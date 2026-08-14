import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import baseSchema from '../migrations/0001_init.sql?raw';
import collaborationSchema from '../migrations/0015_order_collaboration.sql?raw';
import bulkSchema from '../migrations/0018_order_bulk_actions.sql?raw';

function database(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(baseSchema);
  db.exec(collaborationSchema);
  db.exec(bulkSchema);
  db.exec(`INSERT INTO order_tags (id, slug, label, active, created_at, updated_at)
    VALUES (1, 'prioritario', 'Prioritario', 1, '2026-08-14T08:00:00.000Z', '2026-08-14T08:00:00.000Z')`);
  return db;
}

function insertBatch(db: DatabaseSync, id = 'bulk_1234567890abcdef1234567890abcdef'): void {
  db.prepare(`INSERT INTO order_bulk_batches (
    id, action_type, tag_id, selection_fingerprint, preview_fingerprint,
    actor_kind, actor_id, actor_label, status,
    observed_at, expires_at, created_at, updated_at
  ) VALUES (?, 'add_tag', 1, ?, ?, 'admin', 'admin-panel', 'Panel', 'pending', ?, ?, ?, ?)`)
    .run(
      id,
      `sha256:${'1'.repeat(64)}`,
      `sha256:${'2'.repeat(64)}`,
      '2026-08-14T08:00:00.000Z',
      '2026-08-14T08:15:00.000Z',
      '2026-08-14T08:01:00.000Z',
      '2026-08-14T08:01:00.000Z',
    );
}

describe('migración R3.5 de acciones masivas', () => {
  it('es expand-only, no crea lotes y conserva integridad', () => {
    const db = database();
    expect(db.prepare(`SELECT name FROM sqlite_schema WHERE type = 'table'
      AND name LIKE 'order_bulk_%' ORDER BY name`).all()).toEqual([
      { name: 'order_bulk_batch_rows' },
      { name: 'order_bulk_batches' },
    ]);
    expect(db.prepare('SELECT count(*) AS n FROM order_bulk_batches').get()).toEqual({ n: 0 });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(bulkSchema).not.toMatch(/ALTER TABLE|DROP TABLE|DELETE FROM|UPDATE orders/iu);
  });

  it('tipa la acción y rechaza payloads cruzados', () => {
    const db = database();
    insertBatch(db);
    expect(() => db.prepare(`INSERT INTO order_bulk_batches (
      id, action_type, tag_id, hold_reason_code, hold_owner_kind, hold_owner_id,
      hold_owner_label, hold_due_at, selection_fingerprint, preview_fingerprint,
      actor_kind, actor_id, status, observed_at, expires_at, created_at, updated_at
    ) VALUES ('bulk_badbadbadbadbadbadbadbadbadbadba', 'add_tag', 1, 'risk_review',
      'admin', 'ops', 'Ops', '2026-08-14T12:00:00.000Z', ?, ?, 'admin', 'admin-panel',
      'pending', '2026-08-14T08:00:00.000Z', '2026-08-14T08:15:00.000Z',
      '2026-08-14T08:01:00.000Z', '2026-08-14T08:01:00.000Z')`)
      .run(`sha256:${'3'.repeat(64)}`, `sha256:${'4'.repeat(64)}`)).toThrow(/CHECK/);
  });

  it('congela hasta 500 posiciones únicas y resultados cerrados', () => {
    const db = database();
    insertBatch(db);
    const batchId = 'bulk_1234567890abcdef1234567890abcdef';
    db.prepare(`INSERT INTO order_bulk_batch_rows (
      batch_id, order_id, selection_position, observed_version, observed_status,
      preview_eligibility, preview_reason, outcome, idempotency_key,
      created_at, updated_at
    ) VALUES (?, 7, 1, 2, 'paid', 'ready', 'ready', 'pending', ?, ?, ?)`)
      .run(batchId, 'bulk:batch:add_tag:order:7', '2026-08-14T08:01:00.000Z', '2026-08-14T08:01:00.000Z');
    expect(() => db.prepare(`INSERT INTO order_bulk_batch_rows (
      batch_id, order_id, selection_position, preview_eligibility, preview_reason,
      outcome, result_code, idempotency_key, created_at, updated_at, completed_at
    ) VALUES (?, 8, 1, 'skipped', 'order_not_found', 'skipped', 'order_not_found', ?, ?, ?, ?)`)
      .run(batchId, 'bulk:batch:add_tag:order:8', '2026-08-14T08:01:00.000Z',
        '2026-08-14T08:01:00.000Z', '2026-08-14T08:01:00.000Z')).toThrow(/UNIQUE/);
    expect(() => db.prepare(`UPDATE order_bulk_batch_rows SET outcome = 'unknown'
      WHERE batch_id = ?`).run(batchId)).toThrow(/CHECK/);
  });

  it('permite purgar el lote y sus filas sin borrar auditoría de negocio', () => {
    const db = database();
    insertBatch(db);
    const batchId = 'bulk_1234567890abcdef1234567890abcdef';
    db.prepare(`INSERT INTO order_bulk_batch_rows (
      batch_id, order_id, selection_position, preview_eligibility, preview_reason,
      outcome, result_code, idempotency_key, created_at, updated_at, completed_at
    ) VALUES (?, 7, 1, 'skipped', 'order_not_found', 'skipped', 'order_not_found', ?, ?, ?, ?)`)
      .run(batchId, 'bulk:batch:add_tag:order:7', '2026-08-14T08:01:00.000Z',
        '2026-08-14T08:01:00.000Z', '2026-08-14T08:01:00.000Z');
    db.prepare(`UPDATE order_bulk_batches SET status = 'completed',
      completed_at = '2026-08-14T08:02:00.000Z' WHERE id = ?`).run(batchId);
    db.prepare('DELETE FROM order_bulk_batches WHERE id = ?').run(batchId);
    expect(db.prepare('SELECT count(*) AS n FROM order_bulk_batch_rows').get()).toEqual({ n: 0 });
  });
});

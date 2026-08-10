import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import migration1 from '../migrations/0001_init.sql?raw';
import migration2 from '../migrations/0002_collections_and_product_capabilities.sql?raw';
import migration3 from '../migrations/0003_contact_requests.sql?raw';
import migration4 from '../migrations/0004_event_outbox.sql?raw';
import migration5 from '../migrations/0005_audit_log.sql?raw';
import migration6 from '../migrations/0006_platform_job_runs.sql?raw';
import migration7 from '../migrations/0007_product_variants.sql?raw';
import migration8 from '../migrations/0008_product_media_attributes.sql?raw';
import migration9 from '../migrations/0009_inventory_ledger.sql?raw';

const beforeLedger = [
  migration1, migration2, migration3, migration4,
  migration5, migration6, migration7, migration8,
];

function databaseBeforeR27(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const migration of beforeLedger) db.exec(migration);
  db.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'con-stock', 'Con stock', 1000, 5, 'test'),
           (2, 'sin-stock', 'Sin stock', 2000, 0, 'test');
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES
      (1, 1, 'P1-DEFAULT', '', 1000, 'active', 1, NULL),
      (2, 1, 'P1-ALT', 'Alternativa', 1000, 'active', 0, '[10]'),
      (3, 2, 'P2-DEFAULT', '', 2000, 'active', 1, NULL);
  `);
  return db;
}

describe('migración R2.7 del ledger de inventario', () => {
  it('replica el stock legacy en cada variante y abre también los saldos cero', () => {
    const db = databaseBeforeR27();
    db.exec(migration9);

    expect(db.prepare(`
      SELECT variant_id, on_hand, reserved, version
      FROM inventory_balances ORDER BY variant_id
    `).all()).toEqual([
      { variant_id: 1, on_hand: 5, reserved: 0, version: 1 },
      { variant_id: 2, on_hand: 5, reserved: 0, version: 1 },
      { variant_id: 3, on_hand: 0, reserved: 0, version: 1 },
    ]);
    expect(db.prepare(`
      SELECT variant_id, delta, reason, balance_after, version_after,
             idempotency_key
      FROM inventory_movements ORDER BY variant_id
    `).all()).toEqual([
      { variant_id: 1, delta: 5, reason: 'legacy_opening_balance', balance_after: 5, version_after: 1, idempotency_key: 'r2:inventory:opening:1' },
      { variant_id: 2, delta: 5, reason: 'legacy_opening_balance', balance_after: 5, version_after: 1, idempotency_key: 'r2:inventory:opening:2' },
      { variant_id: 3, delta: 0, reason: 'legacy_opening_balance', balance_after: 0, version_after: 1, idempotency_key: 'r2:inventory:opening:3' },
    ]);
    expect(db.prepare(`
      SELECT b.variant_id
      FROM inventory_balances b
      LEFT JOIN inventory_movements m ON m.variant_id = b.variant_id
      GROUP BY b.variant_id
      HAVING b.on_hand <> COALESCE(SUM(m.delta), 0)
    `).all()).toEqual([]);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
  });

  it('mantiene ledger append-only por versión e idempotencia', () => {
    const db = databaseBeforeR27();
    db.exec(migration9);
    expect(() => db.prepare(`
      INSERT INTO inventory_movements (
        variant_id, delta, reason, balance_after, version_after, actor_kind,
        actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
      ) VALUES (1, -1, 'sale', 4, 1, 'system', 'test', 'order', '1',
        'sale:duplicate-version', 'order:1', '2026-08-10T10:00:00.000Z')
    `).run()).toThrow(/UNIQUE/);
    expect(() => db.prepare(`
      INSERT INTO inventory_movements (
        variant_id, delta, reason, balance_after, version_after, actor_kind,
        actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
      ) VALUES (2, -1, 'sale', 4, 2, 'system', 'test', 'order', '1',
        'r2:inventory:opening:1', 'order:1', '2026-08-10T10:00:00.000Z')
    `).run()).toThrow(/UNIQUE/);
  });
});

import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import migration from '../migrations/0005_audit_log.sql?raw';
import { BACKUP_TABLES } from '../src/lib/backup';
import { MODULE_REGISTRY } from '../src/platform/configuration';
import {
  AUDIT_REDACTED,
  createAuditDiff,
  createAuditEntry,
} from '../src/shared-kernel/audit';

const publicAuditRouteFiles = Object.keys(import.meta.glob('../src/pages/**/*audit*'));

describe('contrato de auditoría R1.8', () => {
  it('redacta PII y secretos aunque un caso de uso los incluya por error', () => {
    const diff = createAuditDiff(
      { email: 'antes@example.com', payment_intent: null, name: 'AOVE' },
      { email: 'despues@example.com', payment_intent: 'pi_secret', name: 'AOVE premium' },
      ['email', 'payment_intent', 'name'],
    );
    expect(diff.email).toEqual({ before: AUDIT_REDACTED, after: AUDIT_REDACTED });
    expect(diff.payment_intent).toEqual({ before: AUDIT_REDACTED, after: AUDIT_REDACTED });
    expect(diff.name).toEqual({ before: 'AOVE', after: 'AOVE premium' });
    expect(JSON.stringify(diff)).not.toContain('example.com');
    expect(JSON.stringify(diff)).not.toContain('pi_secret');
  });

  it('solo conserva cambios reales y limita forma, campos y tamaño', () => {
    expect(createAuditDiff({ stock: 3 }, { stock: 3 }, ['stock'])).toEqual({});
    expect(() => createAuditDiff({}, {}, Array.from({ length: 51 }, (_, i) => `field_${i}`))).toThrow(/máximo/);
    expect(() => createAuditDiff({}, {}, ['campo-con-guion'])).toThrow(/inválido/);
    expect(() => createAuditEntry(
      { event_id: 'audit_1', occurred_at: '2026-08-07T08:00:00.000Z' },
      {
        actor: { kind: 'admin', id: 'admin-panel' },
        action: 'acción inválida',
        entity: { type: 'product', id: '1' },
        diff: {},
      },
    )).toThrow(/Acción/);
  });

  it('la migración impone JSON objeto, 4 KB e índices acotados', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(migration);
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_audit_log_%' ORDER BY name")
      .all().map((row) => String(row.name));
    expect(indexes).toEqual(['idx_audit_log_correlation', 'idx_audit_log_entity']);
    const base = `
      INSERT INTO audit_log (
        audit_id, occurred_at, actor_kind, actor_id, action,
        entity_type, entity_id, correlation_id, diff_json, created_at
      ) VALUES (?, '2026-08-07T08:00:00.000Z', 'admin', 'admin-panel',
        'catalog.product_updated', 'product', '1', 'audit:1', ?, '2026-08-07T08:00:00.000Z')
    `;
    db.prepare(base).run('audit_1', '{}');
    expect(() => db.prepare(base).run('audit_2', '[]')).toThrow(/CHECK constraint/);
    expect(() => db.prepare(base).run('audit_3', JSON.stringify({ value: 'x'.repeat(4100) }))).toThrow(/CHECK constraint/);
  });

  it('no crea ruta, navegación ni export desde el Worker público', () => {
    expect(publicAuditRouteFiles).toEqual([]);
    expect(MODULE_REGISTRY.routes.some((route) => route.path.includes('audit'))).toBe(false);
    expect(BACKUP_TABLES).not.toContain('audit_log');
  });
});

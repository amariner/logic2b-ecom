import { describe, expect, it } from 'vitest';
import { seedStatements } from '../seed/seed';
import { SqliteD1 } from './sqlite-d1';

describe('migración 0024 de documentos', () => {
  it('instala plantillas, documentos, artefactos, eventos e índices de alcance', async () => {
    const db = new SqliteD1();
    const tables = db.query<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table'`)
      .map((row) => row.name);
    expect(tables).toEqual(expect.arrayContaining([
      'order_document_templates', 'order_documents', 'order_document_artifacts', 'order_document_events',
    ]));
    const indexes = db.query<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='index'`)
      .map((row) => row.name);
    expect(indexes).toEqual(expect.arrayContaining([
      'idx_order_documents_scope_version', 'idx_order_documents_active_scope',
      'idx_order_documents_external_reference',
    ]));
    await db.batch(seedStatements().map((sql) => db.prepare(sql)));
    expect(db.value('SELECT count(*) AS value FROM order_document_templates')).toBe(2);
    expect(db.value('SELECT count(*) AS value FROM order_documents')).toBe(2);
    expect(db.value('SELECT count(*) AS value FROM order_document_artifacts')).toBe(1);
  });

  it('bloquea importes inventados y artefactos locales para referencias fiscales', async () => {
    const db = new SqliteD1();
    await db.batch(seedStatements().map((sql) => db.prepare(sql)));
    const orderId = Number(db.value("SELECT id AS value FROM orders WHERE order_number='BM-DEMO-1003'"));
    expect(() => db.sqlite.prepare(`INSERT INTO order_documents (
      id, document_number, order_id, document_type, source, document_version,
      lifecycle_version, status, expected_amount_cents, currency, external_provider,
      external_reference, snapshot_json, content_sha256, idempotency_key,
      issued_at, created_at, updated_at
    ) VALUES ('doc_bad_amount', 'F-BAD', ?, 'external_invoice', 'external', 2, 1,
      'active', 1, 'EUR', 'erp', 'bad-amount', '{}', ?, 'document:bad:amount',
      datetime('now'), datetime('now'), datetime('now'))`)
      .run(orderId, '0'.repeat(64))).toThrow(/document_invoice_amount_conflict/);
    expect(() => db.sqlite.prepare(`INSERT INTO order_document_artifacts (
      document_id, content_type, content_text, content_sha256, byte_size, created_at
    ) VALUES ('doc_demo_factura_1004', 'text/html', 'falso', ?, 5, datetime('now'))`)
      .run('0'.repeat(64))).toThrow(/document_artifact_conflict/);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { seedStatements } from '../seed/seed';
import { createOrderDocumentOperations } from '../src/composition/order-document-operations';
import { SqliteD1 } from './sqlite-d1';

describe('runtime de documentos operativos R3.11', () => {
  let db: SqliteD1;
  let orderId: number;
  let fulfillmentId: number;
  beforeEach(async () => {
    db = new SqliteD1();
    await db.batch(seedStatements().map((sql) => db.prepare(sql)));
    orderId = Number(db.value("SELECT id AS value FROM orders WHERE order_number='BM-DEMO-1004'"));
    fulfillmentId = Number(db.value(`SELECT id AS value FROM fulfillments WHERE order_id=${orderId} LIMIT 1`));
  });

  it('reexpide un albarán inmutable, conserva la versión previa y hace replay', async () => {
    const operations = createOrderDocumentOperations(db.asD1(), () => '2026-08-14T12:00:00.000Z');
    const input = {
      orderId, fulfillmentId, documentType: 'packing_slip' as const,
      templateId: 'tpl_packing_slip_v1', idempotencyKey: 'document:test:packing:v2',
    };
    const first = await operations.issueGenerated(input);
    expect(first.outcome).toBe('applied');
    expect(first.detail?.document).toMatchObject({ document_version: 2, status: 'active', source: 'generated' });
    expect(await operations.issueGenerated(input)).toMatchObject({ outcome: 'idempotent' });
    expect(db.query(`SELECT status, document_version FROM order_documents
      WHERE order_id=? AND document_type='packing_slip' ORDER BY document_version`, orderId)).toEqual([
      { status: 'superseded', document_version: 1 }, { status: 'active', document_version: 2 },
    ]);
    const artifact = await operations.artifact(first.detail!.document.id);
    expect(artifact?.content_text).toContain('Documento logístico sin importes');
    expect(artifact?.content_text).not.toContain('€');
    const hashBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(artifact!.content_text)));
    const digest = [...hashBytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    expect(digest).toBe(artifact?.content_sha256);
  });

  it('una carrera por la siguiente versión deja un solo documento activo', async () => {
    const operations = createOrderDocumentOperations(db.asD1(), () => '2026-08-14T12:01:00.000Z');
    const base = { orderId, fulfillmentId, documentType: 'internal_label' as const, templateId: 'tpl_internal_label_v1' };
    const [one, two] = await Promise.all([
      operations.issueGenerated({ ...base, idempotencyKey: 'document:race:label:one' }),
      operations.issueGenerated({ ...base, idempotencyKey: 'document:race:label:two' }),
    ]);
    expect([one.outcome, two.outcome].toSorted()).toEqual(['applied', 'conflict']);
    expect(db.value(`SELECT count(*) AS value FROM order_documents
      WHERE order_id=${orderId} AND document_type='internal_label' AND status='active'`)).toBe(1);
  });

  it('registra la referencia fiscal con importe servidor y permite anular solo por versión', async () => {
    const operations = createOrderDocumentOperations(db.asD1(), () => '2026-08-14T12:02:00.000Z');
    const issued = await operations.registerExternal({
      orderId, documentType: 'external_invoice', provider: 'erp-demo',
      externalReference: 'erp-invoice-1004-v2', documentNumber: 'FAC-DEMO-1004-B',
      externalUrl: 'https://example.test/invoices/1004-b', idempotencyKey: 'document:test:invoice:v2',
    });
    expect(issued.outcome).toBe('applied');
    expect(issued.detail?.document.expected_amount_cents).toBe(
      db.value(`SELECT total_cents AS value FROM orders WHERE id=${orderId}`),
    );
    expect(await operations.artifact(issued.detail!.document.id)).toBeNull();
    expect(await operations.voidDocument(issued.detail!.document.id, 99, 'document:test:void:wrong', 'Referencia errónea'))
      .toMatchObject({ outcome: 'conflict' });
    const voided = await operations.voidDocument(
      issued.detail!.document.id, 1, 'document:test:void:invoice', 'Referencia errónea',
    );
    expect(voided).toMatchObject({ outcome: 'applied', detail: { document: { status: 'voided', lifecycle_version: 2 } } });
    expect(await operations.voidDocument(
      issued.detail!.document.id, 1, 'document:test:void:invoice', 'Referencia errónea',
    )).toMatchObject({ outcome: 'idempotent' });
  });
});

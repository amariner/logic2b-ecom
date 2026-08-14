import { describe, expect, it } from 'vitest';
import {
  assertOrderDocumentVoid,
  planExternalOrderDocument,
  planGeneratedOrderDocument,
} from '../src/modules/orders';

const order = { id: 7, orderNumber: 'BM-1007', status: 'shipped', totalCents: 4990, currency: 'eur' } as const;
const fulfillment = { id: 11, orderId: 7, status: 'shipped' } as const;
const template = { id: 'tpl_packing_v1', documentType: 'packing_slip', version: 1, renderer: 'packing-slip-v1', active: true } as const;

describe('documentos operativos R3.11', () => {
  it('versiona un albarán por envío sin convertirlo en documento fiscal', () => {
    expect(planGeneratedOrderDocument({
      documentType: 'packing_slip', order, fulfillment, template,
      previous: { id: 'doc_previous', documentVersion: 2, status: 'active' },
      idempotencyKey: 'document:packing:7:11:v3',
    })).toMatchObject({
      source: 'generated', documentVersion: 3, supersedesId: 'doc_previous',
      documentNumber: 'ALB-BM-1007-11-V3',
    });
  });

  it('rechaza plantilla, envío o versión activa incoherentes', () => {
    expect(() => planGeneratedOrderDocument({
      documentType: 'packing_slip', order,
      fulfillment: { ...fulfillment, orderId: 8 }, template, previous: null,
      idempotencyKey: 'document:packing:invalid',
    })).toThrow(/pertenece/);
    expect(() => planGeneratedOrderDocument({
      documentType: 'packing_slip', order, fulfillment,
      template: { ...template, active: false }, previous: null,
      idempotencyKey: 'document:packing:template',
    })).toThrow(/plantilla/);
  });

  it('deriva el importe fiscal del pedido o reembolso confirmado', () => {
    const invoice = planExternalOrderDocument({
      documentType: 'external_invoice', order, refund: null, previous: null,
      provider: 'Gestoría', externalReference: 'ext-77', documentNumber: 'F-2026-77',
      externalUrl: 'https://example.test/F-2026-77', idempotencyKey: 'document:invoice:77',
    });
    expect(invoice).toMatchObject({ expectedAmountCents: 4990, currency: 'EUR', refundId: null });

    const credit = planExternalOrderDocument({
      documentType: 'external_credit_note', order,
      refund: { id: 9, orderId: 7, status: 'succeeded', totalCents: 1250 }, previous: null,
      provider: 'ERP', externalReference: 'credit-9', documentNumber: 'R-2026-9',
      idempotencyKey: 'document:credit:9',
    });
    expect(credit).toMatchObject({ expectedAmountCents: 1250, refundId: 9 });
  });

  it('no admite rectificativa sin abono confirmado ni URL no HTTPS', () => {
    expect(() => planExternalOrderDocument({
      documentType: 'external_credit_note', order, refund: null, previous: null,
      provider: 'ERP', externalReference: 'credit-9', documentNumber: 'R-2026-9',
      idempotencyKey: 'document:credit:invalid',
    })).toThrow(/reembolso confirmado/);
    expect(() => planExternalOrderDocument({
      documentType: 'external_invoice', order, refund: null, previous: null,
      provider: 'ERP', externalReference: 'invoice-9', documentNumber: 'F-2026-9',
      externalUrl: 'http://example.test/file', idempotencyKey: 'document:invoice:invalid',
    })).toThrow(/HTTPS/);
    expect(() => assertOrderDocumentVoid('superseded', 2)).toThrow(/activo/);
  });
});

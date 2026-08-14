import { describe, expect, it } from 'vitest';
import {
  ORDER_BULK_LIMITS,
  assertOrderBulkPreviewCurrent,
  createOrderBulkPreview,
  orderBulkRowIdempotencyKey,
  summarizeOrderBulkExecution,
  verifyOrderBulkPreview,
  type OrderBulkCandidate,
} from '../src/modules/orders';

const OBSERVED_AT = '2026-08-13T10:00:00.000Z';
const EXPIRES_AT = '2026-08-13T10:15:00.000Z';

const candidates: readonly OrderBulkCandidate[] = [
  {
    orderId: 12,
    observedVersion: 3,
    status: 'paid',
    tagIds: [7],
    activeHoldReasonCodes: [],
  },
  {
    orderId: 10,
    observedVersion: 1,
    status: 'delivered',
    tagIds: [],
    activeHoldReasonCodes: [],
  },
];

describe('contrato puro de acciones masivas R3.5', () => {
  it('congela la selección ordenada y produce fingerprints estables', async () => {
    const first = await createOrderBulkPreview({
      orderIds: [12, 10, 11],
      candidates,
      action: { type: 'add_tag', tagId: 8 },
      observedAt: OBSERVED_AT,
      expiresAt: EXPIRES_AT,
    });
    const second = await createOrderBulkPreview({
      orderIds: [10, 11, 12],
      candidates: [...candidates].reverse(),
      action: { type: 'add_tag', tagId: 8 },
      observedAt: OBSERVED_AT,
      expiresAt: EXPIRES_AT,
    });

    expect(first.rows.map((row) => row.orderId)).toEqual([10, 11, 12]);
    expect(first.selectionFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.selectionFingerprint).toBe(second.selectionFingerprint);
    expect(first.previewFingerprint).toBe(second.previewFingerprint);
    expect(first.counts).toEqual({ total: 3, ready: 2, skipped: 1 });
    expect(first.rows[1]).toMatchObject({
      orderId: 11,
      eligibility: 'skipped',
      reason: 'order_not_found',
    });
  });

  it('clasifica no-ops y precondiciones sin producir efectos laterales', async () => {
    const add = await createOrderBulkPreview({
      orderIds: [12],
      candidates: candidates.filter((candidate) => candidate.orderId === 12),
      action: { type: 'add_tag', tagId: 7 },
      observedAt: OBSERVED_AT,
      expiresAt: EXPIRES_AT,
    });
    const remove = await createOrderBulkPreview({
      orderIds: [10],
      candidates: candidates.filter((candidate) => candidate.orderId === 10),
      action: { type: 'remove_tag', tagId: 7 },
      observedAt: OBSERVED_AT,
      expiresAt: EXPIRES_AT,
    });
    const hold = await createOrderBulkPreview({
      orderIds: [10, 12],
      candidates,
      action: {
        type: 'create_hold',
        reasonCode: 'risk_review',
        owner: { kind: 'admin', id: 'operations' },
        dueAt: '2026-08-13T12:00:00.000Z',
      },
      observedAt: OBSERVED_AT,
      expiresAt: EXPIRES_AT,
    });

    expect(add.rows[0]).toMatchObject({ eligibility: 'skipped', reason: 'already_applied' });
    expect(remove.rows[0]).toMatchObject({ eligibility: 'skipped', reason: 'already_absent' });
    expect(hold.rows).toEqual([
      expect.objectContaining({ orderId: 10, eligibility: 'skipped', reason: 'status_not_supported' }),
      expect.objectContaining({ orderId: 12, eligibility: 'ready', reason: 'ready' }),
    ]);
  });

  it('rechaza selección ambigua, sin límite o previews demasiado largos', async () => {
    await expect(createOrderBulkPreview({
      orderIds: [10, 10],
      candidates: [],
      action: { type: 'add_tag', tagId: 1 },
      observedAt: OBSERVED_AT,
      expiresAt: EXPIRES_AT,
    })).rejects.toThrow(/duplicados/);

    await expect(createOrderBulkPreview({
      orderIds: Array.from({ length: ORDER_BULK_LIMITS.maxOrders + 1 }, (_, index) => index + 1),
      candidates: [],
      action: { type: 'add_tag', tagId: 1 },
      observedAt: OBSERVED_AT,
      expiresAt: EXPIRES_AT,
    })).rejects.toThrow(/entre 1 y 500/);

    await expect(createOrderBulkPreview({
      orderIds: [10],
      candidates,
      action: { type: 'add_tag', tagId: 1 },
      observedAt: OBSERVED_AT,
      expiresAt: '2026-08-13T10:15:00.001Z',
    })).rejects.toThrow(/ventana de preview/);
  });

  it('caduca en el límite exacto y no permite ejecutar una decisión vieja', async () => {
    const preview = await createOrderBulkPreview({
      orderIds: [12],
      candidates: candidates.filter((candidate) => candidate.orderId === 12),
      action: { type: 'add_tag', tagId: 8 },
      observedAt: OBSERVED_AT,
      expiresAt: EXPIRES_AT,
    });
    expect(() => assertOrderBulkPreviewCurrent(preview, '2026-08-13T10:14:59.999Z')).not.toThrow();
    expect(() => assertOrderBulkPreviewCurrent(preview, EXPIRES_AT)).toThrow(/caducado/);
  });

  it('deriva idempotencia por lote, acción y pedido', () => {
    expect(orderBulkRowIdempotencyKey('batch_01', 12, 'create_hold'))
      .toBe('bulk:batch_01:create_hold:order:12');
    expect(orderBulkRowIdempotencyKey('batch_01', 12, 'create_hold'))
      .toBe(orderBulkRowIdempotencyKey('batch_01', 12, 'create_hold'));
    expect(orderBulkRowIdempotencyKey('batch_01', 13, 'create_hold'))
      .not.toBe(orderBulkRowIdempotencyKey('batch_01', 12, 'create_hold'));
  });

  it('calcula progreso y solo permite replay de filas no terminales', () => {
    expect(summarizeOrderBulkExecution([
      { orderId: 1, outcome: 'applied' },
      { orderId: 2, outcome: 'replayed' },
      { orderId: 3, outcome: 'skipped' },
      { orderId: 4, outcome: 'conflict' },
      { orderId: 5, outcome: 'retryable_failure' },
      { orderId: 6, outcome: 'permanent_failure' },
      { orderId: 7, outcome: 'pending' },
    ])).toEqual({
      total: 7,
      completed: 5,
      pending: 1,
      applied: 1,
      replayed: 1,
      skipped: 1,
      conflict: 1,
      failed: 2,
      replayableOrderIds: [5, 7],
    });
  });

  it('verifica la integridad completa antes de confirmar el dry-run', async () => {
    const preview = await createOrderBulkPreview({
      orderIds: [12],
      candidates: candidates.filter((candidate) => candidate.orderId === 12),
      action: { type: 'add_tag', tagId: 8 },
      observedAt: OBSERVED_AT,
      expiresAt: EXPIRES_AT,
    });
    await expect(verifyOrderBulkPreview(preview)).resolves.toEqual(preview);
    await expect(verifyOrderBulkPreview({
      ...preview,
      counts: { total: 1, ready: 0, skipped: 1 },
    })).rejects.toThrow(/counts/);
    await expect(verifyOrderBulkPreview({
      ...preview,
      rows: [{ ...preview.rows[0]!, reason: 'already_applied', eligibility: 'skipped' }],
      counts: { total: 1, ready: 0, skipped: 1 },
    })).rejects.toThrow(/previewFingerprint/);
  });
});

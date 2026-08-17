import { describe, expect, it } from 'vitest';
import {
  authorizeStoredValue,
  generateGiftCardCode,
  giftCardCodeHash,
  normalizeGiftCardCode,
  planStoredValueRefund,
} from '../src/modules/payments';

const account = {
  id: 'gift_example', kind: 'gift_card' as const, state: 'active' as const,
  currency: 'EUR', label: 'Regalo', balance_cents: 5000, reserved_cents: 1200,
  version: 4, expires_at: null,
};

describe('valor almacenado R4.8', () => {
  it('normaliza, genera y hashea códigos sin persistir el secreto', async () => {
    const code = generateGiftCardCode();
    expect(code).toMatch(/^L2B-(?:[A-Z2-9]{6}-){3}[A-Z2-9]{6}$/);
    expect(normalizeGiftCardCode(code)).toHaveLength(27);
    expect(await giftCardCodeHash(code)).toMatch(/^[a-f0-9]{64}$/);
    expect(await giftCardCodeHash(code.toLowerCase().replaceAll('-', ' ')))
      .toBe(await giftCardCodeHash(code));
  });

  it('autoriza solo el disponible, con pago parcial y snapshot congelado', () => {
    expect(authorizeStoredValue({ account, requestedCents: 0, orderTotalCents: 6000,
      currency: 'EUR', at: '2026-08-14T12:00:00.000Z' })).toMatchObject({
      amountCents: 3800, availableBeforeCents: 3800,
      snapshot: { account_id: 'gift_example', account_version: 4,
        refund_policy: 'original_tender_stored_value_first' },
    });
    expect(authorizeStoredValue({ account, requestedCents: 1700, orderTotalCents: 6000,
      currency: 'EUR', at: '2026-08-14T12:00:00.000Z' }).amountCents).toBe(1700);
  });

  it('rechaza moneda, estado y caducidad incompatibles', () => {
    const input = { requestedCents: 100, orderTotalCents: 1000, currency: 'EUR',
      at: '2026-08-14T12:00:00.000Z' } as const;
    expect(() => authorizeStoredValue({ account: { ...account, currency: 'USD' }, ...input }))
      .toThrow(/moneda/);
    expect(() => authorizeStoredValue({ account: { ...account, state: 'disabled' }, ...input }))
      .toThrow(/activo/);
    expect(() => authorizeStoredValue({ account: { ...account,
      expires_at: '2026-08-14T11:59:59.999Z' }, ...input })).toThrow(/caducado/);
  });

  it('reembolsa al medio original antes de devolver dinero externo', () => {
    expect(planStoredValueRefund(3500, 2000)).toEqual({ storedValueCents: 2000, externalCents: 1500 });
    expect(planStoredValueRefund(900, 2000)).toEqual({ storedValueCents: 900, externalCents: 0 });
  });
});

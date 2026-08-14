import { describe, expect, it } from 'vitest';
import {
  normalizePromotionCode,
  promotionCodeHash,
  promotionCodeHint,
  promotionCustomerHash,
  resolvePromotionCode,
  type PromotionCode,
} from '../src/modules/pricing';

const promotion: PromotionCode = {
  id: 'summer-10', version: 2, label: 'Verano 10', state: 'active', priority: 50,
  currency: 'EUR', effect: { type: 'percentage_off', basisPoints: 1000 },
  activeFrom: '2026-08-01T00:00:00.000Z', activeUntil: '2026-09-01T00:00:00.000Z',
  markets: ['ES'], channels: ['storefront'], globalUsageLimit: 100,
  perCustomerUsageLimit: 1, minimumSubtotalCents: 2000, productIds: [1, 3],
};

const input = {
  promotion,
  context: { at: '2026-08-14T12:00:00.000Z', currency: 'EUR', market: 'ES', channel: 'storefront' },
  baseSubtotalCents: 5000,
  cartProductIds: [1, 2],
  globalUsageCount: 5,
  customerUsageCount: 0,
} as const;

describe('códigos promocionales R4.2', () => {
  it('normaliza solo ASCII inequívoco y nunca conserva el código en el hash', async () => {
    expect(normalizePromotionCode('  verano-10 ')).toBe('VERANO-10');
    expect(promotionCodeHint('verano-10')).toBe('••••O-10');
    const digest = await promotionCodeHash('verano-10');
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain('verano');
    expect(await promotionCustomerHash(' CLIENTE@Example.COM '))
      .toBe(await promotionCustomerHash('cliente@example.com'));
    expect(() => normalizePromotionCode('VERANO 10')).toThrow(/ASCII/);
    expect(() => normalizePromotionCode('VЕRANO10')).toThrow(/ASCII/);
  });

  it('crea una candidata R4.1 solo para productos dentro del scope', () => {
    expect(resolvePromotionCode(input)).toEqual({
      status: 'eligible',
      eligibleProductIds: [1],
      candidate: {
        id: 'promotion:summer-10', version: 2, label: 'Verano 10', priority: 50,
        activeFrom: promotion.activeFrom, activeUntil: promotion.activeUntil,
        markets: ['ES'], channels: ['storefront'], currency: 'EUR',
        effect: { type: 'percentage_off', basisPoints: 1000 },
      },
    });
  });

  it('bloquea límites, mínimo y scope con motivos deterministas', () => {
    expect(resolvePromotionCode({ ...input, globalUsageCount: 100 }).status).toBe('excluded_global_limit');
    expect(resolvePromotionCode({ ...input, customerUsageCount: 1 }).status).toBe('excluded_customer_limit');
    expect(resolvePromotionCode({ ...input, baseSubtotalCents: 1999 }).status).toBe('excluded_minimum_subtotal');
    expect(resolvePromotionCode({ ...input, cartProductIds: [2] }).status).toBe('excluded_product_scope');
    expect(resolvePromotionCode({ ...input, customerUsageCount: null }).status).toBe('eligible');
  });
});

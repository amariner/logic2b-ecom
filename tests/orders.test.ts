import { describe, expect, it } from 'vitest';
import { shopConfig } from '../shop.config';
import { generateOrderNumber, generateSimulatedSessionToken } from '../src/lib/orders';

describe('generateOrderNumber', () => {
  it('formato {prefijo}-AAMMDD-XXXX con fecha UTC, prefijo desde shop.config.ts', () => {
    const num = generateOrderNumber(new Date('2026-07-17T23:59:00Z'));
    const prefix = shopConfig.orderNumberPrefix;
    expect(num).toMatch(new RegExp(`^${prefix}-260717-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$`));
  });

  it('sin colisiones evidentes en una tanda', () => {
    const nums = new Set(Array.from({ length: 200 }, () => generateOrderNumber()));
    expect(nums.size).toBeGreaterThan(190);
  });
});

describe('generateSimulatedSessionToken', () => {
  it('24 caracteres alfanuméricos en minúscula: no enumerable como el nº de pedido', () => {
    const token = generateSimulatedSessionToken();
    expect(token).toMatch(/^[a-z0-9]{24}$/);
  });

  it('sin colisiones evidentes en una tanda', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateSimulatedSessionToken()));
    expect(tokens.size).toBe(500);
  });
});

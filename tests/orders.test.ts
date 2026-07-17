import { describe, expect, it } from 'vitest';
import { generateOrderNumber } from '../src/lib/orders';

describe('generateOrderNumber', () => {
  it('formato BM-AAMMDD-XXXX con fecha UTC', () => {
    const num = generateOrderNumber(new Date('2026-07-17T23:59:00Z'));
    expect(num).toMatch(/^BM-260717-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
  });

  it('sin colisiones evidentes en una tanda', () => {
    const nums = new Set(Array.from({ length: 200 }, () => generateOrderNumber()));
    expect(nums.size).toBeGreaterThan(190); // 31^4 ≈ 923k combinaciones/día
  });
});

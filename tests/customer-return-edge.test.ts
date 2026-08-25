import { describe, expect, it, vi } from 'vitest';
import { enforceCustomerReturnEdgeRate } from '../src/composition/customer-account-edge';

describe('rate limit owner-only de devoluciones R5.5h', () => {
  it('comparte bolsa entre API/SSR/lectura/alta sin incluir referencias', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const observability = { count: vi.fn() };
    const pathname = `/api/customer/returns/ret_${'a'.repeat(32)}`;
    const response = await enforceCustomerReturnEdgeRate({
      request: new Request(`https://shop.example${pathname}`, {
        headers: { 'cf-connecting-ip': '203.0.113.44' },
      }), pathname, binding: { limit }, observability,
    });
    expect(response?.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: '/customer-return-access:203.0.113.44' });
    expect(JSON.stringify(limit.mock.calls)).not.toContain('ret_');
  });

  it('falla cerrado si el binding no existe', async () => {
    const observability = { count: vi.fn() };
    const response = await enforceCustomerReturnEdgeRate({
      request: new Request('https://shop.example/cuanta/devoluciones', { method: 'POST' }),
      pathname: '/cuenta/devoluciones', binding: undefined, observability,
    });
    expect(response?.status).toBe(503);
    expect(observability.count).toHaveBeenCalledWith({ operation: 'create',
      outcome: 'denied', reason: 'edge_rate_unavailable' });
  });
});

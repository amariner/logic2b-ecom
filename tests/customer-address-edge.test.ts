import { describe, expect, it, vi } from 'vitest';
import { enforceCustomerAddressEdgeRate } from '../src/composition/customer-account-edge';

describe('rate limit compartido de direcciones R5.5f', () => {
  it('agrupa lectura y escritura por IP/superficie, nunca por addr_', async () => {
    const limit = vi.fn(async (_input: { key: string }) => ({ success: false }));
    const observability = { count: vi.fn() };
    const pathname = `/api/customer/addresses/addr_${'a'.repeat(32)}`;
    const response = await enforceCustomerAddressEdgeRate({
      request: new Request(`https://shop.example${pathname}`, {
        method: 'PATCH', headers: { 'cf-connecting-ip': '203.0.113.9' },
      }),
      pathname, binding: { limit }, observability,
    });
    expect(response?.status).toBe(429);
    expect(response?.headers.get('retry-after')).toBe('60');
    expect(limit).toHaveBeenCalledWith({ key: '/customer-address-access:203.0.113.9' });
    expect(JSON.stringify(limit.mock.calls)).not.toContain('addr_');
  });

  it('aplica la misma bolsa a API y página y falla cerrado sin binding', async () => {
    const limit = vi.fn(async (_input: { key: string }) => ({ success: true }));
    const observability = { count: vi.fn() };
    for (const [pathname, method] of [
      ['/api/customer/addresses', 'GET'], ['/api/customer/addresses', 'POST'],
      ['/cuenta/direcciones', 'GET'], ['/cuenta/direcciones', 'POST'],
    ] as const) {
      await enforceCustomerAddressEdgeRate({
        request: new Request(`https://shop.example${pathname}`, {
          method, headers: { 'cf-connecting-ip': '203.0.113.10' },
        }), pathname, binding: { limit }, observability,
      });
    }
    expect(limit).toHaveBeenCalledTimes(4);
    expect(limit.mock.calls.every(([entry]) =>
      entry.key === '/customer-address-access:203.0.113.10')).toBe(true);
    const unavailable = await enforceCustomerAddressEdgeRate({
      request: new Request('https://shop.example/cuanta/direcciones'),
      pathname: '/cuenta/direcciones', binding: undefined, observability,
    });
    expect(unavailable?.status).toBe(503);
  });
});

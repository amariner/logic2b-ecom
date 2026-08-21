import { describe, expect, it, vi } from 'vitest';
import { enforceCustomerOrderAccessEdgeRate } from '../src/composition/customer-account-edge';

describe('rate limit de lectura de pedidos R5.5c', () => {
  it('agrupa por IP/superficie y no permite saltarse el límite rotando referencias', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const observability = { count: vi.fn() };
    const response = await enforceCustomerOrderAccessEdgeRate({
      request: new Request(`https://shop.example/api/customer/orders/ord_${'a'.repeat(32)}`, {
        headers: { 'cf-connecting-ip': '203.0.113.5' },
      }),
      pathname: `/api/customer/orders/ord_${'a'.repeat(32)}`,
      binding: { limit },
      observability,
    });
    expect(response?.status).toBe(429);
    expect(response?.headers.get('retry-after')).toBe('60');
    expect(limit).toHaveBeenCalledWith({ key: '/api/customer/orders/:203.0.113.5' });
    expect(JSON.stringify(limit.mock.calls)).not.toContain('ord_');
  });

  it('falla cerrado si falta el binding y no actúa sobre otra ruta o método', async () => {
    const observability = { count: vi.fn() };
    const missing = await enforceCustomerOrderAccessEdgeRate({
      request: new Request(`https://shop.example/api/customer/orders/ord_${'b'.repeat(32)}`),
      pathname: `/api/customer/orders/ord_${'b'.repeat(32)}`,
      binding: undefined,
      observability,
    });
    expect(missing?.status).toBe(503);
    await expect(enforceCustomerOrderAccessEdgeRate({
      request: new Request('https://shop.example/api/customer/orders/x', { method: 'POST' }),
      pathname: '/api/customer/orders/x', binding: undefined, observability,
    })).resolves.toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { enforceCustomerAccountEdgeRate } from '../src/composition/customer-account-edge';
import type { CustomerPasswordlessObservability } from '../src/modules/customers/application/passwordless-observability';

function request(pathname: string): Request {
  return new Request(`https://shop.example${pathname}`, {
    method: 'POST',
    headers: { 'cf-connecting-ip': '2001:db8::1' },
  });
}

describe('rate limit de borde de cuenta', () => {
  it('normaliza slash final y deja continuar un resultado aceptado', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const observability = { count: vi.fn() } satisfies CustomerPasswordlessObservability;
    await expect(enforceCustomerAccountEdgeRate({
      request: request('/cuenta/acceso/'),
      pathname: '/cuenta/acceso/',
      binding: { limit },
      observability,
    })).resolves.toBeNull();
    expect(limit).toHaveBeenCalledWith({ key: '/cuenta/acceso:2001:db8::1' });
    expect(observability.count).not.toHaveBeenCalled();
  });

  it('devuelve 429 uniforme y métrica cerrada cuando el binding limita', async () => {
    const observability = { count: vi.fn() } satisfies CustomerPasswordlessObservability;
    const response = await enforceCustomerAccountEdgeRate({
      request: request('/cuenta/acceso/confirmar'),
      pathname: '/cuenta/acceso/confirmar',
      binding: { limit: async () => ({ success: false }) },
      observability,
    });
    expect(response?.status).toBe(429);
    expect(response?.headers.get('retry-after')).toBe('60');
    expect(response?.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(observability.count).toHaveBeenCalledWith({ stage: 'edge_rate', outcome: 'limited' });
  });

  it.each([
    ['binding ausente', undefined],
    ['binding caído', { limit: async () => { throw new Error('unavailable'); } }],
  ] as const)('falla cerrado con %s', async (_label, binding) => {
    const observability = { count: vi.fn() } satisfies CustomerPasswordlessObservability;
    const response = await enforceCustomerAccountEdgeRate({
      request: request('/cuenta/acceso'), pathname: '/cuenta/acceso', binding, observability,
    });
    expect(response?.status).toBe(503);
    expect(observability.count).toHaveBeenCalledWith({ stage: 'edge_rate', outcome: 'unavailable' });
  });
});

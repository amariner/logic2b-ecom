import { describe, expect, it, vi } from 'vitest';
import { createCustomerPasswordlessConsoleObservability } from '../src/modules/customers/infrastructure/customer-passwordless-console-observability';

describe('observabilidad agregada passwordless', () => {
  it('emite solo etapa/resultado cerrados y agrega repeticiones por minuto', () => {
    let at = Date.parse('2026-08-19T10:00:00.000Z');
    const sink = { info: vi.fn(), warn: vi.fn() };
    const metrics = createCustomerPasswordlessConsoleObservability({ sink, now: () => at });
    metrics.count({ stage: 'provider_delivery', outcome: 'failed' });
    metrics.count({ stage: 'provider_delivery', outcome: 'failed' });
    metrics.count({ stage: 'provider_delivery', outcome: 'failed' });
    expect(sink.warn).toHaveBeenCalledTimes(1);

    at += 60_000;
    metrics.count({ stage: 'provider_delivery', outcome: 'failed' });
    expect(sink.warn).toHaveBeenCalledTimes(2);
    const record = JSON.parse(sink.warn.mock.calls[1]![0]) as Record<string, unknown>;
    expect(record).toEqual({
      schema: 'logic2b.customer_auth.metrics.v1',
      kind: 'counter',
      stage: 'provider_delivery',
      outcome: 'failed',
      count: 3,
      window_ms: 60_000,
      emitted_at: '2026-08-19T10:01:00.000Z',
    });
    expect(Object.keys(record).toSorted()).toEqual([
      'count', 'emitted_at', 'kind', 'outcome', 'schema', 'stage', 'window_ms',
    ]);
  });

  it('absorbe el sink y descarta valores runtime fuera del enum sin filtrar datos', () => {
    const sink = {
      info: vi.fn((_message: string) => undefined),
      warn: vi.fn((_message: string) => { throw new Error('sink unavailable'); }),
    };
    const metrics = createCustomerPasswordlessConsoleObservability({ sink, now: () => 1 });
    expect(() => metrics.count({ stage: 'challenge_rate', outcome: 'unavailable' })).not.toThrow();
    metrics.count({ stage: 'proof:cliente@example.test', outcome: 'secret' } as never);
    expect(sink.warn).toHaveBeenCalledTimes(1);
    const serialized = String(sink.warn.mock.calls[0]![0]);
    expect(serialized).not.toContain('cliente@example.test');
    expect(serialized).not.toContain('secret');
  });
});

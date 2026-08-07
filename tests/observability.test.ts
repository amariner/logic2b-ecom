import { describe, expect, it, vi } from 'vitest';
import { flushEventOutbox } from '../src/composition/outbox-dispatcher';
import {
  asOperationalError,
  createConsoleObservability,
  type PlatformObservability,
} from '../src/platform/operations';
import observabilityAdapterSource from '../src/platform/operations/infrastructure/console-observability.ts?raw';
import { SqliteD1 } from './sqlite-d1';

function captureSink() {
  const records: Array<{ level: 'info' | 'warn' | 'error'; value: Record<string, unknown> }> = [];
  const append = (level: 'info' | 'warn' | 'error') => (message: string) => {
    records.push({ level, value: JSON.parse(message) as Record<string, unknown> });
  };
  return {
    records,
    sink: { info: append('info'), warn: append('warn'), error: append('error') },
  };
}

describe('observabilidad operativa segura R1.9', () => {
  it('emite JSON acotado y rechaza identificadores manipulados o con PII', () => {
    const captured = captureSink();
    const observability = createConsoleObservability({
      sink: captured.sink,
      clock: { now: () => new Date('2026-08-07T09:00:00.000Z') },
    });

    observability.metric({
      name: 'checkout.completed',
      operationId: 'clienta@example.com',
      correlationId: 'pedido con espacios y dirección privada',
      paymentMode: 'simulated',
      paymentOutcome: 'confirmed',
      durationMs: 12.7,
    });

    expect(captured.records).toEqual([{
      level: 'info',
      value: {
        schema: 'logic2b.observability.v1',
        kind: 'metric',
        level: 'info',
        metric: 'checkout.completed',
        operation_id: null,
        correlation_id: null,
        payment_mode: 'simulated',
        payment_outcome: 'confirmed',
        value: 1,
        duration_ms: 13,
        emitted_at: '2026-08-07T09:00:00.000Z',
      },
    }]);
    expect(JSON.stringify(captured.records)).not.toContain('clienta@example.com');
    expect(JSON.stringify(captured.records)).not.toContain('dirección privada');
  });

  it('normaliza fallos sin serializar mensajes, causas, payloads ni secretos', () => {
    const captured = captureSink();
    const observability = createConsoleObservability({ sink: captured.sink });
    const raw = new Error('clienta@example.com token=sk_live_secret calle privada');

    observability.failure(asOperationalError(raw, 'checkout.unexpected_failure'), {
      operation: 'checkout',
      operationId: 'op_12345678-1234-4123-8123-123456789abc',
      correlationId: 'order:BM-260807-SAFE',
      durationMs: 61_000,
    });

    const serialized = JSON.stringify(captured.records);
    expect(serialized).toContain('checkout.unexpected_failure');
    expect(serialized).toContain('order:BM-260807-SAFE');
    expect(serialized).not.toContain('clienta@example.com');
    expect(serialized).not.toContain('sk_live_secret');
    expect(serialized).not.toContain('calle privada');
    expect(captured.records[0]?.value['duration_ms']).toBe(60_000);
  });

  it('usa warning sólo para tandas con fallos y nunca rompe negocio si falla el sink', () => {
    const captured = captureSink();
    const observability = createConsoleObservability({ sink: captured.sink });
    observability.metric({
      name: 'email.delivery',
      operationId: 'op_email_1',
      claimed: 5_000,
      delivered: 2,
      failed: 1,
      durationMs: 4,
    });
    expect(captured.records[0]).toMatchObject({
      level: 'warn',
      value: { level: 'warn', claimed: 1_000, delivered: 2, failed: 1 },
    });

    const throwing = createConsoleObservability({
      sink: {
        info: () => { throw new Error('sink down'); },
        warn: () => { throw new Error('sink down'); },
        error: () => { throw new Error('sink down'); },
      },
    });
    expect(() => throwing.metric({
      name: 'outbox.dispatch',
      operationId: 'op_outbox_1',
      claimed: 1,
      delivered: 1,
      failed: 0,
      durationMs: 1,
    })).not.toThrow();
  });

  it('demo corta antes de D1 y no emite señales; una tanda real vacía tampoco', async () => {
    const observability: PlatformObservability = {
      metric: vi.fn(),
      failure: vi.fn(),
    };
    const hostileDb = {
      prepare: () => { throw new Error('D1 no debe tocarse en demo'); },
    } as unknown as D1Database;

    await expect(flushEventOutbox(hostileDb, { DEMO_MODE: 'true' }, observability)).resolves.toEqual({
      claimed: 0,
      delivered: 0,
      failed: 0,
      emailsSent: 0,
    });
    expect(observability.metric).not.toHaveBeenCalled();
    expect(observability.failure).not.toHaveBeenCalled();

    await expect(flushEventOutbox(
      new SqliteD1().asD1(),
      { DEMO_MODE: 'false' },
      observability,
    )).resolves.toEqual({ claimed: 0, delivered: 0, failed: 0, emailsSent: 0 });
    expect(observability.metric).not.toHaveBeenCalled();
    expect(observability.failure).not.toHaveBeenCalled();
  });

  it('el adaptador no persiste en D1 ni publica un exportador HTTP', () => {
    expect(observabilityAdapterSource).not.toMatch(/\b(?:SELECT|INSERT|UPDATE|DELETE)\b/);
    const publicApiModules = import.meta.glob('../src/pages/api/**/*.{ts,astro}', { eager: true });
    expect(Object.keys(publicApiModules).some((path) => /(?:metrics|observability|telemetry)/i.test(path))).toBe(false);
  });
});

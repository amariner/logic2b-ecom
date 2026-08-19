import type {
  CustomerPasswordlessMetric,
  CustomerPasswordlessObservability,
} from '../application/passwordless-observability';

export type CustomerPasswordlessMetricSink = Readonly<{
  info(message: string): void;
  warn(message: string): void;
}>;

const SCHEMA = 'logic2b.customer_auth.metrics.v1';
const WINDOW_MS = 60_000;
const MAX_PENDING_COUNT = 1_000_000;
const OUTCOMES = Object.freeze({
  contact_rate: new Set(['limited', 'unavailable']),
  challenge_rate: new Set(['limited', 'unavailable']),
  provider_delivery: new Set(['delivered', 'failed']),
  verification: new Set(['rejected']),
  session_guard: new Set(['revoked', 'unavailable']),
  edge_rate: new Set(['limited', 'unavailable']),
  runtime: new Set(['unavailable']),
} as const);

type Bucket = { lastEmittedAt: number; pending: number };

function validMetric(value: CustomerPasswordlessMetric): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const outcomes = OUTCOMES[value.stage];
  return outcomes !== undefined && (outcomes as ReadonlySet<string>).has(value.outcome);
}

/**
 * Workers Logs recibe como máximo una línea por etapa/resultado y minuto. La
 * primera señal alerta de inmediato; las repeticiones se acumulan y salen en
 * el siguiente intervalo, sin ids ni campos controlados por el request.
 */
export function createCustomerPasswordlessConsoleObservability(
  options: Readonly<{
    sink?: CustomerPasswordlessMetricSink;
    now?: () => number;
  }> = {},
): CustomerPasswordlessObservability {
  const sink = options.sink ?? console;
  const now = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();

  return Object.freeze({
    count(metric: CustomerPasswordlessMetric): void {
      let at: number;
      try {
        if (!validMetric(metric)) return;
        at = now();
      } catch {
        return;
      }
      if (!Number.isFinite(at) || at < 0 || at > 8_640_000_000_000_000) return;
      const key = `${metric.stage}:${metric.outcome}`;
      const bucket = buckets.get(key);
      if (bucket !== undefined && at - bucket.lastEmittedAt < WINDOW_MS) {
        bucket.pending = Math.min(MAX_PENDING_COUNT, bucket.pending + 1);
        return;
      }
      const count = Math.min(MAX_PENDING_COUNT, 1 + (bucket?.pending ?? 0));
      buckets.set(key, { lastEmittedAt: at, pending: 0 });
      const record = JSON.stringify({
        schema: SCHEMA,
        kind: 'counter',
        stage: metric.stage,
        outcome: metric.outcome,
        count,
        window_ms: WINDOW_MS,
        emitted_at: new Date(at).toISOString(),
      });
      try {
        (metric.outcome === 'delivered' ? sink.info : sink.warn)(record);
      } catch {
        // La observabilidad nunca cambia el resultado de autenticación.
      }
    },
  });
}

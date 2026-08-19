/** Señales cerradas y sin identificadores para la superficie passwordless. */
export type CustomerPasswordlessMetric =
  | Readonly<{ stage: 'contact_rate'; outcome: 'limited' | 'unavailable' }>
  | Readonly<{ stage: 'challenge_rate'; outcome: 'limited' | 'unavailable' }>
  | Readonly<{ stage: 'provider_delivery'; outcome: 'delivered' | 'failed' }>
  | Readonly<{ stage: 'verification'; outcome: 'rejected' }>
  | Readonly<{ stage: 'session_guard'; outcome: 'revoked' | 'unavailable' }>
  | Readonly<{ stage: 'edge_rate'; outcome: 'limited' | 'unavailable' }>
  | Readonly<{ stage: 'runtime'; outcome: 'unavailable' }>;

export interface CustomerPasswordlessObservability {
  /** No acepta ids, strings libres, emails, digests ni material bearer. */
  count(metric: CustomerPasswordlessMetric): void;
}

export const silentCustomerPasswordlessObservability: CustomerPasswordlessObservability =
  Object.freeze({ count: () => undefined });

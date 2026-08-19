import { createCustomerPasswordlessConsoleObservability } from '../modules/customers/infrastructure/customer-passwordless-console-observability';

/** Agregador único por isolate; no persiste ni expone una superficie HTTP. */
export const customerPasswordlessRuntimeObservability =
  createCustomerPasswordlessConsoleObservability();

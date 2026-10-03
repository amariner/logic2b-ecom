import type { TaxAssessmentResponse } from '../domain/tax-calculation';

/** Puerto síncrono de fixtures; no representa un proveedor fiscal ni operaciones remotas. */
export type TaxAdapter = Readonly<{
  source: 'fixture';
  adapterId: string;
  assess(request: unknown): TaxAssessmentResponse;
}>;

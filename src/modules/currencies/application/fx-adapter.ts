import type { FxResponse } from '../domain/currency-presentment';

/** Puerto de cotizaciones ficticias; solo presentación, nunca liquidación o cobro. */
export interface FxAdapter {
  readonly source: 'fixture';
  readonly adapterId: string;
  quote(request: unknown): FxResponse;
}

import type { VatIdValidationResponse } from '../domain/vat-id-evidence';

/** Puerto síncrono para fixtures inyectados; no acredita un proveedor VAT real. */
export interface VatIdValidationAdapter {
  readonly source: 'fixture';
  readonly adapterId: string;
  validate(query: unknown): VatIdValidationResponse;
}

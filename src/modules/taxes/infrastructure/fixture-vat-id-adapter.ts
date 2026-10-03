import type { VatIdValidationAdapter } from '../application/vat-id-validation';
import { dataArray, exactRecord, invalid, opaqueId } from '../domain/contract-data';
import { defineVatIdEvidence, defineVatIdQuery, type VatIdEvidence, type VatIdValidationResponse } from '../domain/vat-id-evidence';

export const MAX_FIXTURE_VAT_ID_CASES = 100;

/** Casos cerrados e inmutables, sin red, reloj, caché ni almacenamiento. */
export function createFixtureVatIdAdapter(input: unknown): VatIdValidationAdapter {
  const row = exactRecord(input, ['adapterId', 'cases'], 'adapter');
  const adapterId = opaqueId(row.adapterId, 'adapter.adapterId');
  const cases = new Map<string, VatIdEvidence>();
  for (const item of dataArray(row.cases, 0, MAX_FIXTURE_VAT_ID_CASES, 'adapter.cases')) {
    const evidence = defineVatIdEvidence(item);
    if (evidence.adapterId !== adapterId) return invalid('adapter.cases', 'contiene evidencia de otro adaptador.');
    if (cases.has(evidence.query.id)) return invalid('adapter.cases', 'contiene una identidad de consulta repetida.');
    cases.set(evidence.query.id, evidence);
  }
  return Object.freeze({
    source: 'fixture' as const,
    adapterId,
    validate(queryInput: unknown): VatIdValidationResponse {
      const query = defineVatIdQuery(queryInput);
      const evidence = cases.get(query.id);
      if (!evidence || evidence.query.countryCode !== query.countryCode || evidence.query.identifier !== query.identifier) {
        return Object.freeze({ status: 'unavailable', reason: 'not_configured', adapterId, query, evidence: null });
      }
      return Object.freeze({ status: 'evidence', evidence });
    },
  });
}

import type { TaxAdapter } from '../application/tax-assessment';
import { dataArray, exactRecord, invalid, opaqueId } from '../domain/contract-data';
import { defineTaxAssessmentResponse, defineTaxRequest } from '../domain/tax-calculation';

export const MAX_FIXTURE_TAX_CASES = 100;

/** Coincidencia canónica completa, sin reglas por defecto, credenciales, reloj ni I/O. */
export function createFixtureTaxAdapter(input: unknown): TaxAdapter {
  const record = exactRecord(input, ['adapterId', 'cases'], 'adapter');
  const adapterId = opaqueId(record.adapterId, 'adapter.adapterId');
  const cases = Object.freeze(dataArray(record.cases, 0, MAX_FIXTURE_TAX_CASES, 'adapter.cases').map(defineTaxAssessmentResponse));
  const ids = new Set<string>();
  for (const response of cases) {
    if (response.adapterId !== adapterId) return invalid('adapter.cases.adapterId', 'el caso pertenece a otro adaptador.');
    if (ids.has(response.request.id)) return invalid('adapter.cases.request.id', 'identificador de petición duplicado.');
    ids.add(response.request.id);
  }
  const byRequest = new Map(cases.map((response) => [JSON.stringify(response.request), response]));
  return Object.freeze({ source: 'fixture', adapterId, assess(requestInput: unknown) {
    const request = defineTaxRequest(requestInput);
    const response = byRequest.get(JSON.stringify(request));
    return response ?? Object.freeze({ source: 'fixture' as const, adapterId, request,
      outcome: 'unavailable' as const, reason: 'not_configured' as const });
  } });
}

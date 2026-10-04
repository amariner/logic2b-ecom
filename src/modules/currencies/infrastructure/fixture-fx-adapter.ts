import type { FxAdapter } from '../application/fx-adapter';
import { dataArray, exactRecord, invalid, opaqueId } from '../domain/contract-data';
import { defineFxResponse, definePresentmentRequest, type FxResponse } from '../domain/currency-presentment';

export const MAX_FIXTURE_FX_CASES = 100;

/** Casos inyectados y congelados; no obtiene ni renueva tipos de cambio. */
export function createFixtureFxAdapter(input: unknown): FxAdapter {
  const row = exactRecord(input, ['adapterId', 'cases'], 'adapter');
  const adapterId = opaqueId(row.adapterId, 'adapter.adapterId');
  const cases = new Map<string, Readonly<{ requestKey: string; response: FxResponse }>>();
  for (const item of dataArray(row.cases, 0, MAX_FIXTURE_FX_CASES, 'adapter.cases')) {
    const response = defineFxResponse(item);
    if (response.adapterId !== adapterId) return invalid('adapter.cases', 'contiene una respuesta de otro adaptador.');
    if (cases.has(response.request.id)) return invalid('adapter.cases', 'contiene una identidad de consulta repetida.');
    cases.set(response.request.id, Object.freeze({ requestKey: JSON.stringify(response.request), response }));
  }
  return Object.freeze({
    source: 'fixture' as const,
    adapterId,
    quote(requestInput: unknown): FxResponse {
      const request = definePresentmentRequest(requestInput);
      if (request.original.currency === request.targetCurrency) {
        return invalid('request.targetCurrency', 'la misma moneda no requiere una cotización FX.');
      }
      const configured = cases.get(request.id);
      if (configured?.requestKey === JSON.stringify(request)) return configured.response;
      return Object.freeze({ source: 'fixture', adapterId, request, outcome: 'unavailable', reason: 'not_configured' });
    },
  });
}

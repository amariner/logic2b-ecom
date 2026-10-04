import type { CompanyDocumentAdapter } from '../application/company-document-adapter';
import {
  COMPANY_DOCUMENT_EVIDENCE_LIMITS, CompanyDocumentContractError,
  defineCompanyDocumentRequest, defineCompanyDocumentResponse,
  type CompanyDocumentContractReason, type CompanyDocumentResponse,
} from '../domain/company-document-evidence';

export const MAX_FIXTURE_COMPANY_DOCUMENT_CASES = 100;

const ERROR_REASONS: readonly CompanyDocumentContractReason[] = /* @__PURE__ */ Object.freeze([
  'invalid_data', 'purchase_order_invalid', 'adapter_mismatch', 'request_mismatch', 'duplicate_request',
]);
function invalid(reason: CompanyDocumentContractReason = 'invalid_data'): never {
  throw new CompanyDocumentContractError(reason);
}
function boundary<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    let reason: CompanyDocumentContractReason = 'invalid_data';
    try {
      if (error instanceof CompanyDocumentContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string' &&
          ERROR_REASONS.includes(descriptor.value as CompanyDocumentContractReason)) {
          reason = descriptor.value as CompanyDocumentContractReason;
        }
      }
    } catch { /* No se propagan trampas, accesores ni mensajes de entradas ajenas. */ }
    throw new CompanyDocumentContractError(reason);
  }
}
function configuration(input: unknown): Readonly<Record<string, unknown>> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const keys = Reflect.ownKeys(input);
  if (keys.length !== 2) return invalid();
  const row: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if ((key !== 'adapterId' && key !== 'cases') || !descriptor?.enumerable || !('value' in descriptor)) return invalid();
    row[key] = descriptor.value;
  }
  return Object.freeze(row);
}
function adapterToken(input: unknown): string {
  if (typeof input !== 'string' || input.length > COMPANY_DOCUMENT_EVIDENCE_LIMITS.idLength ||
    !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(input)) return invalid();
  return input;
}
function caseEntries(input: unknown): readonly unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return invalid();
  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, 'length');
  if (!lengthDescriptor || !('value' in lengthDescriptor)) return invalid();
  const length: unknown = lengthDescriptor.value;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 ||
    length > MAX_FIXTURE_COMPANY_DOCUMENT_CASES || Reflect.ownKeys(input).length !== length + 1) return invalid();
  const entries: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor?.enumerable || !('value' in descriptor)) return invalid();
    entries.push(descriptor.value);
  }
  return Object.freeze(entries);
}

/** Casos completos y congelados; ninguna fecha ni evidencia se obtiene o renueva aquí. */
export function createFixtureCompanyDocumentAdapter(input: unknown): CompanyDocumentAdapter {
  return boundary(() => {
    const row = configuration(input);
    const adapterId = adapterToken(row.adapterId);
    const responses = caseEntries(row.cases).map(defineCompanyDocumentResponse);
    const cases = new Map<string, Readonly<{ requestKey: string; response: CompanyDocumentResponse }>>();
    for (const response of responses) {
      if (response.adapterId !== adapterId) return invalid('adapter_mismatch');
      if (cases.has(response.request.id)) return invalid('duplicate_request');
      cases.set(response.request.id, Object.freeze({ requestKey: JSON.stringify(response.request), response }));
    }
    return Object.freeze({
      source: 'fixture' as const,
      adapterId,
      read(requestInput: unknown): CompanyDocumentResponse {
        return boundary(() => {
          const request = defineCompanyDocumentRequest(requestInput);
          const configured = cases.get(request.id);
          if (configured?.requestKey === JSON.stringify(request)) return configured.response;
          return Object.freeze({ source: 'fixture', adapterId, request, outcome: 'unavailable', reason: 'not_configured' });
        });
      },
    });
  });
}

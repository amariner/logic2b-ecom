import {
  createCustomerSegmentFacts,
  CustomerSegmentationContractError,
  type CustomerSegmentFact,
  type CustomerSegmentFacts,
} from '../domain/customer-segmentation';

export { CustomerSegmentationContractError } from '../domain/customer-segmentation';

// Límites técnicos conservadores de la importación atómica local; no son
// umbrales de segmentación ni una promesa de capacidad del futuro proveedor.
export const MAX_CUSTOMER_SEGMENT_CANDIDATES = 100;
export const MAX_CUSTOMER_SEGMENT_SNAPSHOT_BYTES = 256_000;

export type CustomerSegmentFactsCandidate = Readonly<{
  customerProfileId: string;
  customerProfileVersion: number;
  facts: CustomerSegmentFacts;
}>;

export type CustomerSegmentFactsSnapshot = Readonly<{
  ref: string;
  policyId: string;
  policyVersion: number;
  capturedAt: string;
  currency: string;
  candidates: readonly CustomerSegmentFactsCandidate[];
}>;

/** Puerto interno: una captura completa y consistente, nunca hechos del comprador. */
export interface CustomerSegmentFactsSource {
  capture(): Promise<CustomerSegmentFactsSnapshot>;
}

function invalid(message: string): never {
  throw new CustomerSegmentationContractError(message);
}

function dataRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalid(`${field} debe ser un objeto de datos.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return invalid(`${field} debe ser un objeto de datos.`);
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor)) {
      return invalid(`${field} contiene campos que no son datos propios enumerables.`);
    }
  }
  return value as Record<string, unknown>;
}

/** Exige todos los campos declarados y rechaza cualquier campo adicional. */
export function segmentRecord(
  value: unknown,
  keys: readonly string[],
  field: string,
): Record<string, unknown> {
  const record = dataRecord(value, field);
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    return invalid(`${field} contiene campos ausentes o desconocidos.`);
  }
  return record;
}

function dataArray(value: unknown, field: string, maxLength = Infinity): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return invalid(`${field} debe ser un array de datos.`);
  }
  if (value.length > maxLength) {
    return invalid(`${field} supera el límite técnico de ${maxLength}.`);
  }
  if (Reflect.ownKeys(value).length !== value.length + 1) {
    return invalid(`${field} contiene huecos o campos desconocidos.`);
  }
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      return invalid(`${field} debe contener elementos propios sin huecos.`);
    }
  }
  return value;
}

export function segmentOpaqueId(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length > 200 || !/^[a-z][a-z0-9_.:-]*$/.test(value)) {
    return invalid(`${field} debe ser un identificador opaco canónico de hasta 200 caracteres.`);
  }
  return value;
}

export function segmentInteger(value: unknown, min: number, field: string): number {
  if (!Number.isSafeInteger(min) || min < 0) {
    return invalid(`${field} tiene un mínimo inválido.`);
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) {
    return invalid(`${field} debe ser un entero seguro mayor o igual a ${min}.`);
  }
  return value;
}

export function segmentTimestamp(value: unknown, nowMs: number, field: string): string {
  if (typeof nowMs !== 'number' || !Number.isFinite(new Date(nowMs).getTime())) {
    return invalid('nowMs debe ser un reloj finito dentro del rango de fechas.');
  }
  if (typeof value !== 'string' || value.length !== 24) return invalid(`${field} debe usar ISO UTC canónico de 24 caracteres.`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    return invalid(`${field} debe usar ISO UTC canónico.`);
  }
  if (parsed > nowMs) return invalid(`${field} no puede estar en el futuro.`);
  return value;
}

/** JSON determinista sin coerciones, toJSON, getters ni pérdida de campos. */
export function canonicalSegmentJson(value: unknown): string {
  const active = new Set<object>();
  function serialize(input: unknown): string {
    if (input === null) return 'null';
    if (typeof input === 'string' || typeof input === 'boolean') return JSON.stringify(input);
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) return invalid('El JSON de segmentación contiene un número no finito.');
      return JSON.stringify(input);
    }
    if (typeof input !== 'object') return invalid('El JSON de segmentación contiene un valor no representable.');
    if (active.has(input)) return invalid('El JSON de segmentación contiene una referencia circular.');
    active.add(input);
    try {
      if (Array.isArray(input)) {
        const values = dataArray(input, 'JSON');
        return `[${values.map((item) => serialize(item)).join(',')}]`;
      }
      const record = dataRecord(input, 'JSON');
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`).join(',')}}`;
    } finally {
      active.delete(input);
    }
  }
  return serialize(value);
}

export async function segmentFingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalSegmentJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Copia congelada; el orden de candidatos es la posición persistida desde uno. */
export function normalizeCustomerSegmentFactsSnapshot(
  input: unknown,
  nowMs = Date.now(),
): CustomerSegmentFactsSnapshot {
  const record = segmentRecord(input, [
    'ref', 'policyId', 'policyVersion', 'capturedAt', 'currency', 'candidates',
  ], 'snapshot');
  const ref = segmentOpaqueId(record.ref, 'snapshot.ref');
  const policyId = segmentOpaqueId(record.policyId, 'snapshot.policyId');
  if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(policyId)) {
    return invalid('snapshot.policyId no es un nombre canónico de política.');
  }
  const policyVersion = segmentInteger(record.policyVersion, 1, 'snapshot.policyVersion');
  const capturedAt = segmentTimestamp(record.capturedAt, nowMs, 'snapshot.capturedAt');
  if (typeof record.currency !== 'string' || !/^[A-Z]{3}$/.test(record.currency)) {
    return invalid('snapshot.currency debe ser un código de moneda de tres letras mayúsculas.');
  }
  const candidatesInput = dataArray(record.candidates, 'snapshot.candidates', MAX_CUSTOMER_SEGMENT_CANDIDATES);
  const profiles = new Set<string>();
  const candidates = candidatesInput.map((item, index) => {
    const field = `snapshot.candidates.${index}`;
    const candidate = segmentRecord(item, [
      'customerProfileId', 'customerProfileVersion', 'facts',
    ], field);
    const customerProfileId = segmentOpaqueId(candidate.customerProfileId, `${field}.customerProfileId`);
    if (profiles.has(customerProfileId)) return invalid(`${field}.customerProfileId está duplicado.`);
    profiles.add(customerProfileId);
    const customerProfileVersion = segmentInteger(candidate.customerProfileVersion, 1, `${field}.customerProfileVersion`);
    // El dominio revalida el registro, los nombres y cada valor antes de copiar.
    const facts = createCustomerSegmentFacts(candidate.facts as Partial<Record<CustomerSegmentFact, number | null>>);
    return Object.freeze({ customerProfileId, customerProfileVersion, facts });
  });
  const normalized = Object.freeze({
    ref, policyId, policyVersion, capturedAt,
    currency: record.currency,
    candidates: Object.freeze(candidates),
  });
  if (new TextEncoder().encode(canonicalSegmentJson(normalized)).byteLength > MAX_CUSTOMER_SEGMENT_SNAPSHOT_BYTES) {
    return invalid(`snapshot supera el límite técnico de ${MAX_CUSTOMER_SEGMENT_SNAPSHOT_BYTES} bytes.`);
  }
  return normalized;
}

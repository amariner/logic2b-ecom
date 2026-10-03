export class TaxContractError extends Error {
  readonly code = 'tax_contract_invalid';

  constructor(message: string) {
    super(message);
    this.name = 'TaxContractError';
  }
}

export function invalid(field: string, explanation: string): never {
  throw new TaxContractError(`${field}: ${explanation}`);
}

/** Copia superficial de datos propios; nunca ejecuta getters de entrada. */
export function dataRecord(input: unknown, field: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid(field, 'debe ser un objeto de datos.');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid(field, 'debe contener datos propios.');
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor)) {
      return invalid(field, 'no admite accesores, símbolos ni propiedades ocultas.');
    }
    copy[key] = descriptor.value;
  }
  return Object.freeze(copy);
}

export function exactRecord(input: unknown, expected: readonly string[], field: string): Record<string, unknown> {
  const record = dataRecord(input, field);
  const keys = Object.keys(record);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
    return invalid(field, 'contiene campos ausentes o desconocidos.');
  }
  return record;
}

export function dataArray(input: unknown, min: number, max: number, field: string): readonly unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length < min || input.length > max) {
    return invalid(field, `debe ser un array de datos con entre ${min} y ${max} elementos.`);
  }
  if (Reflect.ownKeys(input).length !== input.length + 1) return invalid(field, 'no admite huecos ni propiedades adicionales.');
  const copy: unknown[] = [];
  for (let index = 0; index < input.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor?.enumerable || !('value' in descriptor)) return invalid(field, 'no admite accesores ni elementos ocultos.');
    copy.push(descriptor.value);
  }
  return Object.freeze(copy);
}

export function opaqueId(input: unknown, field: string): string {
  if (typeof input !== 'string' || input.length > 100 || !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(input)) {
    return invalid(field, 'debe ser un identificador opaco canónico de hasta 100 caracteres.');
  }
  return input;
}

export function utcTimestamp(input: unknown, field: string): string {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input)) {
    return invalid(field, 'debe ser una fecha UTC canónica de 24 caracteres.');
  }
  const date = new Date(input);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== input) return invalid(field, 'debe ser una fecha UTC válida.');
  return input;
}

export function nonNegativeInteger(input: unknown, field: string): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0 || Object.is(input, -0)) {
    return invalid(field, 'debe ser un entero no negativo seguro.');
  }
  return input;
}

export function positiveInteger(input: unknown, field: string): number {
  const value = nonNegativeInteger(input, field);
  if (value === 0) return invalid(field, 'debe ser un entero positivo seguro.');
  return value;
}

export function countryCode(input: unknown, field: string): string {
  if (typeof input !== 'string' || !/^[A-Z]{2}$/.test(input)) return invalid(field, 'debe contener dos letras ASCII mayúsculas.');
  return input;
}

export function enumValue<T extends string>(input: unknown, values: readonly T[], field: string): T {
  if (typeof input !== 'string' || !values.includes(input as T)) return invalid(field, 'contiene un valor fuera del vocabulario.');
  return input as T;
}

export function compareTokens(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

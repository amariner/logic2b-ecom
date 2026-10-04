export const LOCAL_PAYMENT_METHOD_LIMITS = Object.freeze({ methods: 100, rules: 10000 });

export type LocalPaymentMethodCatalogRef = Readonly<{ id: string; version: number }>;
export type LocalPaymentMethodRule = Readonly<{
  methodId: string;
  marketId: string;
  currency: string;
  exponent: 0 | 2 | 3;
  enabled: boolean;
  minMinor: number;
  maxMinor: number;
}>;
/** Configuración sintética; no declara proveedores, instrumentos ni disponibilidad operativa. */
export type LocalPaymentMethodPolicy = Readonly<{
  schemaVersion: 1;
  source: 'fixture';
  id: string;
  version: number;
  currencyCatalogRef: LocalPaymentMethodCatalogRef;
  marketCatalogRef: LocalPaymentMethodCatalogRef;
  methods: readonly Readonly<{ id: string }>[];
  rules: readonly LocalPaymentMethodRule[];
}>;
/** Importe nominal original; no admite un resultado FX ni un importe de presentación. */
export type LocalPaymentMethodRequest = Readonly<{
  schemaVersion: 1;
  id: string;
  marketId: string;
  original: Readonly<{ currency: string; exponent: 0 | 2 | 3; amountMinor: number }>;
  currencyCatalogRef: LocalPaymentMethodCatalogRef;
  marketCatalogRef: LocalPaymentMethodCatalogRef;
}>;
export type LocalPaymentMethodResult = Readonly<{ methodId: string }> & (
  | Readonly<{ outcome: 'available_in_fixture'; reason: null; matchedRule: LocalPaymentMethodRule }>
  | Readonly<{ outcome: 'unavailable_in_fixture'; reason: 'not_configured'; matchedRule: null }>
  | Readonly<{ outcome: 'unavailable_in_fixture'; reason: 'disabled' | 'below_minimum' | 'above_maximum'; matchedRule: LocalPaymentMethodRule }>
);
export type LocalPaymentMethodsPreview = Readonly<{
  source: 'fixture';
  request: LocalPaymentMethodRequest;
  policyRef: Readonly<{ id: string; version: number }>;
  methods: readonly LocalPaymentMethodResult[];
}>;

export class LocalPaymentMethodContractError extends Error {
  readonly code = 'local_payment_method_contract_invalid';

  constructor(message: string) {
    super(message);
    this.name = 'LocalPaymentMethodContractError';
  }
}

function invalid(field: string, explanation: string): never {
  throw new LocalPaymentMethodContractError(`${field}: ${explanation}`);
}
function record(input: unknown, keys: readonly string[], field: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid(field, 'debe ser un objeto de datos.');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid(field, 'debe contener datos propios.');
  const actual = Reflect.ownKeys(input);
  if (actual.length !== keys.length) return invalid(field, 'contiene campos ausentes o desconocidos.');
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (typeof key !== 'string' || !keys.includes(key) || !descriptor.enumerable || !('value' in descriptor)) {
      return invalid(field, 'solo admite los datos propios enumerables declarados, sin accesores.');
    }
    copy[key] = descriptor.value;
  }
  return Object.freeze(copy);
}
function list(input: unknown, min: number, max: number, field: string): readonly unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length < min || input.length > max) {
    return invalid(field, `debe ser un array con entre ${min} y ${max} elementos.`);
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
function opaqueId(input: unknown, field: string): string {
  if (typeof input !== 'string' || input.length > 100 || !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(input)) {
    return invalid(field, 'debe ser un identificador opaco canónico de hasta 100 caracteres.');
  }
  return input;
}
function marketId(input: unknown, field: string): string {
  if (typeof input !== 'string' || input.length < 2 || input.length > 40 ||
    !/^[A-Z][A-Z0-9]*(?:[._-][A-Z0-9]+)*$/.test(input)) {
    return invalid(field, 'debe ser un identificador canónico en mayúsculas de 2 a 40 caracteres.');
  }
  return input;
}
function currency(input: unknown, field: string): string {
  if (typeof input !== 'string' || !/^[A-Z]{3}$/.test(input)) return invalid(field, 'debe contener tres letras ASCII mayúsculas.');
  return input;
}
function nonNegativeInteger(input: unknown, field: string): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0 || Object.is(input, -0)) {
    return invalid(field, 'debe ser un entero no negativo seguro.');
  }
  return input;
}
function positiveInteger(input: unknown, field: string): number {
  const value = nonNegativeInteger(input, field);
  if (value === 0) return invalid(field, 'debe ser un entero positivo seguro.');
  return value;
}
function exponent(input: unknown, field: string): 0 | 2 | 3 {
  const value = nonNegativeInteger(input, field);
  if (value !== 0 && value !== 2 && value !== 3) return invalid(field, 'debe ser 0, 2 o 3.');
  return value;
}
function catalogRef(input: unknown, field: string): LocalPaymentMethodCatalogRef {
  const row = record(input, ['id', 'version'], field);
  return Object.freeze({ id: opaqueId(row.id, `${field}.id`), version: positiveInteger(row.version, `${field}.version`) });
}
function compareTokens(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function defineLocalPaymentMethodPolicy(input: unknown): LocalPaymentMethodPolicy {
  const row = record(input, ['schemaVersion', 'source', 'id', 'version', 'currencyCatalogRef', 'marketCatalogRef', 'methods', 'rules'], 'policy');
  if (row.schemaVersion !== 1) return invalid('policy.schemaVersion', 'debe ser 1.');
  if (row.source !== 'fixture') return invalid('policy.source', 'solo admite configuración fixture.');
  const id = opaqueId(row.id, 'policy.id');
  const version = positiveInteger(row.version, 'policy.version');
  const currencyCatalogRef = catalogRef(row.currencyCatalogRef, 'policy.currencyCatalogRef');
  const marketCatalogRef = catalogRef(row.marketCatalogRef, 'policy.marketCatalogRef');
  const methodIds = new Set<string>();
  const methods = list(row.methods, 1, LOCAL_PAYMENT_METHOD_LIMITS.methods, 'policy.methods').map((value, index) => {
    const field = `policy.methods.${index}`;
    const method = record(value, ['id'], field);
    const methodId = opaqueId(method.id, `${field}.id`);
    if (methodIds.has(methodId)) return invalid(`${field}.id`, 'método duplicado.');
    methodIds.add(methodId);
    return Object.freeze({ id: methodId });
  });
  const tuples = new Set<string>();
  const exponents = new Map<string, number>();
  const rules = list(row.rules, 0, LOCAL_PAYMENT_METHOD_LIMITS.rules, 'policy.rules').map((value, index): LocalPaymentMethodRule => {
    const field = `policy.rules.${index}`;
    const rule = record(value, ['methodId', 'marketId', 'currency', 'exponent', 'enabled', 'minMinor', 'maxMinor'], field);
    const methodId = opaqueId(rule.methodId, `${field}.methodId`);
    if (!methodIds.has(methodId)) return invalid(`${field}.methodId`, 'método no declarado.');
    const selectedMarket = marketId(rule.marketId, `${field}.marketId`);
    const selectedCurrency = currency(rule.currency, `${field}.currency`);
    const selectedExponent = exponent(rule.exponent, `${field}.exponent`);
    const knownExponent = exponents.get(selectedCurrency);
    if (knownExponent !== undefined && knownExponent !== selectedExponent) return invalid(`${field}.exponent`, 'exponente contradictorio para la misma moneda.');
    exponents.set(selectedCurrency, selectedExponent);
    const tuple = `${methodId}/${selectedMarket}/${selectedCurrency}`;
    if (tuples.has(tuple)) return invalid(field, 'tupla método/mercado/moneda duplicada.');
    tuples.add(tuple);
    if (typeof rule.enabled !== 'boolean') return invalid(`${field}.enabled`, 'debe ser booleano.');
    const minMinor = nonNegativeInteger(rule.minMinor, `${field}.minMinor`);
    const maxMinor = nonNegativeInteger(rule.maxMinor, `${field}.maxMinor`);
    if (minMinor > maxMinor) return invalid(`${field}.maxMinor`, 'debe ser mayor o igual al mínimo.');
    return Object.freeze({ methodId, marketId: selectedMarket, currency: selectedCurrency, exponent: selectedExponent,
      enabled: rule.enabled, minMinor, maxMinor });
  });
  rules.sort((a, b) => compareTokens(a.methodId, b.methodId) || compareTokens(a.marketId, b.marketId) || compareTokens(a.currency, b.currency));
  return Object.freeze({ schemaVersion: 1, source: 'fixture', id, version, currencyCatalogRef, marketCatalogRef,
    methods: Object.freeze(methods.sort((a, b) => compareTokens(a.id, b.id))), rules: Object.freeze(rules) });
}

export function defineLocalPaymentMethodRequest(input: unknown): LocalPaymentMethodRequest {
  const row = record(input, ['schemaVersion', 'id', 'marketId', 'original', 'currencyCatalogRef', 'marketCatalogRef'], 'request');
  if (row.schemaVersion !== 1) return invalid('request.schemaVersion', 'debe ser 1.');
  const id = opaqueId(row.id, 'request.id');
  const selectedMarket = marketId(row.marketId, 'request.marketId');
  const money = record(row.original, ['currency', 'exponent', 'amountMinor'], 'request.original');
  const original = Object.freeze({ currency: currency(money.currency, 'request.original.currency'),
    exponent: exponent(money.exponent, 'request.original.exponent'), amountMinor: nonNegativeInteger(money.amountMinor, 'request.original.amountMinor') });
  return Object.freeze({ schemaVersion: 1, id, marketId: selectedMarket, original,
    currencyCatalogRef: catalogRef(row.currencyCatalogRef, 'request.currencyCatalogRef'),
    marketCatalogRef: catalogRef(row.marketCatalogRef, 'request.marketCatalogRef') });
}

/**
 * Elegibilidad sintética sobre el importe original. La composición valida la
 * existencia de TODAS las referencias frente a los catálogos completos.
 */
export function previewLocalPaymentMethods(input: unknown): LocalPaymentMethodsPreview {
  const row = record(input, ['policy', 'request'], 'preview');
  const policy = defineLocalPaymentMethodPolicy(row.policy);
  const request = defineLocalPaymentMethodRequest(row.request);
  for (const field of ['currencyCatalogRef', 'marketCatalogRef'] as const) {
    if (policy[field].id !== request[field].id || policy[field].version !== request[field].version) {
      return invalid(`request.${field}`, 'no coincide con la referencia de la política.');
    }
  }
  const knownUnit = policy.rules.find((rule) => rule.currency === request.original.currency);
  if (knownUnit && knownUnit.exponent !== request.original.exponent) return invalid('request.original.exponent', 'no coincide con las unidades de la política.');
  const matches = new Map(policy.rules.filter((rule) => rule.marketId === request.marketId && rule.currency === request.original.currency)
    .map((rule) => [rule.methodId, rule]));
  const methods = Object.freeze(policy.methods.map(({ id: methodId }): LocalPaymentMethodResult => {
    const matchedRule = matches.get(methodId);
    if (!matchedRule) return Object.freeze({ methodId, outcome: 'unavailable_in_fixture', reason: 'not_configured', matchedRule: null });
    // Precedencia explícita: configuración ausente, desactivación, límites inclusivos.
    const reason = !matchedRule.enabled ? 'disabled' : request.original.amountMinor < matchedRule.minMinor ? 'below_minimum'
      : request.original.amountMinor > matchedRule.maxMinor ? 'above_maximum' : null;
    return reason === null ? Object.freeze({ methodId, outcome: 'available_in_fixture', reason: null, matchedRule })
      : Object.freeze({ methodId, outcome: 'unavailable_in_fixture', reason, matchedRule });
  }));
  return Object.freeze({ source: 'fixture', request, policyRef: Object.freeze({ id: policy.id, version: policy.version }), methods });
}

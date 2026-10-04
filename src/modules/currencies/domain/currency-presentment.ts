import {
  compareTokens, currencyCode, dataArray, dataRecord, enumValue, exactRecord, invalid,
  nonNegativeInteger, opaqueId, positiveInteger, utcTimestamp,
} from './contract-data';

export const CURRENCY_PRESENTMENT_PROFILE = 'minor-unit-presentment-half-up-v1';
export const MAX_CURRENCIES = 100;

export type CurrencyUnit = Readonly<{ code: string; exponent: 0 | 2 | 3 }>;
/** Catálogo estructural declarado para fixtures; no certifica ISO ni habilita monedas. */
export type CurrencyCatalog = Readonly<{
  schemaVersion: 1;
  id: string;
  version: number;
  currencies: readonly CurrencyUnit[];
}>;
export type PresentmentRequest = Readonly<{
  schemaVersion: 1;
  id: string;
  profile: typeof CURRENCY_PRESENTMENT_PROFILE;
  at: string;
  catalog: CurrencyCatalog;
  original: Readonly<{ currency: string; amountMinor: number }>;
  targetCurrency: string;
}>;
/** Razón positiva en unidades PRINCIPALES: 1 base = numerator/denominator destino. */
export type FxRate = Readonly<{
  baseCurrency: string;
  targetCurrency: string;
  numerator: number;
  denominator: number;
}>;
type FxResponseIdentity = Readonly<{ source: 'fixture'; adapterId: string; request: PresentmentRequest }>;
export type FxResponse = FxResponseIdentity & (
  | Readonly<{ outcome: 'quoted'; evidenceRef: string; quotedAt: string; expiresAt: string; rate: FxRate }>
  | Readonly<{ outcome: 'unavailable'; reason: 'not_configured' | 'unsupported' | 'unavailable' }>
);
export type PresentedAmount = Readonly<{ currency: string; amountMinor: number; exponent: 0 | 2 | 3 }>;
type PresentmentIdentity = Readonly<{ request: PresentmentRequest; original: PresentedAmount }>;
/** Artefacto de presentación; no modifica importes de cobro, impuestos, reembolso o ledger. */
export type CurrencyPresentmentResult = PresentmentIdentity & (
  | Readonly<{ outcome: 'identity'; presented: PresentedAmount; response: null }>
  | Readonly<{ outcome: 'converted'; presented: PresentedAmount; response: Extract<FxResponse, { outcome: 'quoted' }> }>
  | Readonly<{ outcome: 'unresolved'; presented: null; response: FxResponse;
    reason: 'not_configured' | 'unsupported' | 'unavailable' | 'future' | 'expired' }>
);

export function defineCurrencyCatalog(input: unknown): CurrencyCatalog {
  const record = exactRecord(input, ['schemaVersion', 'id', 'version', 'currencies'], 'catalog');
  if (record.schemaVersion !== 1) return invalid('catalog.schemaVersion', 'debe ser 1.');
  const id = opaqueId(record.id, 'catalog.id');
  const version = positiveInteger(record.version, 'catalog.version');
  const codes = new Set<string>();
  const currencies = dataArray(record.currencies, 1, MAX_CURRENCIES, 'catalog.currencies').map((item, index): CurrencyUnit => {
    const field = `catalog.currencies.${index}`;
    const row = exactRecord(item, ['code', 'exponent'], field);
    const code = currencyCode(row.code, `${field}.code`);
    if (codes.has(code)) return invalid(`${field}.code`, 'moneda duplicada.');
    codes.add(code);
    const exponent = nonNegativeInteger(row.exponent, `${field}.exponent`);
    if (exponent !== 0 && exponent !== 2 && exponent !== 3) return invalid(`${field}.exponent`, 'este perfil admite exponentes 0, 2 o 3.');
    return Object.freeze({ code, exponent });
  });
  return Object.freeze({ schemaVersion: 1, id, version,
    currencies: Object.freeze(currencies.sort((a, b) => compareTokens(a.code, b.code))) });
}

export function definePresentmentRequest(input: unknown): PresentmentRequest {
  const record = exactRecord(input, ['schemaVersion', 'id', 'profile', 'at', 'catalog', 'original', 'targetCurrency'], 'request');
  if (record.schemaVersion !== 1) return invalid('request.schemaVersion', 'debe ser 1.');
  if (record.profile !== CURRENCY_PRESENTMENT_PROFILE) return invalid('request.profile', 'perfil de presentación no admitido.');
  const id = opaqueId(record.id, 'request.id');
  const at = utcTimestamp(record.at, 'request.at');
  const catalog = defineCurrencyCatalog(record.catalog);
  const money = exactRecord(record.original, ['currency', 'amountMinor'], 'request.original');
  const original = Object.freeze({ currency: currencyCode(money.currency, 'request.original.currency'),
    amountMinor: nonNegativeInteger(money.amountMinor, 'request.original.amountMinor') });
  const targetCurrency = currencyCode(record.targetCurrency, 'request.targetCurrency');
  if (!catalog.currencies.some(({ code }) => code === original.currency)) return invalid('request.original.currency', 'moneda ausente del catálogo.');
  if (!catalog.currencies.some(({ code }) => code === targetCurrency)) return invalid('request.targetCurrency', 'moneda ausente del catálogo.');
  return Object.freeze({ schemaVersion: 1, id, profile: CURRENCY_PRESENTMENT_PROFILE, at, catalog, original, targetCurrency });
}

export function defineFxResponse(input: unknown): FxResponse {
  const record = dataRecord(input, 'response');
  const outcome = enumValue(record.outcome, ['quoted', 'unavailable'], 'response.outcome');
  exactRecord(record, ['source', 'adapterId', 'request', 'outcome', ...(outcome === 'quoted'
    ? ['evidenceRef', 'quotedAt', 'expiresAt', 'rate'] : ['reason'])], 'response');
  if (record.source !== 'fixture') return invalid('response.source', 'solo se admite evidencia fixture.');
  const adapterId = opaqueId(record.adapterId, 'response.adapterId');
  const request = definePresentmentRequest(record.request);
  if (request.original.currency === request.targetCurrency) return invalid('response.request', 'la misma moneda requiere identidad explícita sin FX.');
  if (outcome === 'unavailable') return Object.freeze({ source: 'fixture', adapterId, request, outcome,
    reason: enumValue(record.reason, ['not_configured', 'unsupported', 'unavailable'], 'response.reason') });
  const evidenceRef = opaqueId(record.evidenceRef, 'response.evidenceRef');
  const quotedAt = utcTimestamp(record.quotedAt, 'response.quotedAt');
  const expiresAt = utcTimestamp(record.expiresAt, 'response.expiresAt');
  if (quotedAt >= expiresAt) return invalid('response.expiresAt', 'debe ser posterior a quotedAt.');
  const rateRecord = exactRecord(record.rate, ['baseCurrency', 'targetCurrency', 'numerator', 'denominator'], 'response.rate');
  const rate = Object.freeze({ baseCurrency: currencyCode(rateRecord.baseCurrency, 'response.rate.baseCurrency'),
    targetCurrency: currencyCode(rateRecord.targetCurrency, 'response.rate.targetCurrency'),
    numerator: positiveInteger(rateRecord.numerator, 'response.rate.numerator'),
    denominator: positiveInteger(rateRecord.denominator, 'response.rate.denominator') });
  if (rate.baseCurrency !== request.original.currency || rate.targetCurrency !== request.targetCurrency) {
    return invalid('response.rate', 'la dirección no coincide con la petición; no se invierten ni triangulan tasas.');
  }
  return Object.freeze({ source: 'fixture', adapterId, request, outcome, evidenceRef, quotedAt, expiresAt, rate });
}

/** Identidad y FX son intenciones separadas; no hay tasa ni evidencia implícitas. */
export function previewCurrencyPresentment(input: unknown): CurrencyPresentmentResult {
  const record = dataRecord(input, 'presentment');
  const mode = enumValue(record.mode, ['identity', 'fx'], 'presentment.mode');
  exactRecord(record, mode === 'identity' ? ['mode', 'request'] : ['mode', 'request', 'expectedAdapterId', 'response'], 'presentment');
  const request = definePresentmentRequest(record.request);
  const originalUnit = request.catalog.currencies.find(({ code }) => code === request.original.currency)!;
  const targetUnit = request.catalog.currencies.find(({ code }) => code === request.targetCurrency)!;
  const original = Object.freeze({ ...request.original, exponent: originalUnit.exponent });
  if (mode === 'identity') {
    if (request.original.currency !== request.targetCurrency) return invalid('presentment.mode', 'la identidad requiere la misma moneda.');
    return Object.freeze({ outcome: 'identity', request, original, presented: original, response: null });
  }
  if (request.original.currency === request.targetCurrency) return invalid('presentment.mode', 'la misma moneda requiere identidad explícita sin FX.');
  const expectedAdapterId = opaqueId(record.expectedAdapterId, 'presentment.expectedAdapterId');
  const response = defineFxResponse(record.response);
  if (response.adapterId !== expectedAdapterId) return invalid('presentment.response', 'el adaptador no coincide con el esperado.');
  if (JSON.stringify(response.request) !== JSON.stringify(request)) return invalid('presentment.response', 'la petición completa y su catálogo no coinciden.');
  const identity = { request, original, response };
  if (response.outcome === 'unavailable') return Object.freeze({ ...identity, outcome: 'unresolved', reason: response.reason, presented: null });
  if (response.quotedAt > request.at) return Object.freeze({ ...identity, outcome: 'unresolved', reason: 'future', presented: null });
  if (response.expiresAt <= request.at) return Object.freeze({ ...identity, outcome: 'unresolved', reason: 'expired', presented: null });
  // La tasa relaciona unidades principales. Se escala exactamente antes de redondear una sola vez.
  const numerator = BigInt(original.amountMinor) * BigInt(response.rate.numerator) * (10n ** BigInt(targetUnit.exponent));
  const denominator = BigInt(response.rate.denominator) * (10n ** BigInt(originalUnit.exponent));
  const rounded = (2n * numerator + denominator) / (2n * denominator);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) return invalid('presentment.amountMinor', 'el importe presentado supera el rango seguro.');
  const presented = Object.freeze({ currency: targetUnit.code, amountMinor: Number(rounded), exponent: targetUnit.exponent });
  return Object.freeze({ outcome: 'converted', request, original, presented, response });
}

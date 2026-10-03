export const MAX_MARKETS = 100;
export const MAX_MARKET_COUNTRIES = 250;
export const MAX_MARKET_DOMAINS = 20;

/** Alcance configurado; no acredita envíos, impuestos ni traducciones publicadas. */
export type Market = Readonly<{
  id: string;
  countryCodes: readonly string[];
  defaultLocale: string;
  currency: string;
  domains: readonly string[];
}>;

export type MarketFallback =
  | Readonly<{ strategy: 'none' }>
  | Readonly<{ strategy: 'market'; marketId: string }>;

export type MarketCatalog = Readonly<{
  schemaVersion: 1;
  id: string;
  version: number;
  markets: readonly Market[];
  fallback: MarketFallback;
}>;

/** Una sola fuente explícita. Su autoridad la acredita el futuro adaptador servidor. */
export type MarketSelector =
  | Readonly<{ by: 'id'; marketId: string }>
  | Readonly<{ by: 'domain'; hostname: string }>
  | Readonly<{ by: 'country'; countryCode: string }>
  | Readonly<{ by: 'none' }>;

export type MarketFallbackReason = 'no_context' | 'domain_not_matched' | 'country_not_matched';
export type MarketUnresolvedReason = 'unknown_market_id' | 'ambiguous_country' | 'fallback_disabled';

type MarketResolutionSource = Readonly<{
  catalogId: string;
  catalogVersion: number;
  selector: MarketSelector;
}>;

export type MarketResolution = MarketResolutionSource & (
  | Readonly<{ outcome: 'matched'; matchedBy: 'id' | 'domain' | 'country'; market: Market }>
  | Readonly<{ outcome: 'fallback'; reason: MarketFallbackReason; market: Market }>
  | Readonly<{ outcome: 'unresolved'; reason: MarketUnresolvedReason }>
);

export class MarketContextContractError extends Error {
  readonly code = 'market_context_contract_invalid';

  constructor(message: string) {
    super(message);
    this.name = 'MarketContextContractError';
  }
}

function invalid(field: string, explanation: string): never {
  throw new MarketContextContractError(`${field}: ${explanation}`);
}

function dataRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalid(field, 'debe ser un objeto de datos.');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return invalid(field, 'debe ser un objeto de datos propios.');
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor)) {
      return invalid(field, 'solo admite datos propios enumerables, sin accesores.');
    }
  }
  return value as Record<string, unknown>;
}

function exactRecord(value: unknown, expected: readonly string[], field: string): Record<string, unknown> {
  const record = dataRecord(value, field);
  const keys = Object.keys(record);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
    return invalid(field, 'contiene campos ausentes o desconocidos.');
  }
  return record;
}

function dataArray(value: unknown, min: number, max: number, field: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return invalid(field, 'debe ser un array de datos.');
  }
  if (value.length < min || value.length > max) {
    return invalid(field, `debe contener entre ${min} y ${max} elementos.`);
  }
  if (Reflect.ownKeys(value).length !== value.length + 1) {
    return invalid(field, 'no admite huecos ni propiedades adicionales.');
  }
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      return invalid(field, 'solo admite elementos propios enumerables, sin accesores.');
    }
  }
  return value;
}

function catalogId(value: unknown): string {
  if (typeof value !== 'string' || value.length > 100 || !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(value)) {
    return invalid('catalog.id', 'debe ser un identificador opaco canónico de hasta 100 caracteres.');
  }
  return value;
}

function marketId(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length < 2 || value.length > 40 ||
    !/^[A-Z][A-Z0-9]*(?:[._-][A-Z0-9]+)*$/.test(value)) {
    return invalid(field, 'debe ser un identificador canónico en mayúsculas de 2 a 40 caracteres.');
  }
  return value;
}

function countryCode(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[A-Z]{2}$/.test(value)) {
    return invalid(field, 'debe contener dos letras ASCII mayúsculas.');
  }
  return value;
}

function currencyCode(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    return invalid(field, 'debe contener tres letras ASCII mayúsculas.');
  }
  return value;
}

function locale(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 100 || /-[a-z0-9]-/i.test(value)) {
    return invalid(field, 'debe ser un locale sin extensiones ni uso privado, de hasta 100 caracteres.');
  }
  let canonical: string | undefined;
  try {
    canonical = Intl.getCanonicalLocales(value)[0];
  } catch {
    // Una etiqueta inválida nunca se sustituye por el idioma del entorno.
  }
  if (!canonical) return invalid(field, 'debe ser una etiqueta de idioma válida.');
  if (canonical.length > 100) return invalid(field, 'la etiqueta canónica supera 100 caracteres.');
  return canonical;
}

function hostname(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length > 253 || !/^[A-Za-z0-9.-]+$/.test(value)) {
    return invalid(field, 'debe ser un nombre DNS ASCII de hasta 253 caracteres.');
  }
  const normalized = value.toLowerCase();
  const labels = normalized.split('.');
  if (labels.length < 2 || labels.some((label) => label.length > 63 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) ||
    !/^[a-z]/.test(labels[labels.length - 1]!)) {
    return invalid(field, 'debe ser un dominio completo sin IP, puerto, comodín ni punto final.');
  }
  try {
    // El parser estándar valida también A-labels IDNA sin consultar DNS.
    if (new URL(`https://${normalized}`).hostname === normalized) return normalized;
  } catch {
    // La gramática anterior ya excluye protocolos, rutas y credenciales.
  }
  return invalid(field, 'contiene un nombre DNS inválido.');
}

function compareTokens(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueTokens(
  input: unknown, min: number, max: number, field: string,
  normalize: (value: unknown, field: string) => string,
): readonly string[] {
  const values = dataArray(input, min, max, field).map((value, index) => normalize(value, `${field}.${index}`));
  if (new Set(values).size !== values.length) return invalid(field, 'contiene valores duplicados.');
  return Object.freeze(values.sort(compareTokens));
}

function defineMarket(input: unknown, index: number): Market {
  const field = `catalog.markets.${index}`;
  const row = exactRecord(input, ['id', 'countryCodes', 'defaultLocale', 'currency', 'domains'], field);
  return Object.freeze({
    id: marketId(row.id, `${field}.id`),
    countryCodes: uniqueTokens(row.countryCodes, 1, MAX_MARKET_COUNTRIES, `${field}.countryCodes`, countryCode),
    defaultLocale: locale(row.defaultLocale, `${field}.defaultLocale`),
    currency: currencyCode(row.currency, `${field}.currency`),
    domains: uniqueTokens(row.domains, 0, MAX_MARKET_DOMAINS, `${field}.domains`, hostname),
  });
}

function defineFallback(input: unknown): MarketFallback {
  const row = dataRecord(input, 'catalog.fallback');
  if (row.strategy === 'none') {
    exactRecord(row, ['strategy'], 'catalog.fallback');
    return Object.freeze({ strategy: 'none' });
  }
  if (row.strategy === 'market') {
    exactRecord(row, ['strategy', 'marketId'], 'catalog.fallback');
    return Object.freeze({ strategy: 'market', marketId: marketId(row.marketId, 'catalog.fallback.marketId') });
  }
  return invalid('catalog.fallback.strategy', 'debe declarar none o market.');
}

/** Copia canónica e inmutable. País y moneda solo validan sintaxis, no disponibilidad comercial. */
export function defineMarketCatalog(input: unknown): MarketCatalog {
  const row = exactRecord(input, ['schemaVersion', 'id', 'version', 'markets', 'fallback'], 'catalog');
  if (row.schemaVersion !== 1) return invalid('catalog.schemaVersion', 'debe ser 1.');
  const id = catalogId(row.id);
  if (typeof row.version !== 'number' || !Number.isSafeInteger(row.version) || row.version < 1) {
    return invalid('catalog.version', 'debe ser un entero positivo seguro.');
  }
  const markets = dataArray(row.markets, 1, MAX_MARKETS, 'catalog.markets').map(defineMarket);
  const ids = new Set<string>();
  const domains = new Set<string>();
  for (const market of markets) {
    if (ids.has(market.id)) return invalid('catalog.markets', 'contiene identificadores duplicados.');
    ids.add(market.id);
    for (const domain of market.domains) {
      if (domains.has(domain)) return invalid('catalog.markets', 'un dominio pertenece a más de un mercado.');
      domains.add(domain);
    }
  }
  const fallback = defineFallback(row.fallback);
  if (fallback.strategy === 'market' && !ids.has(fallback.marketId)) {
    return invalid('catalog.fallback.marketId', 'debe referenciar un mercado del catálogo.');
  }
  return Object.freeze({
    schemaVersion: 1, id, version: row.version,
    markets: Object.freeze(markets.sort((left, right) => compareTokens(left.id, right.id))),
    fallback,
  });
}

function defineSelector(input: unknown): MarketSelector {
  const row = dataRecord(input, 'selector');
  switch (row.by) {
    case 'id':
      exactRecord(row, ['by', 'marketId'], 'selector');
      return Object.freeze({ by: 'id', marketId: marketId(row.marketId, 'selector.marketId') });
    case 'domain':
      exactRecord(row, ['by', 'hostname'], 'selector');
      return Object.freeze({ by: 'domain', hostname: hostname(row.hostname, 'selector.hostname') });
    case 'country':
      exactRecord(row, ['by', 'countryCode'], 'selector');
      return Object.freeze({ by: 'country', countryCode: countryCode(row.countryCode, 'selector.countryCode') });
    case 'none':
      exactRecord(row, ['by'], 'selector');
      return Object.freeze({ by: 'none' });
    default:
      return invalid('selector.by', 'debe declarar id, domain, country o none.');
  }
}

/** Resuelve solo contexto; nunca convierte divisas ni decide país de envío o jurisdicción fiscal. */
export function resolveMarket(catalogInput: unknown, selectorInput: unknown): MarketResolution {
  const catalog = defineMarketCatalog(catalogInput);
  const selector = defineSelector(selectorInput);
  const source: MarketResolutionSource = {
    catalogId: catalog.id, catalogVersion: catalog.version, selector,
  };
  let fallbackReason: MarketFallbackReason;
  switch (selector.by) {
    case 'id': {
      const market = catalog.markets.find((item) => item.id === selector.marketId);
      return market
        ? Object.freeze({ ...source, outcome: 'matched', matchedBy: 'id', market })
        : Object.freeze({ ...source, outcome: 'unresolved', reason: 'unknown_market_id' });
    }
    case 'domain': {
      const market = catalog.markets.find((item) => item.domains.includes(selector.hostname));
      if (market) return Object.freeze({ ...source, outcome: 'matched', matchedBy: 'domain', market });
      fallbackReason = 'domain_not_matched';
      break;
    }
    case 'country': {
      const candidates = catalog.markets.filter((item) => item.countryCodes.includes(selector.countryCode));
      if (candidates.length > 1) {
        return Object.freeze({ ...source, outcome: 'unresolved', reason: 'ambiguous_country' });
      }
      if (candidates.length === 1) {
        return Object.freeze({ ...source, outcome: 'matched', matchedBy: 'country', market: candidates[0]! });
      }
      fallbackReason = 'country_not_matched';
      break;
    }
    case 'none':
      fallbackReason = 'no_context';
  }
  if (catalog.fallback.strategy === 'none') {
    return Object.freeze({ ...source, outcome: 'unresolved', reason: 'fallback_disabled' });
  }
  const fallbackId = catalog.fallback.marketId;
  const market = catalog.markets.find((item) => item.id === fallbackId)!;
  return Object.freeze({ ...source, outcome: 'fallback', reason: fallbackReason, market });
}

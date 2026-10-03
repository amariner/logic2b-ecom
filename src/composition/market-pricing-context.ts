import { resolveMarket, type MarketResolution } from '../modules/markets';
import type { PriceRuleContext } from '../modules/pricing';

type SelectedMarketResolution = Exclude<MarketResolution, { outcome: 'unresolved' }>;
type UnresolvedMarketResolution = Extract<MarketResolution, { outcome: 'unresolved' }>;

export type MarketPricingContextResult =
  | Readonly<{
    status: 'resolved';
    baseCurrency: string;
    resolution: SelectedMarketResolution;
    context: PriceRuleContext;
  }>
  | Readonly<{
    status: 'blocked';
    reason: 'market_unresolved';
    baseCurrency: string;
    resolution: UnresolvedMarketResolution;
    context: null;
  }>
  | Readonly<{
    status: 'blocked';
    reason: 'currency_mismatch';
    baseCurrency: string;
    resolution: SelectedMarketResolution;
    context: null;
  }>;

export class MarketPricingContextContractError extends Error {
  readonly code = 'market_pricing_context_contract_invalid';

  constructor(message: string) {
    super(message);
    this.name = 'MarketPricingContextContractError';
  }
}

function invalid(field: string): never {
  throw new MarketPricingContextContractError(`${field} no es válido para el contexto de precios.`);
}

function inputRecord(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid('input');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid('input');
  const expected = ['catalog', 'selector', 'baseCurrency', 'at', 'channel'];
  const keys = Reflect.ownKeys(input);
  if (keys.length !== expected.length) return invalid('input');
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (typeof key !== 'string' || !expected.includes(key) || !descriptor.enumerable || !('value' in descriptor)) {
      return invalid('input');
    }
  }
  return input as Record<string, unknown>;
}

function baseCurrency(value: unknown): string {
  if (typeof value !== 'string') return invalid('baseCurrency');
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return invalid('baseCurrency');
  return currency;
}

function at(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return invalid('at');
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return invalid('at');
  const canonical = new Date(parsed).toISOString();
  if (value !== canonical && value !== canonical.replace('.000Z', 'Z')) return invalid('at');
  return value;
}

function channel(value: unknown): string {
  if (typeof value !== 'string') return invalid('channel');
  const normalized = value.trim();
  // Conserva el contrato y las comparaciones exactas de PriceRuleContext.
  if (normalized.length < 2 || normalized.length > 40) return invalid('channel');
  return normalized;
}

/**
 * Composición pura para QA: catálogo versionado y contexto recibidos explícitamente.
 * No acepta resoluciones externas ni determina qué selector merece confianza.
 * Una moneda distinta bloquea el contexto; no convierte ni reetiqueta importes.
 * La compatibilidad de moneda tampoco habilita cobros, idiomas ni envíos.
 */
export function resolveMarketPricingContext(input: unknown): MarketPricingContextResult {
  const record = inputRecord(input);
  const currency = baseCurrency(record.baseCurrency);
  const instant = at(record.at);
  const pricingChannel = channel(record.channel);
  const resolution = resolveMarket(record.catalog, record.selector);
  if (resolution.outcome === 'unresolved') {
    return Object.freeze({ status: 'blocked', reason: 'market_unresolved', baseCurrency: currency,
      resolution, context: null });
  }
  if (resolution.market.currency !== currency) {
    return Object.freeze({ status: 'blocked', reason: 'currency_mismatch', baseCurrency: currency,
      resolution, context: null });
  }
  const context: PriceRuleContext = Object.freeze({
    at: instant, currency, market: resolution.market.id, channel: pricingChannel,
  });
  return Object.freeze({ status: 'resolved', baseCurrency: currency, resolution, context });
}

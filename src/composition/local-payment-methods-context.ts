import { defineCurrencyCatalog, type CurrencyCatalog } from '../modules/currencies';
import { defineMarketCatalog, type MarketCatalog } from '../modules/markets';
import {
  LocalPaymentMethodContractError, defineLocalPaymentMethodPolicy, defineLocalPaymentMethodRequest,
  previewLocalPaymentMethods, type LocalPaymentMethodPolicy, type LocalPaymentMethodsPreview,
} from '../modules/payments';

export type LocalPaymentMethodsContextPreview = Readonly<{
  markets: MarketCatalog;
  currencies: CurrencyCatalog;
  policy: LocalPaymentMethodPolicy;
  result: LocalPaymentMethodsPreview;
}>;

function invalid(field: string, explanation: string): never {
  throw new LocalPaymentMethodContractError(`${field}: ${explanation}`);
}

function inputRecord(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid('input', 'debe ser un objeto de datos.');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid('input', 'debe contener datos propios.');
  const expected = ['markets', 'currencies', 'policy', 'request'];
  const keys = Reflect.ownKeys(input);
  if (keys.length !== expected.length) return invalid('input', 'contiene campos ausentes o desconocidos.');
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (typeof key !== 'string' || !expected.includes(key) || !descriptor.enumerable || !('value' in descriptor)) {
      return invalid('input', 'solo admite los campos declarados como datos propios enumerables.');
    }
    copy[key] = descriptor.value;
  }
  return copy;
}

/**
 * Composición de fixtures sobre el importe original y catálogos explícitos.
 * Valida también reglas ajenas al contexto o desactivadas; una referencia rota
 * es un error de contrato, no una indisponibilidad comercial del método.
 * No selecciona mercados por fallback ni consulta precios presentados o FX.
 */
export function previewLocalPaymentMethodsContext(input: unknown): LocalPaymentMethodsContextPreview {
  const record = inputRecord(input);
  const markets = defineMarketCatalog(record.markets);
  const currencies = defineCurrencyCatalog(record.currencies);
  const policy = defineLocalPaymentMethodPolicy(record.policy);
  const request = defineLocalPaymentMethodRequest(record.request);

  for (const [field, value] of [['policy', policy], ['request', request]] as const) {
    if (value.marketCatalogRef.id !== markets.id || value.marketCatalogRef.version !== markets.version) {
      return invalid(`${field}.marketCatalogRef`, 'no coincide con el catálogo de mercados recibido.');
    }
    if (value.currencyCatalogRef.id !== currencies.id || value.currencyCatalogRef.version !== currencies.version) {
      return invalid(`${field}.currencyCatalogRef`, 'no coincide con el catálogo de monedas recibido.');
    }
  }

  const marketById = new Map(markets.markets.map(market => [market.id, market]));
  const currencyByCode = new Map(currencies.currencies.map(currency => [currency.code, currency]));
  for (const rule of policy.rules) {
    const market = marketById.get(rule.marketId);
    if (!market) return invalid('policy.rules.marketId', 'referencia un mercado ausente del catálogo.');
    const currency = currencyByCode.get(rule.currency);
    if (!currency) return invalid('policy.rules.currency', 'referencia una moneda ausente del catálogo.');
    if (rule.exponent !== currency.exponent) return invalid('policy.rules.exponent', 'no coincide con la unidad declarada en el catálogo.');
    if (rule.currency !== market.currency) return invalid('policy.rules.currency', 'debe ser la moneda nominal de su mercado.');
  }

  const market = marketById.get(request.marketId);
  if (!market) return invalid('request.marketId', 'requiere un mercado explícito presente en el catálogo.');
  const currency = currencyByCode.get(request.original.currency);
  if (!currency) return invalid('request.original.currency', 'referencia una moneda ausente del catálogo.');
  if (request.original.exponent !== currency.exponent) return invalid('request.original.exponent', 'no coincide con la unidad declarada en el catálogo.');
  if (request.original.currency !== market.currency) return invalid('request.original.currency', 'debe ser la moneda nominal del mercado solicitado.');

  return Object.freeze({ markets, currencies, policy, result: previewLocalPaymentMethods({ policy, request }) });
}

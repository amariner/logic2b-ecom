import type { Platform } from './create-platform';
import {
  CURRENCY_PRESENTMENT_PROFILE, createFixtureFxAdapter, defineCurrencyCatalog,
  definePresentmentRequest, previewCurrencyPresentment,
  type CurrencyPresentmentResult, type FxResponse, type PresentedAmount,
} from '../modules/currencies';
import { defineMarketCatalog } from '../modules/markets';
import {
  defineLocalPaymentMethodPolicy, type LocalPaymentMethodResult,
  type LocalPaymentMethodRule, type LocalPaymentMethodsPreview,
} from '../modules/payments';
import { previewLocalPaymentMethodsContext } from './local-payment-methods-context';

export type CurrencyMethodsDemoSelection = Readonly<{
  marketId: 'ES' | 'FR' | 'JP' | 'KW';
  amountId: 'eur-2975' | 'eur-0' | 'eur-499' | 'eur-500' | 'eur-5000' | 'eur-5001' | 'jpy-3000' | 'kwd-9875';
  targetCurrency: 'EUR' | 'JPY' | 'KWD';
  fxScenario: 'current' | 'expired' | 'unavailable';
}>;
export type CurrencyMethodsDemoFeedback = Readonly<{
  tone: 'info'; code: 'initial' | 'selection_changed' | 'nominal_amount_reset'; message: string;
}>;
export type CurrencyMethodsDemoState = Readonly<{
  selection: CurrencyMethodsDemoSelection; feedback: CurrencyMethodsDemoFeedback;
}>;
export type CurrencyMethodsDemoMoney = PresentedAmount & Readonly<{ formatted: string }>;
export type CurrencyMethodsDemoView = Readonly<{
  selection: CurrencyMethodsDemoSelection;
  marketOptions: readonly Readonly<{ id: CurrencyMethodsDemoSelection['marketId']; label: string }>[];
  amountOptions: readonly Readonly<{ id: CurrencyMethodsDemoSelection['amountId']; label: string }>[];
  targetCurrencyOptions: readonly Readonly<{ id: CurrencyMethodsDemoSelection['targetCurrency']; label: string }>[];
  fxScenarioOptions: readonly Readonly<{ id: CurrencyMethodsDemoSelection['fxScenario']; label: string }>[];
  context: Readonly<{ marketLabel: string; original: CurrencyMethodsDemoMoney }>;
  presentment: Readonly<{
    outcome: CurrencyPresentmentResult['outcome']; label: string; message: string;
    reason: Extract<CurrencyPresentmentResult, { outcome: 'unresolved' }>['reason'] | null;
    original: CurrencyMethodsDemoMoney; presented: CurrencyMethodsDemoMoney | null; at: string;
    evidence: Readonly<{ quotedAt: string; expiresAt: string; rateLabel: string }> | null;
  }>;
  methods: readonly Readonly<{
    id: string; label: string; outcome: LocalPaymentMethodResult['outcome']; available: boolean;
    reason: LocalPaymentMethodResult['reason']; reasonLabels: readonly string[];
    rangeLabel: string | null;
    range: Readonly<Pick<LocalPaymentMethodRule, 'currency' | 'exponent' | 'minMinor' | 'maxMinor'>> | null;
  }>[];
  presentmentResult: CurrencyPresentmentResult;
  methodsResult: LocalPaymentMethodsPreview;
  feedback: CurrencyMethodsDemoFeedback;
}>;

/** Gate de presentación; no activa métodos de pago ni accede a bindings. */
export function canShowCurrencyMethodsDemo(
  env: Readonly<{ DEMO_MODE?: string | undefined }> | undefined,
  platform: Pick<Platform, 'manifest'>,
): boolean {
  return platform.manifest.deployment.mode === 'demo' && env?.DEMO_MODE === 'true';
}

const CURRENCIES = defineCurrencyCatalog({ schemaVersion: 1, id: 'demo.currency.catalog', version: 1,
  currencies: [{ code: 'EUR', exponent: 2 }, { code: 'JPY', exponent: 0 }, { code: 'KWD', exponent: 3 }] });
const MARKET_OPTIONS = Object.freeze([
  Object.freeze({ id: 'ES' as const, label: 'España · EUR' }), Object.freeze({ id: 'FR' as const, label: 'Francia · EUR' }),
  Object.freeze({ id: 'JP' as const, label: 'Japón · JPY' }), Object.freeze({ id: 'KW' as const, label: 'Kuwait · KWD' }),
]);
const MARKETS = defineMarketCatalog({ schemaVersion: 1, id: 'demo.methods.markets', version: 1,
  markets: MARKET_OPTIONS.map(({ id }) => ({ id, countryCodes: [id], domains: [],
    currency: id === 'JP' ? 'JPY' : id === 'KW' ? 'KWD' : 'EUR', defaultLocale: 'es-ES' })), fallback: { strategy: 'none' } });
const TARGET_OPTIONS = Object.freeze([
  Object.freeze({ id: 'EUR' as const, label: 'EUR · 2 decimales' }),
  Object.freeze({ id: 'JPY' as const, label: 'JPY · sin decimales' }),
  Object.freeze({ id: 'KWD' as const, label: 'KWD · 3 decimales' }),
]);
const FX_OPTIONS = Object.freeze([
  Object.freeze({ id: 'current' as const, label: 'Tasa vigente' }),
  Object.freeze({ id: 'expired' as const, label: 'Tasa caducada' }),
  Object.freeze({ id: 'unavailable' as const, label: 'Sin cotización' }),
]);
type AmountFixture = PresentedAmount & Readonly<{ id: CurrencyMethodsDemoSelection['amountId'] }>;
const AMOUNTS: readonly AmountFixture[] = Object.freeze([
  ...[2975, 0, 499, 500, 5000, 5001].map((amountMinor): AmountFixture => Object.freeze({
    id: `eur-${amountMinor}` as CurrencyMethodsDemoSelection['amountId'], currency: 'EUR', exponent: 2, amountMinor,
  })),
  Object.freeze({ id: 'jpy-3000' as const, currency: 'JPY', exponent: 0 as const, amountMinor: 3000 }),
  Object.freeze({ id: 'kwd-9875' as const, currency: 'KWD', exponent: 3 as const, amountMinor: 9875 }),
]);
const REFS = Object.freeze({ currencyCatalogRef: Object.freeze({ id: CURRENCIES.id, version: CURRENCIES.version }),
  marketCatalogRef: Object.freeze({ id: MARKETS.id, version: MARKETS.version }) });
const METHOD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'method.transfer': 'Transferencia de ejemplo', 'method.local': 'Método local de ejemplo',
  'method.alternative': 'Método alternativo de ejemplo',
});
const POLICY = defineLocalPaymentMethodPolicy({ schemaVersion: 1, source: 'fixture', id: 'demo.methods.policy', version: 1,
  ...REFS, methods: Object.keys(METHOD_LABELS).map(id => ({ id })), rules: [
    { methodId: 'method.transfer', marketId: 'ES', currency: 'EUR', exponent: 2, enabled: true, minMinor: 500, maxMinor: 100000 },
    { methodId: 'method.transfer', marketId: 'FR', currency: 'EUR', exponent: 2, enabled: false, minMinor: 500, maxMinor: 100000 },
    { methodId: 'method.local', marketId: 'ES', currency: 'EUR', exponent: 2, enabled: true, minMinor: 100, maxMinor: 5000 },
    { methodId: 'method.local', marketId: 'FR', currency: 'EUR', exponent: 2, enabled: true, minMinor: 100, maxMinor: 5000 },
    { methodId: 'method.local', marketId: 'JP', currency: 'JPY', exponent: 0, enabled: true, minMinor: 1000, maxMinor: 20000 },
    { methodId: 'method.alternative', marketId: 'KW', currency: 'KWD', exponent: 3, enabled: true, minMinor: 1000, maxMinor: 50000 },
  ] });
const REASON_LABELS: Readonly<Record<Exclude<LocalPaymentMethodResult['reason'], null>, string>> = Object.freeze({
  not_configured: 'Sin regla para este mercado y su moneda original.',
  disabled: 'Desactivado para este mercado en el ejemplo.',
  below_minimum: 'El importe original está por debajo del mínimo.',
  above_maximum: 'El importe original supera el máximo.',
});
const FEEDBACK = Object.freeze({
  initial: Object.freeze({ tone: 'info' as const, code: 'initial' as const,
    message: 'Explora importes y métodos ficticios. Las selecciones solo cambian este ejemplo en memoria.' }),
  selection_changed: Object.freeze({ tone: 'info' as const, code: 'selection_changed' as const,
    message: 'Ejemplo actualizado. Los métodos se evalúan con el importe original, independientemente de la presentación en otra moneda.' }),
  nominal_amount_reset: Object.freeze({ tone: 'info' as const, code: 'nominal_amount_reset' as const,
    message: 'Mercado cambiado; se carga un importe independiente de ejemplo en su moneda original. No se ha convertido el importe anterior.' }),
});

function record(input: unknown, keys: readonly string[], partial = false): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Datos del ejemplo inválidos.');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new RangeError('Se requieren datos propios del ejemplo.');
  const ownKeys = Reflect.ownKeys(input);
  if ((!partial && ownKeys.length !== keys.length) || (partial && ownKeys.length === 0)) throw new RangeError('Campos del ejemplo incompletos.');
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of ownKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (typeof key !== 'string' || !keys.includes(key) || !descriptor.enumerable || !('value' in descriptor)) {
      throw new RangeError('El ejemplo solo admite los campos declarados como datos propios.');
    }
    copy[key] = descriptor.value;
  }
  return copy;
}

/** Formato decimal exacto: el exponente es explícito, nunca se consulta el valor ISO por defecto. */
export function formatDemoMinorAmount(input: PresentedAmount): string {
  const money = record(input, ['currency', 'amountMinor', 'exponent']);
  if (typeof money.currency !== 'string' || !/^[A-Z]{3}$/.test(money.currency) ||
    typeof money.amountMinor !== 'number' || !Number.isSafeInteger(money.amountMinor) || money.amountMinor < 0 || Object.is(money.amountMinor, -0) ||
    (money.exponent !== 0 && money.exponent !== 2 && money.exponent !== 3) || Object.is(money.exponent, -0)) {
    throw new RangeError('Importe o unidad del ejemplo inválidos.');
  }
  const minor = BigInt(money.amountMinor);
  const scale = 10n ** BigInt(money.exponent);
  const integer = new Intl.NumberFormat('es-ES', { style: 'decimal', useGrouping: 'always', maximumFractionDigits: 0 }).format(minor / scale);
  const fraction = money.exponent === 0 ? '' : `,${(minor % scale).toString().padStart(money.exponent, '0')}`;
  return `${integer}${fraction} ${money.currency}`;
}
function demoMoney(money: PresentedAmount): CurrencyMethodsDemoMoney {
  return Object.freeze({ ...money, formatted: formatDemoMinorAmount(money) });
}
function defineSelection(input: unknown): CurrencyMethodsDemoSelection {
  const row = record(input, ['marketId', 'amountId', 'targetCurrency', 'fxScenario']);
  const market = MARKETS.markets.find(({ id }) => id === row.marketId);
  const amount = AMOUNTS.find(({ id }) => id === row.amountId);
  if (!market || !amount || amount.currency !== market.currency ||
    !TARGET_OPTIONS.some(({ id }) => id === row.targetCurrency) || !FX_OPTIONS.some(({ id }) => id === row.fxScenario)) {
    throw new RangeError('Selección ajena a los casos compatibles del ejemplo.');
  }
  return Object.freeze({ marketId: row.marketId as CurrencyMethodsDemoSelection['marketId'], amountId: amount.id,
    targetCurrency: row.targetCurrency as CurrencyMethodsDemoSelection['targetCurrency'], fxScenario: row.fxScenario as CurrencyMethodsDemoSelection['fxScenario'] });
}
function defineState(input: unknown): CurrencyMethodsDemoState {
  const state = record(input, ['selection', 'feedback']);
  const selection = defineSelection(state.selection);
  const feedback = record(state.feedback, ['tone', 'code', 'message']);
  if ((feedback.code !== 'initial' && feedback.code !== 'selection_changed' && feedback.code !== 'nominal_amount_reset') ||
    feedback.tone !== 'info' || feedback.message !== FEEDBACK[feedback.code].message) throw new RangeError('Estado del ejemplo inválido.');
  return Object.freeze({ selection, feedback: FEEDBACK[feedback.code] });
}

export function createCurrencyMethodsDemo(): CurrencyMethodsDemoState {
  return Object.freeze({ selection: Object.freeze({ marketId: 'ES', amountId: 'eur-2975', targetCurrency: 'JPY', fxScenario: 'current' }),
    feedback: FEEDBACK.initial });
}
export function configureCurrencyMethodsDemo(
  stateInput: CurrencyMethodsDemoState, input: Readonly<Partial<CurrencyMethodsDemoSelection>>,
): CurrencyMethodsDemoState {
  const state = defineState(stateInput);
  const patch = record(input, ['marketId', 'amountId', 'targetCurrency', 'fxScenario'], true);
  const market = MARKETS.markets.find(({ id }) => id === (patch.marketId ?? state.selection.marketId));
  // Campos explícitos inválidos (incluido undefined) se rechazan al normalizar; no son ausencia.
  const currentAmount = AMOUNTS.find(({ id }) => id === state.selection.amountId)!;
  const resetAmount = !Object.hasOwn(patch, 'amountId') && market !== undefined && market.currency !== currentAmount.currency;
  const amountId = resetAmount ? AMOUNTS.find(({ currency }) => currency === market.currency)!.id : state.selection.amountId;
  return Object.freeze({ selection: defineSelection({ ...state.selection, amountId, ...patch }),
    feedback: resetAmount ? FEEDBACK.nominal_amount_reset : FEEDBACK.selection_changed });
}

// Instantes intencionadamente fijos de un ejemplo: no se consulta el reloj ni se renueva evidencia.
const AT = '2026-10-03T12:00:00.000Z';
const QUOTED_AT = '2026-10-03T11:00:00.000Z';
const EXPIRES_AT = '2026-10-03T13:00:00.000Z';
const ADAPTER_ID = 'demo.currency.adapter';
const RATES = Object.freeze([
  Object.freeze({ baseCurrency: 'EUR', targetCurrency: 'JPY', numerator: 160, denominator: 1 }),
  Object.freeze({ baseCurrency: 'EUR', targetCurrency: 'KWD', numerator: 33, denominator: 100 }),
  Object.freeze({ baseCurrency: 'JPY', targetCurrency: 'EUR', numerator: 1, denominator: 160 }),
  Object.freeze({ baseCurrency: 'JPY', targetCurrency: 'KWD', numerator: 1, denominator: 500 }),
  Object.freeze({ baseCurrency: 'KWD', targetCurrency: 'EUR', numerator: 3, denominator: 1 }),
  Object.freeze({ baseCurrency: 'KWD', targetCurrency: 'JPY', numerator: 500, denominator: 1 }),
]);
function requestFor(amount: AmountFixture, targetCurrency: string, scenario: CurrencyMethodsDemoSelection['fxScenario']) {
  return definePresentmentRequest({ schemaVersion: 1,
    id: `demo.fx.${amount.id}.${targetCurrency.toLowerCase()}.${amount.currency === targetCurrency ? 'identity' : scenario}`,
    profile: CURRENCY_PRESENTMENT_PROFILE, at: AT, catalog: CURRENCIES,
    original: { currency: amount.currency, amountMinor: amount.amountMinor }, targetCurrency });
}
// 8 importes × 2 destinos distintos × 2 vigencias = 32 casos. ES y FR comparten EUR.
// Unavailable carece de caso, e identidad no consulta el adaptador.
const FX_ADAPTER = createFixtureFxAdapter({ adapterId: ADAPTER_ID, cases: AMOUNTS.flatMap(amount =>
  TARGET_OPTIONS.filter(({ id }) => id !== amount.currency).flatMap(({ id: targetCurrency }) =>
    (['current', 'expired'] as const).map((scenario): FxResponse => ({ source: 'fixture', adapterId: ADAPTER_ID,
      request: requestFor(amount, targetCurrency, scenario), outcome: 'quoted', evidenceRef: `demo.fx.evidence.${amount.id}.${targetCurrency.toLowerCase()}.${scenario}`,
      quotedAt: QUOTED_AT, expiresAt: scenario === 'expired' ? AT : EXPIRES_AT,
      rate: RATES.find(rate => rate.baseCurrency === amount.currency && rate.targetCurrency === targetCurrency)!,
    })))) });

function presentmentMessage(result: CurrencyPresentmentResult): Readonly<{ label: string; message: string }> {
  if (result.outcome === 'identity') return { label: 'Misma moneda',
    message: 'El importe original se conserva exactamente. No se necesita una tasa ni evidencia de conversión.' };
  if (result.outcome === 'converted') return { label: 'Importe presentado',
    message: 'La tasa ficticia vigente presenta el importe en otra moneda y redondea una vez a su unidad menor. No cambia el importe original ni los métodos.' };
  if (result.reason === 'expired') return { label: 'Tasa caducada',
    message: 'La evidencia ha caducado en el instante del ejemplo. Se conserva para explicar el caso y el importe presentado queda sin calcular.' };
  return { label: 'Sin cotización', message: 'No hay evidencia de conversión utilizable para este caso. El importe original y sus métodos se conservan.' };
}

/** Proyecciones independientes: los métodos solo reciben el importe original y los catálogos nominales. */
export function getCurrencyMethodsDemoView(stateInput: CurrencyMethodsDemoState): CurrencyMethodsDemoView {
  const state = defineState(stateInput);
  const amount = AMOUNTS.find(({ id }) => id === state.selection.amountId)!;
  const request = requestFor(amount, state.selection.targetCurrency, state.selection.fxScenario);
  const presentmentResult = previewCurrencyPresentment(amount.currency === request.targetCurrency
    ? { mode: 'identity', request } : { mode: 'fx', request, expectedAdapterId: ADAPTER_ID, response: FX_ADAPTER.quote(request) });
  const methodsResult = previewLocalPaymentMethodsContext({ markets: MARKETS, currencies: CURRENCIES, policy: POLICY,
    request: { schemaVersion: 1, id: `demo.methods.${state.selection.marketId.toLowerCase()}.${amount.id}`,
      marketId: state.selection.marketId, original: { currency: amount.currency, exponent: amount.exponent, amountMinor: amount.amountMinor }, ...REFS } }).result;
  const original = demoMoney(presentmentResult.original);
  const evidence = presentmentResult.response?.outcome === 'quoted' ? presentmentResult.response : null;
  const methods = Object.freeze(methodsResult.methods.map((method) => {
    const rule = method.matchedRule;
    return Object.freeze({ id: method.methodId, label: METHOD_LABELS[method.methodId]!, outcome: method.outcome,
      available: method.outcome === 'available_in_fixture', reason: method.reason,
      reasonLabels: Object.freeze(method.reason === null ? [] : [REASON_LABELS[method.reason]]),
      range: rule ? Object.freeze({ currency: rule.currency, exponent: rule.exponent, minMinor: rule.minMinor, maxMinor: rule.maxMinor }) : null,
      rangeLabel: rule ? `De ${formatDemoMinorAmount({ currency: rule.currency, exponent: rule.exponent, amountMinor: rule.minMinor })} a ${formatDemoMinorAmount({ currency: rule.currency, exponent: rule.exponent, amountMinor: rule.maxMinor })}, ambos incluidos.` : null });
  }));
  return Object.freeze({ selection: state.selection, marketOptions: MARKET_OPTIONS, targetCurrencyOptions: TARGET_OPTIONS, fxScenarioOptions: FX_OPTIONS,
    amountOptions: Object.freeze(AMOUNTS.filter(({ currency }) => currency === amount.currency).map(({ id, ...money }) => Object.freeze({ id, label: formatDemoMinorAmount(money) }))),
    context: Object.freeze({ marketLabel: MARKET_OPTIONS.find(({ id }) => id === state.selection.marketId)!.label, original }),
    presentment: Object.freeze({ outcome: presentmentResult.outcome, ...presentmentMessage(presentmentResult),
      reason: presentmentResult.outcome === 'unresolved' ? presentmentResult.reason : null,
      original, presented: presentmentResult.presented ? demoMoney(presentmentResult.presented) : null, at: AT,
      evidence: evidence ? Object.freeze({ quotedAt: evidence.quotedAt, expiresAt: evidence.expiresAt,
        rateLabel: `${evidence.rate.denominator} ${evidence.rate.baseCurrency} = ${evidence.rate.numerator} ${evidence.rate.targetCurrency}` }) : null }),
    methods, presentmentResult, methodsResult, feedback: state.feedback });
}

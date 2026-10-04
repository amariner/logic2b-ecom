export { CurrencyContractError } from './domain/contract-data';
export {
  CURRENCY_PRESENTMENT_PROFILE,
  MAX_CURRENCIES,
  defineCurrencyCatalog,
  definePresentmentRequest,
  defineFxResponse,
  previewCurrencyPresentment,
  type CurrencyUnit,
  type CurrencyCatalog,
  type PresentmentRequest,
  type FxRate,
  type FxResponse,
  type PresentedAmount,
  type CurrencyPresentmentResult,
} from './domain/currency-presentment';
export type { FxAdapter } from './application/fx-adapter';
export { MAX_FIXTURE_FX_CASES, createFixtureFxAdapter } from './infrastructure/fixture-fx-adapter';

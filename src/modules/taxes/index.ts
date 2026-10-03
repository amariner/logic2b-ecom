export { TaxContractError } from './domain/contract-data';

export {
  TAX_CALCULATION_PROFILE,
  MAX_TAX_LINES,
  defineTaxRequest,
  defineTaxAssessmentResponse,
  previewTaxCalculation,
  type TaxRequestLine,
  type TaxRequest,
  type TaxDecision,
  type TaxAssessmentPolicy,
  type TaxAssessmentResponse,
  type TaxAmounts,
  type TaxCalculationLine,
  type TaxCalculationSnapshot,
  type TaxCalculationResult,
} from './domain/tax-calculation';
export type { TaxAdapter } from './application/tax-assessment';
export { MAX_FIXTURE_TAX_CASES, createFixtureTaxAdapter } from './infrastructure/fixture-tax-adapter';

export {
  VAT_ID_OUTCOMES,
  defineVatIdQuery,
  defineVatIdEvidence,
  defineVatIdValidationResponse,
  evaluateVatIdEvidence,
  type VatIdOutcome,
  type VatIdQuery,
  type VatIdEvidence,
  type VatIdValidationResponse,
  type VatIdEvidenceEvaluation,
} from './domain/vat-id-evidence';
export type { VatIdValidationAdapter } from './application/vat-id-validation';
export { MAX_FIXTURE_VAT_ID_CASES, createFixtureVatIdAdapter } from './infrastructure/fixture-vat-id-adapter';

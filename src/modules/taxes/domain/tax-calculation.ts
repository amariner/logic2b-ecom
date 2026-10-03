import {
  compareTokens, dataArray, dataRecord, enumValue, exactRecord, invalid,
  nonNegativeInteger, opaqueId, positiveInteger, utcTimestamp,
} from './contract-data';

export const TAX_CALCULATION_PROFILE = 'eur-line-tax-half-up-v1';
export const MAX_TAX_LINES = 100;

/** Importe de línea completo tras descuentos; no se recalculan cantidad ni descuentos. */
export type TaxRequestLine = Readonly<{
  id: string;
  kind: 'goods' | 'shipping';
  amountCents: number;
  priceBasis: 'included' | 'excluded';
}>;
export type TaxRequest = Readonly<{
  schemaVersion: 1;
  id: string;
  profile: typeof TAX_CALCULATION_PROFILE;
  at: string;
  currency: 'EUR';
  lines: readonly TaxRequestLine[];
}>;
type TaxRuleReference = Readonly<{ lineId: string; jurisdictionRef: string; ruleId: string }>;
export type TaxDecision =
  | (TaxRuleReference & Readonly<{ treatment: 'taxable'; rateBasisPoints: number }>)
  | (TaxRuleReference & Readonly<{ treatment: 'zero_rate' }>)
  | (TaxRuleReference & Readonly<{ treatment: 'exempt'; exemptionEvidenceRef: string }>)
  | Readonly<{ lineId: string; treatment: 'unresolved'; reason: 'not_configured' | 'unsupported' | 'missing_evidence' }>;
export type TaxAssessmentPolicy = Readonly<{ id: string; version: number }>;
type TaxResponseIdentity = Readonly<{ source: 'fixture'; adapterId: string; request: TaxRequest }>;
export type TaxAssessmentResponse = TaxResponseIdentity & (
  | Readonly<{ outcome: 'assessed'; assessedAt: string; expiresAt: string; policy: TaxAssessmentPolicy; decisions: readonly TaxDecision[] }>
  | Readonly<{ outcome: 'unavailable'; reason: 'not_configured' | 'unsupported' | 'unavailable' }>
);
export type TaxAmounts = Readonly<{ netCents: number; taxCents: number; grossCents: number }>;
export type TaxCalculationLine = Readonly<{
  line: TaxRequestLine;
  decision: TaxDecision;
  netCents: number | null;
  taxCents: number | null;
  grossCents: number | null;
}>;
/** Artefacto calculado en memoria; no acredita persistencia ni validez fiscal operativa. */
export type TaxCalculationSnapshot = Readonly<{
  schemaVersion: 1;
  profile: typeof TAX_CALCULATION_PROFILE;
  source: 'fixture';
  adapterId: string;
  request: TaxRequest;
  assessedAt: string;
  expiresAt: string;
  policy: TaxAssessmentPolicy;
  lines: readonly TaxCalculationLine[];
  totals: TaxAmounts | null;
}>;
type TaxCalculationIdentity = Readonly<{ request: TaxRequest; adapterId: string; response: TaxAssessmentResponse }>;
export type TaxCalculationResult = TaxCalculationIdentity & (
  | Readonly<{ outcome: 'calculated'; snapshot: TaxCalculationSnapshot }>
  | Readonly<{ outcome: 'unresolved'; reason: 'line_unresolved'; snapshot: TaxCalculationSnapshot }>
  | Readonly<{ outcome: 'unresolved'; reason: 'assessment_unavailable' | 'assessment_future' | 'assessment_stale'; snapshot: null }>
);

export function defineTaxRequest(input: unknown): TaxRequest {
  const record = exactRecord(input, ['schemaVersion', 'id', 'profile', 'at', 'currency', 'lines'], 'request');
  if (record.schemaVersion !== 1) return invalid('request.schemaVersion', 'debe ser 1.');
  if (record.profile !== TAX_CALCULATION_PROFILE) return invalid('request.profile', 'perfil fiscal no admitido.');
  if (record.currency !== 'EUR') return invalid('request.currency', 'este perfil solo admite EUR.');
  const id = opaqueId(record.id, 'request.id');
  const at = utcTimestamp(record.at, 'request.at');
  const ids = new Set<string>();
  const lines = dataArray(record.lines, 1, MAX_TAX_LINES, 'request.lines').map((inputLine, index): TaxRequestLine => {
    const field = `request.lines.${index}`;
    const line = exactRecord(inputLine, ['id', 'kind', 'amountCents', 'priceBasis'], field);
    const lineId = opaqueId(line.id, `${field}.id`);
    if (ids.has(lineId)) return invalid(`${field}.id`, 'línea duplicada.');
    ids.add(lineId);
    return Object.freeze({ id: lineId, kind: enumValue(line.kind, ['goods', 'shipping'], `${field}.kind`),
      amountCents: nonNegativeInteger(line.amountCents, `${field}.amountCents`),
      priceBasis: enumValue(line.priceBasis, ['included', 'excluded'], `${field}.priceBasis`) });
  });
  return Object.freeze({ schemaVersion: 1, id, profile: TAX_CALCULATION_PROFILE, at, currency: 'EUR',
    lines: Object.freeze(lines.sort((a, b) => compareTokens(a.id, b.id))) });
}

function defineDecision(input: unknown, field: string): TaxDecision {
  const record = dataRecord(input, field);
  const treatment = enumValue(record.treatment, ['taxable', 'zero_rate', 'exempt', 'unresolved'], `${field}.treatment`);
  const keys = treatment === 'unresolved' ? ['lineId', 'treatment', 'reason']
    : ['lineId', 'treatment', 'jurisdictionRef', 'ruleId', ...(treatment === 'taxable' ? ['rateBasisPoints']
      : treatment === 'exempt' ? ['exemptionEvidenceRef'] : [])];
  exactRecord(record, keys, field);
  const lineId = opaqueId(record.lineId, `${field}.lineId`);
  if (treatment === 'unresolved') return Object.freeze({ lineId, treatment,
    reason: enumValue(record.reason, ['not_configured', 'unsupported', 'missing_evidence'], `${field}.reason`) });
  const reference = { lineId, jurisdictionRef: opaqueId(record.jurisdictionRef, `${field}.jurisdictionRef`),
    ruleId: opaqueId(record.ruleId, `${field}.ruleId`) };
  if (treatment === 'taxable') {
    const rateBasisPoints = positiveInteger(record.rateBasisPoints, `${field}.rateBasisPoints`);
    if (rateBasisPoints > 10000) return invalid(`${field}.rateBasisPoints`, 'debe estar entre 1 y 10000.');
    return Object.freeze({ ...reference, treatment, rateBasisPoints });
  }
  if (treatment === 'exempt') return Object.freeze({ ...reference, treatment,
    exemptionEvidenceRef: opaqueId(record.exemptionEvidenceRef, `${field}.exemptionEvidenceRef`) });
  return Object.freeze({ ...reference, treatment });
}

/** La copia completa de la petición impide correlacionar importes por ID solamente. */
export function defineTaxAssessmentResponse(input: unknown): TaxAssessmentResponse {
  const record = dataRecord(input, 'response');
  const outcome = enumValue(record.outcome, ['assessed', 'unavailable'], 'response.outcome');
  exactRecord(record, ['source', 'adapterId', 'request', 'outcome', ...(outcome === 'assessed'
    ? ['assessedAt', 'expiresAt', 'policy', 'decisions'] : ['reason'])], 'response');
  if (record.source !== 'fixture') return invalid('response.source', 'solo se admite evidencia fixture.');
  const adapterId = opaqueId(record.adapterId, 'response.adapterId');
  const request = defineTaxRequest(record.request);
  if (outcome === 'unavailable') return Object.freeze({ source: 'fixture', adapterId, request, outcome,
    reason: enumValue(record.reason, ['not_configured', 'unsupported', 'unavailable'], 'response.reason') });
  const assessedAt = utcTimestamp(record.assessedAt, 'response.assessedAt');
  const expiresAt = utcTimestamp(record.expiresAt, 'response.expiresAt');
  if (assessedAt >= expiresAt) return invalid('response.expiresAt', 'debe ser posterior a assessedAt.');
  const policyRecord = exactRecord(record.policy, ['id', 'version'], 'response.policy');
  const policy = Object.freeze({ id: opaqueId(policyRecord.id, 'response.policy.id'), version: positiveInteger(policyRecord.version, 'response.policy.version') });
  const lineIds = new Set(request.lines.map((line) => line.id));
  const decisions = dataArray(record.decisions, request.lines.length, request.lines.length, 'response.decisions')
    .map((value, index) => defineDecision(value, `response.decisions.${index}`));
  const decidedIds = new Set<string>();
  for (const decision of decisions) {
    if (!lineIds.has(decision.lineId)) return invalid('response.decisions.lineId', 'línea ajena a la petición.');
    if (decidedIds.has(decision.lineId)) return invalid('response.decisions.lineId', 'decisión de línea duplicada.');
    decidedIds.add(decision.lineId);
  }
  return Object.freeze({ source: 'fixture', adapterId, request, outcome, assessedAt, expiresAt, policy,
    decisions: Object.freeze(decisions.sort((a, b) => compareTokens(a.lineId, b.lineId))) });
}

function safeCents(amount: bigint, field: string): number {
  if (amount < 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) return invalid(field, 'el resultado supera el rango monetario seguro.');
  return Number(amount);
}

function halfUp(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

function calculateLine(line: TaxRequestLine, decision: TaxDecision): TaxCalculationLine {
  if (decision.treatment === 'unresolved') return Object.freeze({ line, decision, netCents: null, taxCents: null, grossCents: null });
  const amount = BigInt(line.amountCents);
  const rate = decision.treatment === 'taxable' ? BigInt(decision.rateBasisPoints) : 0n;
  const tax = halfUp(amount * rate, line.priceBasis === 'included' ? 10000n + rate : 10000n);
  const net = line.priceBasis === 'included' ? amount - tax : amount;
  const gross = line.priceBasis === 'included' ? amount : amount + tax;
  return Object.freeze({ line, decision, netCents: safeCents(net, 'calculation.netCents'),
    taxCents: safeCents(tax, 'calculation.taxCents'), grossCents: safeCents(gross, 'calculation.grossCents') });
}

/** Cálculo por línea en EUR; no es cotización de compra ni determina tratamientos fiscales. */
export function previewTaxCalculation(input: unknown): TaxCalculationResult {
  const record = exactRecord(input, ['request', 'expectedAdapterId', 'response'], 'calculation');
  const request = defineTaxRequest(record.request);
  const adapterId = opaqueId(record.expectedAdapterId, 'calculation.expectedAdapterId');
  const response = defineTaxAssessmentResponse(record.response);
  if (adapterId !== response.adapterId) return invalid('calculation.response', 'el adaptador no coincide con el esperado.');
  if (JSON.stringify(request) !== JSON.stringify(response.request)) return invalid('calculation.response', 'la petición completa no coincide.');
  const identity = { request, adapterId, response };
  if (response.outcome === 'unavailable') return Object.freeze({ ...identity, outcome: 'unresolved', reason: 'assessment_unavailable', snapshot: null });
  if (response.assessedAt > request.at) return Object.freeze({ ...identity, outcome: 'unresolved', reason: 'assessment_future', snapshot: null });
  if (response.expiresAt <= request.at) return Object.freeze({ ...identity, outcome: 'unresolved', reason: 'assessment_stale', snapshot: null });
  const decisions = new Map(response.decisions.map((decision) => [decision.lineId, decision]));
  const lines = Object.freeze(request.lines.map((line) => calculateLine(line, decisions.get(line.id)!)));
  const unresolved = lines.some((line) => line.decision.treatment === 'unresolved');
  const totals = unresolved ? null : Object.freeze({
    netCents: safeCents(lines.reduce((sum, line) => sum + BigInt(line.netCents!), 0n), 'totals.netCents'),
    taxCents: safeCents(lines.reduce((sum, line) => sum + BigInt(line.taxCents!), 0n), 'totals.taxCents'),
    grossCents: safeCents(lines.reduce((sum, line) => sum + BigInt(line.grossCents!), 0n), 'totals.grossCents'),
  });
  const snapshot = Object.freeze({ schemaVersion: 1 as const, profile: TAX_CALCULATION_PROFILE, source: 'fixture' as const,
    adapterId, request, assessedAt: response.assessedAt, expiresAt: response.expiresAt, policy: response.policy, lines, totals });
  return unresolved ? Object.freeze({ ...identity, outcome: 'unresolved', reason: 'line_unresolved', snapshot })
    : Object.freeze({ ...identity, outcome: 'calculated', snapshot });
}

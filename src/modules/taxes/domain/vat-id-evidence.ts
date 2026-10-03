import { countryCode, dataRecord, enumValue, exactRecord, invalid, opaqueId, utcTimestamp } from './contract-data';

export const VAT_ID_OUTCOMES = Object.freeze(['valid', 'invalid', 'unavailable', 'unsupported'] as const);
export type VatIdOutcome = (typeof VAT_ID_OUTCOMES)[number];

/** Identidad estructural de una consulta; no valida un NIF/VAT real. */
export type VatIdQuery = Readonly<{
  schemaVersion: 1;
  id: string;
  countryCode: string;
  identifier: string;
}>;

export type VatIdEvidence = Readonly<{
  source: 'fixture';
  adapterId: string;
  query: VatIdQuery;
  evidenceRef: string;
  checkedAt: string;
  expiresAt: string;
  outcome: VatIdOutcome;
}>;

export type VatIdValidationResponse =
  | Readonly<{ status: 'evidence'; evidence: VatIdEvidence }>
  | Readonly<{ status: 'unavailable'; reason: 'not_configured'; adapterId: string; query: VatIdQuery; evidence: null }>;

type EvaluationContext = Readonly<{ adapterId: string; query: VatIdQuery; at: string }>;

export type VatIdEvidenceEvaluation =
  | Readonly<EvaluationContext & { status: 'usable'; outcome: 'valid' | 'invalid'; evidence: VatIdEvidence }>
  | Readonly<EvaluationContext & { status: 'unusable';
    reason: 'not_configured' | 'future' | 'expired' | 'unavailable' | 'unsupported'; evidence: VatIdEvidence | null }>;

export function defineVatIdQuery(input: unknown): VatIdQuery {
  const row = exactRecord(input, ['schemaVersion', 'id', 'countryCode', 'identifier'], 'query');
  if (row.schemaVersion !== 1) return invalid('query.schemaVersion', 'debe ser 1.');
  const id = opaqueId(row.id, 'query.id');
  const country = countryCode(row.countryCode, 'query.countryCode');
  if (typeof row.identifier !== 'string' || !/^[A-Z0-9]{1,32}$/.test(row.identifier)) {
    return invalid('query.identifier', 'debe contener entre 1 y 32 caracteres ASCII alfanuméricos en mayúsculas.');
  }
  return Object.freeze({ schemaVersion: 1, id, countryCode: country, identifier: row.identifier });
}

export function defineVatIdEvidence(input: unknown): VatIdEvidence {
  const row = exactRecord(input, ['source', 'adapterId', 'query', 'evidenceRef', 'checkedAt', 'expiresAt', 'outcome'], 'evidence');
  if (row.source !== 'fixture') return invalid('evidence.source', 'solo admite evidencia ficticia.');
  const adapterId = opaqueId(row.adapterId, 'evidence.adapterId');
  const query = defineVatIdQuery(row.query);
  const evidenceRef = opaqueId(row.evidenceRef, 'evidence.evidenceRef');
  const checkedAt = utcTimestamp(row.checkedAt, 'evidence.checkedAt');
  const expiresAt = utcTimestamp(row.expiresAt, 'evidence.expiresAt');
  if (checkedAt >= expiresAt) return invalid('evidence.expiresAt', 'debe ser posterior a checkedAt.');
  const outcome = enumValue(row.outcome, VAT_ID_OUTCOMES, 'evidence.outcome');
  return Object.freeze({ source: 'fixture', adapterId, query, evidenceRef, checkedAt, expiresAt, outcome });
}

/** La ausencia de un caso no fabrica una comprobación, referencia ni fecha. */
export function defineVatIdValidationResponse(input: unknown): VatIdValidationResponse {
  const discriminator = dataRecord(input, 'response');
  if (discriminator.status === 'evidence') {
    const row = exactRecord(discriminator, ['status', 'evidence'], 'response');
    return Object.freeze({ status: 'evidence', evidence: defineVatIdEvidence(row.evidence) });
  }
  if (discriminator.status !== 'unavailable') return invalid('response.status', 'contiene un valor fuera del vocabulario.');
  const row = exactRecord(discriminator, ['status', 'reason', 'adapterId', 'query', 'evidence'], 'response');
  if (row.reason !== 'not_configured' || row.evidence !== null) {
    return invalid('response', 'la ausencia de caso requiere not_configured y evidence null.');
  }
  return Object.freeze({ status: 'unavailable', reason: 'not_configured',
    adapterId: opaqueId(row.adapterId, 'response.adapterId'), query: defineVatIdQuery(row.query), evidence: null });
}

/**
 * Evalúa evidencia ficticia correlacionada en [checkedAt, expiresAt).
 * Un resultado VAT válido NO concede exención, condición B2B ni jurisdicción.
 * Una respuesta ajena/corrupta es error de contrato, nunca un VAT negativo.
 */
export function evaluateVatIdEvidence(input: unknown): VatIdEvidenceEvaluation {
  const row = exactRecord(input, ['expectedAdapterId', 'query', 'at', 'response'], 'evaluation');
  const adapterId = opaqueId(row.expectedAdapterId, 'evaluation.expectedAdapterId');
  const query = defineVatIdQuery(row.query);
  const at = utcTimestamp(row.at, 'evaluation.at');
  const response = defineVatIdValidationResponse(row.response);
  const actual = response.status === 'evidence' ? response.evidence : response;
  if (actual.adapterId !== adapterId || actual.query.id !== query.id ||
    actual.query.countryCode !== query.countryCode || actual.query.identifier !== query.identifier) {
    return invalid('response', 'no corresponde al adaptador y a la consulta esperados.');
  }
  const context = { adapterId, query, at };
  if (response.status === 'unavailable') {
    return Object.freeze({ ...context, status: 'unusable', reason: 'not_configured', evidence: null });
  }
  const evidence = response.evidence;
  if (at < evidence.checkedAt) return Object.freeze({ ...context, status: 'unusable', reason: 'future', evidence });
  if (at >= evidence.expiresAt) return Object.freeze({ ...context, status: 'unusable', reason: 'expired', evidence });
  if (evidence.outcome === 'unavailable' || evidence.outcome === 'unsupported') {
    return Object.freeze({ ...context, status: 'unusable', reason: evidence.outcome, evidence });
  }
  return Object.freeze({ ...context, status: 'usable', outcome: evidence.outcome, evidence });
}

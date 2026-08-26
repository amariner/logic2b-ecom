export const CUSTOMER_SEGMENT_FACTS = [
  'customer.age_days',
  'orders.count',
  'orders.days_since_last',
  'orders.total_spent_cents',
] as const;

export const CUSTOMER_SEGMENT_OPERATORS = ['eq', 'gte', 'lte'] as const;
export const CUSTOMER_SEGMENT_RECALCULATION_STATES = [
  'requested',
  'running',
  'completed',
  'failed',
] as const;

export type CustomerSegmentFact = (typeof CUSTOMER_SEGMENT_FACTS)[number];
export type CustomerSegmentOperator = (typeof CUSTOMER_SEGMENT_OPERATORS)[number];
export type CustomerSegmentRecalculationState =
  (typeof CUSTOMER_SEGMENT_RECALCULATION_STATES)[number];
export type CustomerSegmentFacts = Readonly<Record<CustomerSegmentFact, number | null>>;

export type CustomerSegmentParameter = Readonly<{
  name: string;
  min: number;
  max: number;
}>;

export type CustomerSegmentTemplateCondition = Readonly<{
  fact: CustomerSegmentFact;
  operator: CustomerSegmentOperator;
  parameter: string;
}>;

export type CustomerSegmentTemplate = Readonly<{
  id: string;
  version: number;
  parameters: readonly CustomerSegmentParameter[];
  conditions: readonly CustomerSegmentTemplateCondition[];
}>;

export type CustomerSegmentCondition = Readonly<{
  fact: CustomerSegmentFact;
  operator: CustomerSegmentOperator;
  value: number;
}>;

export type CalculatedCustomerSegment = Readonly<{
  templateId: string;
  templateVersion: number;
  parameters: Readonly<Record<string, number>>;
  conditions: readonly CustomerSegmentCondition[];
}>;

export type CustomerSegmentEvaluation = Readonly<{
  matches: boolean;
  missingFacts: readonly CustomerSegmentFact[];
}>;

export type CustomerSegmentRecalculation = Readonly<{
  segmentId: string;
  definitionVersion: number;
  state: CustomerSegmentRecalculationState;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  cursor: string | null;
  totalCandidates: number;
  processedCandidates: number;
  matchedCustomers: number;
  errorCode: string | null;
}>;

const FACTS = new Set<string>(CUSTOMER_SEGMENT_FACTS);
const OPERATORS = new Set<string>(CUSTOMER_SEGMENT_OPERATORS);
const STATES = new Set<string>(CUSTOMER_SEGMENT_RECALCULATION_STATES);
const OPAQUE_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const PARAMETER_NAME = /^[a-z][a-z0-9_]*$/;
const ERROR_CODE = /^[a-z][a-z0-9_.-]*$/;

export class CustomerSegmentationContractError extends Error {
  readonly code = 'customer_segmentation_contract_invalid';

  constructor(message: string) {
    super(message);
    this.name = 'CustomerSegmentationContractError';
  }
}

function invalid(message: string): never {
  throw new CustomerSegmentationContractError(message);
}

function safeNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    invalid(`${field} debe ser un entero seguro no negativo.`);
  }
  return value as number;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = safeNonNegativeInteger(value, field);
  if (parsed === 0) invalid(`${field} debe ser positivo.`);
  return parsed;
}

function exactKeys(value: object, expected: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    invalid(`${field} contiene campos ausentes o desconocidos.`);
  }
}

function timestamp(value: unknown, field: string, nowMs: number): number {
  if (typeof value !== 'string' || value.length === 0) invalid(`${field} es obligatorio.`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) invalid(`${field} no es una fecha ISO válida.`);
  if (new Date(parsed).toISOString() !== value) invalid(`${field} debe usar ISO UTC canónico.`);
  if (parsed > nowMs) invalid(`${field} no puede estar en el futuro.`);
  return parsed;
}

function optionalTimestamp(value: unknown, field: string, nowMs: number): number | null {
  if (value === null) return null;
  return timestamp(value, field, nowMs);
}

/**
 * Normaliza el snapshot calculable. La ausencia nunca se disfraza con un
 * sentinel numérico: cada hecho no disponible queda explícitamente en null.
 */
export function createCustomerSegmentFacts(
  input: Partial<Record<CustomerSegmentFact, number | null>>,
): CustomerSegmentFacts {
  const result = {} as Record<CustomerSegmentFact, number | null>;
  for (const fact of CUSTOMER_SEGMENT_FACTS) {
    const value = input[fact];
    result[fact] = value === undefined || value === null
      ? null
      : safeNonNegativeInteger(value, `facts.${fact}`);
  }
  return Object.freeze(result);
}

/**
 * Acepta un lenguaje deliberadamente pequeño. Cada parámetro se declara y se
 * usa exactamente una vez para que una edición no cambie varias reglas de
 * manera implícita.
 */
export function defineCustomerSegmentTemplate(
  input: CustomerSegmentTemplate,
): CustomerSegmentTemplate {
  if (!OPAQUE_ID.test(input.id)) invalid('template.id no es canónico.');
  const version = positiveInteger(input.version, 'template.version');
  if (!Array.isArray(input.parameters) || input.parameters.length === 0) {
    invalid('template.parameters debe declarar al menos un parámetro.');
  }
  if (!Array.isArray(input.conditions) || input.conditions.length === 0) {
    invalid('template.conditions debe declarar al menos una condición.');
  }

  const names = new Set<string>();
  const parameters = input.parameters.map((parameter, index) => {
    exactKeys(parameter, ['name', 'min', 'max'], `template.parameters.${index}`);
    if (!PARAMETER_NAME.test(parameter.name) || names.has(parameter.name)) {
      invalid(`template.parameters.${index}.name no es único o canónico.`);
    }
    names.add(parameter.name);
    const min = safeNonNegativeInteger(parameter.min, `template.parameters.${index}.min`);
    const max = safeNonNegativeInteger(parameter.max, `template.parameters.${index}.max`);
    if (min > max) invalid(`template.parameters.${index} tiene un rango incoherente.`);
    return Object.freeze({ name: parameter.name, min, max });
  });

  const occurrences = new Map<string, number>();
  const conditions = input.conditions.map((condition, index) => {
    exactKeys(condition, ['fact', 'operator', 'parameter'], `template.conditions.${index}`);
    if (!FACTS.has(condition.fact)) invalid(`template.conditions.${index}.fact no está permitido.`);
    if (!OPERATORS.has(condition.operator)) invalid(`template.conditions.${index}.operator no está permitido.`);
    if (!names.has(condition.parameter)) invalid(`template.conditions.${index}.parameter no está declarado.`);
    occurrences.set(condition.parameter, (occurrences.get(condition.parameter) ?? 0) + 1);
    return Object.freeze({
      fact: condition.fact,
      operator: condition.operator,
      parameter: condition.parameter,
    });
  });

  for (const name of names) {
    if (occurrences.get(name) !== 1) invalid(`El parámetro ${name} debe aparecer exactamente una vez.`);
  }

  return Object.freeze({
    id: input.id,
    version,
    parameters: Object.freeze(parameters),
    conditions: Object.freeze(conditions),
  });
}

export function instantiateCustomerSegment(
  templateInput: CustomerSegmentTemplate,
  parameterValues: Readonly<Record<string, number>>,
): CalculatedCustomerSegment {
  const template = defineCustomerSegmentTemplate(templateInput);
  const expected = template.parameters.map(({ name }) => name);
  exactKeys(parameterValues, expected, 'parameterValues');

  const parameters: Record<string, number> = {};
  for (const definition of template.parameters) {
    const value = safeNonNegativeInteger(parameterValues[definition.name], `parameterValues.${definition.name}`);
    if (value < definition.min || value > definition.max) {
      invalid(`parameterValues.${definition.name} queda fuera de su rango declarado.`);
    }
    parameters[definition.name] = value;
  }

  const conditions = template.conditions.map((condition) => Object.freeze({
    fact: condition.fact,
    operator: condition.operator,
    value: parameters[condition.parameter]!,
  }));

  const bounds = new Map<CustomerSegmentFact, { min: number; max: number }>();
  for (const condition of conditions) {
    const current = bounds.get(condition.fact) ?? { min: 0, max: Number.MAX_SAFE_INTEGER };
    if (condition.operator === 'gte') current.min = Math.max(current.min, condition.value);
    if (condition.operator === 'lte') current.max = Math.min(current.max, condition.value);
    if (condition.operator === 'eq') {
      current.min = Math.max(current.min, condition.value);
      current.max = Math.min(current.max, condition.value);
    }
    if (current.min > current.max) invalid(`Las condiciones de ${condition.fact} forman un rango incoherente.`);
    bounds.set(condition.fact, current);
  }

  return Object.freeze({
    templateId: template.id,
    templateVersion: template.version,
    parameters: Object.freeze(parameters),
    conditions: Object.freeze(conditions),
  });
}

export function evaluateCustomerSegment(
  segment: CalculatedCustomerSegment,
  facts: CustomerSegmentFacts,
): CustomerSegmentEvaluation {
  const missingFacts = [...new Set(segment.conditions
    .filter(({ fact }) => facts[fact] === null)
    .map(({ fact }) => fact))];
  const matches = missingFacts.length === 0 && segment.conditions.every((condition) => {
    const value = facts[condition.fact];
    if (value === null) return false;
    if (condition.operator === 'eq') return value === condition.value;
    if (condition.operator === 'gte') return value >= condition.value;
    return value <= condition.value;
  });
  return Object.freeze({ matches, missingFacts: Object.freeze(missingFacts) });
}

/** Valida la fotografía observable de una ejecución de recálculo. */
export function assertCustomerSegmentRecalculation(
  input: CustomerSegmentRecalculation,
  nowMs = Date.now(),
): CustomerSegmentRecalculation {
  exactKeys(input, [
    'segmentId', 'definitionVersion', 'state', 'requestedAt', 'startedAt',
    'finishedAt', 'cursor', 'totalCandidates', 'processedCandidates',
    'matchedCustomers', 'errorCode',
  ], 'recalculation');
  if (!OPAQUE_ID.test(input.segmentId)) invalid('recalculation.segmentId no es canónico.');
  const definitionVersion = positiveInteger(input.definitionVersion, 'recalculation.definitionVersion');
  if (!STATES.has(input.state)) invalid('recalculation.state no está declarado.');
  if (input.cursor !== null && (typeof input.cursor !== 'string' || input.cursor.length < 8 || input.cursor.length > 256)) {
    invalid('recalculation.cursor no es opaco o está fuera de límite.');
  }

  const requestedMs = timestamp(input.requestedAt, 'recalculation.requestedAt', nowMs);
  const startedMs = optionalTimestamp(input.startedAt, 'recalculation.startedAt', nowMs);
  const finishedMs = optionalTimestamp(input.finishedAt, 'recalculation.finishedAt', nowMs);
  if (startedMs !== null && startedMs < requestedMs) invalid('startedAt precede a requestedAt.');
  if (finishedMs !== null && finishedMs < (startedMs ?? requestedMs)) invalid('finishedAt precede al inicio.');

  const totalCandidates = safeNonNegativeInteger(input.totalCandidates, 'recalculation.totalCandidates');
  const processedCandidates = safeNonNegativeInteger(input.processedCandidates, 'recalculation.processedCandidates');
  const matchedCustomers = safeNonNegativeInteger(input.matchedCustomers, 'recalculation.matchedCustomers');
  if (processedCandidates > totalCandidates || matchedCustomers > processedCandidates) {
    invalid('Los contadores del recálculo son incoherentes.');
  }
  if (input.errorCode !== null && (typeof input.errorCode !== 'string' || !ERROR_CODE.test(input.errorCode))) {
    invalid('recalculation.errorCode no es canónico.');
  }

  if (input.state === 'requested' && (
    startedMs !== null || finishedMs !== null || input.cursor !== null ||
    totalCandidates !== 0 || processedCandidates !== 0 || matchedCustomers !== 0 || input.errorCode !== null
  )) invalid('El estado requested contiene progreso o resultado.');
  if (input.state === 'running' && (
    startedMs === null || finishedMs !== null || input.errorCode !== null
  )) invalid('El estado running no tiene una combinación temporal válida.');
  if (input.state === 'completed' && (
    startedMs === null || finishedMs === null || input.cursor !== null ||
    processedCandidates !== totalCandidates || input.errorCode !== null
  )) invalid('El estado completed no acredita un cierre completo.');
  if (input.state === 'failed' && (
    finishedMs === null || input.cursor !== null || input.errorCode === null
  )) invalid('El estado failed no acredita un fallo cerrado y observable.');

  return Object.freeze({
    segmentId: input.segmentId,
    definitionVersion,
    state: input.state,
    requestedAt: input.requestedAt,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    cursor: input.cursor,
    totalCandidates,
    processedCandidates,
    matchedCustomers,
    errorCode: input.errorCode,
  });
}

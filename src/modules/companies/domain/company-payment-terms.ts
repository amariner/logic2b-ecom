import { defineCompanyDirectory, type CompanyDirectoryRef, type CompanyDirectoryState } from './company-directory';

/** Límites técnicos del perfil fixture; no establecen condiciones comerciales reales. */
export const COMPANY_PAYMENT_TERMS_LIMITS = /* @__PURE__ */ Object.freeze({
  assignments: 100, remindersPerAssignment: 20, netDays: 3650, absoluteOffsetDays: 3650,
});
export type CompanyPaymentTermsCondition = Readonly<{ kind: 'immediate' }>
  | Readonly<{ kind: 'net_days'; days: number }>;
export type CompanyPaymentTermsAssignment = Readonly<{
  companyId: string; condition: CompanyPaymentTermsCondition; reminderOffsetsDays: readonly number[];
}>;
type PolicyRef = Readonly<{ id: string; version: number }>;
/** Condición declarada en esta revisión; los metadatos no acreditan vigencia ni autoridad. */
export type CompanyPaymentTermsPolicy = PolicyRef & Readonly<{
  schemaVersion: 1; source: 'fixture'; calendar: 'utc-civil-days-v1'; directoryRef: CompanyDirectoryRef;
  assignments: readonly CompanyPaymentTermsAssignment[];
}>;
/** El llamador declara la fecha base; no se infiere de facturas, pedidos ni capturedAt. */
export type CompanyPaymentTermsRequest = Readonly<{
  schemaVersion: 1; id: string; directoryRef: CompanyDirectoryRef; policyRef: PolicyRef;
  companyId: string; baseDate: string; evaluationDate: string;
}>;
export type CompanyPaymentTermsMilestone = Readonly<{
  offsetDays: number; date: string; milestonePosition: 'upcoming' | 'today' | 'past'; daysUntilMilestone: number;
}>;
/** Fechas descriptivas: no saldo, cobro, autorización comercial ni cola de recordatorios. */
export type CompanyPaymentTermsPreview = Readonly<{
  source: 'fixture'; directoryRef: CompanyDirectoryRef; policyRef: PolicyRef; requestId: string;
  calendar: 'utc-civil-days-v1'; company: Readonly<{ id: string; state: CompanyDirectoryState }>;
  baseDate: string; evaluationDate: string; basePosition: 'before_base' | 'on_base' | 'after_base';
  outcome: 'configured' | 'unconfigured'; condition: CompanyPaymentTermsCondition | null;
  dueDate: string | null; duePosition: 'before_due' | 'on_due' | 'after_due' | null; daysUntilDue: number | null;
  reminderMilestones: readonly CompanyPaymentTermsMilestone[];
}>;
export type CompanyPaymentTermsContractReason = 'invalid_data' | 'duplicate_assignment' | 'duplicate_offset'
  | 'unknown_reference' | 'unknown_company' | 'reference_mismatch' | 'date_overflow';
const ERROR_MESSAGES: Readonly<Record<CompanyPaymentTermsContractReason, string>> = /* @__PURE__ */ Object.freeze({
  invalid_data: 'Los datos no cumplen el contrato de condiciones de pago.',
  duplicate_assignment: 'La política contiene más de una condición para la misma empresa.',
  duplicate_offset: 'La condición contiene un offset de recordatorio repetido.',
  unknown_reference: 'Una condición hace referencia a una empresa ausente.',
  unknown_company: 'La empresa solicitada no está presente en el directorio.',
  reference_mismatch: 'Las referencias no coinciden con el directorio y la política recibidos.',
  date_overflow: 'Una fecha calculada queda fuera del calendario admitido.',
});
export class CompanyPaymentTermsContractError extends Error {
  readonly code = 'company_payment_terms_contract_invalid';
  readonly reason: CompanyPaymentTermsContractReason;
  constructor(reason: CompanyPaymentTermsContractReason) {
    const safeReason = typeof reason === 'string' && Object.hasOwn(ERROR_MESSAGES, reason) ? reason : 'invalid_data';
    super(ERROR_MESSAGES[safeReason]); this.name = 'CompanyPaymentTermsContractError'; this.reason = safeReason;
  }
}
function invalid(reason: CompanyPaymentTermsContractReason = 'invalid_data'): never {
  throw new CompanyPaymentTermsContractError(reason);
}
function boundary<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    let reason: CompanyPaymentTermsContractReason = 'invalid_data';
    try {
      if (error instanceof CompanyPaymentTermsContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string' && Object.hasOwn(ERROR_MESSAGES, descriptor.value)) {
          reason = descriptor.value as CompanyPaymentTermsContractReason;
        }
      }
    } catch { /* También el error puede ser hostil; nunca se conserva su mensaje ni cause. */ }
    throw new CompanyPaymentTermsContractError(reason);
  }
}
function dataRecord(input: unknown): Readonly<Record<string, unknown>> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !descriptor?.enumerable || !('value' in descriptor)) return invalid();
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}
function record(input: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  const row = dataRecord(input); const actual = Object.keys(row);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) return invalid();
  return row;
}
function integer(input: unknown, minimum = 1, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || Object.is(input, -0) || input < minimum || input > maximum) return invalid();
  return input;
}
function array(input: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return invalid();
  const descriptor = Object.getOwnPropertyDescriptor(input, 'length');
  if (!descriptor || !('value' in descriptor)) return invalid();
  const length = integer(descriptor.value, 0, maximum);
  if (Reflect.ownKeys(input).length !== length + 1) return invalid();
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const item = Object.getOwnPropertyDescriptor(input, String(index));
    if (!item?.enumerable || !('value' in item)) return invalid();
    result.push(item.value);
  }
  return Object.freeze(result);
}
function id(input: unknown): string {
  if (typeof input !== 'string' || input.length > 100 || !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(input)) return invalid();
  return input;
}
function instant(input: unknown): string {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input)) return invalid();
  const date = new Date(input);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== input) return invalid();
  return input;
}
function directoryRef(input: unknown): CompanyDirectoryRef {
  const row = record(input, ['id', 'version', 'capturedAt']);
  return Object.freeze({ id: id(row.id), version: integer(row.version), capturedAt: instant(row.capturedAt) });
}
function policyRef(input: unknown): PolicyRef {
  const row = record(input, ['id', 'version']);
  return Object.freeze({ id: id(row.id), version: integer(row.version) });
}
const DAY_MS = 86_400_000;
function civilDate(input: unknown): string {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input) || input.startsWith('0000-')) return invalid();
  // La cadena ISO explícita evita el remapeo de años 0..99 de Date.UTC(year, ...).
  const canonical = `${input}T00:00:00.000Z`; const date = new Date(canonical);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== canonical) return invalid();
  return input;
}
function dayNumber(date: string): number { return new Date(`${date}T00:00:00.000Z`).getTime() / DAY_MS; }
function addDays(date: string, days: number): string {
  const result = new Date((dayNumber(date) + days) * DAY_MS); const year = result.getUTCFullYear();
  if (!Number.isFinite(result.getTime()) || year < 1 || year > 9999) return invalid('date_overflow');
  return result.toISOString().slice(0, 10);
}
function condition(input: unknown): CompanyPaymentTermsCondition {
  const row = dataRecord(input);
  if (row.kind === 'immediate') {
    record(row, ['kind']); return Object.freeze({ kind: 'immediate' });
  }
  if (row.kind === 'net_days') {
    record(row, ['kind', 'days']);
    return Object.freeze({ kind: 'net_days', days: integer(row.days, 1, COMPANY_PAYMENT_TERMS_LIMITS.netDays) });
  }
  return invalid();
}

export function defineCompanyPaymentTermsPolicy(input: unknown): CompanyPaymentTermsPolicy {
  return boundary(() => {
    const row = record(input, ['schemaVersion', 'source', 'id', 'version', 'calendar', 'directoryRef', 'assignments']);
    if (row.schemaVersion !== 1 || row.source !== 'fixture' || row.calendar !== 'utc-civil-days-v1') return invalid();
    const policyId = id(row.id); const version = integer(row.version); const reference = directoryRef(row.directoryRef);
    const companies = new Set<string>();
    const assignments = array(row.assignments, COMPANY_PAYMENT_TERMS_LIMITS.assignments).map((inputAssignment): CompanyPaymentTermsAssignment => {
      const assignment = record(inputAssignment, ['companyId', 'condition', 'reminderOffsetsDays']);
      const companyId = id(assignment.companyId); const normalizedCondition = condition(assignment.condition);
      if (companies.has(companyId)) return invalid('duplicate_assignment');
      companies.add(companyId);
      const offsets = new Set<number>();
      const reminders = array(assignment.reminderOffsetsDays, COMPANY_PAYMENT_TERMS_LIMITS.remindersPerAssignment).map(inputOffset => {
        const offset = integer(inputOffset, -COMPANY_PAYMENT_TERMS_LIMITS.absoluteOffsetDays, COMPANY_PAYMENT_TERMS_LIMITS.absoluteOffsetDays);
        if (offsets.has(offset)) return invalid('duplicate_offset');
        offsets.add(offset); return offset;
      });
      return Object.freeze({ companyId, condition: normalizedCondition, reminderOffsetsDays: Object.freeze(reminders.sort((a, b) => a - b)) });
    });
    return Object.freeze({ schemaVersion: 1, source: 'fixture', id: policyId, version, calendar: 'utc-civil-days-v1',
      directoryRef: reference, assignments: Object.freeze(assignments.sort((a, b) => a.companyId < b.companyId ? -1 : a.companyId > b.companyId ? 1 : 0)) });
  });
}

export function defineCompanyPaymentTermsRequest(input: unknown): CompanyPaymentTermsRequest {
  return boundary(() => {
    const row = record(input, ['schemaVersion', 'id', 'directoryRef', 'policyRef', 'companyId', 'baseDate', 'evaluationDate']);
    if (row.schemaVersion !== 1) return invalid();
    return Object.freeze({ schemaVersion: 1, id: id(row.id), directoryRef: directoryRef(row.directoryRef), policyRef: policyRef(row.policyRef),
      companyId: id(row.companyId), baseDate: civilDate(row.baseDate), evaluationDate: civilDate(row.evaluationDate) });
  });
}
function assertDirectoryRef(actual: CompanyDirectoryRef, expected: CompanyDirectoryRef): void {
  if (actual.id !== expected.id || actual.version !== expected.version || actual.capturedAt !== expected.capturedAt) return invalid('reference_mismatch');
}

/** Valida todo el artefacto antes de seleccionar. La fecha transcurrida no demuestra un cobro ni un impago. */
export function previewCompanyPaymentTerms(input: unknown): CompanyPaymentTermsPreview {
  return boundary(() => {
    const row = record(input, ['directory', 'policy', 'request']);
    const directory = defineCompanyDirectory(row.directory); const policy = defineCompanyPaymentTermsPolicy(row.policy);
    const request = defineCompanyPaymentTermsRequest(row.request);
    assertDirectoryRef(policy.directoryRef, directory); assertDirectoryRef(request.directoryRef, directory);
    if (request.policyRef.id !== policy.id || request.policyRef.version !== policy.version) return invalid('reference_mismatch');
    const companies = new Map(directory.companies.map(company => [company.id, company]));
    for (const assignment of policy.assignments) if (!companies.has(assignment.companyId)) return invalid('unknown_reference');
    const company = companies.get(request.companyId);
    if (!company) return invalid('unknown_company');
    const baseDay = dayNumber(request.baseDate); const evaluationDay = dayNumber(request.evaluationDate);
    const basePosition = evaluationDay < baseDay ? 'before_base' as const : evaluationDay === baseDay ? 'on_base' as const : 'after_base' as const;
    const common = {
      source: 'fixture' as const, directoryRef: directoryRef({ id: directory.id, version: directory.version, capturedAt: directory.capturedAt }),
      policyRef: Object.freeze({ id: policy.id, version: policy.version }), requestId: request.id, calendar: policy.calendar,
      company: Object.freeze({ id: company.id, state: company.state }), baseDate: request.baseDate, evaluationDate: request.evaluationDate, basePosition,
    };
    const assignment = policy.assignments.find(item => item.companyId === company.id);
    if (!assignment) return Object.freeze({ ...common, outcome: 'unconfigured', condition: null, dueDate: null, duePosition: null,
      daysUntilDue: null, reminderMilestones: Object.freeze([]) });
    const dueDate = addDays(request.baseDate, assignment.condition.kind === 'immediate' ? 0 : assignment.condition.days);
    const daysUntilDue = dayNumber(dueDate) - evaluationDay;
    // Se validan todos los hitos antes de devolver; uno fuera de rango impide cualquier resultado parcial.
    const reminderMilestones = assignment.reminderOffsetsDays.map((offsetDays): CompanyPaymentTermsMilestone => {
      const date = addDays(dueDate, offsetDays); const daysUntilMilestone = dayNumber(date) - evaluationDay;
      return Object.freeze({ offsetDays, date, daysUntilMilestone,
        milestonePosition: daysUntilMilestone > 0 ? 'upcoming' : daysUntilMilestone === 0 ? 'today' : 'past' });
    });
    return Object.freeze({ ...common, outcome: 'configured', condition: assignment.condition, dueDate, daysUntilDue,
      duePosition: daysUntilDue > 0 ? 'before_due' : daysUntilDue === 0 ? 'on_due' : 'after_due', reminderMilestones: Object.freeze(reminderMilestones) });
  });
}

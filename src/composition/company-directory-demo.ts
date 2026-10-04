import type { Platform } from './create-platform';
import { defineCompanyDirectory, selectCompanyDirectoryEntry, type CompanyDirectoryState } from '../modules/companies';
import { createFixtureVatIdAdapter, type VatIdEvidenceEvaluation } from '../modules/taxes';
import { evaluateCompanyVatEvidence, type CompanyVatEvidenceResult } from './company-vat-context';

export type CompanyDirectoryDemoSelection = Readonly<{
  companyId: 'company.alpha' | 'company.beta';
  vatScenario: 'not_checked' | 'valid' | 'invalid' | 'expired' | 'unavailable';
}>;
export type CompanyDirectoryDemoFeedback = Readonly<{
  tone: 'info'; code: 'initial' | 'selection_changed' | 'company_changed'; message: string;
}>;
export type CompanyDirectoryDemoState = Readonly<{
  selection: CompanyDirectoryDemoSelection; feedback: CompanyDirectoryDemoFeedback;
}>;
export type CompanyDirectoryDemoAssignment = Readonly<{
  companyId: string; contactId: string; roleId: string; roleLabel: string;
  scopeType: 'company' | 'site'; scopeLabel: string; siteId: string | null;
}>;
export type CompanyDirectoryDemoView = Readonly<{
  selection: CompanyDirectoryDemoSelection;
  companyOptions: readonly Readonly<{
    id: CompanyDirectoryDemoSelection['companyId']; label: string; state: CompanyDirectoryState; stateLabel: string;
    siteCount: number; contactCount: number;
  }>[];
  selectedCompany: Readonly<{ id: string; label: string; state: CompanyDirectoryState; stateLabel: string }>;
  sites: readonly Readonly<{ id: string; companyId: string; label: string; state: CompanyDirectoryState; stateLabel: string; countryLabel: string }>[];
  contacts: readonly Readonly<{
    id: string; companyId: string; label: string; state: CompanyDirectoryState; stateLabel: string;
    assignments: readonly CompanyDirectoryDemoAssignment[];
  }>[];
  vat: Readonly<{
    selectable: boolean;
    scenarioOptions: readonly Readonly<{ id: CompanyDirectoryDemoSelection['vatScenario']; label: string }>[];
    status: CompanyVatEvidenceResult['status']; evaluationStatus: VatIdEvidenceEvaluation['status'] | null;
    queryCompanyId: string | null; label: string; message: string; outcome: 'valid' | 'invalid' | null;
    reason: Extract<VatIdEvidenceEvaluation, { status: 'unusable' }>['reason'] | null;
    at: string | null; checkedAt: string | null; expiresAt: string | null;
  }>;
  feedback: CompanyDirectoryDemoFeedback;
}>;

/** Gate de presentación: no activa cuentas, empresas operativas ni permisos delegados. */
export function canShowCompanyDirectoryDemo(
  env: Readonly<{ DEMO_MODE?: string | undefined }> | undefined,
  platform: Pick<Platform, 'manifest'>,
): boolean {
  return platform.manifest.deployment.mode === 'demo' && env?.DEMO_MODE === 'true';
}

const AT = '2026-10-03T12:00:00.000Z';
const CHECKED_AT = '2026-10-03T11:00:00.000Z';
const EXPIRES_AT = '2026-10-03T13:00:00.000Z';
const ADAPTER_ID = 'demo.company.vat';
// Datos sintéticos privados del ejemplo. Las referencias repetidas no fusionan contactos.
const DIRECTORY = defineCompanyDirectory({ schemaVersion: 1, source: 'fixture', id: 'demo.company.directory', version: 1, capturedAt: AT,
  companies: [
    { id: 'company.alpha', displayName: 'Empresa de ejemplo A', state: 'active', vatId: { countryCode: 'ZZ', identifier: 'FICTIONALCOMPANYA' } },
    { id: 'company.beta', displayName: 'Empresa de ejemplo B', state: 'inactive', vatId: null },
  ], sites: [
    { id: 'site.alpha.main', companyId: 'company.alpha', label: 'Sede principal A', state: 'active', countryCode: 'ES' },
    { id: 'site.alpha.secondary', companyId: 'company.alpha', label: 'Sede secundaria A', state: 'inactive', countryCode: 'FR' },
    { id: 'site.beta.main', companyId: 'company.beta', label: 'Sede principal B', state: 'inactive', countryCode: 'FR' },
    { id: 'site.beta.secondary', companyId: 'company.beta', label: 'Sede secundaria B', state: 'active', countryCode: null },
  ], contacts: [
    { id: 'contact.alpha.one', companyId: 'company.alpha', displayName: 'Contacto de ejemplo A1', state: 'active',
      identityRef: { kind: 'customer_profile', profileId: 'customer:demo:shared-reference' } },
    { id: 'contact.alpha.two', companyId: 'company.alpha', displayName: 'Contacto de ejemplo A2', state: 'inactive',
      identityRef: { kind: 'email_identity', emailIdentityHash: 'b'.repeat(64) } },
    { id: 'contact.alpha.three', companyId: 'company.alpha', displayName: 'Contacto de ejemplo A3', state: 'active', identityRef: null },
    { id: 'contact.beta.one', companyId: 'company.beta', displayName: 'Contacto de ejemplo B1', state: 'inactive',
      identityRef: { kind: 'customer_profile', profileId: 'customer:demo:shared-reference' } },
    { id: 'contact.beta.two', companyId: 'company.beta', displayName: 'Contacto de ejemplo B2', state: 'active',
      identityRef: { kind: 'email_identity', emailIdentityHash: 'b'.repeat(64) } },
  ], roles: [
    { id: 'role.purchasing', label: 'Contacto de compras' },
    { id: 'role.billing', label: 'Contacto de facturación' },
    { id: 'role.logistics', label: 'Contacto de logística' },
  ], assignments: [
    { companyId: 'company.alpha', contactId: 'contact.alpha.one', roleId: 'role.purchasing', scope: { type: 'company' } },
    { companyId: 'company.alpha', contactId: 'contact.alpha.one', roleId: 'role.logistics', scope: { type: 'site', siteId: 'site.alpha.main' } },
    { companyId: 'company.alpha', contactId: 'contact.alpha.two', roleId: 'role.billing', scope: { type: 'site', siteId: 'site.alpha.secondary' } },
    { companyId: 'company.beta', contactId: 'contact.beta.one', roleId: 'role.purchasing', scope: { type: 'company' } },
    { companyId: 'company.beta', contactId: 'contact.beta.two', roleId: 'role.logistics', scope: { type: 'site', siteId: 'site.beta.secondary' } },
  ] });
function feminineState(state: CompanyDirectoryState): string { return state === 'active' ? 'Activa' : 'Inactiva'; }
const COMPANY_OPTIONS = Object.freeze(DIRECTORY.companies.map(company => {
  const entry = selectCompanyDirectoryEntry({ directory: DIRECTORY, companyId: company.id });
  return Object.freeze({ id: company.id as CompanyDirectoryDemoSelection['companyId'], label: company.displayName,
    state: company.state, stateLabel: feminineState(company.state), siteCount: entry.sites.length, contactCount: entry.contacts.length });
}));
const VAT_OPTIONS = Object.freeze([
  Object.freeze({ id: 'not_checked' as const, label: 'Sin comprobar' }),
  Object.freeze({ id: 'valid' as const, label: 'Positivo y vigente' }),
  Object.freeze({ id: 'invalid' as const, label: 'Negativo y vigente' }),
  Object.freeze({ id: 'expired' as const, label: 'Evidencia caducada' }),
  Object.freeze({ id: 'unavailable' as const, label: 'Comprobación no disponible' }),
]);
const FEEDBACK = Object.freeze({
  initial: Object.freeze({ tone: 'info' as const, code: 'initial' as const,
    message: 'Explora empresas y relaciones ficticias. Las selecciones solo cambian este ejemplo en memoria.' }),
  selection_changed: Object.freeze({ tone: 'info' as const, code: 'selection_changed' as const,
    message: 'Ejemplo actualizado. La evidencia VAT se muestra por separado y no cambia las sedes, los contactos ni sus roles.' }),
  company_changed: Object.freeze({ tone: 'info' as const, code: 'company_changed' as const,
    message: 'Empresa cambiada. No se conserva evidencia de la empresa anterior.' }),
});

function alphaVatQuery() {
  const result = evaluateCompanyVatEvidence({ directory: DIRECTORY, companyId: 'company.alpha', assessment: null });
  if (result.status !== 'not_checked') throw new Error('El fixture A requiere una declaración VAT.');
  return result.query;
}
const QUERY = alphaVatQuery();
function scenarioAdapter(scenario: Exclude<CompanyDirectoryDemoSelection['vatScenario'], 'not_checked'>) {
  return createFixtureVatIdAdapter({ adapterId: ADAPTER_ID, cases: scenario === 'unavailable' ? [] : [{
    source: 'fixture', adapterId: ADAPTER_ID, query: QUERY, evidenceRef: `demo.company.vat.${scenario}`,
    checkedAt: CHECKED_AT, expiresAt: scenario === 'expired' ? AT : EXPIRES_AT, outcome: scenario === 'invalid' ? 'invalid' : 'valid',
  }] });
}
// Mismo identificador de consulta, casos independientes: no se alteran ni renuevan fechas.
const ADAPTERS = Object.freeze({ valid: scenarioAdapter('valid'), invalid: scenarioAdapter('invalid'),
  expired: scenarioAdapter('expired'), unavailable: scenarioAdapter('unavailable') });

function invalid(): never { throw new RangeError('Selección del ejemplo de empresas inválida.'); }
function record(input: unknown, fields: readonly string[], partial = false): Readonly<Record<string, unknown>> {
  try {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return invalid();
    const keys = Reflect.ownKeys(input);
    if ((!partial && keys.length !== fields.length) || (partial && keys.length === 0)) return invalid();
    const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
      if (typeof key !== 'string' || !fields.includes(key) || !descriptor.enumerable || !('value' in descriptor)) return invalid();
      copy[key] = descriptor.value;
    }
    return Object.freeze(copy);
  } catch { return invalid(); }
}
function defineSelection(input: unknown): CompanyDirectoryDemoSelection {
  const row = record(input, ['companyId', 'vatScenario']);
  if (!COMPANY_OPTIONS.some(option => option.id === row.companyId) || !VAT_OPTIONS.some(option => option.id === row.vatScenario) ||
    (row.companyId === 'company.beta' && row.vatScenario !== 'not_checked')) return invalid();
  return Object.freeze({ companyId: row.companyId as CompanyDirectoryDemoSelection['companyId'],
    vatScenario: row.vatScenario as CompanyDirectoryDemoSelection['vatScenario'] });
}
function defineState(input: unknown): CompanyDirectoryDemoState {
  const row = record(input, ['selection', 'feedback']);
  const selection = defineSelection(row.selection);
  const feedback = record(row.feedback, ['tone', 'code', 'message']);
  if ((feedback.code !== 'initial' && feedback.code !== 'selection_changed' && feedback.code !== 'company_changed') ||
    feedback.tone !== 'info' || feedback.message !== FEEDBACK[feedback.code].message) return invalid();
  return Object.freeze({ selection, feedback: FEEDBACK[feedback.code] });
}

export function createCompanyDirectoryDemo(): CompanyDirectoryDemoState {
  return Object.freeze({ selection: Object.freeze({ companyId: 'company.alpha', vatScenario: 'not_checked' }), feedback: FEEDBACK.initial });
}
export function configureCompanyDirectoryDemo(
  stateInput: CompanyDirectoryDemoState, input: Readonly<Partial<CompanyDirectoryDemoSelection>>,
): CompanyDirectoryDemoState {
  const state = defineState(stateInput);
  const patch = record(input, ['companyId', 'vatScenario'], true);
  if (Object.hasOwn(patch, 'companyId') && !COMPANY_OPTIONS.some(option => option.id === patch.companyId)) return invalid();
  if (Object.hasOwn(patch, 'vatScenario') && !VAT_OPTIONS.some(option => option.id === patch.vatScenario)) return invalid();
  const changedCompany = Object.hasOwn(patch, 'companyId') && patch.companyId !== state.selection.companyId;
  if (changedCompany && Object.hasOwn(patch, 'vatScenario') && patch.vatScenario !== 'not_checked') return invalid();
  const selection = defineSelection({ ...state.selection, ...patch,
    ...(changedCompany ? { vatScenario: 'not_checked' } : {}) });
  return Object.freeze({ selection, feedback: changedCompany ? FEEDBACK.company_changed : FEEDBACK.selection_changed });
}

function vatMessage(result: CompanyVatEvidenceResult): Readonly<{ label: string; message: string }> {
  if (result.status === 'not_declared') return { label: 'Sin VAT declarado', message: 'Esta empresa de ejemplo no tiene una declaración VAT.' };
  if (result.status === 'not_checked') return { label: 'Sin comprobar', message: 'Hay una declaración de ejemplo, pero todavía no se muestra una comprobación.' };
  if (result.evaluation.status === 'usable') return result.evaluation.outcome === 'valid'
    ? { label: 'Positivo y vigente', message: 'La evidencia ficticia coincide con la declaración. No acredita pertenencia, permisos de compra ni exención.' }
    : { label: 'Negativo y vigente', message: 'La evidencia ficticia tiene resultado negativo. El directorio y sus roles no cambian.' };
  if (result.evaluation.reason === 'expired') return { label: 'Evidencia caducada',
    message: 'La evidencia anterior ha caducado en el instante fijo del ejemplo. No se presenta como un resultado vigente.' };
  return { label: 'Comprobación no disponible', message: 'No hay evidencia para este caso de ejemplo. La ausencia no se convierte en un resultado negativo.' };
}
function countryLabel(countryCode: string | null): string {
  if (countryCode === null) return 'Sin país declarado';
  if (countryCode === 'ES') return 'España';
  if (countryCode === 'FR') return 'Francia';
  throw new Error('El país del fixture requiere una etiqueta explícita.');
}

/** DTO de presentación sin identidades externas ni identificador VAT; no filtra inactivos ni asigna permisos. */
export function getCompanyDirectoryDemoView(stateInput: CompanyDirectoryDemoState): CompanyDirectoryDemoView {
  const state = defineState(stateInput);
  const entry = selectCompanyDirectoryEntry({ directory: DIRECTORY, companyId: state.selection.companyId });
  const pending = evaluateCompanyVatEvidence({ directory: DIRECTORY, companyId: entry.company.id, assessment: null });
  let vatResult = pending;
  if (state.selection.vatScenario !== 'not_checked') {
    if (pending.query === null) return invalid();
    const adapter = ADAPTERS[state.selection.vatScenario];
    vatResult = evaluateCompanyVatEvidence({ directory: DIRECTORY, companyId: entry.company.id,
      assessment: { expectedAdapterId: adapter.adapterId, at: AT, response: adapter.validate(pending.query) } });
  }
  const evaluation = vatResult.evaluation;
  const roleById = new Map(entry.roles.map(role => [role.id, role]));
  const siteById = new Map(entry.sites.map(site => [site.id, site]));
  const contacts = Object.freeze(entry.contacts.map(contact => Object.freeze({ id: contact.id, companyId: contact.companyId,
    label: contact.displayName, state: contact.state, stateLabel: contact.state === 'active' ? 'Activo' : 'Inactivo',
    assignments: Object.freeze(entry.assignments.filter(assignment => assignment.contactId === contact.id)
      .map((assignment): CompanyDirectoryDemoAssignment => Object.freeze({ companyId: assignment.companyId, contactId: assignment.contactId,
        roleId: assignment.roleId, roleLabel: roleById.get(assignment.roleId)!.label, scopeType: assignment.scope.type,
        scopeLabel: assignment.scope.type === 'company' ? 'Empresa' : `Sede: ${siteById.get(assignment.scope.siteId)!.label}`,
        siteId: assignment.scope.type === 'company' ? null : assignment.scope.siteId }))
      .sort((a, b) => (a.scopeType === 'company' ? 0 : 1) - (b.scopeType === 'company' ? 0 : 1) ||
        (a.roleLabel < b.roleLabel ? -1 : a.roleLabel > b.roleLabel ? 1 : 0))),
  })).sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return Object.freeze({ selection: state.selection, companyOptions: COMPANY_OPTIONS,
    selectedCompany: Object.freeze({ id: entry.company.id, label: entry.company.displayName, state: entry.company.state, stateLabel: feminineState(entry.company.state) }),
    sites: Object.freeze(entry.sites.map(site => Object.freeze({ id: site.id, companyId: site.companyId, label: site.label,
      state: site.state, stateLabel: feminineState(site.state), countryLabel: countryLabel(site.countryCode) }))),
    contacts, vat: Object.freeze({ selectable: entry.company.vatId !== null, scenarioOptions: VAT_OPTIONS,
      status: vatResult.status, evaluationStatus: evaluation?.status ?? null, queryCompanyId: vatResult.query?.id ?? null, ...vatMessage(vatResult),
      outcome: evaluation?.status === 'usable' ? evaluation.outcome : null, reason: evaluation?.status === 'unusable' ? evaluation.reason : null,
      at: evaluation?.at ?? null, checkedAt: evaluation?.evidence?.checkedAt ?? null, expiresAt: evaluation?.evidence?.expiresAt ?? null }),
    feedback: state.feedback });
}

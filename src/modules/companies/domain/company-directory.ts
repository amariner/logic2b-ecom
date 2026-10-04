export const COMPANY_DIRECTORY_LIMITS = Object.freeze({ companies: 100, sites: 1000, contacts: 2000, roles: 100, assignments: 10000 });
export type CompanyDirectoryState = 'active' | 'inactive';
export type CompanyVatDeclaration = Readonly<{ countryCode: string; identifier: string }>;
export type Company = Readonly<{
  id: string; displayName: string; state: CompanyDirectoryState; vatId: CompanyVatDeclaration | null;
}>;
export type CompanySite = Readonly<{
  id: string; companyId: string; label: string; state: CompanyDirectoryState; countryCode: string | null;
}>;
/** Referencia externa declarada; no acredita existencia, pertenencia ni autenticación. */
export type CompanyContactIdentityRef =
  | Readonly<{ kind: 'customer_profile'; profileId: string }>
  | Readonly<{ kind: 'email_identity'; emailIdentityHash: string }>;
export type CompanyContact = Readonly<{
  id: string; companyId: string; displayName: string; state: CompanyDirectoryState;
  identityRef: CompanyContactIdentityRef | null;
}>;
/** El catálogo de roles contiene etiquetas, nunca permisos, límites ni autoridad comercial. */
export type CompanyRole = Readonly<{ id: string; label: string }>;
export type CompanyRoleScope = Readonly<{ type: 'company' }> | Readonly<{ type: 'site'; siteId: string }>;
export type CompanyRoleAssignment = Readonly<{
  companyId: string; contactId: string; roleId: string; scope: CompanyRoleScope;
}>;
export type CompanyDirectoryRef = Readonly<{ id: string; version: number; capturedAt: string }>;
/** Artefacto fixture aportado por el llamador; sus metadatos no acreditan historia ni procedencia. */
export type CompanyDirectory = CompanyDirectoryRef & Readonly<{
  schemaVersion: 1; source: 'fixture'; companies: readonly Company[]; sites: readonly CompanySite[];
  contacts: readonly CompanyContact[]; roles: readonly CompanyRole[]; assignments: readonly CompanyRoleAssignment[];
}>;
export type CompanyDirectoryEntry = Readonly<{
  directoryRef: CompanyDirectoryRef; company: Company; sites: readonly CompanySite[];
  contacts: readonly CompanyContact[]; roles: readonly CompanyRole[]; assignments: readonly CompanyRoleAssignment[];
}>;
export type CompanyDirectoryContractReason =
  | 'invalid_data' | 'duplicate_id' | 'duplicate_assignment' | 'unknown_reference' | 'cross_company_reference'
  | 'unknown_company' | 'vat_declaration_missing' | 'vat_evidence_invalid';

const ERROR_MESSAGES: Readonly<Record<CompanyDirectoryContractReason, string>> = Object.freeze({
  invalid_data: 'Los datos no cumplen el contrato del directorio.',
  duplicate_id: 'El directorio contiene un identificador duplicado.',
  duplicate_assignment: 'El directorio contiene una asignación duplicada.',
  unknown_reference: 'El directorio contiene una referencia ausente.',
  cross_company_reference: 'La asignación cruza la propiedad de empresas distintas.',
  unknown_company: 'La empresa solicitada no está presente en el directorio.',
  vat_declaration_missing: 'No existe una declaración VAT para evaluar esta evidencia.',
  vat_evidence_invalid: 'La evidencia VAT no cumple el contrato de la empresa seleccionada.',
});
export class CompanyDirectoryContractError extends Error {
  readonly code = 'company_directory_contract_invalid';
  readonly reason: CompanyDirectoryContractReason;

  constructor(reason: CompanyDirectoryContractReason) {
    const safeReason = typeof reason === 'string' && Object.hasOwn(ERROR_MESSAGES, reason) ? reason : 'invalid_data';
    super(ERROR_MESSAGES[safeReason]);
    this.name = 'CompanyDirectoryContractError';
    this.reason = safeReason;
  }
}
function invalid(reason: CompanyDirectoryContractReason = 'invalid_data'): never {
  throw new CompanyDirectoryContractError(reason);
}
/** También redacta fallos arbitrarios de introspección (por ejemplo, trampas Proxy). */
function boundary<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    let reason: CompanyDirectoryContractReason = 'invalid_data';
    try {
      if (error instanceof CompanyDirectoryContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string' && Object.hasOwn(ERROR_MESSAGES, descriptor.value)) {
          reason = descriptor.value as CompanyDirectoryContractReason;
        }
      }
    } catch { /* El propio error puede ser hostil; no se conserva su mensaje ni cause. */ }
    throw new CompanyDirectoryContractError(reason);
  }
}
function dataRecord(input: unknown): Readonly<Record<string, unknown>> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor)) return invalid();
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}
function record(input: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  const row = dataRecord(input);
  const actual = Object.keys(row);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) return invalid();
  return row;
}
function array(input: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length > maximum ||
    Reflect.ownKeys(input).length !== input.length + 1) return invalid();
  const result: unknown[] = [];
  for (let index = 0; index < input.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor?.enumerable || !('value' in descriptor)) return invalid();
    result.push(descriptor.value);
  }
  return Object.freeze(result);
}
function id(input: unknown): string {
  if (typeof input !== 'string' || input.length > 100 || !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(input)) return invalid();
  return input;
}
function label(input: unknown): string {
  if (typeof input !== 'string' || input.length < 1 || input.length > 160 || input.trim() !== input || /[\u0000-\u001f\u007f]/u.test(input)) return invalid();
  return input;
}
function state(input: unknown): CompanyDirectoryState {
  if (input !== 'active' && input !== 'inactive') return invalid();
  return input;
}
function country(input: unknown): string {
  if (typeof input !== 'string' || !/^[A-Z]{2}$/.test(input)) return invalid();
  return input;
}
function vatDeclaration(input: unknown): CompanyVatDeclaration | null {
  if (input === null) return null;
  const row = record(input, ['countryCode', 'identifier']);
  if (typeof row.identifier !== 'string' || !/^[A-Z0-9]{1,32}$/.test(row.identifier)) return invalid();
  return Object.freeze({ countryCode: country(row.countryCode), identifier: row.identifier });
}
function identityRef(input: unknown): CompanyContactIdentityRef | null {
  if (input === null) return null;
  const row = dataRecord(input);
  if (row.kind === 'customer_profile') {
    record(row, ['kind', 'profileId']);
    // Compatibilidad sintáctica con CustomerProfile: referencia externa, nunca lookup ni FK.
    if (typeof row.profileId !== 'string' || row.profileId.length > 200 || !/^[a-z][a-z0-9]*(?:[_:-][a-z0-9]+)+$/u.test(row.profileId)) return invalid();
    return Object.freeze({ kind: 'customer_profile', profileId: row.profileId });
  }
  if (row.kind === 'email_identity') {
    record(row, ['kind', 'emailIdentityHash']);
    if (typeof row.emailIdentityHash !== 'string' || !/^[a-f0-9]{64}$/.test(row.emailIdentityHash)) return invalid();
    return Object.freeze({ kind: 'email_identity', emailIdentityHash: row.emailIdentityHash });
  }
  return invalid();
}
function scope(input: unknown): CompanyRoleScope {
  const row = dataRecord(input);
  if (row.type === 'company') { record(row, ['type']); return Object.freeze({ type: 'company' }); }
  if (row.type === 'site') { record(row, ['type', 'siteId']); return Object.freeze({ type: 'site', siteId: id(row.siteId) }); }
  return invalid();
}
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function namedRows<T extends Readonly<{ id: string }>>(input: unknown, maximum: number, normalize: (value: unknown) => T): readonly T[] {
  const seen = new Set<string>();
  const rows = array(input, maximum).map(value => {
    const item = normalize(value);
    if (seen.has(item.id)) return invalid('duplicate_id');
    seen.add(item.id);
    return item;
  });
  return Object.freeze(rows.sort((a, b) => compare(a.id, b.id)));
}
function assignmentKey(assignment: CompanyRoleAssignment): string {
  return JSON.stringify([assignment.companyId, assignment.contactId, assignment.roleId,
    assignment.scope.type, assignment.scope.type === 'site' ? assignment.scope.siteId : null]);
}
function normalizeDirectory(input: unknown): CompanyDirectory {
  const row = record(input, ['schemaVersion', 'source', 'id', 'version', 'capturedAt', 'companies', 'sites', 'contacts', 'roles', 'assignments']);
  if (row.schemaVersion !== 1 || row.source !== 'fixture') return invalid();
  const directoryId = id(row.id);
  if (typeof row.version !== 'number' || !Number.isSafeInteger(row.version) || row.version < 1) return invalid();
  if (typeof row.capturedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.capturedAt)) return invalid();
  const capturedAt = new Date(row.capturedAt);
  if (!Number.isFinite(capturedAt.getTime()) || capturedAt.toISOString() !== row.capturedAt) return invalid();
  const companies = namedRows(row.companies, COMPANY_DIRECTORY_LIMITS.companies, (value): Company => {
    const company = record(value, ['id', 'displayName', 'state', 'vatId']);
    return Object.freeze({ id: id(company.id), displayName: label(company.displayName), state: state(company.state), vatId: vatDeclaration(company.vatId) });
  });
  const companyIds = new Set(companies.map(company => company.id));
  const sites = namedRows(row.sites, COMPANY_DIRECTORY_LIMITS.sites, (value): CompanySite => {
    const site = record(value, ['id', 'companyId', 'label', 'state', 'countryCode']);
    const companyId = id(site.companyId);
    if (!companyIds.has(companyId)) return invalid('unknown_reference');
    return Object.freeze({ id: id(site.id), companyId, label: label(site.label), state: state(site.state),
      countryCode: site.countryCode === null ? null : country(site.countryCode) });
  });
  const contacts = namedRows(row.contacts, COMPANY_DIRECTORY_LIMITS.contacts, (value): CompanyContact => {
    const contact = record(value, ['id', 'companyId', 'displayName', 'state', 'identityRef']);
    const companyId = id(contact.companyId);
    if (!companyIds.has(companyId)) return invalid('unknown_reference');
    return Object.freeze({ id: id(contact.id), companyId, displayName: label(contact.displayName), state: state(contact.state), identityRef: identityRef(contact.identityRef) });
  });
  const roles = namedRows(row.roles, COMPANY_DIRECTORY_LIMITS.roles, (value): CompanyRole => {
    const role = record(value, ['id', 'label']);
    return Object.freeze({ id: id(role.id), label: label(role.label) });
  });
  const siteById = new Map(sites.map(site => [site.id, site]));
  const contactById = new Map(contacts.map(contact => [contact.id, contact]));
  const roleIds = new Set(roles.map(role => role.id));
  const assignmentKeys = new Set<string>();
  const assignments = array(row.assignments, COMPANY_DIRECTORY_LIMITS.assignments).map((value): CompanyRoleAssignment => {
    const assignment = record(value, ['companyId', 'contactId', 'roleId', 'scope']);
    const companyId = id(assignment.companyId); const contactId = id(assignment.contactId); const roleId = id(assignment.roleId);
    const assignmentScope = scope(assignment.scope);
    const contact = contactById.get(contactId);
    const site = assignmentScope.type === 'site' ? siteById.get(assignmentScope.siteId) : undefined;
    if (!companyIds.has(companyId) || !contact || !roleIds.has(roleId) || (assignmentScope.type === 'site' && !site)) return invalid('unknown_reference');
    if (contact.companyId !== companyId || (site && site.companyId !== companyId)) return invalid('cross_company_reference');
    const normalized = Object.freeze({ companyId, contactId, roleId, scope: assignmentScope });
    const key = assignmentKey(normalized);
    if (assignmentKeys.has(key)) return invalid('duplicate_assignment');
    assignmentKeys.add(key);
    return normalized;
  });
  return Object.freeze({ schemaVersion: 1, source: 'fixture', id: directoryId, version: row.version, capturedAt: row.capturedAt,
    companies, sites, contacts, roles, assignments: Object.freeze(assignments.sort((a, b) => compare(assignmentKey(a), assignmentKey(b)))) });
}

/** Valida todo el snapshot, incluidas relaciones inactivas o ajenas a una futura selección. */
export function defineCompanyDirectory(input: unknown): CompanyDirectory {
  return boundary(() => normalizeDirectory(input));
}

/** Lectura descriptiva: no filtra inactivos ni expande roles de empresa a sus sedes. */
export function selectCompanyDirectoryEntry(input: unknown): CompanyDirectoryEntry {
  return boundary(() => {
    const row = record(input, ['directory', 'companyId']);
    const directory = normalizeDirectory(row.directory);
    const companyId = id(row.companyId);
    const company = directory.companies.find(candidate => candidate.id === companyId);
    if (!company) return invalid('unknown_company');
    const assignments = Object.freeze(directory.assignments.filter(assignment => assignment.companyId === companyId));
    const roleIds = new Set(assignments.map(assignment => assignment.roleId));
    return Object.freeze({ directoryRef: Object.freeze({ id: directory.id, version: directory.version, capturedAt: directory.capturedAt }), company,
      sites: Object.freeze(directory.sites.filter(site => site.companyId === companyId)),
      contacts: Object.freeze(directory.contacts.filter(contact => contact.companyId === companyId)),
      roles: Object.freeze(directory.roles.filter(role => roleIds.has(role.id))), assignments });
  });
}

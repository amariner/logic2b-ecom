import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPANY_DIRECTORY_LIMITS, CompanyDirectoryContractError, defineCompanyDirectory, selectCompanyDirectoryEntry,
  type CompanyDirectoryContractReason,
} from '../src/modules/companies';
import { createCustomerProfile } from '../src/modules/customers';
import { defineVatIdQuery } from '../src/modules/taxes';

const AT = '2026-10-03T12:00:00.000Z';
const HASH = 'a'.repeat(64);
function fixture() {
  return { schemaVersion: 1, source: 'fixture', id: 'directory.example', version: 3, capturedAt: AT,
    companies: [
      { id: 'company.a', displayName: 'Empresa A', state: 'active', vatId: { countryCode: 'ZZ', identifier: 'FICTIONAL' } },
      { id: 'company.b', displayName: 'Empresa B', state: 'inactive', vatId: { countryCode: 'ZZ', identifier: 'FICTIONAL' } },
    ], sites: [
      { id: 'site.a', companyId: 'company.a', label: 'Sede A', state: 'active', countryCode: 'ES' },
      { id: 'site.a2', companyId: 'company.a', label: 'Otra sede A', state: 'inactive', countryCode: null },
      { id: 'site.b', companyId: 'company.b', label: 'Sede B', state: 'inactive', countryCode: 'FR' },
    ], contacts: [
      { id: 'contact.a', companyId: 'company.a', displayName: 'Contacto A', state: 'active', identityRef: { kind: 'customer_profile', profileId: 'customer:fixture:shared' } },
      { id: 'contact.a2', companyId: 'company.a', displayName: 'Contacto A2', state: 'inactive', identityRef: { kind: 'email_identity', emailIdentityHash: HASH } },
      { id: 'contact.a3', companyId: 'company.a', displayName: 'Contacto sin referencia', state: 'active', identityRef: null },
      { id: 'contact.b', companyId: 'company.b', displayName: 'Contacto B', state: 'inactive', identityRef: { kind: 'customer_profile', profileId: 'customer:fixture:shared' } },
      { id: 'contact.b2', companyId: 'company.b', displayName: 'Contacto B2', state: 'active', identityRef: { kind: 'email_identity', emailIdentityHash: HASH } },
    ], roles: [
      { id: 'role.purchasing', label: 'Contacto de compras' }, { id: 'role.accounting', label: 'Contacto de contabilidad' },
      { id: 'role.unused', label: 'Etiqueta sin asignaciones' },
    ], assignments: [
      { companyId: 'company.a', contactId: 'contact.a', roleId: 'role.purchasing', scope: { type: 'company' } },
      { companyId: 'company.a', contactId: 'contact.a', roleId: 'role.purchasing', scope: { type: 'site', siteId: 'site.a' } },
      { companyId: 'company.a', contactId: 'contact.a2', roleId: 'role.accounting', scope: { type: 'site', siteId: 'site.a2' } },
      { companyId: 'company.b', contactId: 'contact.b', roleId: 'role.purchasing', scope: { type: 'company' } },
      { companyId: 'company.b', contactId: 'contact.b2', roleId: 'role.accounting', scope: { type: 'site', siteId: 'site.b' } },
    ] };
}
function empty() { return { ...fixture(), companies: [], sites: [], contacts: [], roles: [], assignments: [] }; }
function selected(directory: unknown = fixture(), companyId = 'company.a') { return selectCompanyDirectoryEntry({ directory, companyId }); }
function errorFrom(operation: () => unknown): CompanyDirectoryContractError {
  try { operation(); } catch (error) {
    expect(error).toBeInstanceOf(CompanyDirectoryContractError);
    return error as CompanyDirectoryContractError;
  }
  throw new Error('Se esperaba un error de contrato.');
}
function reason(operation: () => unknown, expected: CompanyDirectoryContractReason) {
  expect(errorFrom(operation)).toMatchObject({ code: 'company_directory_contract_invalid', reason: expected });
}
function frozen(input: unknown): void {
  if (input === null || typeof input !== 'object') return;
  expect(Object.isFrozen(input)).toBe(true);
  for (const value of Object.values(input)) frozen(value);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('directorio fixture y selección descriptiva por empresa', () => {
  it('conserva identidad/version/metadatos y selecciona exclusivamente relaciones propias', () => {
    const directory = defineCompanyDirectory(fixture());
    const entry = selected(directory);
    expect(entry.directoryRef).toEqual({ id: 'directory.example', version: 3, capturedAt: AT });
    expect(entry.company).toEqual(directory.companies[0]);
    expect(entry.sites.map(site => site.id)).toEqual(['site.a', 'site.a2']);
    expect(entry.contacts.map(contact => contact.id)).toEqual(['contact.a', 'contact.a2', 'contact.a3']);
    expect(entry.roles.map(role => role.id)).toEqual(['role.accounting', 'role.purchasing']);
    expect(entry.assignments).toHaveLength(3);
    expect(entry.assignments.every(assignment => assignment.companyId === 'company.a')).toBe(true);
    expect(JSON.stringify(entry)).not.toContain('company.b');
    expect(entry.roles.some(role => role.id === 'role.unused')).toBe(false);
    expect(Object.keys(entry).sort()).toEqual(['assignments', 'company', 'contacts', 'directoryRef', 'roles', 'sites']);
  });

  it('no filtra registros inactivos ni deduce el estado de sus contactos a partir de la empresa', () => {
    const active = selected(); const inactive = selected(fixture(), 'company.b');
    expect(active.sites.find(site => site.id === 'site.a2')!.state).toBe('inactive');
    expect(active.contacts.find(contact => contact.id === 'contact.a2')!.state).toBe('inactive');
    expect(active.assignments.some(assignment => assignment.contactId === 'contact.a2')).toBe(true);
    expect(inactive.company.state).toBe('inactive');
    expect(inactive.sites[0]!.state).toBe('inactive');
    expect(inactive.contacts.map(contact => contact.state)).toEqual(['inactive', 'active']);
    expect(inactive.assignments).toHaveLength(2);
  });

  it('conserva empresa y sede como ámbitos distintos sin expandir una asignación a todas las sedes', () => {
    const entry = selected();
    const assignments = entry.assignments.filter(assignment => assignment.contactId === 'contact.a');
    expect(assignments).toEqual([
      { companyId: 'company.a', contactId: 'contact.a', roleId: 'role.purchasing', scope: { type: 'company' } },
      { companyId: 'company.a', contactId: 'contact.a', roleId: 'role.purchasing', scope: { type: 'site', siteId: 'site.a' } },
    ]);
    expect(assignments.some(assignment => assignment.scope.type === 'site' && assignment.scope.siteId === 'site.a2')).toBe(false);
    for (const value of [entry, entry.company, ...entry.contacts, ...entry.roles, ...entry.assignments]) {
      for (const property of ['permissions', 'grants', 'canBuy', 'creditLimit', 'session', 'companyKeyHash', 'exempt']) expect(value).not.toHaveProperty(property);
    }
  });

  it('referencias externas y VAT repetidos no fusionan empresas/contactos ni implican pertenencia', () => {
    const directory = defineCompanyDirectory(fixture());
    expect(directory.companies[0]!.vatId).toEqual(directory.companies[1]!.vatId);
    expect(directory.contacts.filter(contact => contact.identityRef?.kind === 'customer_profile')).toHaveLength(2);
    expect(directory.contacts.filter(contact => contact.identityRef?.kind === 'email_identity')).toHaveLength(2);
    expect(directory.contacts).toHaveLength(5);
    expect(directory.contacts.find(contact => contact.id === 'contact.a3')!.identityRef).toBeNull();
    expect(directory.companies).toHaveLength(2);
    expect(directory.sites[0]!.countryCode).toBe('ES');
    expect(directory.companies[0]!.vatId!.countryCode).toBe('ZZ');
  });

  it('admite snapshot vacío y registros sin sedes/contactos/roles/asignaciones ni VAT', () => {
    expect(defineCompanyDirectory(empty())).toEqual(empty());
    reason(() => selected(empty()), 'unknown_company');
    const directory = { ...empty(), companies: [{ id: 'solo', displayName: 'Solo', state: 'inactive', vatId: null }] };
    expect(selected(directory, 'solo')).toMatchObject({ company: { vatId: null }, sites: [], contacts: [], roles: [], assignments: [] });
  });

  it('los namespaces de ID son distintos por colección y nombres repetidos no son identidad', () => {
    const directory = { ...empty(), companies: [{ id: 'same', displayName: 'Igual', state: 'active', vatId: null }],
      sites: [{ id: 'same', companyId: 'same', label: 'Igual', state: 'active', countryCode: null }],
      contacts: [{ id: 'same', companyId: 'same', displayName: 'Igual', state: 'active', identityRef: null }],
      roles: [{ id: 'same', label: 'Igual' }], assignments: [{ companyId: 'same', contactId: 'same', roleId: 'same', scope: { type: 'site', siteId: 'same' } }] };
    expect(selected(directory, 'same').assignments).toHaveLength(1);
  });

  it('metadatos aportados no consultan el reloj ni imponen que sean ahora o una historia previa', () => {
    const directory = defineCompanyDirectory({ ...fixture(), version: Number.MAX_SAFE_INTEGER, capturedAt: '2099-01-01T00:00:00.000Z' });
    expect(directory.version).toBe(Number.MAX_SAFE_INTEGER);
    expect(directory.capturedAt).toBe('2099-01-01T00:00:00.000Z');
    expect(selected(directory).directoryRef.capturedAt).toBe(directory.capturedAt);
  });
});

describe('integridad global y propiedad de todas las relaciones', () => {
  it.each(['companies', 'sites', 'contacts', 'roles'] as const)('ID duplicado en %s se rechaza antes de seleccionar', collection => {
    const directory = fixture();
    const rows = directory[collection];
    const duplicated = { ...directory, [collection]: [...rows, { ...rows[0] }] };
    reason(() => defineCompanyDirectory(duplicated), 'duplicate_id');
    reason(() => selected(duplicated, 'company.b'), 'duplicate_id');
  });

  it('asignaciones duplicadas se detectan por tupla y no admiten un ID que oculte la repetición', () => {
    const directory = fixture();
    reason(() => defineCompanyDirectory({ ...directory, assignments: [...directory.assignments, structuredClone(directory.assignments[0])] }), 'duplicate_assignment');
    reason(() => defineCompanyDirectory({ ...directory, assignments: directory.assignments.map((assignment, index) => index === 0 ? { ...assignment, id: 'other' } : assignment) }), 'invalid_data');
  });

  it.each(['site_owner', 'contact_owner', 'assignment_company', 'assignment_contact', 'assignment_role', 'assignment_site'] as const)(
    'referencia ausente %s en empresa inactiva invalida incluso seleccionar otra', field => {
      const directory = fixture();
      if (field === 'site_owner') directory.sites[2]!.companyId = 'missing';
      if (field === 'contact_owner') directory.contacts[3]!.companyId = 'missing';
      if (field === 'assignment_company') directory.assignments[3]!.companyId = 'missing';
      if (field === 'assignment_contact') directory.assignments[3]!.contactId = 'missing';
      if (field === 'assignment_role') directory.assignments[3]!.roleId = 'missing';
      if (field === 'assignment_site') directory.assignments[4]!.scope = { type: 'site', siteId: 'missing' };
      reason(() => selected(directory, 'company.a'), 'unknown_reference');
    });

  it.each(['active', 'inactive'] as const)('contacto o sede de otra empresa nunca satisfacen una asignación %s', state => {
    const directory = fixture();
    directory.companies[1]!.state = state; directory.contacts[3]!.state = state; directory.sites[2]!.state = state;
    for (const assignment of [
      { companyId: 'company.a', contactId: 'contact.b', roleId: 'role.purchasing', scope: { type: 'company' } },
      { companyId: 'company.a', contactId: 'contact.a', roleId: 'role.purchasing', scope: { type: 'site', siteId: 'site.b' } },
      { companyId: 'company.b', contactId: 'contact.a', roleId: 'role.purchasing', scope: { type: 'site', siteId: 'site.b' } },
    ]) reason(() => selected({ ...directory, assignments: [assignment] }), 'cross_company_reference');
  });

  it.each([{ type: 'company', siteId: 'site.a' }, { type: 'site' }, { type: 'site', siteId: null },
    { type: 'all' }, { type: 'company', grants: ['buy'] }])('scope discriminado estricto %j', scope => {
    const directory = fixture();
    reason(() => defineCompanyDirectory({ ...directory, assignments: [{ ...directory.assignments[0], scope }] }), 'invalid_data');
  });

  it('no adivina empresa cuando falta el selector ni acepta extras/autorizaciones', () => {
    reason(() => selectCompanyDirectoryEntry({ directory: fixture() }), 'invalid_data');
    reason(() => selected(fixture(), 'company.missing'), 'unknown_company');
    reason(() => selectCompanyDirectoryEntry({ directory: fixture(), companyId: 'company.a', authorized: true }), 'invalid_data');
    const directory = fixture();
    reason(() => defineCompanyDirectory({ ...directory, roles: [{ id: 'role.a', label: 'Admin', permissions: ['all'] }] }), 'invalid_data');
  });
});

describe('compatibilidad y validación explícita de referencias externas/VAT', () => {
  it('perfil hasta200 y con dos puntos conserva la sintaxis pública de customers sin leerlo', () => {
    const profileId = `customer:${'a'.repeat(191)}`;
    expect(profileId).toHaveLength(200);
    const profile = createCustomerProfile({ id: profileId, email: 'fixture@example.test', emailIdentityHash: HASH, at: AT });
    const directory = fixture();
    directory.contacts[0]!.identityRef = { kind: 'customer_profile', profileId: profile.id };
    expect(selected(directory).contacts[0]!.identityRef).toEqual({ kind: 'customer_profile', profileId });
    expect(selected(directory).contacts[0]).not.toHaveProperty('email');
  });

  it('company ID hasta100 es compatible con una consulta VAT derivada sin normalización', () => {
    const companyId = `c${'a'.repeat(99)}`;
    const directory = { ...empty(), companies: [{ id: companyId, displayName: 'Fixture', state: 'active', vatId: { countryCode: 'ZZ', identifier: 'FICTIONAL123' } }] };
    const company = selected(directory, companyId).company;
    expect(defineVatIdQuery({ schemaVersion: 1, id: company.id, ...company.vatId })).toEqual({ schemaVersion: 1, id: companyId, countryCode: 'ZZ', identifier: 'FICTIONAL123' });
    expect(company).not.toHaveProperty('verified'); expect(company).not.toHaveProperty('exempt');
  });

  it.each([
    { kind: 'customer_profile', profileId: 'profile' }, { kind: 'customer_profile', profileId: 'customer.foo' },
    { kind: 'customer_profile', profileId: `customer:${'a'.repeat(192)}` }, { kind: 'customer_profile', profileId: 'Customer:one' },
    { kind: 'email_identity', emailIdentityHash: 'A'.repeat(64) }, { kind: 'email_identity', emailIdentityHash: 'a'.repeat(63) },
    { kind: 'email_identity', emailIdentityHash: 'raw@example.test' },
    { kind: 'customer_profile', profileId: 'customer:one', emailIdentityHash: HASH },
    { kind: 'email', email: 'raw@example.test' }, { kind: 'customer_profile' }, {}, undefined,
  ])('referencia externa no declarada/corrupta %j', identityRef => {
    const directory = fixture();
    reason(() => defineCompanyDirectory({ ...directory, contacts: [{ ...directory.contacts[0], identityRef }] }), 'invalid_data');
  });

  it.each([{ countryCode: 'zz', identifier: 'FICTIONAL' }, { countryCode: 'ZZ', identifier: '' },
    { countryCode: 'ZZ', identifier: 'fictional' }, { countryCode: 'ZZ', identifier: 'A'.repeat(33) },
    { countryCode: 'ZZ', identifier: 'FICTIONAL', valid: true }, { countryCode: 'ZZ' }, undefined])('VAT es declaración estricta %j', vatId => {
    reason(() => defineCompanyDirectory({ ...empty(), companies: [{ id: 'company.a', displayName: 'A', state: 'active', vatId }] }), 'invalid_data');
  });
});

describe('límites, determinismo e inmutabilidad', () => {
  it('admite cada máximo global con relaciones coherentes, sin límites implícitos por empresa', () => {
    const companies = Array.from({ length: COMPANY_DIRECTORY_LIMITS.companies }, (_, index) => ({ id: `company.c${index}`, displayName: 'Fixture', state: 'inactive', vatId: null }));
    const sites = Array.from({ length: COMPANY_DIRECTORY_LIMITS.sites }, (_, index) => ({ id: `site.s${index}`, companyId: companies[0]!.id, label: 'Sede', state: 'inactive', countryCode: null }));
    const contacts = Array.from({ length: COMPANY_DIRECTORY_LIMITS.contacts }, (_, index) => ({ id: `contact.c${index}`, companyId: companies[0]!.id, displayName: 'Contacto', state: 'inactive', identityRef: null }));
    const roles = Array.from({ length: COMPANY_DIRECTORY_LIMITS.roles }, (_, index) => ({ id: `role.r${index}`, label: 'Rol descriptivo' }));
    const assignments = Array.from({ length: COMPANY_DIRECTORY_LIMITS.assignments }, (_, index) => ({ companyId: companies[0]!.id,
      contactId: contacts[Math.floor(index / roles.length)]!.id, roleId: roles[index % roles.length]!.id, scope: { type: 'company' } }));
    const normalized = defineCompanyDirectory({ ...empty(), companies, sites, contacts, roles, assignments });
    for (const key of ['companies', 'sites', 'contacts', 'roles', 'assignments'] as const) expect(normalized[key]).toHaveLength(COMPANY_DIRECTORY_LIMITS[key]);
    expect(selected(normalized, companies[0]!.id).assignments).toHaveLength(10000);
  });

  it.each(['companies', 'sites', 'contacts', 'roles', 'assignments'] as const)('rechaza %s superior al límite antes de tratar referencias', key => {
    const rows = Array.from({ length: COMPANY_DIRECTORY_LIMITS[key] + 1 }, () => ({}));
    reason(() => defineCompanyDirectory({ ...empty(), [key]: rows }), 'invalid_data');
  });

  it('ordena canónicamente todas las colecciones y copia cada estructura sin mutar entrada', () => {
    const input = fixture();
    const before = JSON.stringify(input);
    const normalized = defineCompanyDirectory(input);
    expect(JSON.stringify(input)).toBe(before);
    const reversed = fixture();
    for (const key of ['companies', 'sites', 'contacts', 'roles', 'assignments'] as const) reversed[key].reverse();
    expect(defineCompanyDirectory(reversed)).toEqual(normalized);
    expect(selected(reversed)).toEqual(selected(normalized));
    input.companies[0]!.vatId.identifier = 'CHANGED'; input.contacts[0]!.displayName = 'Changed'; input.assignments[1]!.scope.siteId = 'site.b';
    expect(normalized.companies[0]!.vatId!.identifier).toBe('FICTIONAL');
    expect(normalized.contacts[0]!.displayName).toBe('Contacto A');
    frozen(normalized); frozen(selected(normalized));
    expect(() => Object.assign(normalized.companies[0]!, { state: 'inactive' })).toThrow();
  });

  it.each([0, -0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, '1'])('versión inválida %s', version => {
    reason(() => defineCompanyDirectory({ ...fixture(), version }), 'invalid_data');
  });
  it.each(['2026-02-30T12:00:00.000Z', '2026-10-03T12:00:00Z', '2026-10-03T12:00:00.000+00:00', '', null])('fecha no canónica %s', capturedAt => {
    reason(() => defineCompanyDirectory({ ...fixture(), capturedAt }), 'invalid_data');
  });
  it.each(['Company.a', ' company.a', 'company:', 'company..a', 'a'.repeat(101), ''])('ID propio no canónico %s', id => {
    reason(() => defineCompanyDirectory({ ...fixture(), id }), 'invalid_data');
  });
  it.each(['', ' ', ' nombre', 'nombre ', 'a'.repeat(161), 'nombre\nprivado'])('texto no canónico %s', displayName => {
    const directory = fixture();
    reason(() => defineCompanyDirectory({ ...directory, companies: [{ ...directory.companies[0], displayName }] }), 'invalid_data');
  });
});

describe('datos estrictos, errores redactados y ausencia de efectos', () => {
  it.each([null, [], {}, new Date(AT), { ...fixture(), source: 'operational' }, { ...fixture(), schemaVersion: 2 },
    { ...fixture(), grants: [] }, { ...fixture(), roles: undefined }])('rechaza forma extraña sin usar defaults %j', input => {
    reason(() => defineCompanyDirectory(input), 'invalid_data');
  });

  it('rechaza getters y propiedades extra en cualquier nivel sin ejecutarlos', () => {
    let calls = 0;
    const getter = () => { calls++; return 'SECRETO'; };
    const makeGetter = (object: object, key: string) => Object.defineProperty(object, key, { enumerable: true, get: getter });
    const inputs = [makeGetter(fixture(), 'companies'),
      { ...fixture(), companies: [makeGetter({ ...fixture().companies[0] }, 'displayName')] },
      { ...fixture(), companies: [{ ...fixture().companies[0], vatId: makeGetter({ countryCode: 'ZZ' }, 'identifier') }] },
      { ...fixture(), contacts: [{ ...fixture().contacts[0], identityRef: makeGetter({ kind: 'customer_profile' }, 'profileId') }] },
      { ...fixture(), assignments: [{ ...fixture().assignments[0], scope: makeGetter({}, 'type') }] },
      { ...fixture(), [Symbol('secret')]: true }, Object.defineProperty(fixture(), 'secret', { value: 'SECRET' }),
      Object.assign(Object.create({ inherited: true }) as Record<string, unknown>, fixture()),
    ];
    for (const input of inputs) reason(() => defineCompanyDirectory(input), 'invalid_data');
    reason(() => selectCompanyDirectoryEntry(makeGetter({ directory: fixture() }, 'companyId')), 'invalid_data');
    expect(calls).toBe(0);
  });

  it('arrays no admiten huecos, accesores, propiedades, símbolos ni subclases', () => {
    let calls = 0;
    const accessor = Object.defineProperty([{}], '0', { enumerable: true, get() { calls++; return fixture().companies[0]; } });
    class Rows extends Array<unknown> {}
    for (const companies of [Array(1), accessor, Object.assign([], { hidden: true }), Object.assign([], { [Symbol('x')]: true }), new Rows()]) {
      reason(() => defineCompanyDirectory({ ...empty(), companies }), 'invalid_data');
    }
    expect(calls).toBe(0);
  });

  it('objetos sin prototipo se copian y campos de permisos ocultos siguen siendo inválidos', () => {
    const value = Object.assign(Object.create(null) as Record<string, unknown>, fixture());
    expect(defineCompanyDirectory(value)).toEqual(defineCompanyDirectory(fixture()));
    const directory = fixture();
    reason(() => defineCompanyDirectory({ ...directory, roles: [Object.defineProperty({ ...directory.roles[0] }, 'permissions', { value: ['all'] })] }), 'invalid_data');
  });

  it('ningún error incorpora valores de VAT, perfil, hash, nombre o mensajes/cause ajenos', () => {
    const secrets = ['PRIVATE VAT', 'private@example.test', 'Private Display Name', HASH];
    const directory = fixture();
    const sensitive = { ...directory, companies: [{ ...directory.companies[0], displayName: secrets[2], vatId: { countryCode: 'ZZ', identifier: secrets[0] } }] };
    const errors = [errorFrom(() => defineCompanyDirectory(sensitive)), errorFrom(() => selected(fixture(), 'missing.private-id'))];
    const external = new Error(secrets.join(' / '));
    for (const trap of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor'] as const) {
      const proxy = new Proxy(fixture(), { [trap]: () => { throw external; } });
      errors.push(errorFrom(() => defineCompanyDirectory(proxy)));
    }
    const forged = new CompanyDirectoryContractError('cross_company_reference');
    forged.message = secrets.join(' / ');
    errors.push(errorFrom(() => defineCompanyDirectory(new Proxy({}, { getPrototypeOf() { throw forged; } }))));
    const hostileError = new Proxy({}, { getPrototypeOf() { throw external; } });
    errors.push(errorFrom(() => defineCompanyDirectory(new Proxy({}, { getPrototypeOf() { throw hostileError; } }))));
    for (const error of errors) {
      for (const secret of [...secrets, 'missing.private-id']) expect(`${String(error)}${JSON.stringify(error)}`).not.toContain(secret);
      expect(error).not.toHaveProperty('cause');
      expect(error.code).toBe('company_directory_contract_invalid');
    }
    expect(new CompanyDirectoryContractError('PRIVATE VAT' as CompanyDirectoryContractReason).reason).toBe('invalid_data');
  });

  it('selección también revalida snapshots previamente normalizados que se reconstruyen corruptos', () => {
    const valid = defineCompanyDirectory(fixture());
    const corrupt = { ...valid, contacts: valid.contacts.map(contact => contact.id === 'contact.b' ? { ...contact, companyId: 'company.a' } : contact) };
    reason(() => selected(corrupt), 'cross_company_reference');
  });

  it('no consulta perfil/email/VAT, reloj, red, storage o temporizadores', () => {
    const OriginalDate = Date;
    const forbidden = vi.fn(() => { throw new Error('Efecto inesperado'); });
    class ExplicitDate extends OriginalDate {
      constructor(value?: string | number) { if (value === undefined) forbidden(); super(value!); }
      static override now(): number { return forbidden() as never; }
    }
    vi.stubGlobal('Date', ExplicitDate);
    for (const name of ['fetch', 'setTimeout', 'setInterval']) vi.stubGlobal(name, forbidden);
    for (const name of ['localStorage', 'sessionStorage']) vi.stubGlobal(name, { getItem: forbidden, setItem: forbidden });
    const directory = defineCompanyDirectory(fixture());
    expect(selected(directory).company.id).toBe('company.a');
    expect(selected(directory, 'company.b').company.state).toBe('inactive');
    reason(() => selected(directory, 'missing'), 'unknown_company');
    expect(forbidden).not.toHaveBeenCalled();
  });
});

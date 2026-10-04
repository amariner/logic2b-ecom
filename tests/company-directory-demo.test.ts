import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canShowCompanyDirectoryDemo, configureCompanyDirectoryDemo, createCompanyDirectoryDemo,
  getCompanyDirectoryDemoView, type CompanyDirectoryDemoSelection, type CompanyDirectoryDemoState,
} from '../src/composition/company-directory-demo';
import { createPlatform } from '../src/composition/create-platform';
import { createPresetManifest, createPublicDemoManifest } from '../src/platform/configuration';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const configure = configureCompanyDirectoryDemo;
const view = getCompanyDirectoryDemoView;
const SCENARIOS = ['not_checked', 'valid', 'invalid', 'expired', 'unavailable'] as const;
const AT = '2026-10-03T12:00:00.000Z';
const CHECKED_AT = '2026-10-03T11:00:00.000Z';
const EXPIRES_AT = '2026-10-03T13:00:00.000Z';
function stateFor(vatScenario: CompanyDirectoryDemoSelection['vatScenario']) {
  return configure(createCompanyDirectoryDemo(), { vatScenario });
}
function assertFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) assertFrozen(child);
}

describe('gate y aislamiento del ejemplo de empresas', () => {
  it.each(['demo', 'client'] as const)('exige modo %s y DEMO_MODE literal true sin acceder a D1', mode => {
    const deployment = { id: 'company-demo-isolation', environment: 'development' as const };
    const platform = createPlatform(mode === 'demo' ? createPublicDemoManifest(deployment)
      : createPresetManifest('standard', { ...deployment, mode }));
    for (const DEMO_MODE of ['true', 'TRUE', 'false', '', undefined]) {
      const env = { DEMO_MODE, get DB(): never { throw new Error('No operational binding'); } };
      expect(canShowCompanyDirectoryDemo(env, platform)).toBe(mode === 'demo' && DEMO_MODE === 'true');
    }
    expect(canShowCompanyDirectoryDemo(undefined, platform)).toBe(false);
  });

  it('mostrar el directorio no activa cuentas, permisos delegados, rutas ni trabajos', () => {
    const platform = createPlatform(createPublicDemoManifest({ id: 'company-demo-isolation', environment: 'development' }));
    expect(canShowCompanyDirectoryDemo({ DEMO_MODE: 'true' }, platform)).toBe(true);
    expect(platform.capabilityState('B2B-001')).toBe('installed');
    expect(platform.isCapabilityActive('B2B-001')).toBe(false);
    expect(platform.hasCapabilityFlag('B2B-001', 'routes')).toBe(false);
    expect(platform.manifest.capabilities).not.toHaveProperty('B2B-009');
    expect(platform.scheduledJobs('*/1 * * * *')).toEqual([]);
    expect(platform.scheduledJobs('*/5 * * * *')).toEqual([]);
  });
});

describe('subárbol descriptivo y evidencia VAT independiente', () => {
  it('inicia A sin comprobación y conserva contactos y sedes inactivos', () => {
    const initial = createCompanyDirectoryDemo();
    const current = view(initial);
    expect(initial.selection).toEqual({ companyId: 'company.alpha', vatScenario: 'not_checked' });
    expect(current.companyOptions.map(({ id, state, siteCount, contactCount }) => ({ id, state, siteCount, contactCount }))).toEqual([
      { id: 'company.alpha', state: 'active', siteCount: 2, contactCount: 3 },
      { id: 'company.beta', state: 'inactive', siteCount: 2, contactCount: 2 },
    ]);
    expect(current.sites.map(({ id, state, countryLabel }) => ({ id, state, countryLabel }))).toEqual([
      { id: 'site.alpha.main', state: 'active', countryLabel: 'España' },
      { id: 'site.alpha.secondary', state: 'inactive', countryLabel: 'Francia' },
    ]);
    expect(current.contacts.map(({ id, state }) => ({ id, state }))).toEqual([
      { id: 'contact.alpha.one', state: 'active' }, { id: 'contact.alpha.two', state: 'inactive' },
      { id: 'contact.alpha.three', state: 'active' },
    ]);
    expect(current.vat).toMatchObject({ selectable: true, status: 'not_checked', evaluationStatus: null,
      queryCompanyId: 'company.alpha', outcome: null, reason: null, at: null, checkedAt: null, expiresAt: null });
    expect(current.vat.scenarioOptions.map(({ id }) => id)).toEqual(SCENARIOS);
    expect(current.feedback.code).toBe('initial');
  });

  it('presenta las asignaciones exactas sin expandir el ámbito empresa ni inferir roles ausentes', () => {
    const current = view(createCompanyDirectoryDemo());
    expect(current.contacts.map(({ id, assignments }) => ({ id, assignments }))).toEqual([
      { id: 'contact.alpha.one', assignments: [
        { companyId: 'company.alpha', contactId: 'contact.alpha.one', roleId: 'role.purchasing', roleLabel: 'Contacto de compras',
          scopeType: 'company', scopeLabel: 'Empresa', siteId: null },
        { companyId: 'company.alpha', contactId: 'contact.alpha.one', roleId: 'role.logistics', roleLabel: 'Contacto de logística',
          scopeType: 'site', scopeLabel: 'Sede: Sede principal A', siteId: 'site.alpha.main' },
      ] },
      { id: 'contact.alpha.two', assignments: [
        { companyId: 'company.alpha', contactId: 'contact.alpha.two', roleId: 'role.billing', roleLabel: 'Contacto de facturación',
          scopeType: 'site', scopeLabel: 'Sede: Sede secundaria A', siteId: 'site.alpha.secondary' },
      ] },
      { id: 'contact.alpha.three', assignments: [] },
    ]);
  });

  it('B mantiene su subárbol completo sin declaración VAT ni relaciones heredadas de A', () => {
    const current = view(configure(stateFor('valid'), { companyId: 'company.beta' }));
    expect(current.selectedCompany).toMatchObject({ id: 'company.beta', state: 'inactive' });
    expect(current.selection.vatScenario).toBe('not_checked');
    expect(current.sites.map(({ id, state, countryLabel }) => ({ id, state, countryLabel }))).toEqual([
      { id: 'site.beta.main', state: 'inactive', countryLabel: 'Francia' },
      { id: 'site.beta.secondary', state: 'active', countryLabel: 'Sin país declarado' },
    ]);
    expect(current.contacts.map(({ id, state }) => ({ id, state }))).toEqual([
      { id: 'contact.beta.one', state: 'inactive' }, { id: 'contact.beta.two', state: 'active' },
    ]);
    const assignments = current.contacts.flatMap(contact => contact.assignments);
    expect(assignments.map(({ roleId, siteId }) => ({ roleId, siteId }))).toEqual([
      { roleId: 'role.purchasing', siteId: null }, { roleId: 'role.logistics', siteId: 'site.beta.secondary' },
    ]);
    for (const row of [...current.contacts, ...current.sites, ...assignments]) expect(row.companyId).toBe('company.beta');
    expect(JSON.stringify({ sites: current.sites, contacts: current.contacts })).not.toContain('alpha');
    expect(current.vat).toMatchObject({ selectable: false, status: 'not_declared', evaluationStatus: null,
      queryCompanyId: null, outcome: null, reason: null, at: null, checkedAt: null, expiresAt: null });
    expect(current.companyOptions).toHaveLength(2);
  });

  it.each([
    ['valid', 'usable', 'valid', null, CHECKED_AT, EXPIRES_AT],
    ['invalid', 'usable', 'invalid', null, CHECKED_AT, EXPIRES_AT],
    ['expired', 'unusable', null, 'expired', CHECKED_AT, AT],
    ['unavailable', 'unusable', null, 'not_configured', null, null],
  ] as const)('VAT %s conserva correlación y fechas sin fabricar un resultado vigente', (vatScenario, evaluationStatus, outcome, reason, checkedAt, expiresAt) => {
    const current = view(stateFor(vatScenario));
    expect(current.vat).toMatchObject({ selectable: true, status: 'evaluated', evaluationStatus,
      queryCompanyId: 'company.alpha', outcome, reason, at: AT, checkedAt, expiresAt });
    if (vatScenario === 'valid') expect(current.vat.message).toContain('No acredita pertenencia, permisos de compra ni exención');
    if (vatScenario === 'expired') expect(current.vat.expiresAt).toBe(current.vat.at);
    const baseline = view(createCompanyDirectoryDemo());
    expect(current.selectedCompany).toEqual(baseline.selectedCompany);
    expect(current.sites).toEqual(baseline.sites);
    expect(current.contacts).toEqual(baseline.contacts);
    expect(current.companyOptions).toEqual(baseline.companyOptions);
  });

  it('el DTO público omite identidades externas y el identificador VAT en los seis estados', () => {
    const states = [...SCENARIOS.map(stateFor), configure(createCompanyDirectoryDemo(), { companyId: 'company.beta' })];
    const privateKeys = new Set(['identityRef', 'profileId', 'emailIdentityHash', 'vatId', 'identifier', 'directory', 'query', 'evidence']);
    function assertPrivateFieldsAbsent(value: unknown): void {
      if (value === null || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        expect(privateKeys.has(key)).toBe(false);
        assertPrivateFieldsAbsent(child);
      }
    }
    for (const state of states) {
      const current = view(state);
      assertPrivateFieldsAbsent(current);
      const json = JSON.stringify(current);
      for (const secret of ['customer:demo:shared-reference', 'b'.repeat(64), 'FICTIONALCOMPANYA']) expect(json).not.toContain(secret);
    }
  });
});

describe('transiciones explícitas, límites hostiles y ausencia de efectos', () => {
  it.each(SCENARIOS)('A/%s → B → A limpia evidencia y no conserva presets anteriores', vatScenario => {
    const before = stateFor(vatScenario);
    const beta = configure(before, { companyId: 'company.beta' });
    const alpha = configure(beta, { companyId: 'company.alpha' });
    expect(beta.selection).toEqual({ companyId: 'company.beta', vatScenario: 'not_checked' });
    expect(alpha.selection).toEqual({ companyId: 'company.alpha', vatScenario: 'not_checked' });
    expect(alpha.feedback.code).toBe('company_changed');
    expect(view(alpha).vat).toEqual(view(createCompanyDirectoryDemo()).vat);
    expect(before.selection.vatScenario).toBe(vatScenario);
  });

  it('repetir empresa preserva el preset; cambiarla admite solo not_checked explícito', () => {
    const valid = stateFor('valid');
    expect(configure(valid, { companyId: 'company.alpha' }).selection).toEqual(valid.selection);
    const beta = configure(valid, { companyId: 'company.beta', vatScenario: 'not_checked' });
    for (const vatScenario of ['valid', 'invalid', 'expired', 'unavailable'] as const) {
      expect(() => configure(beta, { vatScenario })).toThrow(RangeError);
      expect(() => configure(beta, { companyId: 'company.alpha', vatScenario })).toThrow(RangeError);
      expect(() => configure(valid, { companyId: 'company.beta', vatScenario })).toThrow(RangeError);
    }
    expect(configure(beta, { companyId: 'company.alpha', vatScenario: 'not_checked' }).selection.vatScenario).toBe('not_checked');
  });

  it('reset crea el estado inicial sin cambiar los estados previos', () => {
    const initial = createCompanyDirectoryDemo();
    const changed = configure(stateFor('valid'), { companyId: 'company.beta' });
    const reset = createCompanyDirectoryDemo();
    expect(reset).toEqual(initial);
    expect(view(reset)).toEqual(view(initial));
    expect(changed.selection.companyId).toBe('company.beta');
    expect(reset).not.toBe(initial);
  });

  it('rechaza selectores ajenos, campos extra y undefined sin completar por defecto', () => {
    const initial = createCompanyDirectoryDemo();
    for (const input of [null, [], {}, { companyId: 'company.unknown' }, { companyId: undefined },
      { vatScenario: undefined }, { vatScenario: 'future' }, { vatScenario: 'VALID' }, { companyId: 'company.alpha', extra: true },
      { siteId: 'site.alpha.main' }, { identifier: 'INJECTED' }, { at: AT }]) {
      expect(() => configure(initial, input as never)).toThrow(RangeError);
    }
    expect(initial).toEqual(createCompanyDirectoryDemo());
  });

  it('revalida el estado en lectura y configuración, incluidos feedback y combinaciones imposibles', () => {
    const initial = createCompanyDirectoryDemo();
    for (const state of [null, {}, { ...initial, extra: true }, { ...initial, selection: {} },
      { ...initial, selection: { companyId: 'company.unknown', vatScenario: 'not_checked' } },
      { ...initial, selection: { companyId: 'company.beta', vatScenario: 'valid' } },
      { ...initial, selection: { ...initial.selection, vatScenario: 'future' } },
      { ...initial, feedback: { ...initial.feedback, message: 'Injected message' } },
      { ...initial, feedback: { ...initial.feedback, code: 'unknown' } },
    ]) {
      expect(() => view(state as CompanyDirectoryDemoState)).toThrow(RangeError);
      expect(() => configure(state as CompanyDirectoryDemoState, { vatScenario: 'not_checked' })).toThrow(RangeError);
    }
  });

  it('rechaza getters, prototipos, símbolos y propiedades ocultas; redacta errores de introspección', () => {
    const initial = createCompanyDirectoryDemo();
    const getter = vi.fn(() => 'valid');
    const accessor = Object.defineProperty({}, 'vatScenario', { enumerable: true, get: getter });
    for (const input of [accessor, Object.assign(Object.create({ inherited: true }), { vatScenario: 'valid' }),
      { vatScenario: 'valid', [Symbol('hidden')]: true }, Object.defineProperty({}, 'vatScenario', { value: 'valid' })]) {
      expect(() => configure(initial, input)).toThrow(RangeError);
    }
    const badState = Object.defineProperty({ feedback: initial.feedback }, 'selection', { enumerable: true, get: getter });
    expect(() => view(badState as CompanyDirectoryDemoState)).toThrow(RangeError);
    expect(() => view({ ...initial, selection: accessor } as CompanyDirectoryDemoState)).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
    const proxy = new Proxy({}, { ownKeys() { throw new Error('private:person@example.test'); } });
    for (const call of [() => configure(initial, proxy), () => view(proxy as CompanyDirectoryDemoState)]) {
      expect(call).toThrow('Selección del ejemplo de empresas inválida.');
      try { call(); } catch (error) { expect(String(error)).not.toContain('person@example.test'); }
    }
  });

  it('acepta registros de datos sin prototipo, copia el estado y congela recursivamente los DTO', () => {
    const initial = createCompanyDirectoryDemo();
    const selection = { companyId: 'company.alpha', vatScenario: 'valid' };
    const source = { selection, feedback: { ...initial.feedback } };
    const current = view(source as CompanyDirectoryDemoState);
    selection.companyId = 'company.beta'; selection.vatScenario = 'not_checked';
    expect(current.selection).toEqual({ companyId: 'company.alpha', vatScenario: 'valid' });
    const patch = Object.assign(Object.create(null), { vatScenario: 'invalid' });
    const changed = configure(initial, patch);
    patch.vatScenario = 'expired';
    expect(changed.selection.vatScenario).toBe('invalid');
    for (const state of [...SCENARIOS.map(stateFor), configure(initial, { companyId: 'company.beta' })]) {
      assertFrozen(state); assertFrozen(view(state));
    }
  });

  it('recorre los seis estados sin reloj implícito, red, almacenamiento ni temporizadores', () => {
    const RealDate = Date;
    class ExplicitDate extends RealDate {
      constructor(value?: string | number) { if (value === undefined) throw new Error('Implicit clock'); super(value); }
      static override now(): never { throw new Error('Implicit clock'); }
    }
    const forbidden = vi.fn(() => { throw new Error('Unexpected effect'); });
    vi.stubGlobal('Date', ExplicitDate);
    for (const name of ['fetch', 'setTimeout', 'setInterval', 'requestAnimationFrame']) vi.stubGlobal(name, forbidden);
    for (const name of ['localStorage', 'sessionStorage']) vi.stubGlobal(name, { getItem: forbidden, setItem: forbidden, removeItem: forbidden });
    for (const vatScenario of SCENARIOS) {
      expect(view(stateFor(vatScenario)).selection.vatScenario).toBe(vatScenario);
    }
    expect(view(configure(createCompanyDirectoryDemo(), { companyId: 'company.beta' })).vat.status).toBe('not_declared');
    expect(view(createCompanyDirectoryDemo()).vat.status).toBe('not_checked');
    expect(forbidden).not.toHaveBeenCalled();
  });
});

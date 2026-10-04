import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPANY_PAYMENT_TERMS_LIMITS, CompanyPaymentTermsContractError,
  defineCompanyPaymentTermsPolicy, defineCompanyPaymentTermsRequest, previewCompanyPaymentTerms,
  type CompanyPaymentTermsCondition, type CompanyPaymentTermsContractReason,
} from '../src/modules/companies';

const AT = '2026-10-03T12:00:00.000Z';
function fixture() {
  const directoryRef = { id: 'directory.example', version: 3, capturedAt: AT };
  return {
    directory: { ...directoryRef, schemaVersion: 1, source: 'fixture', companies: [
      { id: 'company.a', displayName: 'Empresa A', state: 'active', vatId: { countryCode: 'ZZ', identifier: 'PRIVATEFIXTURE' } },
      { id: 'company.b', displayName: 'Empresa B', state: 'inactive', vatId: null },
    ], sites: [], contacts: [], roles: [], assignments: [] },
    policy: { schemaVersion: 1, source: 'fixture', id: 'terms.example', version: 2, calendar: 'utc-civil-days-v1',
      directoryRef: { ...directoryRef }, assignments: [{ companyId: 'company.a',
        condition: { kind: 'net_days', days: 30 } as CompanyPaymentTermsCondition, reminderOffsetsDays: [5, -7, 0] }] },
    request: { schemaVersion: 1, id: 'request.example', directoryRef: { ...directoryRef },
      policyRef: { id: 'terms.example', version: 2 }, companyId: 'company.a', baseDate: '2026-10-03', evaluationDate: '2026-10-26' },
  };
}
function errorFrom(operation: () => unknown): CompanyPaymentTermsContractError {
  try { operation(); } catch (error) {
    expect(error).toBeInstanceOf(CompanyPaymentTermsContractError);
    return error as CompanyPaymentTermsContractError;
  }
  throw new Error('Se esperaba un error de contrato.');
}
function reason(operation: () => unknown, expected: CompanyPaymentTermsContractReason = 'invalid_data'): void {
  expect(errorFrom(operation)).toMatchObject({ code: 'company_payment_terms_contract_invalid', reason: expected });
}
function frozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) frozen(child);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('condición declarada y calendario de pago fixture', () => {
  it('calcula neto 30 e hitos explícitos preservando referencias y dirección de las diferencias', () => {
    expect(previewCompanyPaymentTerms(fixture())).toEqual({
      source: 'fixture', directoryRef: { id: 'directory.example', version: 3, capturedAt: AT },
      policyRef: { id: 'terms.example', version: 2 }, requestId: 'request.example', calendar: 'utc-civil-days-v1',
      company: { id: 'company.a', state: 'active' }, baseDate: '2026-10-03', evaluationDate: '2026-10-26',
      basePosition: 'after_base', outcome: 'configured', condition: { kind: 'net_days', days: 30 },
      dueDate: '2026-11-02', duePosition: 'before_due', daysUntilDue: 7,
      reminderMilestones: [
        { offsetDays: -7, date: '2026-10-26', milestonePosition: 'today', daysUntilMilestone: 0 },
        { offsetDays: 0, date: '2026-11-02', milestonePosition: 'upcoming', daysUntilMilestone: 7 },
        { offsetDays: 5, date: '2026-11-07', milestonePosition: 'upcoming', daysUntilMilestone: 12 },
      ],
    });
  });

  it.each([
    ['2026-10-01', 'before_base', 'before_due', 2, 'upcoming'],
    ['2026-10-03', 'on_base', 'on_due', 0, 'today'],
    ['2026-10-04', 'after_base', 'after_due', -1, 'past'],
  ] as const)('inmediato con evaluación %s conserva diagnóstico temporal, no estado de cobro', (evaluationDate, basePosition, duePosition, daysUntilDue, milestonePosition) => {
    const input = fixture(); input.policy.assignments[0]!.condition = { kind: 'immediate' };
    input.policy.assignments[0]!.reminderOffsetsDays = [0]; input.request.evaluationDate = evaluationDate;
    const output = previewCompanyPaymentTerms(input);
    expect(output).toMatchObject({ dueDate: input.request.baseDate, basePosition, duePosition, daysUntilDue });
    expect(output.reminderMilestones).toEqual([{ offsetDays: 0, date: input.request.baseDate, milestonePosition, daysUntilMilestone: daysUntilDue }]);
    for (const key of ['paid', 'unpaid', 'overdue', 'collectionStatus', 'balance', 'amount', 'authorized', 'sent', 'jobs', 'recipients']) {
      expect(output).not.toHaveProperty(key);
    }
    expect(JSON.stringify(output)).not.toContain('PRIVATEFIXTURE');
  });

  it('conserva hitos anteriores a la base sin moverlos ni añadir un recordatorio al vencimiento', () => {
    const input = fixture(); input.policy.assignments[0]!.condition = { kind: 'immediate' };
    input.policy.assignments[0]!.reminderOffsetsDays = [-7]; input.request.evaluationDate = input.request.baseDate;
    expect(previewCompanyPaymentTerms(input).reminderMilestones).toEqual([
      { offsetDays: -7, date: '2026-09-26', milestonePosition: 'past', daysUntilMilestone: -7 },
    ]);
    input.policy.assignments[0]!.reminderOffsetsDays = [];
    expect(previewCompanyPaymentTerms(input).reminderMilestones).toEqual([]);
  });

  it('ausencia significa derivados nulos, también para empresa inactiva, sin pago inmediato inferido', () => {
    const input = fixture(); input.request.companyId = 'company.b';
    const absent = previewCompanyPaymentTerms(input);
    expect(absent).toMatchObject({ company: { id: 'company.b', state: 'inactive' }, outcome: 'unconfigured', condition: null,
      dueDate: null, duePosition: null, daysUntilDue: null, reminderMilestones: [], basePosition: 'after_base' });
    input.policy.assignments = [];
    input.request.companyId = 'company.a';
    expect(previewCompanyPaymentTerms(input)).toMatchObject({ outcome: 'unconfigured', company: { state: 'active' }, dueDate: null });
  });

  it('inactiva configurada conserva condición descriptiva de esta revisión', () => {
    const input = fixture(); input.request.companyId = 'company.b';
    input.policy.assignments[0]!.companyId = 'company.b';
    expect(previewCompanyPaymentTerms(input)).toMatchObject({ company: { id: 'company.b', state: 'inactive' },
      outcome: 'configured', dueDate: '2026-11-02', condition: { kind: 'net_days', days: 30 } });
  });
});

describe('calendario civil gregoriano UTC', () => {
  it.each([
    ['0001-01-01', 1, '0001-01-02'], ['0099-12-31', 1, '0100-01-01'],
    ['1900-02-28', 1, '1900-03-01'], ['2000-02-28', 1, '2000-02-29'],
    ['2000-02-29', 1, '2000-03-01'], ['2100-02-28', 1, '2100-03-01'],
    ['2400-02-28', 1, '2400-02-29'], ['2026-01-31', 30, '2026-03-02'],
    ['2026-12-31', 1, '2027-01-01'], ['9999-12-30', 1, '9999-12-31'],
  ] as const)('%s + %i días => %s sin reglas laborales ni remapeo de años', (baseDate, days, expected) => {
    const input = fixture(); input.request.baseDate = baseDate; input.request.evaluationDate = expected;
    input.policy.assignments[0]!.condition = { kind: 'net_days', days }; input.policy.assignments[0]!.reminderOffsetsDays = [];
    expect(previewCompanyPaymentTerms(input)).toMatchObject({ dueDate: expected, duePosition: 'on_due', daysUntilDue: 0 });
  });

  it('evalúa el rango completo sin ligar base o evaluación a capturedAt', () => {
    const input = fixture(); input.policy.assignments[0]!.condition = { kind: 'immediate' };
    input.policy.assignments[0]!.reminderOffsetsDays = [];
    input.request.baseDate = '9999-12-31'; input.request.evaluationDate = '0001-01-01';
    expect(previewCompanyPaymentTerms(input)).toMatchObject({ dueDate: '9999-12-31', basePosition: 'before_base', daysUntilDue: 3_652_058 });
    input.request.baseDate = '0001-01-01'; input.request.evaluationDate = '9999-12-31';
    expect(previewCompanyPaymentTerms(input)).toMatchObject({ dueDate: '0001-01-01', daysUntilDue: -3_652_058, duePosition: 'after_due' });
  });

  it.each(['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2026-02-30', '2026-04-31', '2026-13-01',
    '2026-00-01', '2026-01-00', '2026-1-01', ' 2026-01-01', '2026-01-01 ', '2026-01-01T00:00:00.000Z', '2026-01-01+01:00'])('rechaza fecha no canónica o inexistente %s', date => {
    const request = fixture().request;
    reason(() => defineCompanyPaymentTermsRequest({ ...request, baseDate: date }));
    reason(() => defineCompanyPaymentTermsRequest({ ...request, evaluationDate: date }));
  });

  it('rechaza overflow del vencimiento o de cualquier hito sin respuesta parcial', () => {
    const input = fixture(); input.request.baseDate = '9999-12-31';
    input.policy.assignments[0]!.condition = { kind: 'net_days', days: 1 }; input.policy.assignments[0]!.reminderOffsetsDays = [];
    reason(() => previewCompanyPaymentTerms(input), 'date_overflow');
    input.policy.assignments[0]!.condition = { kind: 'immediate' };
    input.policy.assignments[0]!.reminderOffsetsDays = [-1, 0, 1];
    reason(() => previewCompanyPaymentTerms(input), 'date_overflow');
    input.request.baseDate = '0001-01-01'; input.policy.assignments[0]!.reminderOffsetsDays = [-1, 0];
    reason(() => previewCompanyPaymentTerms(input), 'date_overflow');
  });

  it('no aplica la fecha base seleccionada a las condiciones de otra empresa', () => {
    const input = fixture(); input.request.baseDate = '9999-12-31';
    input.policy.assignments[0]!.condition = { kind: 'immediate' }; input.policy.assignments[0]!.reminderOffsetsDays = [];
    input.policy.assignments.push({ companyId: 'company.b', condition: { kind: 'net_days', days: 3650 }, reminderOffsetsDays: [3650] });
    expect(previewCompanyPaymentTerms(input).dueDate).toBe('9999-12-31');
  });
});

describe('referencias completas y condiciones estrictas', () => {
  it('valida referencias ajenas antes de ausencia, selección inexistente o empresa inactiva', () => {
    const input = fixture(); input.policy.assignments[0]!.companyId = 'company.absent';
    for (const companyId of ['company.a', 'company.b', 'company.absent']) {
      input.request.companyId = companyId; reason(() => previewCompanyPaymentTerms(input), 'unknown_reference');
    }
    input.policy.assignments = [];
    reason(() => previewCompanyPaymentTerms(input), 'unknown_company');
  });

  it('normaliza el directorio completo antes de responder sin condición', () => {
    const input = fixture(); input.policy.assignments = []; input.request.companyId = 'company.b';
    const directory = { ...input.directory, sites: [{ id: 'site.foreign', companyId: 'company.missing', label: 'Sede', state: 'inactive', countryCode: null }] };
    reason(() => previewCompanyPaymentTerms({ ...input, directory }));
    reason(() => previewCompanyPaymentTerms({ ...input, directory: { ...input.directory, companies: [...input.directory.companies, input.directory.companies[0]] } }));
  });

  it('correlaciona todos los campos de ambas referencias de directorio y de política', () => {
    for (const patch of [{ id: 'directory.other' }, { version: 4 }, { capturedAt: '2026-10-04T12:00:00.000Z' }]) {
      const input = fixture(); input.policy.directoryRef = { ...input.policy.directoryRef, ...patch };
      reason(() => previewCompanyPaymentTerms(input), 'reference_mismatch');
      const next = fixture(); next.request.directoryRef = { ...next.request.directoryRef, ...patch };
      reason(() => previewCompanyPaymentTerms(next), 'reference_mismatch');
    }
    for (const patch of [{ id: 'terms.other' }, { version: 3 }]) {
      const input = fixture(); input.request.policyRef = { ...input.request.policyRef, ...patch };
      reason(() => previewCompanyPaymentTerms(input), 'reference_mismatch');
    }
  });

  it('rechaza asignaciones repetidas aunque cambien condición y offsets', () => {
    const input = fixture(); input.policy.assignments.push({ companyId: 'company.a', condition: { kind: 'immediate' }, reminderOffsetsDays: [] });
    reason(() => defineCompanyPaymentTermsPolicy(input.policy), 'duplicate_assignment');
  });

  it('rechaza offsets repetidos y no interpreta campos extra como opciones', () => {
    const input = fixture(); input.policy.assignments[0]!.reminderOffsetsDays = [5, 0, 5];
    reason(() => defineCompanyPaymentTermsPolicy(input.policy), 'duplicate_offset');
    const policy = fixture().policy;
    for (const condition of [{ kind: 'immediate', days: undefined }, { kind: 'immediate', days: 0 }, { kind: 'net_days' },
      { kind: 'business_days', days: 30 }, { kind: 'net_days', days: 30, grace: 1 }]) {
      reason(() => defineCompanyPaymentTermsPolicy({ ...policy, assignments: [{ ...policy.assignments[0], condition }] }));
    }
  });

  it('acepta máximos técnicos inclusivos y rechaza cada límite excedido', () => {
    const input = fixture();
    const companies = Array.from({ length: 100 }, (_, index) => ({ id: `company.c${index}`, displayName: 'Empresa', state: 'inactive', vatId: null }));
    const assignments = companies.map(company => ({ companyId: company.id, condition: { kind: 'net_days', days: 3650 },
      reminderOffsetsDays: [-3650, ...Array.from({ length: 18 }, (_, index) => index), 3650] }));
    const policy = { ...input.policy, assignments }; const directory = { ...input.directory, companies };
    const request = { ...input.request, companyId: 'company.c0' };
    expect(previewCompanyPaymentTerms({ directory, policy, request }).reminderMilestones).toHaveLength(20);
    expect(defineCompanyPaymentTermsPolicy(policy).assignments).toHaveLength(COMPANY_PAYMENT_TERMS_LIMITS.assignments);
    reason(() => defineCompanyPaymentTermsPolicy({ ...policy, assignments: [...assignments, { ...assignments[0], companyId: 'company.extra' }] }));
    reason(() => defineCompanyPaymentTermsPolicy({ ...policy, assignments: [{ ...assignments[0], reminderOffsetsDays: Array.from({ length: 21 }, (_, index) => index) }] }));
    for (const days of [0, -1, -0, 3651, 0.5, NaN, Infinity, '30']) {
      reason(() => defineCompanyPaymentTermsPolicy({ ...policy, assignments: [{ ...assignments[0], condition: { kind: 'net_days', days } }] }));
    }
    for (const offset of [-3651, 3651, -0, 0.5, NaN, Infinity, '0']) {
      reason(() => defineCompanyPaymentTermsPolicy({ ...policy, assignments: [{ ...assignments[0], reminderOffsetsDays: [offset] }] }));
    }
  });

  it('mantiene IDs opacos, versiones seguras y timestamps de referencia canónicos', () => {
    const policy = fixture().policy;
    expect(defineCompanyPaymentTermsPolicy({ ...policy, id: 'a'.repeat(100), version: Number.MAX_SAFE_INTEGER }).version).toBe(Number.MAX_SAFE_INTEGER);
    for (const id of ['', 'A', 'a/b', 'a b', 'a..b', 'a'.repeat(101)]) reason(() => defineCompanyPaymentTermsPolicy({ ...policy, id }));
    for (const version of [0, -0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1, '1']) reason(() => defineCompanyPaymentTermsPolicy({ ...policy, version }));
    for (const capturedAt of ['2026-10-03', '2026-10-03T12:00:00Z', '2026-02-30T12:00:00.000Z', '2026-10-03T14:00:00.000+02:00']) {
      reason(() => defineCompanyPaymentTermsPolicy({ ...policy, directoryRef: { ...policy.directoryRef, capturedAt } }));
    }
  });
});

describe('frontera unknown, aislamiento y ausencia de efectos', () => {
  it('ordena y copia los artefactos sin mutar originales; salida profundamente congelada', () => {
    const input = fixture(); input.policy.assignments.unshift({ companyId: 'company.b', condition: { kind: 'immediate' }, reminderOffsetsDays: [1, -1] });
    const before = JSON.stringify(input); const policy = defineCompanyPaymentTermsPolicy(input.policy);
    const request = defineCompanyPaymentTermsRequest(input.request); const output = previewCompanyPaymentTerms(input);
    expect(policy.assignments.map(item => item.companyId)).toEqual(['company.a', 'company.b']);
    expect(policy.assignments[0]!.reminderOffsetsDays).toEqual([-7, 0, 5]);
    expect(JSON.stringify(input)).toBe(before); frozen(policy); frozen(request); frozen(output); frozen(COMPANY_PAYMENT_TERMS_LIMITS);
    input.policy.assignments[1]!.condition = { kind: 'immediate' }; input.policy.assignments[1]!.reminderOffsetsDays.push(19);
    input.request.baseDate = '0001-01-01'; input.directory.companies[0]!.state = 'inactive';
    expect(output).toMatchObject({ company: { state: 'active' }, baseDate: '2026-10-03', dueDate: '2026-11-02' });
    expect(policy.assignments[0]!.condition).toEqual({ kind: 'net_days', days: 30 });
    expect(output.reminderMilestones).toHaveLength(3);
  });

  it('rechaza getters de entradas anidadas sin ejecutarlos', () => {
    const getter = vi.fn(() => { throw new Error('private@example.test'); });
    const input = fixture(); const policy = fixture().policy;
    Object.defineProperty(policy.assignments[0]!.condition, 'days', { enumerable: true, get: getter });
    reason(() => defineCompanyPaymentTermsPolicy(policy));
    const request = fixture().request; Object.defineProperty(request.directoryRef, 'capturedAt', { enumerable: true, get: getter });
    reason(() => defineCompanyPaymentTermsRequest(request));
    const offsets = [0]; Object.defineProperty(offsets, '0', { enumerable: true, get: getter });
    reason(() => defineCompanyPaymentTermsPolicy({ ...input.policy, assignments: [{ ...input.policy.assignments[0], reminderOffsetsDays: offsets }] }));
    Object.defineProperty(input, 'directory', { enumerable: true, get: getter });
    reason(() => previewCompanyPaymentTerms(input)); expect(getter).not.toHaveBeenCalled();
  });

  it('rechaza prototipos, símbolos, extras, undefined, arrays sparse y propiedades ocultas', () => {
    const input = fixture();
    for (const policy of [null, [], Object.assign(Object.create({ inherited: true }), input.policy),
      { ...input.policy, extra: undefined }, { ...input.policy, [Symbol('secret')]: 1 },
      { ...input.policy, assignments: new Array(1) }, { ...input.policy, calendar: undefined }]) {
      reason(() => defineCompanyPaymentTermsPolicy(policy));
    }
    const hidden = { ...input.policy }; Object.defineProperty(hidden, 'secret', { value: 'private', enumerable: false });
    reason(() => defineCompanyPaymentTermsPolicy(hidden));
    const assignments = [...input.policy.assignments]; Object.assign(assignments, { extra: 1 });
    reason(() => defineCompanyPaymentTermsPolicy({ ...input.policy, assignments }));
    reason(() => previewCompanyPaymentTerms({ ...input, now: AT }));
    reason(() => defineCompanyPaymentTermsRequest({ ...input.request, timezone: 'Europe/Madrid' }));
    expect(defineCompanyPaymentTermsPolicy(Object.assign(Object.create(null), input.policy))).toEqual(defineCompanyPaymentTermsPolicy(input.policy));
  });

  it('redacta errores ajenos y trampas Proxy sin causa ni datos privados', () => {
    const secret = 'private@example.test'; const input = fixture();
    const hostile = new Proxy({}, { getPrototypeOf() { throw new Error(secret); } });
    const operations = [
      () => defineCompanyPaymentTermsPolicy(hostile), () => defineCompanyPaymentTermsRequest(hostile),
      () => previewCompanyPaymentTerms(hostile), () => previewCompanyPaymentTerms({ ...input, directory: hostile }),
      () => defineCompanyPaymentTermsPolicy(new Proxy(input.policy, { ownKeys() { throw secret; } })),
    ];
    for (const operation of operations) {
      const error = errorFrom(operation);
      expect(error.reason).toBe('invalid_data'); expect(error.message).not.toContain(secret);
      expect(error).not.toHaveProperty('cause'); expect(JSON.stringify(error)).not.toContain(secret);
    }
    const error = new CompanyPaymentTermsContractError(secret as CompanyPaymentTermsContractReason);
    expect(error.reason).toBe('invalid_data'); expect(error.message).not.toContain(secret);
  });

  it('solo usa instantes explícitos y no accede a red, almacenamiento, timers o reloj implícito', () => {
    class ExplicitDate extends Date {
      constructor(value?: string | number) { if (value === undefined) throw new Error('Implicit clock'); super(value); }
      static override now(): never { throw new Error('Implicit clock'); }
    }
    const forbidden = vi.fn(() => { throw new Error('Unexpected effect'); });
    vi.stubGlobal('Date', ExplicitDate);
    for (const name of ['fetch', 'setTimeout', 'setInterval']) vi.stubGlobal(name, forbidden);
    for (const name of ['localStorage', 'sessionStorage']) vi.stubGlobal(name, { getItem: forbidden, setItem: forbidden });
    expect(previewCompanyPaymentTerms(fixture()).dueDate).toBe('2026-11-02');
    const input = fixture(); input.policy.assignments = [];
    expect(previewCompanyPaymentTerms(input).outcome).toBe('unconfigured');
    expect(forbidden).not.toHaveBeenCalled();
  });
});

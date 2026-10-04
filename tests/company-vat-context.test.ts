import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateCompanyVatEvidence } from '../src/composition/company-vat-context';
import { CompanyDirectoryContractError } from '../src/modules/companies';
import { createFixtureVatIdAdapter, type VatIdOutcome } from '../src/modules/taxes';

const AT = '2026-10-04T12:00:00.000Z';
const CHECKED = '2026-10-04T11:00:00.000Z';
const UNTIL = '2026-10-04T13:00:00.000Z';
const ADAPTER = 'fixture.company.vat';
const COMPANY = 'company.alpha';
function declaration() { return { countryCode: 'ZZ', identifier: 'FICTIONAL123' }; }
function directory() {
  return { schemaVersion: 1, source: 'fixture', id: 'directory.fixture', version: 1, capturedAt: AT,
    companies: [
      { id: COMPANY, displayName: 'Empresa ficticia Alpha', state: 'active', vatId: declaration() as ReturnType<typeof declaration> | null },
      { id: 'company.beta', displayName: 'Empresa ficticia Beta', state: 'inactive', vatId: null as ReturnType<typeof declaration> | null },
    ],
    sites: [
      { id: 'site.alpha', companyId: COMPANY, label: 'Sede ficticia Alpha', state: 'active', countryCode: 'ZZ' },
      { id: 'site.beta', companyId: 'company.beta', label: 'Sede ficticia Beta', state: 'inactive', countryCode: null },
    ],
    contacts: [
      { id: 'contact.alpha', companyId: COMPANY, displayName: 'Contacto ficticio Alpha', state: 'active', identityRef: null },
      { id: 'contact.beta', companyId: 'company.beta', displayName: 'Contacto ficticio Beta', state: 'inactive', identityRef: null },
    ], roles: [{ id: 'role.buyer', label: 'Comprador descriptivo' }],
    assignments: [
      { companyId: COMPANY, contactId: 'contact.alpha', roleId: 'role.buyer', scope: { type: 'company' } },
      { companyId: 'company.beta', contactId: 'contact.beta', roleId: 'role.buyer', scope: { type: 'site', siteId: 'site.beta' } },
    ] };
}
function query(id = COMPANY) { return { schemaVersion: 1, id, ...declaration() }; }
function evidence(outcome: VatIdOutcome = 'valid') {
  return { source: 'fixture', adapterId: ADAPTER, query: query(), evidenceRef: 'evidence.fixture',
    checkedAt: CHECKED, expiresAt: UNTIL, outcome };
}
function assessment(outcome: VatIdOutcome = 'valid') {
  return { expectedAdapterId: ADAPTER, at: AT, response: { status: 'evidence', evidence: evidence(outcome) } };
}
function input() { return { directory: directory(), companyId: COMPANY, assessment: assessment() }; }

function expectReason(callback: () => unknown, reason: string) {
  try { callback(); throw new Error('Expected contract rejection'); }
  catch (error) {
    expect(error).toBeInstanceOf(CompanyDirectoryContractError);
    expect(error).toMatchObject({ code: 'company_directory_contract_invalid', reason });
    expect(error).not.toHaveProperty('cause');
  }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('contexto de evidencia VAT de empresas R6.1a', () => {
  it('distingue VAT no declarado y declarado sin evaluación, sin fabricar adaptador ni instante', () => {
    expect(evaluateCompanyVatEvidence({ directory: directory(), companyId: 'company.beta', assessment: null })).toEqual({
      directoryRef: { id: 'directory.fixture', version: 1, capturedAt: AT }, companyId: 'company.beta', companyState: 'inactive',
      status: 'not_declared', query: null, evaluation: null,
    });
    const pending = evaluateCompanyVatEvidence({ ...input(), assessment: null });
    expect(pending).toEqual({ directoryRef: { id: 'directory.fixture', version: 1, capturedAt: AT }, companyId: COMPANY,
      companyState: 'active', status: 'not_checked', query: query(), evaluation: null });
    expect(pending).not.toHaveProperty('adapterId');
    expect(pending).not.toHaveProperty('at');
    expect(pending).not.toHaveProperty('evidence');
  });

  it('no ignora evidencia adjunta cuando no existe declaración VAT', () => {
    expectReason(() => evaluateCompanyVatEvidence({ ...input(), companyId: 'company.beta' }), 'vat_declaration_missing');
  });

  it.each(['valid', 'invalid'] as const)('conserva resultado conocido %s sin conceder derechos a la empresa', (outcome) => {
    const result = evaluateCompanyVatEvidence({ ...input(), assessment: assessment(outcome) });
    expect(result).toMatchObject({ companyId: COMPANY, companyState: 'active', status: 'evaluated', query: query(),
      evaluation: { status: 'usable', outcome, adapterId: ADAPTER, at: AT, evidence: evidence(outcome) } });
    expect(Object.keys(result).sort()).toEqual(['companyId', 'companyState', 'directoryRef', 'evaluation', 'query', 'status']);
    for (const key of ['exempt', 'b2b', 'authenticated', 'roles', 'credit', 'permissions']) expect(result).not.toHaveProperty(key);
  });

  it.each(['unavailable', 'unsupported'] as const)('conserva estado desconocido %s, distinto de VAT negativo', (outcome) => {
    const result = evaluateCompanyVatEvidence({ ...input(), assessment: assessment(outcome) });
    expect(result).toMatchObject({ status: 'evaluated', evaluation: { status: 'unusable', reason: outcome } });
    expect(result.evaluation).not.toHaveProperty('outcome');
  });

  it('reutiliza el adaptador público y distingue un caso ausente sin referencias ni fechas inventadas', () => {
    const adapter = createFixtureVatIdAdapter({ adapterId: ADAPTER, cases: [] });
    const result = evaluateCompanyVatEvidence({ ...input(), assessment: {
      expectedAdapterId: adapter.adapterId, at: AT, response: adapter.validate(query()),
    } });
    expect(result).toMatchObject({ status: 'evaluated', evaluation: {
      status: 'unusable', reason: 'not_configured', query: query(), evidence: null,
    } });
  });

  it.each([
    [CHECKED, 'usable', null], [AT, 'usable', null],
    [UNTIL, 'unusable', 'expired'], ['2026-10-04T10:59:59.999Z', 'unusable', 'future'],
  ] as const)('respeta la ventana semiabierta en %s', (at, status, reason) => {
    const adapter = createFixtureVatIdAdapter({ adapterId: ADAPTER, cases: [evidence()] });
    const result = evaluateCompanyVatEvidence({ ...input(), assessment: {
      expectedAdapterId: ADAPTER, at, response: adapter.validate(query()),
    } });
    expect(result.evaluation).toMatchObject({ status, at, evidence: { checkedAt: CHECKED, expiresAt: UNTIL } });
    if (reason === null) expect(result.evaluation).toMatchObject({ outcome: 'valid' });
    else expect(result.evaluation).toMatchObject({ reason });
  });

  it('otro companyId no puede reutilizar evidencia aunque declare el mismo VAT', () => {
    const data = input(); data.directory.companies[1]!.vatId = declaration(); data.companyId = 'company.beta';
    expectReason(() => evaluateCompanyVatEvidence(data), 'vat_evidence_invalid');
  });

  it.each([{ countryCode: 'YY' }, { identifier: 'FICTIONAL456' }])('declaración modificada %o exige evidencia correlacionada', (patch) => {
    const data = input(); Object.assign(data.directory.companies[0]!.vatId!, patch);
    expectReason(() => evaluateCompanyVatEvidence(data), 'vat_evidence_invalid');
  });

  it('correlaciona también adaptador esperado y respuestas de ausencia', () => {
    expectReason(() => evaluateCompanyVatEvidence({ ...input(), assessment: { ...assessment(), expectedAdapterId: 'fixture.other' } }), 'vat_evidence_invalid');
    const adapter = createFixtureVatIdAdapter({ adapterId: ADAPTER, cases: [] });
    const response = adapter.validate(query('company.other'));
    expectReason(() => evaluateCompanyVatEvidence({ ...input(), assessment: { expectedAdapterId: ADAPTER, at: AT, response } }), 'vat_evidence_invalid');
  });

  it('una versión editorial nueva no invalida evidencia vigente de la misma declaración', () => {
    const data = input(); data.directory.version = 2;
    data.directory.companies[0]!.displayName = 'Nombre editorial revisado';
    data.directory.sites[0]!.label = 'Etiqueta revisada';
    data.directory.contacts[0]!.state = 'inactive';
    const result = evaluateCompanyVatEvidence(data);
    expect(result).toMatchObject({ directoryRef: { version: 2 }, status: 'evaluated', evaluation: { status: 'usable', outcome: 'valid' } });
    expect(result.query).toEqual(query());
    expect(result.evaluation?.evidence).toEqual(evidence());
  });

  it('directoryRef conserva procedencia sin convertirse en autenticación o identidad de consulta', () => {
    const data = input(); data.directory.id = 'directory.another'; data.directory.version = 9;
    const result = evaluateCompanyVatEvidence(data);
    expect(result).toMatchObject({ directoryRef: { id: 'directory.another', version: 9 }, query: query(),
      status: 'evaluated', evaluation: { status: 'usable', outcome: 'valid' } });
  });

  it('preserva empresa inactiva sin alterar el significado de su evidencia VAT', () => {
    const data = input(); data.directory.companies[0]!.state = 'inactive';
    expect(evaluateCompanyVatEvidence(data)).toMatchObject({ companyState: 'inactive', status: 'evaluated',
      evaluation: { status: 'usable', outcome: 'valid' } });
  });

  it('valida todo el directorio antes de seleccionar, incluida otra empresa', () => {
    const data = input(); data.directory.sites[1]!.companyId = 'company.unknown';
    expectReason(() => evaluateCompanyVatEvidence(data), 'unknown_reference');
    expectReason(() => evaluateCompanyVatEvidence({ ...input(), companyId: 'company.unknown' }), 'unknown_company');
  });

  it('copia y congela resultado, procedencia, consulta y evidencia sin conservar entradas mutables', () => {
    const data = input();
    const result = evaluateCompanyVatEvidence(data);
    const snapshot = JSON.stringify(result);
    data.directory.id = 'directory.changed'; data.directory.companies[0]!.vatId!.identifier = 'CHANGED';
    data.assessment.response.evidence.query.identifier = 'CHANGED';
    data.assessment.response.evidence.outcome = 'invalid';
    expect(JSON.stringify(result)).toBe(snapshot);
    for (const value of [result, result.directoryRef, result.query, result.evaluation,
      result.evaluation?.query, result.evaluation?.evidence]) expect(Object.isFrozen(value)).toBe(true);
    if (result.evaluation?.evidence) expect(Object.isFrozen(result.evaluation.evidence.query)).toBe(true);
    for (const companyId of [COMPANY, 'company.beta']) {
      const pending = evaluateCompanyVatEvidence({ directory: directory(), companyId, assessment: null });
      expect(Object.isFrozen(pending)).toBe(true);
      expect(Object.isFrozen(pending.directoryRef)).toBe(true);
    }
  });

  it('rechaza campos extra, shape ambiguo y query externa en vez de derivarla de la empresa', () => {
    for (const data of [null, {}, { ...input(), query: query() }, { ...input(), authorized: true },
      { ...input(), assessment: undefined }, { ...input(), assessment: {} },
      { ...input(), assessment: { ...assessment(), query: query() } },
      { ...input(), assessment: { ...assessment(), expiresAt: UNTIL } }]) {
      expectReason(() => evaluateCompanyVatEvidence(data), 'invalid_data');
    }
  });

  it('rechaza getters sin ejecutarlos en contexto, evaluación y evidencia', () => {
    const getter = vi.fn(() => { throw new Error('Sensitive getter'); });
    const context = { ...input(), get companyId() { return getter(); } };
    const assessmentAccessor = { ...assessment(), get response() { return getter(); } };
    expectReason(() => evaluateCompanyVatEvidence(context), 'invalid_data');
    expectReason(() => evaluateCompanyVatEvidence({ ...input(), assessment: assessmentAccessor }), 'invalid_data');
    const nested = evidence(); Object.defineProperty(nested.query, 'identifier', { get: getter });
    expectReason(() => evaluateCompanyVatEvidence({ ...input(), assessment: {
      ...assessment(), response: { status: 'evidence', evidence: nested },
    } }), 'vat_evidence_invalid');
    expect(getter).not.toHaveBeenCalled();
  });

  it('errores fiscales y de introspección quedan redactados, sin causas ni valores privados', () => {
    const secret = 'PRIVATE VAT IDENTIFIER 987654321';
    const hostile = new Proxy({}, { getPrototypeOf() { throw new Error(secret); } });
    const inputs = [hostile, { ...input(), directory: hostile },
      { ...input(), assessment: { ...assessment(), response: hostile } },
      { ...input(), assessment: { ...assessment(), expectedAdapterId: secret } },
      { ...input(), assessment: { ...assessment(), at: secret } },
      { ...input(), assessment: { ...assessment(), response: { status: 'evidence', evidence: {
        ...evidence(), query: { ...query(), identifier: secret },
      } } } }];
    for (const data of inputs) {
      try { evaluateCompanyVatEvidence(data); throw new Error('Expected contract rejection'); }
      catch (error) {
        expect(error).toBeInstanceOf(CompanyDirectoryContractError);
        expect(String(error)).not.toContain(secret);
        expect(JSON.stringify(error)).not.toContain(secret);
        expect(error).not.toHaveProperty('cause');
      }
    }
  });

  it('no consulta reloj, IO, temporizadores, almacenamiento o logs, ni siquiera sin evaluación', () => {
    const expected = evaluateCompanyVatEvidence(input());
    const unexpected = () => { throw new Error('Unexpected effect'); };
    vi.spyOn(Date, 'now').mockImplementation(unexpected);
    const log = vi.spyOn(console, 'log').mockImplementation(unexpected);
    const warn = vi.spyOn(console, 'warn').mockImplementation(unexpected);
    const error = vi.spyOn(console, 'error').mockImplementation(unexpected);
    vi.stubGlobal('fetch', unexpected); vi.stubGlobal('setTimeout', unexpected); vi.stubGlobal('setInterval', unexpected);
    vi.stubGlobal('localStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('sessionStorage', { getItem: unexpected, setItem: unexpected });
    expect(evaluateCompanyVatEvidence(input())).toEqual(expected);
    expect(evaluateCompanyVatEvidence({ ...input(), assessment: null }).status).toBe('not_checked');
    expect(evaluateCompanyVatEvidence({ directory: directory(), companyId: 'company.beta', assessment: null }).status).toBe('not_declared');
    expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
});

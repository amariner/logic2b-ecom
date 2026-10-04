import { describe, expect, it, vi } from 'vitest';
import {
  CompanyCatalogContractError, defineCompanyPricingBindings, selectCompanyPricingBinding,
  type CompanyCatalogContractReason,
} from '../src/modules/companies';

const AT = '2026-10-03T12:00:00.000Z';
const DIRECTORY_REF = { id: 'directory.fixture', version: 2, capturedAt: AT };
const HASH = 'a'.repeat(64);
function directory() {
  return { schemaVersion: 1, source: 'fixture', ...DIRECTORY_REF,
    companies: [{ id: 'company.alpha', displayName: 'Empresa A', state: 'active', vatId: { countryCode: 'ZZ', identifier: 'FICTIONALA' } },
      { id: 'company.beta', displayName: 'Empresa B', state: 'inactive', vatId: null }], sites: [],
    contacts: [{ id: 'contact.a', companyId: 'company.alpha', displayName: 'Contacto A', state: 'active',
      identityRef: { kind: 'email_identity', emailIdentityHash: HASH } }], roles: [], assignments: [] };
}
function bindings() {
  return { schemaVersion: 1, source: 'fixture', id: 'pricing.bindings', version: 3, directoryRef: { ...DIRECTORY_REF },
    bindings: [{ companyId: 'company.alpha', companyKeyHash: HASH }, { companyId: 'company.beta', companyKeyHash: HASH }] };
}
function input() { return { directory: directory(), bindings: bindings(), companyId: 'company.alpha' }; }
function expectReason(operation: () => unknown, reason: CompanyCatalogContractReason): void {
  try { operation(); expect.fail('Expected contract error'); }
  catch (error) { expect(error).toBeInstanceOf(CompanyCatalogContractError); expect(error).toMatchObject({ code: 'company_catalog_contract_invalid', reason }); }
}

describe('binding explícito y versionado de empresa a cohorte de precios', () => {
  it('permite una clave compartida sin fusionar empresas ni bloquear lectura de inactive', () => {
    const alpha = selectCompanyPricingBinding(input());
    const beta = selectCompanyPricingBinding({ ...input(), companyId: 'company.beta' });
    expect(alpha).toEqual({ source: 'fixture', directoryRef: DIRECTORY_REF, bindingsRef: { id: 'pricing.bindings', version: 3 },
      companyId: 'company.alpha', binding: { companyId: 'company.alpha', companyKeyHash: HASH } });
    expect(beta.binding).toEqual({ companyId: 'company.beta', companyKeyHash: HASH });
    expect(beta.companyId).not.toBe(alpha.companyId);
    expect(beta).not.toHaveProperty('eligible');
    expect(beta).not.toHaveProperty('permissions');
  });

  it('ausencia no deriva la clave de VAT o del hash de contacto y no fabrica contexto general', () => {
    const source = input(); source.bindings.bindings = [];
    expect(selectCompanyPricingBinding(source)).toMatchObject({ companyId: 'company.alpha', binding: null });
    expect(selectCompanyPricingBinding(source)).not.toHaveProperty('fallback');
    expect(source.directory.contacts[0]!.identityRef.emailIdentityHash).toBe(HASH);
  });

  it('rechaza dos bindings de la misma empresa, incluso si comparten clave', () => {
    for (const hash of [HASH, 'b'.repeat(64)]) {
      const source = bindings(); source.bindings.push({ companyId: 'company.alpha', companyKeyHash: hash });
      expectReason(() => defineCompanyPricingBindings(source), 'duplicate_id');
    }
  });

  it.each(['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), ' ' + HASH, null])('rechaza clave no canónica %s', hash => {
    const source = bindings(); Object.assign(source.bindings[0]!, { companyKeyHash: hash });
    expectReason(() => defineCompanyPricingBindings(source), 'invalid_data');
  });

  it.each(['id', 'version', 'capturedAt'] as const)('correlaciona directoryRef.%s exacto antes de seleccionar', key => {
    const source = input(); Object.assign(source.bindings.directoryRef,
      { [key]: key === 'id' ? 'other.directory' : key === 'version' ? 3 : '2026-10-03T13:00:00.000Z' });
    expectReason(() => selectCompanyPricingBinding(source), 'reference_mismatch');
  });

  it('la definición permite referencia pendiente y la selección rechaza todas las referencias ausentes', () => {
    const source = input(); source.bindings.bindings[1]!.companyId = 'company.unknown';
    expect(defineCompanyPricingBindings(source.bindings).bindings).toHaveLength(2);
    expectReason(() => selectCompanyPricingBinding(source), 'unknown_reference');
    expectReason(() => selectCompanyPricingBinding({ ...input(), companyId: 'company.unknown' }), 'unknown_company');
    const inactive = input(); inactive.bindings.bindings[0]!.companyId = 'company.unknown';
    expectReason(() => selectCompanyPricingBinding({ ...inactive, companyId: 'company.beta' }), 'unknown_reference');
  });

  it('admite 100 empresas declaradas y rechaza 101 bindings antes de resolver', () => {
    const source = input();
    source.directory.companies = Array.from({ length: 100 }, (_, index) => ({
      id: `company.c${index}`, displayName: `Empresa ${index}`, state: 'active', vatId: null,
    }));
    source.directory.contacts = [];
    source.bindings.bindings = source.directory.companies.map(company => ({ companyId: company.id, companyKeyHash: HASH }));
    expect(defineCompanyPricingBindings(source.bindings).bindings).toHaveLength(100);
    expect(selectCompanyPricingBinding({ ...source, companyId: 'company.c99' }).binding?.companyId).toBe('company.c99');
    source.bindings.bindings.push({ companyId: 'company.extra', companyKeyHash: HASH });
    expectReason(() => defineCompanyPricingBindings(source.bindings), 'invalid_data');
  });

  it('ordena y congela copias separadas; los metadatos no cambian por mutación externa', () => {
    const source = input(); source.bindings.bindings.reverse();
    const result = selectCompanyPricingBinding(source); const normalized = defineCompanyPricingBindings(source.bindings);
    expect(normalized.bindings.map(binding => binding.companyId)).toEqual(['company.alpha', 'company.beta']);
    source.bindings.bindings[1]!.companyKeyHash = 'b'.repeat(64); source.bindings.directoryRef.version = 999;
    expect(result.binding?.companyKeyHash).toBe(HASH); expect(result.directoryRef.version).toBe(2);
    for (const value of [result, result.binding, result.directoryRef, result.bindingsRef, normalized, normalized.bindings, ...normalized.bindings]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(defineCompanyPricingBindings(Object.assign(Object.create(null), bindings()))).toEqual(defineCompanyPricingBindings(bindings()));
  });

  it('revalida el directorio completo aunque no exista binding para la empresa', () => {
    const source = input(); source.bindings.bindings = [];
    source.directory.contacts[0]!.companyId = 'company.missing';
    expectReason(() => selectCompanyPricingBinding(source), 'invalid_data');
  });

  it('rechaza campos ocultos, getters y wrappers extra sin ejecutarlos ni filtrar errores', () => {
    const getter = vi.fn(() => HASH);
    const source = bindings(); Object.defineProperty(source.bindings[0]!, 'companyKeyHash', { enumerable: true, get: getter });
    expectReason(() => defineCompanyPricingBindings(source), 'invalid_data');
    const outer = input(); Object.defineProperty(outer, 'companyId', { enumerable: true, get: getter });
    expectReason(() => selectCompanyPricingBinding(outer), 'invalid_data');
    expectReason(() => selectCompanyPricingBinding({ ...input(), companyKeyHash: HASH }), 'invalid_data');
    const hidden = bindings(); Object.defineProperty(hidden, 'id', { enumerable: false, value: 'pricing.bindings' });
    expectReason(() => defineCompanyPricingBindings(hidden), 'invalid_data');
    const sparse = bindings(); delete (sparse.bindings as Array<unknown>)[0];
    expectReason(() => defineCompanyPricingBindings(sparse), 'invalid_data');
    expect(getter).not.toHaveBeenCalled();
    const proxy = new Proxy({}, { getPrototypeOf() { throw new Error('private:person@example.test'); } });
    expectReason(() => selectCompanyPricingBinding(proxy), 'invalid_data');
    try { selectCompanyPricingBinding(proxy); } catch (error) { expect(String(error)).not.toContain('person@example.test'); }
  });
});

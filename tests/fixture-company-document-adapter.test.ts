import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CompanyDocumentContractError, MAX_FIXTURE_COMPANY_DOCUMENT_CASES,
  createFixtureCompanyDocumentAdapter, createCompanyNegotiation, appendCompanyOfferRevision,
  defineCompanyDocumentRequest, defineCompanyDocumentResponse, defineCompanyPurchaseOrderDeclaration,
  type CompanyDocumentContractReason, type CompanyDocumentRequest, type CompanyDocumentResponse,
} from '../src/modules/companies';

const ADAPTER = 'fixture.company-documents';
const OBSERVED = '2026-10-03T14:00:00.000Z';
type Mutable<T> = T extends readonly (infer U)[] ? Mutable<U>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
function copy<T>(value: T): Mutable<T> { return structuredClone(value) as Mutable<T>; }
function declaration() {
  const directoryRef = { id: 'directory.documents', version: 1, capturedAt: '2026-10-03T10:00:00.000Z' };
  const catalogRef = { ref: 'catalog.documents', capturedAt: '2026-10-03T10:00:00.000Z' };
  let negotiation = createCompanyNegotiation({ id: 'negotiation.documents', createdAt: '2026-10-03T11:00:00.000Z', context: {
    directory: { schemaVersion: 1, source: 'fixture', ...directoryRef, companies: [
      { id: 'company.a', displayName: 'Empresa A', state: 'active', vatId: null },
      { id: 'company.b', displayName: 'Empresa B', state: 'inactive', vatId: null },
    ], sites: [], contacts: [
      { id: 'contact.buyer', companyId: 'company.a', displayName: 'Contacto A', state: 'active', identityRef: null },
    ], roles: [], assignments: [] },
    catalog: { schemaVersion: 1, source: 'fixture', ...catalogRef, currency: 'EUR', products: [
      { id: 1, active: true, variants: [{ id: 11, productId: 1, status: 'active', priceCents: 1000 }] },
      { id: 2, active: false, variants: [{ id: 21, productId: 2, status: 'draft', priceCents: 2000 }] },
    ] },
    request: { schemaVersion: 1, source: 'fixture', profile: 'company-offer-eur-cents-v1', id: 'request.offer', version: 1,
      directoryRef, catalogRef, companyId: 'company.a', buyerContactId: 'contact.buyer', requestedAt: '2026-10-03T11:00:00.000Z',
      currency: 'EUR', lines: [{ productId: 1, variantId: 11, quantityUnits: 2 }] },
  } });
  for (const [index, id] of ['offer.one', 'offer.two'].entries()) {
    const result = appendCompanyOfferRevision({ negotiation, context: negotiation.context,
      command: { negotiationId: negotiation.id, expectedVersion: negotiation.version, revision: {
        id, revision: index + 1, previousRevisionId: index === 0 ? null : 'offer.one', proposedBy: 'seller',
        createdAt: index === 0 ? '2026-10-03T12:00:00.000Z' : '2026-10-03T13:00:00.000Z',
        expiresAt: '2026-10-10T12:00:00.000Z',
        lines: [{ productId: 1, variantId: 11, quantityUnits: 2, unitPriceCents: 900 + index }], shippingCents: 200,
      } } });
    if (result.outcome !== 'appended') throw new Error('Fixture inválido.');
    negotiation = result.negotiation;
  }
  return defineCompanyPurchaseOrderDeclaration({ schemaVersion: 1, source: 'fixture', profile: 'company-po-reference-v1',
    id: 'po.example', version: 1, recordedAt: OBSERVED, binding: { negotiation, revisionId: 'offer.one' },
    purchaseOrder: { issuerCompanyId: 'company.a', number: 'PO 0042-Á', documentReference: 'support.po' } });
}
const DECLARATION = declaration();
function request(id = 'query.one'): Mutable<CompanyDocumentRequest> {
  return { schemaVersion: 1, source: 'fixture', profile: 'company-commercial-document-evidence-v1', id, declaration: copy(DECLARATION) };
}
function response(id = 'query.one') {
  return { source: 'fixture' as const, adapterId: ADAPTER, request: request(id), outcome: 'evidence' as const,
    evidence: { ref: 'observation.one', observedAt: OBSERVED, coverage: 'complete' as const,
      document: { reference: 'document.observed', companyId: 'company.a', purchaseOrderNumber: 'PO 0042-Á',
        commercialAmount: { basis: 'bound_offer_total_as_declared' as const, currency: 'EUR' as const, amountCents: 2000 } } } };
}
function unavailable(reason: 'not_configured' | 'unavailable' | 'unsupported' = 'not_configured', id = 'query.one') {
  return { source: 'fixture' as const, adapterId: ADAPTER, request: request(id), outcome: 'unavailable' as const, reason };
}
function configuration() { return { adapterId: ADAPTER, cases: [response()] }; }
function errorFrom(operation: () => unknown, expected: CompanyDocumentContractReason = 'invalid_data') {
  try { operation(); } catch (error) {
    expect(error).toBeInstanceOf(CompanyDocumentContractError);
    expect(error).toMatchObject({ code: 'company_document_contract_invalid', reason: expected });
    expect(error).not.toHaveProperty('cause');
    return error as CompanyDocumentContractError;
  }
  throw new Error('Se esperaba un error de contrato.');
}
function frozen(input: unknown): void {
  if (input !== null && typeof input === 'object') {
    expect(Object.isFrozen(input)).toBe(true); Object.values(input).forEach(frozen);
  }
}
function reordered(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(reordered);
  if (input !== null && typeof input === 'object') {
    return Object.fromEntries(Object.entries(input).reverse().map(([key, value]) => [key, reordered(value)]));
  }
  return input;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('adaptador documental fixture cerrado', () => {
  it('devuelve la respuesta completa correlacionada de forma síncrona sin atribuir autenticidad o pago', () => {
    const adapter = createFixtureCompanyDocumentAdapter(configuration());
    expect(adapter.source).toBe('fixture'); expect(adapter.adapterId).toBe(ADAPTER);
    const result = adapter.read(request());
    expect(result).toEqual(response()); expect(result).not.toBeInstanceOf(Promise);
    expect(adapter.read(request())).toBe(result);
    expect(Object.keys(adapter).sort()).toEqual(['adapterId', 'read', 'source']);
    expect(Object.keys(result).sort()).toEqual(['adapterId', 'evidence', 'outcome', 'request', 'source']);
    frozen(adapter); frozen(result);
  });

  it.each(['not_configured', 'unavailable', 'unsupported'] as const)('preserva %s sin fabricar metadatos documentales', reason => {
    const expected = unavailable(reason);
    const result = createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER, cases: [expected] }).read(request());
    expect(result).toEqual(expected);
    expect(Object.keys(result).sort()).toEqual(['adapterId', 'outcome', 'reason', 'request', 'source']);
    frozen(result);
  });

  it.each(['complete', 'incomplete'] as const)('conserva coverage %s con documento null, sin convertirlo en cero', coverage => {
    const item = { ...response(), evidence: { ...response().evidence, coverage, document: null } };
    const result = createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER, cases: [item] }).read(request());
    expect(result).toEqual(item); frozen(result);
  });

  it('no decide vigencia, pertenencia del comprador ni magnitud fiscal al recuperar el caso', () => {
    const item = response();
    item.evidence.observedAt = '2099-01-01T00:00:00.000Z';
    item.evidence.document.companyId = 'company.external';
    item.evidence.document.purchaseOrderNumber = 'PO distinta';
    item.evidence.document.commercialAmount.amountCents = 0;
    expect(createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER, cases: [item] }).read(request())).toEqual(item);
  });

  it('cero casos y un id desconocido conservan la consulta real sin evidencia ni fecha', () => {
    for (const cases of [[], [response()]]) {
      const actual = request('query.unknown');
      const result = createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER, cases }).read(actual);
      expect(result).toEqual(unavailable('not_configured', 'query.unknown'));
      expect(Object.keys(result).sort()).toEqual(['adapterId', 'outcome', 'reason', 'request', 'source']);
      actual.declaration.purchaseOrder!.number = 'PO changed';
      expect(result.request.declaration.purchaseOrder?.number).toBe('PO 0042-Á'); frozen(result);
    }
  });

  const changes: ReadonlyArray<readonly [string, (query: Mutable<CompanyDocumentRequest>) => void]> = [
    ['id', value => { value.id = 'query.other'; }],
    ['identidad de declaración', value => { value.declaration.id = 'po.other'; }],
    ['versión de declaración', value => { value.declaration.version++; }],
    ['fecha declarada', value => { value.declaration.recordedAt = '2026-10-03T15:00:00.000Z'; }],
    ['número PO literal', value => { value.declaration.purchaseOrder!.number = 'po 0042-Á'; }],
    ['soporte PO independiente', value => { value.declaration.purchaseOrder!.documentReference = 'support.other'; }],
    ['PO ausente', value => { value.declaration.purchaseOrder = null; }],
    ['selección histórica', value => { value.declaration.binding.revisionId = 'offer.two'; }],
    ['otra revisión de oferta', value => { value.declaration.binding.negotiation.revisions[1]!.shippingCents++; }],
    ['empresa ajena a la selección', value => { value.declaration.binding.negotiation.context.directory.companies[1]!.displayName = 'Otro nombre'; }],
    ['variante ajena a la selección', value => { value.declaration.binding.negotiation.context.catalog.products[1]!.variants[0]!.priceCents++; }],
    ['solicitud comercial completa', value => { value.declaration.binding.negotiation.context.request.lines[0]!.quantityUnits++; }],
  ];
  it.each(changes)('exige coincidencia de %s aunque el id y el importe seleccionado puedan coincidir', (_label, change) => {
    const adapter = createFixtureCompanyDocumentAdapter(configuration());
    const input = request(); change(input);
    const normalized = defineCompanyDocumentRequest(input);
    expect(adapter.read(input)).toEqual({ source: 'fixture', adapterId: ADAPTER, request: normalized,
      outcome: 'unavailable', reason: 'not_configured' });
    expect(adapter.read(request())).toEqual(response());
  });

  it('usa las copias canónicas, independientemente del orden de propiedades y del orden normalizable del catálogo', () => {
    const item = response(); item.request.declaration.binding.negotiation.context.catalog.products.reverse();
    const adapter = createFixtureCompanyDocumentAdapter(reordered({ adapterId: ADAPTER, cases: [item] }));
    expect(adapter.read(reordered(request()))).toEqual(defineCompanyDocumentResponse(response()));
    const nullPrototype = Object.assign(Object.create(null) as Record<string, unknown>, { adapterId: ADAPTER, cases: [response()] });
    expect(createFixtureCompanyDocumentAdapter(nullPrototype).read(request())).toEqual(response());
  });

  it('aísla todas las copias de entrada y no expone un índice mutable', () => {
    const original = configuration(); const adapter = createFixtureCompanyDocumentAdapter(original);
    original.adapterId = 'fixture.other'; original.cases[0]!.evidence.document.commercialAmount.amountCents = 99;
    original.cases[0]!.request.declaration.binding.negotiation.revisions[1]!.shippingCents = 88;
    original.cases[0]!.request.declaration.purchaseOrder!.number = 'changed'; original.cases.length = 0;
    const result = adapter.read(request()); expect(result).toEqual(response()); frozen(result);
    if (result.outcome !== 'evidence' || result.evidence.document?.commercialAmount == null) throw new Error('Expected fixture');
    const amount = result.evidence.document.commercialAmount;
    expect(() => { (amount as { amountCents: number }).amountCents = 0; }).toThrow();
    const other = createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER, cases: [unavailable('unsupported')] });
    expect(other.read(request())).toEqual(unavailable('unsupported'));
    expect(adapter.read(request())).toBe(result);
  });

  it('captura adapterId y cases propios antes de introspectar entradas mutables', () => {
    const input = configuration(); const cases = input.cases;
    input.cases = new Proxy(cases, { getPrototypeOf(target) {
      input.adapterId = 'fixture.changed'; input.cases = [];
      return Reflect.getPrototypeOf(target);
    } });
    const adapter = createFixtureCompanyDocumentAdapter(input);
    expect(adapter.adapterId).toBe(ADAPTER); expect(adapter.read(request())).toEqual(response());
  });

  it('permite 100 casos y rechaza 101; también valida el último antes de devolver el adaptador', () => {
    const cases = Array.from({ length: MAX_FIXTURE_COMPANY_DOCUMENT_CASES }, (_, index) => response(`query.n${index}`));
    const adapter = createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER, cases });
    expect(adapter.read(request('query.n99'))).toEqual(response('query.n99'));
    errorFrom(() => createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER, cases: [...cases, response('query.n100')] }));
    const bad = copy(cases); bad.at(-1)!.evidence.document.commercialAmount.amountCents = -1;
    errorFrom(() => createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER, cases: bad }));
  });

  it('rechaza identidad duplicada aunque cambie la declaración o el tipo de respuesta', () => {
    const changed = response(); changed.request.declaration.version++;
    for (const item of [response(), changed, unavailable('unsupported')]) {
      errorFrom(() => createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER, cases: [response(), item] }), 'duplicate_request');
    }
  });

  it('rechaza casos de otro adaptador y normaliza todas las respuestas antes de indexar', () => {
    errorFrom(() => createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER, cases: [{ ...response(), adapterId: 'fixture.other' }] }), 'adapter_mismatch');
    const malformed = { ...response('query.last'), endpoint: 'not-allowed' };
    errorFrom(() => createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER, cases: [response(), response(), malformed] }));
  });
});

describe('frontera estricta y efectos ausentes del adaptador documental', () => {
  it('rechaza configuración abierta y tokens inválidos sin convertirlos en valores por defecto', () => {
    const prototype = Object.create({ adapterId: ADAPTER }) as Record<string, unknown>; prototype.cases = [];
    const hidden = configuration(); Object.defineProperty(hidden, 'adapterId', { enumerable: false });
    for (const input of [undefined, null, [], {}, prototype, hidden, { ...configuration(), source: 'fixture' },
      { ...configuration(), [Symbol('extra')]: true }, { adapterId: ADAPTER },
      ...['', 'UPPER', 'doc..one', '../doc', 'https://example.test', 'a'.repeat(101), 1].map(adapterId => ({ adapterId, cases: [] }))]) {
      errorFrom(() => createFixtureCompanyDocumentAdapter(input));
    }
  });

  it('rechaza arrays dispersos, con prototipo ajeno, ocultos o propiedades extra', () => {
    const extra = [response()]; Object.defineProperty(extra, 'extra', { value: true });
    const symbol = [response()]; Object.defineProperty(symbol, Symbol('extra'), { value: true });
    const hidden = [response()]; Object.defineProperty(hidden, '0', { enumerable: false });
    const prototype = [response()]; Object.setPrototypeOf(prototype, null);
    for (const cases of [undefined, null, {}, new Array(1), extra, symbol, hidden, prototype]) {
      errorFrom(() => createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER, cases }));
    }
  });

  it('no ejecuta getters de configuración, entradas, respuestas o consultas', () => {
    const getter = vi.fn(() => { throw new Error('PRIVATE GETTER'); });
    for (const field of ['adapterId', 'cases']) {
      const input = configuration(); Object.defineProperty(input, field, { get: getter });
      errorFrom(() => createFixtureCompanyDocumentAdapter(input));
    }
    const cases = [response()]; Object.defineProperty(cases, '0', { get: getter });
    errorFrom(() => createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER, cases }));
    for (const field of ['outcome', 'adapterId', 'request', 'evidence']) {
      const item = response(); Object.defineProperty(item, field, { get: getter });
      errorFrom(() => createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER, cases: [item] }));
    }
    const item = response(); Object.defineProperty(item.evidence.document, 'companyId', { get: getter });
    errorFrom(() => createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER, cases: [item] }));
    const query = request(); Object.defineProperty(query, 'declaration', { get: getter });
    errorFrom(() => createFixtureCompanyDocumentAdapter(configuration()).read(query));
    const nested = request(); Object.defineProperty(nested.declaration, 'binding', { get: getter });
    errorFrom(() => createFixtureCompanyDocumentAdapter(configuration()).read(nested), 'purchase_order_invalid');
    expect(getter).not.toHaveBeenCalled();
  });

  it('no convierte consultas corruptas en not_configured, ni siquiera sin casos', () => {
    for (const cases of [[], [response()]]) {
      const adapter = createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER, cases });
      for (const input of [undefined, null, {}, { ...request(), id: '../query' }, { ...request(), profile: 'another' },
        { ...request(), expectedAmountCents: 2000 }]) errorFrom(() => adapter.read(input));
      const bad = request(); bad.declaration.binding.negotiation.context.catalog.products[1]!.variants[0]!.priceCents = -1;
      errorFrom(() => adapter.read(bad), 'purchase_order_invalid');
    }
  });

  it('no permite campos de otra rama ni una evidencia parcial rellenada con importes', () => {
    const item = response();
    for (const invalid of [{ ...unavailable(), evidence: item.evidence }, { ...item, reason: 'not_configured' },
      { ...item, evidence: { ...item.evidence, coverage: 'incomplete' } },
      { ...item, evidence: { ...item.evidence, document: { ...item.evidence.document, issuerCompanyId: 'company.a' } } }]) {
      errorFrom(() => createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER, cases: [invalid] }));
    }
  });

  it('redacta errores de Proxy y errores con accesores sin divulgar mensajes, payload o cause', () => {
    const secret = 'PRIVATE-DOCUMENT-DETAIL';
    const throwing = () => { throw new Error(secret); };
    const revoked = Proxy.revocable(configuration(), {}); revoked.revoke();
    const inputs: unknown[] = [revoked.proxy, new Proxy(configuration(), { getPrototypeOf: throwing }),
      new Proxy(configuration(), { ownKeys: throwing }), new Proxy(configuration(), { getOwnPropertyDescriptor: throwing }),
      { adapterId: ADAPTER, cases: new Proxy([response()], { ownKeys: throwing }) }];
    for (const input of inputs) {
      const error = errorFrom(() => createFixtureCompanyDocumentAdapter(input));
      expect(error.message).toBe('Los datos no cumplen el contrato de evidencia documental comercial.');
      expect(JSON.stringify(error)).not.toContain(secret);
    }
    const errorGetter = vi.fn(throwing);
    const hostileError = new CompanyDocumentContractError('duplicate_request');
    Object.defineProperty(hostileError, 'reason', { get: errorGetter });
    errorFrom(() => createFixtureCompanyDocumentAdapter(new Proxy(configuration(), { ownKeys() { throw hostileError; } })));
    expect(errorGetter).not.toHaveBeenCalled();
    const adapter = createFixtureCompanyDocumentAdapter(configuration());
    errorFrom(() => adapter.read(new Proxy(request(), { getPrototypeOf: throwing })));
  });

  it('lee solo descriptores de datos del array, sin acceder a su length mediante get', () => {
    const get = vi.fn(() => { throw new Error('Unexpected property read'); });
    const cases = new Proxy([response()], { get });
    expect(createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER, cases }).read(request())).toEqual(response());
    expect(get).not.toHaveBeenCalled();
  });

  it('creación y lookup no usan reloj, red, timers, almacenamiento ni logs', () => {
    const effect = vi.fn(() => { throw new Error('Unexpected effect'); });
    vi.spyOn(Date, 'now').mockImplementation(effect);
    vi.spyOn(console, 'log').mockImplementation(effect); vi.spyOn(console, 'warn').mockImplementation(effect);
    vi.spyOn(console, 'error').mockImplementation(effect);
    for (const key of ['fetch', 'setTimeout', 'setInterval', 'requestAnimationFrame']) vi.stubGlobal(key, effect);
    vi.stubGlobal('localStorage', { getItem: effect, setItem: effect });
    vi.stubGlobal('sessionStorage', { getItem: effect, setItem: effect });
    const adapter = createFixtureCompanyDocumentAdapter(configuration());
    const expected: CompanyDocumentResponse = response();
    expect(adapter.read(request())).toEqual(expected);
    expect(adapter.read(request('query.absent'))).toEqual(unavailable('not_configured', 'query.absent'));
    expect(adapter.read(request())).toEqual(expected); expect(effect).not.toHaveBeenCalled();
  });
});

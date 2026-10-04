import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPANY_PURCHASE_ORDER_LIMITS, CompanyPurchaseOrderContractError,
  defineCompanyPurchaseOrderBinding, defineCompanyPurchaseOrderDeclaration, previewCompanyPurchaseOrderDeclaration,
  createCompanyNegotiation, appendCompanyOfferRevision, previewCompanyOfferRevision,
  type CompanyPurchaseOrderBinding, type CompanyPurchaseOrderDeclaration, type CompanyPurchaseOrderContractReason,
  type CompanyOfferRevision,
} from '../src/modules/companies';
import * as negotiationContract from '../src/modules/companies/domain/company-negotiation';

const RECORDED = '2026-10-03T14:00:00.000Z';
const AFTER = '2026-10-12T12:00:00.000Z';
type Mutable<T> = T extends readonly (infer U)[] ? Mutable<U>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
function copy<T>(value: T): Mutable<T> { return structuredClone(value) as Mutable<T>; }
function fixtureBinding(): CompanyPurchaseOrderBinding {
  const directoryRef = { id: 'directory.po', version: 2, capturedAt: '2026-10-03T10:00:00.000Z' };
  const catalogRef = { ref: 'catalog.po', capturedAt: '2026-10-03T10:00:00.000Z' };
  let negotiation = createCompanyNegotiation({ id: 'negotiation.po', createdAt: '2026-10-03T11:30:00.000Z', context: {
    directory: { schemaVersion: 1, source: 'fixture', ...directoryRef, companies: [
      { id: 'company.a', displayName: 'Empresa A', state: 'active', vatId: null },
      { id: 'company.b', displayName: 'Empresa B', state: 'inactive', vatId: null },
    ], sites: [], contacts: [
      { id: 'contact.buyer', companyId: 'company.a', displayName: 'Comprador', state: 'active', identityRef: null },
      { id: 'contact.other', companyId: 'company.b', displayName: 'Otro contacto', state: 'inactive', identityRef: null },
    ], roles: [], assignments: [] },
    catalog: { schemaVersion: 1, source: 'fixture', ...catalogRef, currency: 'EUR', products: [
      { id: 1, active: true, variants: [{ id: 11, productId: 1, status: 'active', priceCents: 1000 }, { id: 12, productId: 1, status: 'archived', priceCents: 1500 }] },
      { id: 2, active: true, variants: [{ id: 21, productId: 2, status: 'active', priceCents: 2000 }] },
      { id: 3, active: false, variants: [{ id: 31, productId: 3, status: 'draft', priceCents: 3000 }] },
    ] },
    request: { schemaVersion: 1, source: 'fixture', profile: 'company-offer-eur-cents-v1', id: 'request.po', version: 1,
      directoryRef, catalogRef, companyId: 'company.a', buyerContactId: 'contact.buyer', requestedAt: '2026-10-03T11:00:00.000Z',
      currency: 'EUR', lines: [{ productId: 1, variantId: 11, quantityUnits: 4 }, { productId: 2, variantId: 21, quantityUnits: 2 }] },
  } });
  const revisions: CompanyOfferRevision[] = [
    { id: 'offer.one', revision: 1, previousRevisionId: null, proposedBy: 'seller', createdAt: '2026-10-03T12:00:00.000Z',
      expiresAt: '2026-10-10T12:00:00.000Z', lines: [{ productId: 1, variantId: 11, quantityUnits: 4, unitPriceCents: 900 },
        { productId: 2, variantId: 21, quantityUnits: 2, unitPriceCents: 1800 }], shippingCents: 500 },
    { id: 'offer.two', revision: 2, previousRevisionId: 'offer.one', proposedBy: 'buyer', createdAt: '2026-10-03T13:00:00.000Z',
      expiresAt: '2026-10-11T12:00:00.000Z', lines: [{ productId: 1, variantId: 12, quantityUnits: 3, unitPriceCents: 1400 }], shippingCents: 0 },
    { id: 'offer.three', revision: 3, previousRevisionId: 'offer.two', proposedBy: 'seller', createdAt: RECORDED,
      expiresAt: '2026-10-11T12:00:00.000Z', lines: [{ productId: 1, variantId: 12, quantityUnits: 3, unitPriceCents: 1350 },
        { productId: 2, variantId: 21, quantityUnits: 1, unitPriceCents: 1750 }], shippingCents: 200 },
  ];
  for (const revision of revisions) {
    const result = appendCompanyOfferRevision({ negotiation, context: negotiation.context,
      command: { negotiationId: negotiation.id, expectedVersion: negotiation.version, revision } });
    if (result.outcome !== 'appended') throw new Error('Fixture inválido.');
    negotiation = result.negotiation;
  }
  return { negotiation, revisionId: 'offer.one' };
}
function declaration(overrides: Partial<CompanyPurchaseOrderDeclaration> = {}): CompanyPurchaseOrderDeclaration {
  return { schemaVersion: 1, source: 'fixture', profile: 'company-po-reference-v1', id: 'po.example', version: 1,
    recordedAt: RECORDED, binding: fixtureBinding(), purchaseOrder: { issuerCompanyId: 'company.a',
      number: 'PO 2026/0042-Á', documentReference: 'doc.po.example.1' }, ...overrides };
}
function preview(input: CompanyPurchaseOrderDeclaration = declaration(), binding: unknown = input.binding) {
  return previewCompanyPurchaseOrderDeclaration({ declaration: input, binding });
}
function errorFrom(operation: () => unknown): CompanyPurchaseOrderContractError {
  try { operation(); } catch (error) {
    expect(error).toBeInstanceOf(CompanyPurchaseOrderContractError);
    return error as CompanyPurchaseOrderContractError;
  }
  throw new Error('Se esperaba un error de contrato.');
}
function reason(operation: () => unknown, expected: CompanyPurchaseOrderContractReason = 'invalid_data') {
  expect(errorFrom(operation)).toMatchObject({ code: 'company_purchase_order_contract_invalid', reason: expected });
}
function frozen(input: unknown): void {
  if (input !== null && typeof input === 'object') { expect(Object.isFrozen(input)).toBe(true); Object.values(input).forEach(frozen); }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('referencia PO declarada y oferta histórica', () => {
  it.each(['with-document', 'without-document', 'not-provided'] as const)('distinguishes %s without proving an external document exists', mode => {
    const input = declaration();
    const purchaseOrder = mode === 'not-provided' ? null : { ...input.purchaseOrder!, documentReference: mode === 'with-document' ? 'doc.po.example.1' : null };
    const result = preview({ ...input, purchaseOrder });
    expect(result.purchaseOrderStatus).toBe(mode === 'not-provided' ? 'not_provided' : 'declared');
    expect(result.documentReferenceStatus).toBe(mode === 'with-document' ? 'declared' : 'not_provided');
    expect(result.declaration.purchaseOrder).toEqual(purchaseOrder);
    expect(result.offer).toEqual(previewCompanyOfferRevision({ ...input.binding, context: input.binding.negotiation.context }));
    expect(result.offer).toMatchObject({ negotiationRef: { version: 4 }, offer: { id: 'offer.one', revision: 1, totalCents: 7700 } });
    for (const key of ['approved', 'eligible', 'status', 'invoice', 'order', 'paidCents', 'expectedAmountCents']) expect(result).not.toHaveProperty(key);
    frozen(result);
  });

  it('preserves the historical binding if another copy grows, and refuses to retarget it', () => {
    const input = defineCompanyPurchaseOrderDeclaration(declaration());
    const before = preview(input); const old = input.binding.negotiation;
    const next = appendCompanyOfferRevision({ negotiation: old, context: old.context,
      command: { negotiationId: old.id, expectedVersion: old.version, revision: {
        ...old.revisions[2]!, id: 'offer.four', revision: 4, previousRevisionId: 'offer.three', createdAt: '2026-10-03T15:00:00.000Z', shippingCents: 300,
      } } });
    expect(next.outcome).toBe('appended');
    expect(preview(input)).toEqual(before);
    reason(() => preview(input, { negotiation: next.negotiation, revisionId: 'offer.one' }), 'binding_mismatch');
    reason(() => preview(input, { ...input.binding, revisionId: 'offer.two' }), 'binding_mismatch');
    expect(input.binding.negotiation.version).toBe(4);
  });

  it('normalizes and derives through the real sibling contract, without accepting arbitrary amount snapshots', () => {
    const read = vi.spyOn(negotiationContract, 'defineCompanyNegotiation');
    const select = vi.spyOn(negotiationContract, 'previewCompanyOfferRevision');
    const input = declaration(); const result = preview(input);
    expect(read).toHaveBeenCalled(); expect(select).toHaveBeenCalled();
    expect(result.offer).toEqual(select.mock.results[0]?.value);
    reason(() => defineCompanyPurchaseOrderDeclaration({ ...input, amountCents: 7700 }));
    reason(() => defineCompanyPurchaseOrderDeclaration({ ...input, currency: 'EUR' }));
    reason(() => defineCompanyPurchaseOrderBinding({ ...input.binding, offer: result.offer }));
  });

  it('requires exact issuer ownership, never an external identity/VAT guess', () => {
    const input = declaration();
    for (const issuerCompanyId of ['company.b', 'company.unknown']) {
      reason(() => preview({ ...input, purchaseOrder: { ...input.purchaseOrder!, issuerCompanyId } }), 'issuer_mismatch');
    }
    const binding = copy(input.binding);
    binding.negotiation.context.directory.companies.forEach(company => { company.vatId = { countryCode: 'ZZ', identifier: 'FIXTURE42' }; });
    reason(() => preview({ ...input, binding, purchaseOrder: { ...input.purchaseOrder!, issuerCompanyId: 'company.b' } }), 'issuer_mismatch');
  });

  it('describes inactive subjects and a reference recorded after offer expiry without rehabilitating the offer', () => {
    const input = copy(declaration());
    input.recordedAt = AFTER;
    input.binding.negotiation.context.directory.companies[0]!.state = 'inactive';
    input.binding.negotiation.context.directory.contacts[0]!.state = 'inactive';
    input.binding.negotiation.context.catalog.products[0]!.active = false;
    const result = preview(input);
    expect(result.purchaseOrderStatus).toBe('declared');
    expect(result.offer.context.directory.companies[0]!.state).toBe('inactive');
    expect(result.offer.offer.expiresAt).toBe('2026-10-10T12:00:00.000Z');
    expect(result.declaration.recordedAt).toBe(AFTER);
    expect(Object.keys(result).sort()).toEqual(['declaration', 'documentReferenceStatus', 'offer', 'profile', 'purchaseOrderStatus', 'source']);
  });

  it('validates and compares every valid content change, not merely references or the selected total', () => {
    const mutations: Array<(binding: Mutable<CompanyPurchaseOrderBinding>) => void> = [
      b => { b.negotiation.context.directory.id = 'directory.other'; b.negotiation.context.request.directoryRef.id = 'directory.other'; },
      b => { b.negotiation.context.directory.version++; b.negotiation.context.request.directoryRef.version++; },
      b => { b.negotiation.context.directory.capturedAt = AFTER; b.negotiation.context.request.directoryRef.capturedAt = AFTER; },
      b => { b.negotiation.context.catalog.capturedAt = AFTER; b.negotiation.context.request.catalogRef.capturedAt = AFTER; },
      b => { b.negotiation.context.catalog.ref = 'catalog.other'; b.negotiation.context.request.catalogRef.ref = 'catalog.other'; },
      b => { b.negotiation.context.directory.companies[0]!.displayName = 'Otro nombre declarado'; },
      b => { b.negotiation.context.directory.contacts[1]!.displayName = 'Otro contacto no seleccionado'; },
      b => { b.negotiation.context.catalog.products[2]!.variants[0]!.priceCents++; },
      b => { b.negotiation.context.request.lines[0]!.quantityUnits++; },
      b => { b.negotiation.context.request.id = 'request.other'; },
      b => { b.negotiation.context.request.version++; },
      b => { b.negotiation.revisions[2]!.shippingCents++; },
      b => { b.negotiation.revisions[2]!.id = 'offer.last'; },
      b => { b.negotiation.revisions[0]!.expiresAt = AFTER; },
      b => { b.negotiation.createdAt = '2026-10-03T11:45:00.000Z'; },
      b => { b.revisionId = 'offer.two'; },
    ];
    for (const purchaseOrder of [declaration().purchaseOrder, null]) {
      const input = declaration({ purchaseOrder });
      for (const mutate of mutations) {
        const external = copy(input.binding); mutate(external);
        expect(defineCompanyPurchaseOrderBinding(external)).toBeDefined();
        reason(() => preview(input, external), 'binding_mismatch');
      }
    }
  });

  it('checks the entire context and history before not_provided, including unselected corrupt records', () => {
    const mutations: Array<(binding: Mutable<CompanyPurchaseOrderBinding>) => void> = [
      b => { b.negotiation.context.catalog.products[2]!.variants[0]!.priceCents = 10_000_001; },
      b => { b.negotiation.context.catalog.products[2]!.variants[0]!.productId = 1; },
      b => { b.negotiation.context.directory.contacts[1]!.companyId = 'company.unknown'; },
      b => { b.negotiation.context.request.directoryRef.version++; },
      b => { b.negotiation.revisions[2]!.previousRevisionId = 'offer.one'; },
      b => { b.negotiation.revisions[2]!.lines[0]!.quantityUnits = 0; },
    ];
    for (const mutate of mutations) {
      const input = copy(declaration({ purchaseOrder: null })); mutate(input.binding);
      reason(() => defineCompanyPurchaseOrderDeclaration(input), 'offer_invalid');
      reason(() => preview(declaration({ purchaseOrder: null }), input.binding), 'offer_invalid');
    }
    const input = declaration({ purchaseOrder: null });
    reason(() => preview(input, { ...input.binding, revisionId: 'offer.unknown' }), 'offer_invalid');
    reason(() => preview(input, { ...input.binding, negotiation: { ...input.binding.negotiation, version: 1, revisions: [] } }), 'offer_invalid');
  });
});

describe('texto literal, null y metadatos temporales de PO', () => {
  it('preserves number case, initial zeros, internal spaces, punctuation and distinct NFC/NFD literally', () => {
    const input = declaration();
    for (const number of ['0', '00042', 'PO 2026/0042-Á', 'po 2026/0042-Á', 'PO  2026/0042-Á', 'PO 2026/0042-A\u0301',
      '订单42', 'طلب42', 'A.#_/-', '1'.repeat(120), '𐐀'.repeat(60)]) {
      const result = defineCompanyPurchaseOrderDeclaration({ ...input, purchaseOrder: { ...input.purchaseOrder!, number } });
      expect(result.purchaseOrder?.number).toBe(number);
    }
    const a = defineCompanyPurchaseOrderDeclaration({ ...input, purchaseOrder: { ...input.purchaseOrder!, number: 'Á' } });
    const b = defineCompanyPurchaseOrderDeclaration({ ...input, purchaseOrder: { ...input.purchaseOrder!, number: 'A\u0301' } });
    expect(a.purchaseOrder?.number).not.toBe(b.purchaseOrder?.number);
  });

  it('rejects malformed or invisible numbers instead of cleaning them into a different identifier', () => {
    const input = declaration();
    for (const number of ['', ' PO42', 'PO42 ', '\tPO42', 'PO\n42', 'PO\r42', 'PO\u000042', 'PO\u00a042',
      'PO\u200b42', 'PO\u202e42', 'PO\u034f42', 'PO\ufe0f42', 'PO\u316442', '1\u20e3',
      'https://example.test/po', '../PO42', '<PO42>', '😀42', 'a'.repeat(121), '𐐀'.repeat(61), 42, null, undefined]) {
      reason(() => defineCompanyPurchaseOrderDeclaration({ ...input, purchaseOrder: { ...input.purchaseOrder!, number } }));
    }
  });

  it('accepts an explicit opaque document token or null without dereferencing paths, URLs or uploads', () => {
    const input = declaration();
    for (const documentReference of [null, 'a', 'doc.po-example_42', 'a'.repeat(100)]) {
      expect(defineCompanyPurchaseOrderDeclaration({ ...input, purchaseOrder: { ...input.purchaseOrder!, documentReference } })
        .purchaseOrder?.documentReference).toBe(documentReference);
    }
    for (const documentReference of ['', undefined, 'A', 'doc/po', 'https://example.test', '../file', 'doc..po', 'a'.repeat(101), {}]) {
      reason(() => defineCompanyPurchaseOrderDeclaration({ ...input, purchaseOrder: { ...input.purchaseOrder!, documentReference } }));
    }
    reason(() => defineCompanyPurchaseOrderDeclaration({ ...input, purchaseOrder: { ...input.purchaseOrder, file: 'upload' } }));
    reason(() => defineCompanyPurchaseOrderDeclaration({ ...input, purchaseOrder: null, documentReference: 'doc.po' }));
  });

  it('does not interpret omitted/undefined fields or empty references as a declaration of absence', () => {
    const input = declaration();
    const { purchaseOrder: _purchaseOrder, ...missing } = input;
    reason(() => defineCompanyPurchaseOrderDeclaration(missing));
    reason(() => defineCompanyPurchaseOrderDeclaration({ ...input, purchaseOrder: undefined }));
    reason(() => defineCompanyPurchaseOrderDeclaration({ ...input, purchaseOrder: {} }));
    const { documentReference: _documentReference, ...missingDocument } = input.purchaseOrder!;
    reason(() => defineCompanyPurchaseOrderDeclaration({ ...input, purchaseOrder: missingDocument }));
    expect(preview({ ...input, purchaseOrder: null }).purchaseOrderStatus).toBe('not_provided');
  });

  it('declares version independently without pretending to increment history or guarantee uniqueness', () => {
    const input = declaration();
    for (const version of [1, 7, Number.MAX_SAFE_INTEGER]) {
      expect(defineCompanyPurchaseOrderDeclaration({ ...input, version }).version).toBe(version);
    }
    for (const version of [-0, 0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, '1', null]) {
      reason(() => defineCompanyPurchaseOrderDeclaration({ ...input, version }));
    }
    const first = defineCompanyPurchaseOrderDeclaration(input);
    const second = defineCompanyPurchaseOrderDeclaration({ ...input, purchaseOrder: { ...input.purchaseOrder!, number: 'PO-different' } });
    expect(first.id).toBe(second.id); expect(first.version).toBe(second.version);
    expect(first.purchaseOrder?.number).not.toBe(second.purchaseOrder?.number);
  });

  it('bounds internal ids independently of the readable purchase number', () => {
    const input = declaration();
    expect(defineCompanyPurchaseOrderDeclaration({ ...input, id: 'a' }).id).toBe('a');
    expect(defineCompanyPurchaseOrderDeclaration({ ...input, id: 'a'.repeat(100) }).id).toHaveLength(100);
    for (const id of ['', 'A', '1', 'po/reference', 'po 42', 'a'.repeat(101)]) reason(() => defineCompanyPurchaseOrderDeclaration({ ...input, id }));
    expect(defineCompanyPurchaseOrderDeclaration(input).id).not.toBe(input.purchaseOrder?.number);
    reason(() => defineCompanyPurchaseOrderBinding({ ...input.binding, revisionId: 'Offer.One' }));
  });

  it('records association no earlier than the latest included proposal, not merely the selected one', () => {
    const input = declaration();
    expect(defineCompanyPurchaseOrderDeclaration(input).recordedAt).toBe(RECORDED);
    for (const recordedAt of ['2026-10-03T12:00:00.000Z', '2026-10-03T13:59:59.999Z']) {
      reason(() => defineCompanyPurchaseOrderDeclaration({ ...input, recordedAt }), 'invalid_chronology');
      reason(() => preview({ ...input, purchaseOrder: null, recordedAt }), 'invalid_chronology');
    }
    expect(preview({ ...input, recordedAt: AFTER }).declaration.recordedAt).toBe(AFTER);
  });

  it('keeps the inherited year-zero metadata boundary while association timestamps use years 0001..9999', () => {
    const input = copy(declaration()); const context = input.binding.negotiation.context;
    context.directory.capturedAt = context.request.directoryRef.capturedAt = '0000-01-01T00:00:00.000Z';
    context.catalog.capturedAt = context.request.catalogRef.capturedAt = '0000-01-01T00:00:00.000Z';
    expect(preview(input).offer.context.directory.capturedAt).toBe('0000-01-01T00:00:00.000Z');
    for (const year of ['0001', '0099']) {
      const early = copy(input);
      early.recordedAt = RECORDED.replace('2026', year);
      early.binding.negotiation.createdAt = early.binding.negotiation.createdAt.replace('2026', year);
      early.binding.negotiation.context.request.requestedAt = early.binding.negotiation.context.request.requestedAt.replace('2026', year);
      for (const offer of early.binding.negotiation.revisions) {
        offer.createdAt = offer.createdAt.replace('2026', year); offer.expiresAt = offer.expiresAt.replace('2026', year);
      }
      expect(preview(early).declaration.recordedAt).toBe(early.recordedAt);
    }
    expect(preview({ ...input, recordedAt: '9999-12-31T23:59:59.999Z' }).declaration.recordedAt).toBe('9999-12-31T23:59:59.999Z');
  });

  it('rejects impossible/noncanonical association timestamps instead of rounding or reading a clock', () => {
    for (const recordedAt of ['0000-01-01T00:00:00.000Z', '1900-02-29T00:00:00.000Z', '2026-02-30T14:00:00.000Z',
      '2026-10-03T14:00:00Z', '2026-10-03T14:00:00.000+00:00', '+010000-01-01T00:00:00.000Z',
      '2026-10-03T24:00:00.000Z', '2026-10-03t14:00:00.000z', '', undefined, 42]) {
      reason(() => defineCompanyPurchaseOrderDeclaration({ ...declaration(), recordedAt }));
    }
  });
});

describe('frontera completa, copias y errores propios', () => {
  it('accepts canonical permutations but never mutates or shares an original mutable binding', () => {
    const input = copy(declaration()); const external = copy(input.binding);
    external.negotiation.context.directory.companies.reverse(); external.negotiation.context.directory.contacts.reverse();
    external.negotiation.context.catalog.products.reverse(); external.negotiation.context.request.lines.reverse();
    external.negotiation.revisions[0]!.lines.reverse();
    const result = preview(input, external); const before = copy(result);
    input.purchaseOrder!.number = 'changed'; input.binding.negotiation.context.directory.companies[0]!.displayName = 'changed';
    external.negotiation.revisions[0]!.shippingCents++;
    expect(result).toEqual(before); frozen(result);
    expect(Object.isFrozen(COMPANY_PURCHASE_ORDER_LIMITS)).toBe(true);
    expect(defineCompanyPurchaseOrderDeclaration(Object.assign(Object.create(null) as object, declaration()))).toBeDefined();
  });

  it('captures the declaration before external binding introspection mutates its original fields', () => {
    const input = copy(declaration()); const expected = preview(input); const external = copy(input.binding);
    const trap = new Proxy(external, { ownKeys(target) {
      input.purchaseOrder!.number = 'changed-late'; input.recordedAt = AFTER;
      input.binding.negotiation.context.directory.companies[0]!.displayName = 'changed-late';
      return Reflect.ownKeys(target);
    } });
    expect(preview(input, trap)).toEqual(expected);
  });

  it('captures primitive association metadata before later binding introspection', () => {
    const input = copy(declaration()); const expected = defineCompanyPurchaseOrderDeclaration(input);
    const original = input.binding;
    input.binding = new Proxy(original, { ownKeys(target) { input.id = 'changed.id'; input.version = 9; input.recordedAt = AFTER; return Reflect.ownKeys(target); } });
    expect(defineCompanyPurchaseOrderDeclaration(input)).toEqual(expected);
  });

  it('rejects getters anywhere in the own boundary and delegated unselected content without executing them', () => {
    let reads = 0; const input = declaration();
    reason(() => defineCompanyPurchaseOrderDeclaration({ ...input, get purchaseOrder() { reads++; return null; } }));
    reason(() => defineCompanyPurchaseOrderBinding({ negotiation: input.binding.negotiation, get revisionId() { reads++; return 'offer.one'; } }));
    reason(() => defineCompanyPurchaseOrderDeclaration({ ...input, purchaseOrder: { ...input.purchaseOrder!, get number() { reads++; return 'PO42'; } } }));
    reason(() => previewCompanyPurchaseOrderDeclaration({ declaration: input, get binding() { reads++; return input.binding; } }));
    const binding = copy(input.binding);
    Object.defineProperty(binding.negotiation.context.catalog.products[2]!.variants[0]!, 'priceCents', { enumerable: true, get() { reads++; return 3000; } });
    reason(() => preview({ ...input, purchaseOrder: null, binding }), 'offer_invalid');
    expect(reads).toBe(0);
  });

  it('rejects foreign prototypes, extras, symbols, sparse histories and hidden data descriptors', () => {
    const input = declaration();
    for (const value of [null, [], Object.create(input), { ...input, [Symbol('extra')]: 1 }, { ...input, file: 'secret' }]) {
      reason(() => defineCompanyPurchaseOrderDeclaration(value));
    }
    const hidden = copy(input); Object.defineProperty(hidden, 'id', { value: hidden.id, enumerable: false });
    reason(() => defineCompanyPurchaseOrderDeclaration(hidden));
    const sparse = copy(input); delete sparse.binding.negotiation.revisions[1];
    reason(() => defineCompanyPurchaseOrderDeclaration(sparse), 'offer_invalid');
    reason(() => previewCompanyPurchaseOrderDeclaration({ declaration: input, binding: input.binding, status: 'approved' }));
  });

  it('redacts arbitrary Proxy and sibling errors without reading their messages, causes or reason accessors', () => {
    let reads = 0;
    const secret = new Error('secret@example.test');
    const hostile = new Proxy({}, { getPrototypeOf() { throw secret; } });
    const error = errorFrom(() => defineCompanyPurchaseOrderDeclaration(hostile));
    expect(error.reason).toBe('invalid_data'); expect(error.message).not.toContain('secret'); expect(error).not.toHaveProperty('cause');
    const ownError = new CompanyPurchaseOrderContractError('binding_mismatch');
    Object.defineProperty(ownError, 'reason', { get() { reads++; return 'issuer_mismatch'; } });
    reason(() => defineCompanyPurchaseOrderDeclaration(new Proxy({}, { ownKeys() { throw ownError; } })));
    const read = vi.spyOn(negotiationContract, 'defineCompanyNegotiation');
    read.mockImplementationOnce(() => { throw secret; });
    reason(() => defineCompanyPurchaseOrderBinding(declaration().binding), 'offer_invalid');
    expect(reads).toBe(0);
    expect(new CompanyPurchaseOrderContractError('unexpected' as CompanyPurchaseOrderContractReason).reason).toBe('invalid_data');
  });

  it('validates a declaration before external mismatch and validates external content before returning null statuses', () => {
    const input = declaration(); const external = { ...input.binding, revisionId: 'offer.two' };
    reason(() => preview({ ...input, purchaseOrder: { ...input.purchaseOrder!, issuerCompanyId: 'company.b' } }, external), 'issuer_mismatch');
    reason(() => preview({ ...input, purchaseOrder: null }, { ...input.binding, negotiation: {} }), 'offer_invalid');
    reason(() => preview({ ...input, purchaseOrder: null }, external), 'binding_mismatch');
  });

  it('runs normalizers and preview without network, storage, timers, providers or implicit dates', () => {
    const input = declaration(); let effects = 0;
    const stop = () => { effects++; throw new Error('Unexpected effect'); };
    class ExplicitDate extends Date {
      constructor(value?: string | number) { if (value === undefined) stop(); super(value!); }
      static override now(): number { return stop(); }
    }
    vi.stubGlobal('Date', ExplicitDate); vi.stubGlobal('fetch', stop); vi.stubGlobal('setTimeout', stop); vi.stubGlobal('setInterval', stop);
    vi.stubGlobal('localStorage', { getItem: stop, setItem: stop }); vi.stubGlobal('sessionStorage', { getItem: stop, setItem: stop });
    expect(defineCompanyPurchaseOrderBinding(input.binding).revisionId).toBe('offer.one');
    expect(defineCompanyPurchaseOrderDeclaration(input).purchaseOrder?.number).toBe('PO 2026/0042-Á');
    expect(preview(input).offer.offer.totalCents).toBe(7700); expect(effects).toBe(0);
  });
});

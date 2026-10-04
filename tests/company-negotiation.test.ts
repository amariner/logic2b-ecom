import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPANY_NEGOTIATION_LIMITS, CompanyNegotiationContractError,
  defineCompanyNegotiationRequest, defineCompanyNegotiation, createCompanyNegotiation,
  appendCompanyOfferRevision, previewCompanyOfferRevision, compareCompanyOfferRevisions,
  type CompanyNegotiation, type CompanyOfferRevision, type CompanyNegotiationContractReason,
} from '../src/modules/companies';

const REQUESTED = '2026-10-03T11:00:00.000Z';
const CREATED = '2026-10-03T11:30:00.000Z';
const FIRST = '2026-10-03T12:00:00.000Z';
const EXPIRY = '2026-10-10T12:00:00.000Z';
type Mutable<T> = T extends readonly (infer U)[] ? Mutable<U>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
function copy<T>(value: T): Mutable<T> { return structuredClone(value) as Mutable<T>; }
function fixture() {
  const directoryRef = { id: 'directory.fixture', version: 2, capturedAt: '2026-10-03T10:00:00.000Z' };
  const catalogRef = { ref: 'catalog.fixture', capturedAt: '2026-10-03T10:00:00.000Z' };
  return {
    directory: { schemaVersion: 1, source: 'fixture', ...directoryRef, companies: [
      { id: 'company.a', displayName: 'Empresa A', state: 'active', vatId: null },
      { id: 'company.b', displayName: 'Empresa B', state: 'inactive', vatId: null },
    ], sites: [], contacts: [
      { id: 'contact.buyer', companyId: 'company.a', displayName: 'Comprador de ejemplo', state: 'active', identityRef: null },
      { id: 'contact.other', companyId: 'company.a', displayName: 'Otro contacto', state: 'inactive', identityRef: null },
      { id: 'contact.foreign', companyId: 'company.b', displayName: 'Contacto externo', state: 'active', identityRef: null },
    ], roles: [], assignments: [] },
    catalog: { schemaVersion: 1, source: 'fixture', ...catalogRef, currency: 'EUR', products: [
      { id: 1, active: true, variants: [{ id: 11, productId: 1, status: 'active', priceCents: 1000 }, { id: 12, productId: 1, status: 'archived', priceCents: 1500 }] },
      { id: 2, active: true, variants: [{ id: 21, productId: 2, status: 'active', priceCents: 2000 }] },
      { id: 3, active: false, variants: [{ id: 31, productId: 3, status: 'draft', priceCents: 3000 }] },
    ] },
    request: { schemaVersion: 1, source: 'fixture', profile: 'company-offer-eur-cents-v1', id: 'request.fixture', version: 4,
      directoryRef: { ...directoryRef }, catalogRef: { ...catalogRef }, companyId: 'company.a', buyerContactId: 'contact.buyer',
      requestedAt: REQUESTED, currency: 'EUR', lines: [{ productId: 1, variantId: 11, quantityUnits: 4 }, { productId: 2, variantId: 21, quantityUnits: 2 }] },
  };
}
function proposal(overrides: Partial<CompanyOfferRevision> = {}): CompanyOfferRevision {
  return { id: 'offer.one', revision: 1, previousRevisionId: null, proposedBy: 'seller', createdAt: FIRST, expiresAt: EXPIRY,
    lines: [{ productId: 1, variantId: 11, quantityUnits: 4, unitPriceCents: 900 }, { productId: 2, variantId: 21, quantityUnits: 2, unitPriceCents: 1800 }],
    shippingCents: 500, ...overrides };
}
function create(context: unknown = fixture(), createdAt = CREATED) { return createCompanyNegotiation({ id: 'negotiation.fixture', createdAt, context }); }
function append(negotiation: CompanyNegotiation, revision: unknown = proposal(), expectedVersion = negotiation.version, context: unknown = negotiation.context) {
  return appendCompanyOfferRevision({ negotiation, context, command: { negotiationId: negotiation.id, expectedVersion, revision } });
}
function added(negotiation: CompanyNegotiation, revision: CompanyOfferRevision = proposal()): CompanyNegotiation {
  const result = append(negotiation, revision); expect(result.outcome).toBe('appended'); return result.negotiation;
}
function history() {
  const one = added(create());
  const two = added(one, proposal({ id: 'offer.two', revision: 2, previousRevisionId: 'offer.one', proposedBy: 'buyer', createdAt: '2026-10-03T13:00:00.000Z',
    expiresAt: '2026-10-11T12:00:00.000Z', lines: [{ productId: 1, variantId: 12, quantityUnits: 3, unitPriceCents: 1400 }], shippingCents: 0 }));
  const three = added(two, proposal({ id: 'offer.three', revision: 3, previousRevisionId: 'offer.two', createdAt: '2026-10-03T14:00:00.000Z',
    expiresAt: '2026-10-11T12:00:00.000Z', lines: [{ productId: 1, variantId: 12, quantityUnits: 3, unitPriceCents: 1350 },
      { productId: 2, variantId: 21, quantityUnits: 1, unitPriceCents: 1750 }], shippingCents: 200 }));
  return { one, two, three };
}
function preview(negotiation: CompanyNegotiation, revisionId = 'offer.one', context: unknown = negotiation.context) {
  return previewCompanyOfferRevision({ negotiation, context, revisionId });
}
function compare(negotiation: CompanyNegotiation, beforeRevisionId: string, afterRevisionId: string) {
  return compareCompanyOfferRevisions({ negotiation, context: negotiation.context, beforeRevisionId, afterRevisionId });
}
function errorFrom(operation: () => unknown): CompanyNegotiationContractError {
  try { operation(); } catch (error) { expect(error).toBeInstanceOf(CompanyNegotiationContractError); return error as CompanyNegotiationContractError; }
  throw new Error('Se esperaba un error de contrato.');
}
function reason(operation: () => unknown, expected: CompanyNegotiationContractReason = 'invalid_data') {
  expect(errorFrom(operation)).toMatchObject({ code: 'company_negotiation_contract_invalid', reason: expected });
}
function frozen(input: unknown): void {
  if (input === null || typeof input !== 'object') return;
  expect(Object.isFrozen(input)).toBe(true); Object.values(input).forEach(frozen);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('solicitud y contexto declarado completos', () => {
  it('crea una solicitud sin dinero y una negociación vacía, sin estados comerciales', () => {
    const context = fixture(); const original = copy(context); const negotiation = create(context);
    expect(negotiation).toMatchObject({ schemaVersion: 1, source: 'fixture', profile: 'company-offer-eur-cents-v1', version: 1, createdAt: CREATED, revisions: [] });
    expect(context).toEqual(original);
    original.directory.contacts.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    expect(negotiation.context).toEqual(original); expect(negotiation.context).not.toBe(context);
    expect(defineCompanyNegotiation(negotiation)).toEqual(negotiation);
    expect(negotiation).not.toHaveProperty('status'); expect(negotiation.context.request).not.toHaveProperty('totalCents');
    frozen(negotiation);
    reason(() => preview(negotiation), 'unknown_revision');
  });

  it('canoniza orden de líneas y conserva cantidades explícitas sin agruparlas', () => {
    const context = fixture(); context.request.lines.reverse();
    const request = defineCompanyNegotiationRequest(context.request);
    expect(request.lines.map(line => line.productId)).toEqual([1, 2]);
    expect(context.request.lines.map(line => line.productId)).toEqual([2, 1]);
    reason(() => defineCompanyNegotiationRequest({ ...context.request, lines: [context.request.lines[1], { productId: 1, variantId: 12, quantityUnits: 1 }] }), 'duplicate_line');
    reason(() => defineCompanyNegotiationRequest({ ...context.request, amountCents: 100 }));
    frozen(request);
  });

  it.each([
    ['unknown_company', (c: ReturnType<typeof fixture>) => { c.request.companyId = 'company.missing'; }, 'unknown_reference'],
    ['unknown_contact', (c: ReturnType<typeof fixture>) => { c.request.buyerContactId = 'contact.missing'; }, 'unknown_reference'],
    ['foreign_contact', (c: ReturnType<typeof fixture>) => { c.request.buyerContactId = 'contact.foreign'; }, 'cross_company_reference'],
    ['unknown_product', (c: ReturnType<typeof fixture>) => { c.request.lines[0]!.productId = 99; }, 'unknown_reference'],
    ['unknown_variant', (c: ReturnType<typeof fixture>) => { c.request.lines[0]!.variantId = 99; }, 'unknown_reference'],
    ['foreign_variant', (c: ReturnType<typeof fixture>) => { c.request.lines[0]!.variantId = 21; }, 'cross_product_reference'],
  ] as const)('rechaza %s sin inferir selección alternativa', (_label, mutate, expected) => {
    const context = fixture(); mutate(context); reason(() => create(context), expected);
  });

  it('compara todos los campos de ambas referencias, incluidos capturedAt', () => {
    const mutations = [
      (c: ReturnType<typeof fixture>) => { c.request.directoryRef.id = 'directory.other'; },
      (c: ReturnType<typeof fixture>) => { c.request.directoryRef.version++; },
      (c: ReturnType<typeof fixture>) => { c.request.directoryRef.capturedAt = FIRST; },
      (c: ReturnType<typeof fixture>) => { c.request.catalogRef.ref = 'catalog.other'; },
      (c: ReturnType<typeof fixture>) => { c.request.catalogRef.capturedAt = FIRST; },
    ];
    for (const mutate of mutations) { const context = fixture(); mutate(context); reason(() => create(context), 'reference_mismatch'); }
  });

  it('valida directorio y catálogo completos aunque no haya propuestas ni selección ajena', () => {
    const context = fixture(); context.catalog.products[2]!.variants[0]!.priceCents = 10_000_001;
    reason(() => create(context), 'context_invalid');
    const another = fixture(); another.directory.contacts[2]!.companyId = 'company.missing';
    reason(() => create(another), 'context_invalid');
    const invalid = fixture(); invalid.catalog.products[2]!.variants[0]!.productId = 1;
    reason(() => create(invalid), 'context_invalid');
  });

  it('conserva sujetos inactivos y variantes archived/draft como declaración, no permiso', () => {
    const context = fixture(); context.directory.companies[0]!.state = 'inactive'; context.directory.contacts[0]!.state = 'inactive';
    context.catalog.products[0]!.active = false; context.request.lines[0]!.variantId = 12;
    context.request.lines.push({ productId: 3, variantId: 31, quantityUnits: 2 });
    const negotiation = added(create(context), proposal({ lines: [{ productId: 1, variantId: 12, quantityUnits: 1, unitPriceCents: 1 },
      { productId: 3, variantId: 31, quantityUnits: 1, unitPriceCents: 1 }], shippingCents: 0 }));
    expect(preview(negotiation).offer.totalCents).toBe(2);
    expect(negotiation.context.directory.companies[0]!.state).toBe('inactive');
    for (const field of ['eligible', 'available', 'approved', 'status']) expect(preview(negotiation)).not.toHaveProperty(field);
  });
});

describe('ofertas completas e importes declarados', () => {
  it('conserva propuestas anteriores y calcula importes diferentes del catálogo', () => {
    const { one, two, three } = history();
    expect(one.version).toBe(2); expect(two.version).toBe(3); expect(three.version).toBe(4);
    expect(two.revisions[0]).toEqual(one.revisions[0]); expect(three.revisions.slice(0, 2)).toEqual(two.revisions);
    expect(two.revisions[1]!.lines).toHaveLength(1); expect(three.revisions[2]!.lines).toHaveLength(2);
    expect(one.context.catalog.products[0]!.variants[0]!.priceCents).toBe(1000);
    for (const [id, subtotal, shipping, total] of [['offer.one', 7200, 500, 7700], ['offer.two', 4200, 0, 4200], ['offer.three', 5800, 200, 6000]] as const) {
      const snapshot = preview(three, id); expect(snapshot.offer).toMatchObject({ subtotalCents: subtotal, shippingCents: shipping, totalCents: total });
      expect(snapshot.negotiationRef).toEqual({ id: three.id, version: 4 }); frozen(snapshot);
    }
    expect(preview(three, 'offer.one').offer.lines.map(line => line.lineTotalCents)).toEqual([3600, 3600]);
  });

  it('acepta una unidad cara y ceros por línea sin cambiar la frontera del catálogo', () => {
    const high = added(create(), proposal({ lines: [{ productId: 1, variantId: 11, quantityUnits: 1, unitPriceCents: 1_000_000_000 }], shippingCents: 0 }));
    expect(preview(high).offer.totalCents).toBe(1_000_000_000);
    const zeroLine = added(create(), proposal({ lines: [{ productId: 1, variantId: 11, quantityUnits: 10_000, unitPriceCents: 0 }], shippingCents: 1 }));
    expect(preview(zeroLine).offer).toMatchObject({ subtotalCents: 0, totalCents: 1, lines: [{ lineTotalCents: 0 }] });
    const context = fixture(); context.catalog.products[0]!.variants[0]!.priceCents = 1_000_000_000;
    reason(() => create(context), 'context_invalid');
  });

  it.each([
    [1, 0, 0, 'amount_out_of_range'], [2, 1_000_000_000, 0, 'amount_out_of_range'],
    [1, 1_000_000_000, 1, 'amount_out_of_range'], [10_000, 1_000_000_000, 0, 'amount_out_of_range'],
    [1, 1_000_000_001, 0, 'invalid_data'], [1, -0, 1, 'invalid_data'], [0, 10, 1, 'invalid_data'],
    [10_001, 1, 0, 'invalid_data'], [1, 1, -0, 'invalid_data'],
  ] as const)('valida cantidad/precio/portes %i/%i/%i antes de aceptar el total', (quantityUnits, unitPriceCents, shippingCents, expected) => {
    reason(() => append(create(), proposal({ lines: [{ productId: 1, variantId: 11, quantityUnits, unitPriceCents }], shippingCents })), expected);
  });

  it('usa suma exacta con varias líneas y no ignora una línea que hace superar el total', () => {
    const lines = [{ productId: 1, variantId: 11, quantityUnits: 3, unitPriceCents: 333_333_333 },
      { productId: 2, variantId: 21, quantityUnits: 1, unitPriceCents: 1 }];
    const negotiation = added(create(), proposal({ lines, shippingCents: 0 }));
    expect(preview(negotiation).offer.totalCents).toBe(1_000_000_000);
    reason(() => append(create(), proposal({ lines, shippingCents: 1 })), 'amount_out_of_range');
  });

  it('rechaza productos no solicitados y variantes ajenas, sin elección predeterminada', () => {
    const negotiation = create();
    reason(() => append(negotiation, proposal({ lines: [{ productId: 3, variantId: 31, quantityUnits: 1, unitPriceCents: 100 }] })), 'unexpected_offer_product');
    reason(() => append(negotiation, proposal({ lines: [{ productId: 1, variantId: 21, quantityUnits: 1, unitPriceCents: 100 }] })), 'cross_product_reference');
    reason(() => append(negotiation, proposal({ lines: [{ productId: 1, variantId: 999, quantityUnits: 1, unitPriceCents: 100 }] })), 'unknown_reference');
    reason(() => append(negotiation, proposal({ lines: [] })));
    reason(() => append(negotiation, proposal({ lines: [proposal().lines[0]!, { productId: 1, variantId: 12, quantityUnits: 1, unitPriceCents: 100 }] })), 'duplicate_line');
  });
});

describe('historial, contexto, CAS y replay puros', () => {
  it('reproduce una revisión histórica sobre el artefacto actual sin quitar propuestas posteriores', () => {
    const { one, three } = history();
    const reversedLines = { ...proposal(), lines: [...proposal().lines].reverse() };
    const replay = append(three, reversedLines, 1);
    expect(replay.outcome).toBe('replayed'); expect(replay.negotiation).toEqual(three);
    expect(replay.negotiation).not.toEqual(one); expect(replay.negotiation.version).toBe(4);
    frozen(replay);
  });

  it('compara el comando completo ante un ID ya registrado', () => {
    const negotiation = added(create());
    const changes: Partial<CompanyOfferRevision>[] = [
      { proposedBy: 'buyer' }, { revision: 2 }, { previousRevisionId: 'offer.other' }, { createdAt: CREATED },
      { expiresAt: '2026-10-11T12:00:00.000Z' }, { shippingCents: 501 },
      { lines: [{ productId: 1, variantId: 12, quantityUnits: 2, unitPriceCents: 1000 }] },
    ];
    for (const change of changes) expect(append(negotiation, proposal(change), 1)).toMatchObject({ outcome: 'conflict', reason: 'revision_id_reused', negotiation });
    expect(append(negotiation, proposal(), 2)).toMatchObject({ outcome: 'conflict', reason: 'revision_id_reused', negotiation });
  });

  it('da conflicto stale antes de comprobar ordinal/pred/fecha contra la cabeza', () => {
    const negotiation = history().three;
    const candidate = proposal({ id: 'offer.stale', revision: 99, previousRevisionId: 'offer.missing', createdAt: REQUESTED });
    expect(append(negotiation, candidate, 1)).toMatchObject({ outcome: 'conflict', reason: 'version_mismatch', negotiation });
    reason(() => append(negotiation, candidate, negotiation.version), 'invalid_history');
    reason(() => append(negotiation, proposal({ id: 'offer.next', revision: 4, previousRevisionId: 'offer.three', createdAt: REQUESTED })), 'invalid_chronology');
  });

  it('no esconde corrupción de candidatas detrás de conflicto o replay', () => {
    const negotiation = added(create());
    const invalidOffer = proposal({ shippingCents: 1_000_000_000 });
    reason(() => append(negotiation, invalidOffer, 99), 'amount_out_of_range');
    reason(() => append(negotiation, { ...proposal(), paidCents: 0 }, 99));
    reason(() => append(negotiation, proposal({ id: 'offer.stale', expiresAt: FIRST }), 1), 'invalid_chronology');
    reason(() => appendCompanyOfferRevision({ negotiation, context: negotiation.context, command: { negotiationId: 'negotiation.other', expectedVersion: 1, revision: proposal() } }), 'reference_mismatch');
  });

  it('un conflicto no consume identidad y otra negociación no hereda nada', () => {
    const initial = create(); const candidate = proposal();
    expect(append(initial, candidate, 9).outcome).toBe('conflict'); expect(append(initial, candidate, 1).outcome).toBe('appended');
    expect(initial.revisions).toEqual([]); expect(create(initial.context)).toEqual(initial);
  });

  it('los cambios completos del contexto ganan frente a replay, CAS y selección', () => {
    const negotiation = history().three;
    const changes = [
      (c: Mutable<typeof negotiation.context>) => { c.directory.companies[1]!.displayName = 'Etiqueta diferente'; },
      (c: Mutable<typeof negotiation.context>) => { c.directory.companies[0]!.state = 'inactive'; },
      (c: Mutable<typeof negotiation.context>) => { c.directory.contacts[0]!.state = 'inactive'; },
      (c: Mutable<typeof negotiation.context>) => { c.catalog.products[2]!.variants[0]!.priceCents = 42; },
      (c: Mutable<typeof negotiation.context>) => { c.request.version++; },
      (c: Mutable<typeof negotiation.context>) => { c.request.lines[0]!.quantityUnits++; },
      (c: Mutable<typeof negotiation.context>) => { c.directory.capturedAt = FIRST; c.request.directoryRef.capturedAt = FIRST; },
      (c: Mutable<typeof negotiation.context>) => { c.catalog.capturedAt = FIRST; c.request.catalogRef.capturedAt = FIRST; },
    ];
    for (const change of changes) {
      const context = copy(negotiation.context); change(context);
      reason(() => append(negotiation, proposal(), 1, context), 'context_mismatch');
      reason(() => preview(negotiation, 'offer.one', context), 'context_mismatch');
      reason(() => compareCompanyOfferRevisions({ negotiation, context, beforeRevisionId: 'offer.one', afterRevisionId: 'offer.two' }), 'context_mismatch');
      expect(create(context).revisions).toEqual([]);
    }
  });

  it('valida todas las revisiones y reconstruye versión, identidad, predecessor y cronología', () => {
    const { three } = history();
    const changes: Array<(n: Mutable<CompanyNegotiation>) => void> = [
      n => { n.version--; }, n => { n.revisions[2]!.revision = 2; }, n => { n.revisions[2]!.id = 'offer.one'; },
      n => { n.revisions[0]!.previousRevisionId = 'offer.other'; }, n => { n.revisions[2]!.previousRevisionId = 'offer.one'; },
    ];
    for (const change of changes) { const value = copy(three); change(value); reason(() => defineCompanyNegotiation(value), 'invalid_history'); }
    const corrupt = copy(three); corrupt.revisions[2]!.lines[0]!.unitPriceCents = 1_000_000_000;
    reason(() => preview(corrupt, 'offer.one'), 'amount_out_of_range');
    const earlier = copy(three); earlier.revisions[2]!.createdAt = FIRST;
    reason(() => defineCompanyNegotiation(earlier), 'invalid_chronology');
  });

  it('admite veinte revisiones y preserva replay/conflicto en el límite', () => {
    let negotiation = create();
    for (let index = 1; index <= 20; index++) negotiation = added(negotiation, proposal({ id: `offer.r${index}`, revision: index,
      previousRevisionId: index === 1 ? null : `offer.r${index - 1}` }));
    expect(negotiation.version).toBe(21); expect(defineCompanyNegotiation(negotiation)).toEqual(negotiation);
    const next = proposal({ id: 'offer.r21', revision: 21, previousRevisionId: 'offer.r20' });
    reason(() => append(negotiation, next), 'history_limit');
    expect(append(negotiation, next, 20)).toMatchObject({ outcome: 'conflict', reason: 'version_mismatch' });
    expect(append(negotiation, negotiation.revisions[0]!, 1).outcome).toBe('replayed');
    reason(() => append(negotiation, { ...next, shippingCents: -1 }));
    reason(() => defineCompanyNegotiation({ ...negotiation, version: 22, revisions: [...negotiation.revisions, next] }));
  });
});

describe('diffs deterministas de revisiones explícitas', () => {
  it('distingue cambio de variante, retirada y reintroducción con importes firmados', () => {
    const { three } = history(); const first = compare(three, 'offer.one', 'offer.two');
    expect(first.lineChanges).toMatchObject([
      { productId: 1, kind: 'changed', changedFields: ['variantId', 'quantityUnits', 'unitPriceCents'] },
      { productId: 2, kind: 'removed', after: null, changedFields: [] },
    ]);
    expect(first.changedFields).toEqual(['proposedBy', 'createdAt', 'expiresAt', 'shippingCents']);
    expect(first.deltas).toEqual({ subtotalCents: -3000, shippingCents: -500, totalCents: -3500 });
    const second = compare(three, 'offer.two', 'offer.three');
    expect(second.lineChanges).toMatchObject([{ productId: 1, kind: 'changed', changedFields: ['unitPriceCents'] },
      { productId: 2, kind: 'added', before: null, changedFields: [] }]);
    expect(second.changedFields).toEqual(['proposedBy', 'createdAt', 'shippingCents']);
    expect(second.deltas).toEqual({ subtotalCents: 1600, shippingCents: 200, totalCents: 1800 }); frozen(second);
  });

  it('selecciona revisiones no adyacentes, iguales o en orden inverso sin latest implícito', () => {
    const { three } = history(); const same = compare(three, 'offer.one', 'offer.one');
    expect(same).toMatchObject({ lineChanges: [], changedFields: [], deltas: { subtotalCents: 0, shippingCents: 0, totalCents: 0 } });
    const backwards = compare(three, 'offer.two', 'offer.one');
    expect(backwards.lineChanges[1]).toMatchObject({ productId: 2, kind: 'added', before: null });
    expect(backwards.deltas).toEqual({ subtotalCents: 3000, shippingCents: 500, totalCents: 3500 });
    expect(compare(three, 'offer.one', 'offer.three').deltas.totalCents).toBe(-1700);
    reason(() => compare(three, 'offer.one', 'offer.unknown'), 'unknown_revision');
    reason(() => previewCompanyOfferRevision({ negotiation: three, context: three.context }));
  });

  it('un precio total igual no oculta un cambio de variante y un ordinal nuevo no inventa un cambio de contenido', () => {
    const first = added(create());
    const onlyMetadata = added(first, proposal({ id: 'offer.two', revision: 2, previousRevisionId: 'offer.one' }));
    expect(compare(onlyMetadata, 'offer.one', 'offer.two')).toMatchObject({ lineChanges: [], changedFields: [], deltas: { totalCents: 0 } });
    const replaced = added(first, proposal({ id: 'offer.two', revision: 2, previousRevisionId: 'offer.one',
      lines: [{ ...proposal().lines[0]!, variantId: 12 }, proposal().lines[1]!] }));
    const diff = compare(replaced, 'offer.one', 'offer.two');
    expect(diff.lineChanges).toHaveLength(1); expect(diff.lineChanges[0]!.changedFields).toEqual(['variantId']); expect(diff.deltas.totalCents).toBe(0);
  });
});

describe('fechas explícitas, límites y frontera hostil', () => {
  it('conserva la frontera capturedAt año cero sin ampliarla a eventos', () => {
    const context = fixture(); const metadata = '0000-01-01T00:00:00.000Z';
    context.directory.capturedAt = metadata; context.request.directoryRef.capturedAt = metadata;
    context.catalog.capturedAt = metadata; context.request.catalogRef.capturedAt = metadata;
    expect(create(context).context.request.directoryRef.capturedAt).toBe(metadata);
    reason(() => create(context, metadata));
    context.request.requestedAt = metadata; reason(() => create(context));
  });

  it.each(['0001-01-01', '0099-12-31', '1900-02-28', '2000-02-29', '9999-12-31'])('acepta fecha gregoriana %s sin remapear año', day => {
    const context = fixture(); context.request.requestedAt = `${day}T00:00:00.000Z`;
    const negotiation = added(create(context, `${day}T00:00:00.000Z`), proposal({ createdAt: `${day}T00:00:00.000Z`, expiresAt: `${day}T00:00:00.001Z` }));
    expect(preview(negotiation).offer.createdAt).toBe(`${day}T00:00:00.000Z`);
  });

  it('rechaza fechas inexistentes, equivalentes no canónicas y cronología inválida', () => {
    for (const at of ['1900-02-29T00:00:00.000Z', '2026-04-31T00:00:00.000Z', '2026-10-03T12:00:00Z', '2026-10-03T12:00:00.000+00:00', '+010000-01-01T00:00:00.000Z']) {
      const context = fixture(); context.request.requestedAt = at; reason(() => create(context));
    }
    reason(() => create(fixture(), '2026-10-03T10:59:59.999Z'), 'invalid_chronology');
    reason(() => append(create(), proposal({ createdAt: REQUESTED })), 'invalid_chronology');
    reason(() => append(create(), proposal({ expiresAt: FIRST })), 'invalid_chronology');
    reason(() => append(create(), proposal({ expiresAt: REQUESTED })), 'invalid_chronology');
  });

  it('permite una nueva propuesta posterior a la caducidad anterior sin reabrir un estado comercial', () => {
    const first = added(create());
    const next = added(first, proposal({ id: 'offer.two', revision: 2, previousRevisionId: 'offer.one', createdAt: '2026-10-11T12:00:00.000Z', expiresAt: '2026-10-11T12:00:00.001Z' }));
    expect(next.revisions).toHaveLength(2); expect(next).not.toHaveProperty('status');
  });

  it('acepta cien líneas y sus máximos técnicos, rechaza la siguiente y enteros inválidos', () => {
    const context = fixture(); context.catalog.products = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, active: true,
      variants: [{ id: index + 1001, productId: index + 1, status: 'active', priceCents: 1 }] }));
    context.request.lines = context.catalog.products.map(product => ({ productId: product.id, variantId: product.variants[0]!.id, quantityUnits: 10_000 }));
    const negotiation = added(create(context), proposal({ lines: context.request.lines.map(line => ({ ...line, unitPriceCents: 1000 })), shippingCents: 0 }));
    expect(preview(negotiation).offer.totalCents).toBe(1_000_000_000);
    reason(() => defineCompanyNegotiationRequest({ ...context.request, lines: [...context.request.lines, { productId: 101, variantId: 1101, quantityUnits: 1 }] }));
    reason(() => append(create(context), proposal({ lines: [...context.request.lines.map(line => ({ ...line, unitPriceCents: 1 })), { productId: 101, variantId: 1101, quantityUnits: 1, unitPriceCents: 1 }] })));
    const maximal = fixture(); maximal.catalog.products[0]!.id = 2_147_483_647;
    maximal.catalog.products[0]!.variants.forEach(variant => { variant.productId = 2_147_483_647; });
    maximal.catalog.products[0]!.variants[0]!.id = Number.MAX_SAFE_INTEGER;
    maximal.request.lines[0]!.productId = 2_147_483_647; maximal.request.lines[0]!.variantId = Number.MAX_SAFE_INTEGER;
    maximal.request.version = Number.MAX_SAFE_INTEGER; expect(create(maximal).context.request.version).toBe(Number.MAX_SAFE_INTEGER);
    for (const quantityUnits of [-0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      reason(() => defineCompanyNegotiationRequest({ ...fixture().request, lines: [{ productId: 1, variantId: 11, quantityUnits }] }));
    }
    expect(COMPANY_NEGOTIATION_LIMITS).toMatchObject({ requestLines: 100, offerLines: 100, revisions: 20, unitPriceCents: 1_000_000_000 });
  });

  it('rechaza estados comerciales o importes derivados aportados como autoridad', () => {
    const negotiation = added(create());
    for (const extra of [{ status: 'approved' }, { paidCents: 0 }, { depositCents: 0 }, { conversionGate: 'approval' }, { creditReview: 'accepted' }]) {
      reason(() => defineCompanyNegotiation({ ...negotiation, ...extra }));
      reason(() => append(create(), { ...proposal(), ...extra }));
    }
    reason(() => append(create(), { ...proposal(), totalCents: 7700 }));
    reason(() => append(create(), { ...proposal(), lines: [{ ...proposal().lines[0]!, lineTotalCents: 3600 }] }));
  });

  it('copia y congela hasta refs/líneas; mutar entradas después no altera el historial', () => {
    const context = fixture(); const revision = copy(proposal()); const negotiation = added(create(context), revision);
    const expected = copy(negotiation);
    context.catalog.products[0]!.variants[0]!.priceCents = 4; context.request.lines[0]!.quantityUnits = 5; revision.lines[0]!.unitPriceCents = 8;
    expect(negotiation).toEqual(expected); frozen(negotiation); frozen(compare(negotiation, 'offer.one', 'offer.one'));
    expect(() => Object.defineProperty(negotiation.revisions[0]!.lines[0], 'quantityUnits', { value: 2 })).toThrow();
  });

  it('no relee contexto, artefacto ni candidatas ya normalizadas ante mutaciones tardías', () => {
    const raw = copy(added(create())); const external = copy(raw.context); const saved = copy(raw);
    const command = new Proxy({ negotiationId: raw.id, expectedVersion: 1, revision: copy(proposal()) }, { ownKeys(target) {
      raw.context.request.lines[0]!.quantityUnits = 99; raw.revisions[0]!.shippingCents = 1; external.request.version++;
      return Reflect.ownKeys(target);
    } });
    expect(appendCompanyOfferRevision({ negotiation: raw, context: external, command })).toEqual({ outcome: 'replayed', negotiation: saved });
    const context = fixture(); const originalName = context.directory.companies[0]!.displayName;
    context.catalog = new Proxy(context.catalog, { ownKeys(target) { context.directory.companies[0]!.displayName = 'Cambio tardío'; return Reflect.ownKeys(target); } });
    expect(create(context).context.directory.companies[0]!.displayName).toBe(originalName);
  });

  it('rechaza getters/prototipos/extras/arrays dispersos y redacta errores Proxy', () => {
    let getters = 0; const request = fixture().request;
    const accessor = { ...request }; Object.defineProperty(accessor, 'id', { enumerable: true, get() { getters++; return 'request.leak'; } });
    reason(() => defineCompanyNegotiationRequest(accessor));
    const hidden = { ...request }; Object.defineProperty(hidden, 'secret', { value: 'persona@example.test' }); reason(() => defineCompanyNegotiationRequest(hidden));
    reason(() => defineCompanyNegotiationRequest({ ...request, [Symbol('extra')]: true }));
    reason(() => defineCompanyNegotiationRequest(Object.assign(Object.create({ inherited: true }) as object, request)));
    const sparse = Array(1); reason(() => defineCompanyNegotiationRequest({ ...request, lines: sparse }));
    const withExtra = Object.assign([...request.lines], { secret: true }); reason(() => defineCompanyNegotiationRequest({ ...request, lines: withExtra }));
    const getterArray = [...request.lines]; Object.defineProperty(getterArray, '0', { enumerable: true, get() { getters++; return request.lines[0]; } });
    reason(() => defineCompanyNegotiationRequest({ ...request, lines: getterArray }));
    const hostile = new Proxy(request, { ownKeys() { throw new Error('persona@example.test'); } });
    const error = errorFrom(() => defineCompanyNegotiationRequest(hostile));
    expect(error.message).toBe('Los datos no cumplen el contrato de negociación de empresa.'); expect(error).not.toHaveProperty('cause');
    const hostileContext = fixture(); hostileContext.directory = new Proxy(hostileContext.directory, { getPrototypeOf() { throw new Error('private-profile'); } });
    const mapped = errorFrom(() => create(hostileContext)); expect(mapped.reason).toBe('context_invalid'); expect(mapped.message).not.toMatch(/private-profile/);
    expect(getters).toBe(0);
  });

  it('preserva null-prototype records de datos y IDs válidos sin normalizar entradas inválidas', () => {
    const request = fixture().request; const own = Object.assign(Object.create(null) as Record<string, unknown>, request);
    expect(defineCompanyNegotiationRequest(own)).toEqual(defineCompanyNegotiationRequest(request));
    for (const id of ['', ' Request', 'UPPER', 'a..b', 'a'.repeat(101)]) reason(() => defineCompanyNegotiationRequest({ ...request, id }));
    expect(defineCompanyNegotiationRequest({ ...request, id: 'a'.repeat(100) }).id).toHaveLength(100);
  });

  it('no consulta reloj, red, storage o temporizadores', () => {
    const forbidden = vi.fn(() => { throw new Error('Efecto prohibido'); });
    for (const name of ['fetch', 'setTimeout', 'setInterval', 'requestAnimationFrame']) vi.stubGlobal(name, forbidden);
    vi.stubGlobal('localStorage', { getItem: forbidden, setItem: forbidden }); vi.stubGlobal('sessionStorage', { getItem: forbidden, setItem: forbidden });
    const NativeDate = Date;
    class ExplicitDate extends NativeDate { constructor(value: string | number) { if (arguments.length === 0) throw new Error('Reloj implícito'); super(value); } static override now() { return forbidden(); } }
    vi.stubGlobal('Date', ExplicitDate);
    const { three } = history(); expect(compare(three, 'offer.one', 'offer.three').deltas.totalCents).toBe(-1700);
    expect(append(three, proposal(), 1).outcome).toBe('replayed'); expect(forbidden).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as orders from '../src/modules/orders';
import { createCompanyNegotiation, appendCompanyOfferRevision, type CompanyNegotiation, type CompanyOfferRevision } from '../src/modules/companies';
import {
  COMPANY_PRELIMINARY_LIMITS, CompanyPreliminaryContractError,
  defineCompanyPreliminaryBinding, defineCompanyPreliminaryArtifact, createCompanyPreliminaryArtifact,
  previewCompanyPreliminaryArtifact, applyCompanyPreliminaryAction,
  type CompanyPreliminaryBinding, type CompanyPreliminarySnapshot, type CompanyPreliminaryActionCommand,
  type CompanyPreliminaryContractReason, type CompanyPreliminaryTerms,
} from '../src/composition/company-preliminary-order';

const CREATED = '2026-10-03T14:00:00.000Z';
const ISSUED = '2026-10-03T14:01:00.000Z';
const APPROVED = '2026-10-03T14:02:00.000Z';
const EXPIRY = '2026-10-10T12:00:00.000Z';
const BEFORE_EXPIRY = '2026-10-10T11:59:59.999Z';
const AFTER_EXPIRY = '2026-10-10T12:00:00.001Z';
type Mutable<T> = T extends readonly (infer U)[] ? Mutable<U>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
function copy<T>(value: T): Mutable<T> { return structuredClone(value) as Mutable<T>; }
function fixtureContext() {
  const directoryRef = { id: 'directory.fixture', version: 2, capturedAt: '2026-10-03T10:00:00.000Z' };
  const catalogRef = { ref: 'catalog.fixture', capturedAt: '2026-10-03T10:00:00.000Z' };
  return {
    directory: { schemaVersion: 1, source: 'fixture', ...directoryRef,
      companies: [{ id: 'company.fixture', displayName: 'Empresa de ejemplo', state: 'active', vatId: null }],
      contacts: [{ id: 'contact.buyer', companyId: 'company.fixture', displayName: 'Comprador', state: 'active', identityRef: null }], sites: [], roles: [], assignments: [] },
    catalog: { schemaVersion: 1, source: 'fixture', ...catalogRef, currency: 'EUR', products: [
      { id: 1, active: true, variants: [{ id: 11, productId: 1, status: 'active', priceCents: 1000 }, { id: 12, productId: 1, status: 'active', priceCents: 1500 }] },
      { id: 2, active: true, variants: [{ id: 21, productId: 2, status: 'active', priceCents: 2000 }] },
      { id: 3, active: false, variants: [{ id: 31, productId: 3, status: 'draft', priceCents: 3000 }] },
    ] },
    request: { schemaVersion: 1, source: 'fixture', profile: 'company-offer-eur-cents-v1', id: 'request.fixture', version: 7,
      directoryRef: { ...directoryRef }, catalogRef: { ...catalogRef }, companyId: 'company.fixture', buyerContactId: 'contact.buyer',
      requestedAt: '2026-10-03T11:00:00.000Z', currency: 'EUR', lines: [{ productId: 1, variantId: 11, quantityUnits: 4 }, { productId: 2, variantId: 21, quantityUnits: 2 }] },
  };
}
function offer(overrides: Partial<CompanyOfferRevision> = {}): CompanyOfferRevision {
  return { id: 'offer.one', revision: 1, previousRevisionId: null, proposedBy: 'seller', createdAt: '2026-10-03T12:00:00.000Z', expiresAt: EXPIRY,
    lines: [{ productId: 1, variantId: 11, quantityUnits: 4, unitPriceCents: 900 }, { productId: 2, variantId: 21, quantityUnits: 2, unitPriceCents: 1800 }],
    shippingCents: 500, ...overrides };
}
function add(negotiation: CompanyNegotiation, revision: CompanyOfferRevision) {
  const result = appendCompanyOfferRevision({ negotiation, context: negotiation.context, command: { negotiationId: negotiation.id, expectedVersion: negotiation.version, revision } });
  expect(result.outcome).toBe('appended'); return result.negotiation;
}
function negotiation() {
  let result = createCompanyNegotiation({ id: 'negotiation.fixture', createdAt: '2026-10-03T11:30:00.000Z', context: fixtureContext() });
  result = add(result, offer());
  result = add(result, offer({ id: 'offer.two', revision: 2, previousRevisionId: 'offer.one', proposedBy: 'buyer', createdAt: '2026-10-03T13:00:00.000Z',
    expiresAt: '2026-10-11T12:00:00.000Z', lines: [{ productId: 1, variantId: 12, quantityUnits: 3, unitPriceCents: 1400 }], shippingCents: 0 }));
  return add(result, offer({ id: 'offer.three', revision: 3, previousRevisionId: 'offer.two', createdAt: CREATED,
    expiresAt: '2026-10-11T12:00:00.000Z', lines: [{ productId: 1, variantId: 12, quantityUnits: 3, unitPriceCents: 1350 }, { productId: 2, variantId: 21, quantityUnits: 1, unitPriceCents: 1750 }], shippingCents: 200 }));
}
function binding(revisionId = 'offer.one', terms: CompanyPreliminaryTerms = { preliminaryId: 'quote_fixture_01', depositCents: 2000, conversionGate: 'deposit' }): CompanyPreliminaryBinding {
  return { negotiation: negotiation(), revisionId, terms };
}
function create(value: unknown = binding(), createdAt = CREATED) {
  return createCompanyPreliminaryArtifact({ id: 'artifact.fixture', createdAt, binding: value });
}
function command(snapshot: CompanyPreliminarySnapshot, action: CompanyPreliminaryActionCommand['action'] = 'issue', occurredAt = ISSUED): CompanyPreliminaryActionCommand {
  return { id: `action.v${snapshot.order.version}.${action}`, artifactId: snapshot.artifact.id, expectedVersion: snapshot.order.version, action, occurredAt };
}
function apply(snapshot: CompanyPreliminarySnapshot, value: unknown, suppliedBinding: unknown = snapshot.artifact.binding) {
  return applyCompanyPreliminaryAction({ artifact: snapshot.artifact, binding: suppliedBinding, command: value });
}
function advance(snapshot: CompanyPreliminarySnapshot, action: CompanyPreliminaryActionCommand['action'] = 'issue', at = ISSUED) {
  const result = apply(snapshot, command(snapshot, action, at)); expect(result.outcome).toBe('applied'); return result.snapshot;
}
function preview(snapshot: CompanyPreliminarySnapshot) { return previewCompanyPreliminaryArtifact({ artifact: snapshot.artifact }); }
function errorFrom(operation: () => unknown): CompanyPreliminaryContractError {
  try { operation(); } catch (error) { expect(error).toBeInstanceOf(CompanyPreliminaryContractError); return error as CompanyPreliminaryContractError; }
  throw new Error('Se esperaba un error de contrato.');
}
function reason(operation: () => unknown, expected: CompanyPreliminaryContractReason = 'invalid_data') {
  expect(errorFrom(operation)).toMatchObject({ code: 'company_preliminary_contract_invalid', reason: expected });
}
function unpaid(snapshot: CompanyPreliminarySnapshot): void {
  expect(snapshot.order).toMatchObject({ paymentStatus: 'unpaid', paidCents: 0, convertedOrderId: null, convertedAt: null });
}
function frozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true); Object.values(value).forEach(frozen);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('binding histórico completo y creación explícita', () => {
  it('deriva una oferta histórica sin retargetear a la última y separa las tres versiones', () => {
    const original = binding(); const normalized = defineCompanyPreliminaryBinding(original); const snapshot = create(normalized);
    expect(snapshot.artifact.binding.negotiation.version).toBe(4); expect(snapshot.offer.offer.revision).toBe(1); expect(snapshot.order.version).toBe(1);
    expect(snapshot.order).toEqual(orders.createPreliminaryOrderDraft({ id: 'quote_fixture_01', currency: 'EUR', totalCents: 7700, depositCents: 2000, conversionGate: 'deposit', expiresAt: EXPIRY }));
    expect(snapshot.artifact.actions).toEqual([]); expect(snapshot.lastOccurredAt).toBe(CREATED);
    expect(snapshot.artifact).not.toHaveProperty('version'); expect(snapshot.artifact).not.toHaveProperty('order');
    expect(defineCompanyPreliminaryArtifact(snapshot.artifact)).toEqual(snapshot.artifact); expect(preview(snapshot)).toEqual(snapshot);
    expect(normalized).toEqual(original); expect(normalized.negotiation).not.toBe(original.negotiation); frozen(snapshot);
  });

  it('crecer otra copia de negociación no invalida lectura ni acciones con el corte original', () => {
    const historical = advance(create()); const stored = copy(historical);
    const updated = add(historical.artifact.binding.negotiation, offer({ id: 'offer.four', revision: 4, previousRevisionId: 'offer.three', createdAt: '2026-10-04T12:00:00.000Z' }));
    expect(preview(historical)).toEqual(stored);
    reason(() => apply(historical, historical.artifact.actions[0], { ...historical.artifact.binding, negotiation: updated }), 'binding_mismatch');
    const accepted = advance(historical, 'approve', APPROVED); expect(accepted.order.status).toBe('approved');
    expect(accepted.artifact.binding.negotiation.version).toBe(4); expect(updated.version).toBe(5);
  });

  it('otra oferta y otros términos comienzan desde un artefacto vacío sin heredar aprobación', () => {
    const approved = advance(advance(create()), 'approve', APPROVED);
    const newOffer = create({ ...approved.artifact.binding, revisionId: 'offer.two', terms: { preliminaryId: 'quote_fixture_02', depositCents: 0, conversionGate: 'approval' } });
    expect(newOffer.order).toMatchObject({ status: 'draft', totalCents: 4200, version: 1, issuedAt: null, approvedAt: null, depositCents: 0, conversionGate: 'approval' });
    expect(newOffer.artifact.actions).toEqual([]); unpaid(newOffer);
    reason(() => apply(approved, command(approved, 'cancel'), newOffer.artifact.binding), 'binding_mismatch');
    reason(() => create({ ...approved.artifact.binding, totalCents: 4200 }));
  });

  it('valida el corte completo y no recibe snapshots monetarios o crédito como autoridad', () => {
    const source = copy(binding()); source.negotiation.context.catalog.products[2]!.variants[0]!.priceCents = 10_000_001;
    reason(() => create(source), 'offer_invalid');
    const invalidHistory = copy(binding()); invalidHistory.negotiation.revisions[2]!.previousRevisionId = 'offer.one';
    reason(() => create(invalidHistory), 'offer_invalid');
    reason(() => create({ ...binding(), revisionId: 'offer.missing' }), 'offer_invalid');
    for (const extra of [{ currency: 'JPY' }, { totalCents: 1 }, { expiresAt: CREATED }, { creditReview: 'accepted' }]) reason(() => create({ ...binding(), ...extra }));
    const snapshot = create();
    for (const extra of [{ status: 'approved' }, { order: snapshot.order }, { version: 1 }, { paidCents: 0 }]) reason(() => defineCompanyPreliminaryArtifact({ ...snapshot.artifact, ...extra }));
    reason(() => previewCompanyPreliminaryArtifact({ artifact: snapshot.artifact, latest: binding().negotiation }));
  });

  it.each(['approval', 'deposit', 'full_payment'] as const)('conserva el gate explícito %s y delega la relación del depósito', conversionGate => {
    for (const depositCents of [0, 1, 7700]) {
      const value = binding('offer.one', { preliminaryId: 'quote_terms', depositCents, conversionGate });
      if (conversionGate === 'deposit' && depositCents === 0) reason(() => create(value), 'terms_invalid');
      else { const snapshot = create(value); expect(snapshot.order).toMatchObject({ depositCents, conversionGate }); unpaid(snapshot); }
    }
    reason(() => create(binding('offer.one', { preliminaryId: 'quote_terms', depositCents: 7701, conversionGate })), 'terms_invalid');
  });

  it('distingue errores escalares de términos y no recotiza un precio negociado alto', () => {
    for (const depositCents of [-0, -1, 1.5, NaN, Infinity, 1_000_000_001]) reason(() => create({ ...binding(), terms: { preliminaryId: 'quote_terms', depositCents, conversionGate: 'approval' } }));
    let high = createCompanyNegotiation({ id: 'negotiation.high', createdAt: CREATED, context: fixtureContext() });
    high = add(high, offer({ createdAt: CREATED, lines: [{ productId: 1, variantId: 11, quantityUnits: 1, unitPriceCents: 1_000_000_000 }], shippingCents: 0 }));
    const snapshot = create({ negotiation: high, revisionId: 'offer.one', terms: { preliminaryId: 'high', depositCents: 1_000_000_000, conversionGate: 'full_payment' } });
    expect(snapshot.order.totalCents).toBe(1_000_000_000); expect(snapshot.offer.context.catalog.products[0]!.variants[0]!.priceCents).toBe(1000);
  });

  it('no transforma estados descriptivos inactivos o crédito en permiso ni en otro workflow', () => {
    const value = copy(binding()); value.negotiation.context.directory.companies[0]!.state = 'inactive'; value.negotiation.context.directory.contacts[0]!.state = 'inactive';
    value.negotiation.context.catalog.products[0]!.active = false; value.negotiation.context.catalog.products[0]!.variants[0]!.status = 'archived';
    const snapshot = advance(advance(create(value)), 'approve', APPROVED);
    expect(snapshot.order.status).toBe('approved'); expect(snapshot.offer.context.directory.companies[0]!.state).toBe('inactive');
    expect(snapshot).not.toHaveProperty('eligible'); expect(snapshot).not.toHaveProperty('creditAvailable'); unpaid(snapshot);
  });
});

describe('ORD-008 determina exclusivamente los estados y las transiciones', () => {
  it('delega constructor, issue, approve y cancel reales y conserva el agregado público exacto', () => {
    const draftFn = vi.spyOn(orders, 'createPreliminaryOrderDraft'); const issueFn = vi.spyOn(orders, 'issuePreliminaryOrder');
    const approveFn = vi.spyOn(orders, 'approvePreliminaryOrder'); const cancelFn = vi.spyOn(orders, 'cancelPreliminaryOrder');
    const initial = create(); const issued = advance(initial); const approved = advance(issued, 'approve', APPROVED);
    const cancelled = advance(approved, 'cancel', '2026-10-11T12:00:00.000Z');
    expect(draftFn).toHaveBeenCalled(); expect(issueFn).toHaveBeenCalledWith(initial.order, ISSUED);
    expect(approveFn).toHaveBeenCalledWith(issued.order, APPROVED); expect(cancelFn).toHaveBeenCalledWith(approved.order);
    expect(issued.order).toEqual(orders.issuePreliminaryOrder(initial.order, ISSUED));
    expect(approved.order).toEqual(orders.approvePreliminaryOrder(issued.order, APPROVED));
    expect(cancelled.order).toEqual(orders.cancelPreliminaryOrder(approved.order));
    for (const value of [initial, issued, approved, cancelled]) { unpaid(value); expect(value.order.version).toBe(value.artifact.actions.length + 1); }
    expect(cancelled.order).toMatchObject({ status: 'cancelled', version: 4, issuedAt: ISSUED, approvedAt: APPROVED });
    expect(preview(cancelled)).toEqual(cancelled);
  });

  it('el rechazo nuevo es blocked y nunca registra intento, ID, fecha o versión', () => {
    const initial = create(); const candidate = command(initial, 'approve'); const result = apply(initial, candidate);
    expect(result).toEqual({ outcome: 'blocked', reason: 'transition_not_allowed', snapshot: initial });
    const issued = advance(initial);
    const reused = apply(issued, { ...candidate, expectedVersion: 2, occurredAt: APPROVED });
    expect(reused.outcome).toBe('applied'); expect(reused.snapshot.artifact.actions).toHaveLength(2);
    expect(initial.artifact.actions).toEqual([]);
  });

  it.each([CREATED, BEFORE_EXPIRY])('emitir antes de caducidad en %s es una acción explícita', at => {
    const initial = create(); const issued = advance(initial, 'issue', at); expect(issued.order).toMatchObject({ status: 'issued', issuedAt: at });
  });

  it.each([EXPIRY, AFTER_EXPIRY])('issue/approve en %s se bloquean sin expirar automáticamente', at => {
    const initial = create(); expect(apply(initial, command(initial, 'issue', at))).toMatchObject({ outcome: 'blocked', snapshot: { order: { status: 'draft', version: 1 } } });
    const issued = advance(initial); expect(apply(issued, command(issued, 'approve', at))).toMatchObject({ outcome: 'blocked', snapshot: { order: { status: 'issued', version: 2 } } });
    expect(preview(issued).order.status).toBe('issued');
  });

  it('expire explícito admite draft/issued en igualdad pero no approved', () => {
    const expireFn = vi.spyOn(orders, 'expirePreliminaryOrder'); const initial = create();
    expect(apply(initial, command(initial, 'expire', BEFORE_EXPIRY)).outcome).toBe('blocked');
    const expiredDraft = advance(initial, 'expire', EXPIRY); expect(expiredDraft.order).toMatchObject({ status: 'expired', version: 2 });
    const issued = advance(initial); const expiredIssued = advance(issued, 'expire', EXPIRY); expect(expiredIssued.order).toMatchObject({ status: 'expired', version: 3 });
    expect(expireFn).toHaveBeenCalledWith(issued.order, EXPIRY);
    const approved = advance(issued, 'approve', BEFORE_EXPIRY); expect(apply(approved, command(approved, 'expire', AFTER_EXPIRY)).outcome).toBe('blocked');
    unpaid(expiredDraft); unpaid(expiredIssued); unpaid(approved);
  });

  it('cancel tardío no ejecuta expire y los estados terminales rechazan nuevas acciones', () => {
    const initial = create(); const expireFn = vi.spyOn(orders, 'expirePreliminaryOrder');
    const cancelled = advance(initial, 'cancel', AFTER_EXPIRY); expect(cancelled.order.status).toBe('cancelled'); expect(expireFn).not.toHaveBeenCalled();
    const expired = advance(initial, 'expire', EXPIRY);
    for (const terminal of [cancelled, expired]) for (const action of ['issue', 'approve', 'expire', 'cancel'] as const) {
      expect(apply(terminal, command(terminal, action, '2026-10-12T12:00:00.000Z'))).toMatchObject({ outcome: 'blocked', snapshot: terminal });
    }
  });

  it('no llama pago, plan de pago o conversión aunque el gate se llame approval', () => {
    const forbidden = vi.fn(() => { throw new Error('No pertenece a este corte'); });
    vi.spyOn(orders, 'nextPreliminaryOrderPayment').mockImplementation(forbidden);
    vi.spyOn(orders, 'applyConfirmedPreliminaryOrderPayment').mockImplementation(forbidden);
    vi.spyOn(orders, 'convertPreliminaryOrder').mockImplementation(forbidden);
    const initial = create(binding('offer.one', { preliminaryId: 'quote_no_payment', depositCents: 0, conversionGate: 'approval' }));
    const approved = advance(advance(initial), 'approve', APPROVED); expect(approved.order.status).toBe('approved');
    expect(forbidden).not.toHaveBeenCalled(); unpaid(approved);
    for (const action of ['pay', 'convert', 'next_payment']) reason(() => apply(approved, { ...command(approved), action }));
  });
});

describe('reconstrucción, replay y conflictos contra binding completo', () => {
  it('un replay de issue conserva acciones posteriores y la versión actual', () => {
    const issued = advance(create()); const current = advance(advance(issued, 'approve', APPROVED), 'cancel', EXPIRY);
    const result = apply(current, issued.artifact.actions[0]); expect(result).toEqual({ outcome: 'replayed', snapshot: current });
    expect(result.snapshot.order.version).toBe(4); expect(result.snapshot.order.status).toBe('cancelled'); frozen(result);
  });

  it('ID reutilizado compara todo payload y un ID ajeno falla antes', () => {
    const issued = advance(create()); const original = issued.artifact.actions[0]!;
    for (const change of [{ action: 'cancel' }, { expectedVersion: 2 }, { occurredAt: CREATED }]) {
      expect(apply(issued, { ...original, ...change })).toMatchObject({ outcome: 'conflict', reason: 'command_id_reused', snapshot: issued });
    }
    reason(() => apply(issued, { ...original, artifactId: 'artifact.other' }), 'reference_mismatch');
    expect(apply(issued, command(issued, 'approve', APPROVED))).toMatchObject({ outcome: 'applied' });
  });

  it('CAS obsoleto precede cronología contra cabeza y no consume ID', () => {
    const issued = advance(create()); const candidate = { ...command(issued, 'approve', CREATED), expectedVersion: 1 };
    expect(apply(issued, candidate)).toMatchObject({ outcome: 'conflict', reason: 'version_mismatch', snapshot: issued });
    reason(() => apply(issued, { ...candidate, expectedVersion: 2 }), 'invalid_chronology');
    expect(apply(issued, { ...candidate, expectedVersion: 2, occurredAt: APPROVED }).outcome).toBe('applied');
    reason(() => apply(issued, { ...candidate, occurredAt: 'not-a-date' }));
  });

  it('diferencia válida en cualquier parte del binding gana ante replay y CAS', () => {
    const issued = advance(create());
    const changes: Array<(b: Mutable<CompanyPreliminaryBinding>) => void> = [
      b => { b.revisionId = 'offer.two'; }, b => { b.terms.preliminaryId = 'quote_other'; },
      b => { b.terms.depositCents = 1000; }, b => { b.terms.conversionGate = 'approval'; },
      b => { b.negotiation.context.directory.companies[0]!.displayName = 'Etiqueta revisada'; },
      b => { b.negotiation.context.catalog.products[2]!.variants[0]!.priceCents = 1; },
      b => { b.negotiation.revisions[2]!.shippingCents++; },
      b => { b.negotiation.context.request.version++; },
      b => { b.negotiation.context.directory.capturedAt = CREATED; b.negotiation.context.request.directoryRef.capturedAt = CREATED; },
    ];
    for (const change of changes) {
      const value = copy(issued.artifact.binding); change(value);
      reason(() => apply(issued, issued.artifact.actions[0], value), 'binding_mismatch');
      reason(() => apply(issued, { ...command(issued), expectedVersion: 999 }, value), 'binding_mismatch');
    }
    const corrupted = copy(issued.artifact.binding); corrupted.negotiation.revisions[2]!.shippingCents = -1;
    reason(() => apply(issued, issued.artifact.actions[0], corrupted), 'offer_invalid');
    reason(() => apply(issued, issued.artifact.actions[0], { ...issued.artifact.binding, terms: { ...issued.artifact.binding.terms, depositCents: 0 } }), 'terms_invalid');
  });

  it('un rechazo dentro de la historia es error, no blocked ni conflicto inocuo', () => {
    const initial = create(); const invalidHistory = { ...initial.artifact, actions: [command(initial, 'approve')] };
    reason(() => defineCompanyPreliminaryArtifact(invalidHistory), 'invalid_history');
    reason(() => applyCompanyPreliminaryAction({ artifact: invalidHistory, binding: initial.artifact.binding, command: { ...command(initial), expectedVersion: 99 } }), 'invalid_history');
    const issued = advance(initial); const approved = advance(issued, 'approve', APPROVED);
    const changes: Array<(a: Mutable<typeof approved.artifact>) => void> = [
      a => { a.actions[1]!.id = a.actions[0]!.id; }, a => { a.actions[1]!.artifactId = 'artifact.other'; },
      a => { a.actions[1]!.expectedVersion = 1; }, a => { a.actions[1]!.action = 'issue'; },
    ];
    for (const change of changes) { const raw = copy(approved.artifact); change(raw); reason(() => defineCompanyPreliminaryArtifact(raw), 'invalid_history'); }
    const regressed = copy(approved.artifact); regressed.actions[1]!.occurredAt = CREATED;
    reason(() => defineCompanyPreliminaryArtifact(regressed), 'invalid_chronology');
  });

  it('reconstruye hasta tres acciones y no admite un historial artificial de cuatro', () => {
    const current = advance(advance(advance(create()), 'approve', APPROVED), 'cancel', EXPIRY);
    expect(current.artifact.actions).toHaveLength(3); expect(current.order.version).toBe(4);
    expect(apply(current, command(current, 'cancel', EXPIRY)).outcome).toBe('blocked');
    reason(() => defineCompanyPreliminaryArtifact({ ...current.artifact, actions: [...current.artifact.actions, command(current, 'cancel', EXPIRY)] }), 'invalid_history');
    expect(COMPANY_PRELIMINARY_LIMITS.recordedActions).toBe(3);
  });
});

describe('fechas e invariantes fuera del catch del reducer', () => {
  it('la captura no precede la última propuesta incluida, incluso seleccionando la primera', () => {
    reason(() => create(binding(), '2026-10-03T13:00:00.000Z'), 'invalid_chronology');
    const historical = binding(); const shorter = { ...historical.negotiation, version: 2, revisions: [historical.negotiation.revisions[0]!] };
    expect(create({ ...historical, negotiation: shorter }, '2026-10-03T13:00:00.000Z').order.status).toBe('draft');
    const futureMetadata = copy(binding()); futureMetadata.negotiation.context.catalog.capturedAt = '9999-12-31T23:59:59.999Z';
    futureMetadata.negotiation.context.request.catalogRef.capturedAt = futureMetadata.negotiation.context.catalog.capturedAt;
    expect(create(futureMetadata).order.status).toBe('draft');
  });

  it('un borrador posterior a caducidad se inspecciona sin reloj y se expira solo por acción', () => {
    const historical = create(binding(), AFTER_EXPIRY); expect(preview(historical).order.status).toBe('draft');
    expect(apply(historical, command(historical, 'issue', AFTER_EXPIRY)).outcome).toBe('blocked');
    expect(advance(historical, 'expire', AFTER_EXPIRY).order.status).toBe('expired');
    reason(() => apply(historical, command(historical, 'cancel', EXPIRY)), 'invalid_chronology');
  });

  it.each(['0001-01-01', '0099-12-31', '1900-02-28', '2000-02-29', '9999-12-31'])('admite fecha %s con metadata año cero separada', day => {
    const raw = copy(binding()); raw.negotiation.context.directory.capturedAt = '0000-01-01T00:00:00.000Z';
    raw.negotiation.context.request.directoryRef.capturedAt = raw.negotiation.context.directory.capturedAt;
    raw.negotiation.context.catalog.capturedAt = '0000-01-01T00:00:00.000Z'; raw.negotiation.context.request.catalogRef.capturedAt = raw.negotiation.context.catalog.capturedAt;
    const at = `${day}T00:00:00.000Z`; raw.negotiation.context.request.requestedAt = at; raw.negotiation.createdAt = at;
    raw.negotiation.revisions.forEach(revision => { revision.createdAt = at; revision.expiresAt = `${day}T00:00:00.001Z`; });
    const initial = create(raw, at); const issued = advance(initial, 'issue', at); const approved = advance(issued, 'approve', at);
    expect(approved.order.approvedAt).toBe(at); expect(advance(approved, 'cancel', at).order.status).toBe('cancelled');
  });

  it('rechaza fechas inexistentes/no canónicas y año cero de eventos propios', () => {
    for (const at of ['0000-01-01T00:00:00.000Z', '1900-02-29T00:00:00.000Z', '2026-04-31T00:00:00.000Z', '2026-10-03T14:00:00Z', '2026-10-03T14:00:00.000+00:00']) {
      reason(() => create(binding(), at)); const initial = create(); reason(() => apply(initial, command(initial, 'issue', at)));
    }
  });

  it('salidas inválidas son reducer_failure, nunca un bloqueo de transición', () => {
    const initial = create();
    const invalidOutputs: Array<(order: orders.PreliminaryOrder) => unknown> = [
      order => ({ ...order, status: 'converted', version: 2 }), order => ({ ...order, status: 'alien', version: 2 }),
      order => ({ ...order, status: 'issued', issuedAt: ISSUED, version: 2, paidCents: 1 }),
      order => ({ ...order, status: 'issued', issuedAt: ISSUED, version: 2, totalCents: 1 }),
      order => ({ ...order, status: 'issued', issuedAt: ISSUED, version: 3 }),
      order => new Proxy({ ...order, status: 'issued', issuedAt: ISSUED, version: 2 }, { ownKeys() { throw new RangeError('private-output'); } }),
    ];
    for (const makeOutput of invalidOutputs) {
      const spy = vi.spyOn(orders, 'issuePreliminaryOrder').mockImplementation(order => makeOutput(order) as orders.PreliminaryOrder);
      const error = errorFrom(() => apply(initial, command(initial))); expect(error.reason).toBe('reducer_failure'); expect(error.message).not.toMatch(/private-output/); spy.mockRestore();
    }
  });

  it('no confunde salida regresiva del constructor con términos inválidos', () => {
    const createDraft = orders.createPreliminaryOrderDraft;
    vi.spyOn(orders, 'createPreliminaryOrderDraft').mockImplementation(input => ({ ...createDraft(input), status: 'cancelled' }));
    reason(() => create(), 'reducer_failure');
  });

  it('redacta errores inesperados y rechazo del reducer sin analizar su texto', () => {
    const initial = create(); const spy = vi.spyOn(orders, 'issuePreliminaryOrder').mockImplementation(() => { throw new Error('secret-contact'); });
    const unexpected = errorFrom(() => apply(initial, command(initial))); expect(unexpected.reason).toBe('reducer_failure'); expect(unexpected.message).not.toMatch(/secret-contact/);
    spy.mockImplementation(() => { throw new RangeError('secret-terms'); });
    expect(apply(initial, command(initial))).toEqual({ outcome: 'blocked', reason: 'transition_not_allowed', snapshot: initial });
    const artifact = { ...initial.artifact, actions: [command(initial)] }; reason(() => defineCompanyPreliminaryArtifact(artifact), 'invalid_history');
  });

  it('un futuro reducer que aceptase una cuarta acción no amplía este perfil', () => {
    const current = advance(advance(advance(create()), 'approve', APPROVED), 'cancel', EXPIRY);
    vi.spyOn(orders, 'cancelPreliminaryOrder').mockImplementation(order => Object.freeze({ ...order, status: 'cancelled', version: order.version + 1 }));
    reason(() => apply(current, command(current, 'cancel', EXPIRY)), 'history_limit');
  });

  it('los enums legacy mutables no amplían vocabulario de entrada o salida', () => {
    const gates = orders.PRELIMINARY_ORDER_CONVERSION_GATES as unknown as string[];
    const states = orders.PRELIMINARY_ORDER_STATUSES as unknown as string[];
    gates.push('alien'); states.push('alien');
    try {
      reason(() => create({ ...binding(), terms: { preliminaryId: 'quote_enum', depositCents: 0, conversionGate: 'alien' } }));
      const initial = create(); reason(() => apply(initial, { ...command(initial), action: 'alien' }));
      vi.spyOn(orders, 'issuePreliminaryOrder').mockImplementation(order => ({ ...order, status: 'alien' as orders.PreliminaryOrder['status'], version: 2 }));
      reason(() => apply(initial, command(initial)), 'reducer_failure');
    } finally { gates.pop(); states.pop(); }
  });
});

describe('frontera desconocida y ausencia de efectos', () => {
  it('respeta IDs diferentes sin truncar ni sustituir caracteres', () => {
    for (const preliminaryId of ['1', 'q'.repeat(200), 'quote:with_underscore-and-digit9']) expect(create(binding('offer.one', { preliminaryId, depositCents: 0, conversionGate: 'approval' })).order.id).toBe(preliminaryId);
    for (const preliminaryId of ['', 'quote.with.dot', 'q'.repeat(201), '_quote', 'quote_', 'Quote']) reason(() => create(binding('offer.one', { preliminaryId, depositCents: 0, conversionGate: 'approval' })));
    const source = binding(); expect(createCompanyPreliminaryArtifact({ id: 'a'.repeat(100), createdAt: CREATED, binding: source }).artifact.id).toHaveLength(100);
    reason(() => createCompanyPreliminaryArtifact({ id: 'a'.repeat(101), createdAt: CREATED, binding: source }));
    const initial = create(); expect(apply(initial, { ...command(initial), id: 'a'.repeat(100) }).outcome).toBe('applied');
    reason(() => apply(initial, { ...command(initial), id: 'a'.repeat(101) }));
    for (const expectedVersion of [-0, 0, -1, 1.5, 1_000_000_001]) reason(() => apply(initial, { ...command(initial), expectedVersion }));
  });

  it('deep-freeze y copias no se alteran al mutar las entradas', () => {
    const input = copy(binding()); const initial = create(input); const saved = copy(initial);
    input.terms.depositCents = 1; input.negotiation.revisions[0]!.shippingCents = 1;
    expect(initial).toEqual(saved); frozen(initial); frozen(advance(initial));
    expect(() => Object.defineProperty(initial.artifact.binding.terms, 'depositCents', { value: 1 })).toThrow();
  });

  it('normaliza artefacto y binding antes de que un comando modifique sus originales', () => {
    const issued = advance(create()); const artifact = copy(issued.artifact); const supplied = copy(issued.artifact.binding);
    const input = new Proxy(copy(issued.artifact.actions[0]!), { ownKeys(target) {
      artifact.binding.terms.depositCents = 1; artifact.actions[0]!.occurredAt = CREATED; supplied.negotiation.revisions[0]!.shippingCents = 1;
      return Reflect.ownKeys(target);
    } });
    expect(applyCompanyPreliminaryAction({ artifact, binding: supplied, command: input })).toEqual({ outcome: 'replayed', snapshot: issued });
    const raw = copy(binding()); const terms = raw.terms;
    raw.terms = new Proxy(terms, { ownKeys(target) { raw.negotiation.revisions[0]!.shippingCents = 999; return Reflect.ownKeys(target); } });
    expect(create(raw).order.totalCents).toBe(7700);
  });

  it('rechaza getters en las cinco APIs y mantiene errores fijos sin cause', () => {
    let getters = 0; const initial = create();
    const getter = <T extends object>(value: T, key: keyof T): T => Object.defineProperty({ ...value }, key, { enumerable: true, get() { getters++; throw new Error('private-email'); } });
    reason(() => defineCompanyPreliminaryBinding(getter(binding(), 'terms')));
    reason(() => defineCompanyPreliminaryArtifact(getter(initial.artifact, 'actions')));
    reason(() => createCompanyPreliminaryArtifact(getter({ id: 'artifact.fixture', createdAt: CREATED, binding: binding() }, 'binding')));
    reason(() => previewCompanyPreliminaryArtifact(getter({ artifact: initial.artifact }, 'artifact')));
    reason(() => apply(initial, getter(command(initial), 'action')));
    const hostile = new Proxy({ artifact: initial.artifact }, { ownKeys() { throw new Error('private-email'); } });
    const error = errorFrom(() => previewCompanyPreliminaryArtifact(hostile)); expect(error.message).toBe('Los datos no cumplen el contrato preliminar de empresa.'); expect(error).not.toHaveProperty('cause');
    const remote = copy(binding()); remote.negotiation = new Proxy(remote.negotiation, { getPrototypeOf() { throw new Error('private-profile'); } });
    expect(errorFrom(() => create(remote)).reason).toBe('offer_invalid'); expect(getters).toBe(0);
  });

  it('no ejecuta getters de salida ni propaga fallos de su introspección', () => {
    const initial = create(); let getters = 0;
    vi.spyOn(orders, 'issuePreliminaryOrder').mockImplementation(order => Object.defineProperty({ ...order, version: 2 }, 'status', { enumerable: true, get() { getters++; return 'issued'; } }));
    reason(() => apply(initial, command(initial)), 'reducer_failure'); expect(getters).toBe(0);
  });

  it('rechaza prototipos, símbolos, extras ocultos y arrays no canónicos; admite datos null-prototype', () => {
    const initial = create(); const hidden = { ...initial.artifact }; Object.defineProperty(hidden, 'secret', { value: true }); reason(() => defineCompanyPreliminaryArtifact(hidden));
    reason(() => defineCompanyPreliminaryArtifact({ ...initial.artifact, [Symbol('extra')]: true }));
    reason(() => defineCompanyPreliminaryArtifact(Object.assign(Object.create({ inherited: true }) as object, initial.artifact)));
    reason(() => defineCompanyPreliminaryArtifact({ ...initial.artifact, actions: Array(1) }));
    reason(() => defineCompanyPreliminaryArtifact({ ...initial.artifact, actions: Object.assign([], { extra: true }) }));
    const own = Object.assign(Object.create(null) as Record<string, unknown>, initial.artifact); expect(defineCompanyPreliminaryArtifact(own)).toEqual(initial.artifact);
  });

  it('no consulta reloj, red, storage ni temporizadores', () => {
    const forbidden = vi.fn(() => { throw new Error('Efecto prohibido'); });
    for (const name of ['fetch', 'setTimeout', 'setInterval', 'requestAnimationFrame']) vi.stubGlobal(name, forbidden);
    vi.stubGlobal('localStorage', { getItem: forbidden, setItem: forbidden }); vi.stubGlobal('sessionStorage', { getItem: forbidden, setItem: forbidden });
    const NativeDate = Date;
    class ExplicitDate extends NativeDate { constructor(value: string | number) { if (arguments.length === 0) throw new Error('Fecha implícita'); super(value); } static override now() { return forbidden(); } }
    vi.stubGlobal('Date', ExplicitDate);
    const initial = create(); const issued = advance(initial); const current = advance(issued, 'approve', APPROVED);
    expect(preview(current)).toEqual(current); expect(apply(current, issued.artifact.actions[0]).outcome).toBe('replayed'); expect(forbidden).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPANY_DOCUMENT_EVIDENCE_LIMITS, CompanyDocumentContractError,
  defineCompanyDocumentRequest, defineCompanyDocumentResponse, evaluateCompanyDocumentEvidence,
  createCompanyNegotiation, appendCompanyOfferRevision,
  type CompanyPurchaseOrderBinding, type CompanyPurchaseOrderDeclaration, type CompanyOfferRevision,
  type CompanyDocumentRequest, type CompanyDocumentResponse, type CompanyDocumentContractReason,
  type CompanyObservedDocument,
} from '../src/modules/companies';
import * as purchaseContract from '../src/modules/companies/domain/company-purchase-order';

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
const EVALUATED = '2026-10-03T14:30:00.000Z';
const OBSERVED = '2026-10-03T14:15:00.000Z';
const ADAPTER = 'adapter.document.fixture';
function query(overrides: Partial<CompanyDocumentRequest> = {}): CompanyDocumentRequest {
  return { schemaVersion: 1, source: 'fixture', profile: 'company-commercial-document-evidence-v1',
    id: 'document.query.example', declaration: declaration(), ...overrides };
}
function document(overrides: Partial<CompanyObservedDocument> = {}): CompanyObservedDocument {
  return { reference: 'document.example.1', companyId: 'company.a', purchaseOrderNumber: 'PO 2026/0042-Á',
    commercialAmount: { basis: 'bound_offer_total_as_declared', currency: 'EUR', amountCents: 7700 }, ...overrides };
}
function response(request = query(), observedDocument: CompanyObservedDocument | null = document()) {
  return { source: 'fixture' as const, adapterId: ADAPTER, request, outcome: 'evidence' as const,
    evidence: { ref: 'evidence.document.example', observedAt: OBSERVED, coverage: 'complete' as const, document: observedDocument } };
}
function evaluate(request = query(), result: unknown = response(request), evaluatedAt = EVALUATED) {
  return evaluateCompanyDocumentEvidence({ request, expectedAdapterId: ADAPTER, evaluatedAt, response: result });
}
function errorFrom(operation: () => unknown): CompanyDocumentContractError {
  try { operation(); } catch (error) { expect(error).toBeInstanceOf(CompanyDocumentContractError); return error as CompanyDocumentContractError; }
  throw new Error('Se esperaba un error de contrato.');
}
function reason(operation: () => unknown, expected: CompanyDocumentContractReason = 'invalid_data') {
  expect(errorFrom(operation)).toMatchObject({ code: 'company_document_contract_invalid', reason: expected });
}
function frozen(input: unknown): void {
  if (input !== null && typeof input === 'object') { expect(Object.isFrozen(input)).toBe(true); Object.values(input).forEach(frozen); }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('documento comercial observado frente a oferta y PO declaradas', () => {
  it('derives the historical offer through the real contract and does not compare the two document tokens', () => {
    const request = query();
    const result = evaluate(request);
    expect(result).toMatchObject({ source: 'fixture', expectedAdapterId: ADAPTER, request, evaluatedAt: EVALUATED,
      outcome: 'observed', reason: null, expected: { companyId: 'company.a', purchaseOrderNumber: 'PO 2026/0042-Á',
        commercialAmount: { amountCents: 7700 } }, observation: { asOf: OBSERVED, document: document() },
      comparisons: { company: { outcome: 'matches' }, purchaseOrder: { outcome: 'matches' },
        amount: { outcome: 'compared', asOf: OBSERVED, deltaCents: 0, position: 'equal_declared' } } });
    expect(request.declaration.purchaseOrder!.documentReference).not.toBe(document().reference);
    for (const key of ['response', 'approved', 'paid', 'debt', 'order', 'invoice', 'eligible', 'reconciled']) expect(result).not.toHaveProperty(key);
    frozen(result);
  });

  it('keeps every unknown cause explicit and retains metadata only where an observation was declared', () => {
    const request = query(); const full = response(request);
    const unavailable = (reason: 'not_configured' | 'unavailable' | 'unsupported'): CompanyDocumentResponse =>
      ({ source: 'fixture', adapterId: ADAPTER, request, outcome: 'unavailable', reason });
    const cases: readonly [unknown, string, boolean][] = [
      [null, 'missing_response', false], [unavailable('not_configured'), 'not_configured', false],
      [unavailable('unavailable'), 'unavailable', false], [unavailable('unsupported'), 'unsupported', false],
      [{ ...full, evidence: { ...full.evidence, observedAt: '2026-10-03T15:00:00.000Z' } }, 'future_observation', true],
      [{ ...full, evidence: { ...full.evidence, coverage: 'incomplete', document: null } }, 'incomplete_evidence', true],
      [response(request, null), 'document_not_provided', true],
    ];
    for (const [input, expectedReason, metadata] of cases) {
      const result = evaluate(request, input);
      expect(result).toMatchObject({ outcome: 'unknown', reason: expectedReason, observation: null, comparisons: null,
        expected: { commercialAmount: { amountCents: 7700 } } });
      expect(result.evidenceMetadata !== null).toBe(metadata);
      expect(result).not.toHaveProperty('response');
      if (metadata) expect(result.evidenceMetadata).toEqual((() => {
        const valid = defineCompanyDocumentResponse(input);
        if (valid.outcome !== 'evidence') throw new Error('Fixture inválido.');
        const { ref, observedAt, coverage } = valid.evidence; return { ref, observedAt, coverage };
      })());
      frozen(result);
    }
  });

  it('makes time a historical observation cut without TTL, emission chronology or an implicit clock', () => {
    const request = query(); const evidence = response(request);
    expect(evaluate(request, evidence, '2026-10-03T14:14:59.999Z')).toMatchObject({ outcome: 'unknown', reason: 'future_observation' });
    for (const at of [OBSERVED, EVALUATED, '9999-12-31T23:59:59.999Z']) {
      expect(evaluate(request, evidence, at)).toMatchObject({ outcome: 'observed', observation: { asOf: OBSERVED } });
    }
    const incomplete = { ...evidence, evidence: { ...evidence.evidence, coverage: 'incomplete', document: null } };
    expect(evaluate(request, incomplete, RECORDED)).toMatchObject({ reason: 'future_observation' });
    expect(evaluate(request, incomplete, OBSERVED)).toMatchObject({ reason: 'incomplete_evidence' });
    for (const at of ['0001-01-01T00:00:00.000Z', '0099-12-31T23:59:59.999Z', '2000-02-29T00:00:00.000Z']) {
      const old = { ...evidence, evidence: { ...evidence.evidence, observedAt: at } };
      expect(evaluate(request, old, at)).toMatchObject({ outcome: 'observed', observation: { asOf: at } });
    }
  });

  it('preserves inactive companies, expired offers and year-zero directory metadata without granting authority', () => {
    const request = copy(query());
    const context = request.declaration.binding.negotiation.context;
    context.directory.companies[0]!.state = 'inactive';
    context.directory.contacts[0]!.state = 'inactive';
    context.directory.capturedAt = '0000-01-01T00:00:00.000Z';
    context.request.directoryRef.capturedAt = context.directory.capturedAt;
    const result = evaluate(request, response(request), AFTER);
    expect(result).toMatchObject({ outcome: 'observed', comparisons: { amount: { deltaCents: 0 } } });
    expect(result.request.declaration.binding.negotiation.context.directory.companies[0]!.state).toBe('inactive');
  });

  it('distinguishes missing PO, missing support and missing observed number without null equality', () => {
    const noPo = query({ declaration: declaration({ purchaseOrder: null }) });
    const absent = evaluate(noPo, response(noPo, document({ purchaseOrderNumber: null })));
    expect(absent).toMatchObject({ outcome: 'observed', comparisons: {
      purchaseOrder: { outcome: 'unknown', reason: 'expected_not_provided', expected: null, observed: null },
      amount: { outcome: 'unknown', reason: 'expected_po_not_provided', observed: null, asOf: null, deltaCents: null, position: null },
    } });
    const input = declaration(); const noSupport = query({ declaration: { ...input,
      purchaseOrder: { ...input.purchaseOrder!, documentReference: null } } });
    expect(evaluate(noSupport)).toMatchObject({ comparisons: { amount: { outcome: 'compared', deltaCents: 0 } } });
    const request = query();
    expect(evaluate(request, response(request, document({ purchaseOrderNumber: null })))).toMatchObject({ comparisons: {
      purchaseOrder: { outcome: 'unknown', reason: 'observed_not_provided' }, amount: { reason: 'observed_po_not_provided' },
    } });
  });

  it('keeps foreign buyer data descriptive while withholding all monetary attribution', () => {
    const request = query();
    for (const companyId of ['company.b', 'company.unknown']) {
      const foreign = document({ companyId }); const result = evaluate(request, response(request, foreign));
      expect(result).toMatchObject({ outcome: 'observed', observation: { document: foreign }, comparisons: {
        company: { outcome: 'differs', expected: 'company.a', observed: companyId }, purchaseOrder: { outcome: 'matches' },
        amount: { outcome: 'unknown', reason: 'company_mismatch', observed: null, asOf: null, deltaCents: null, position: null },
      } });
    }
  });

  it('orders attribution blockers without hiding the independent field comparisons', () => {
    const configured = query(); const noPo = query({ declaration: declaration({ purchaseOrder: null }) });
    const cases: readonly [CompanyDocumentRequest, Partial<CompanyObservedDocument>, string][] = [
      [noPo, { companyId: null, purchaseOrderNumber: null, commercialAmount: null }, 'company_not_provided'],
      [noPo, { companyId: 'company.other', purchaseOrderNumber: null, commercialAmount: null }, 'company_mismatch'],
      [noPo, { purchaseOrderNumber: null, commercialAmount: null }, 'expected_po_not_provided'],
      [configured, { purchaseOrderNumber: null, commercialAmount: null }, 'observed_po_not_provided'],
      [configured, { purchaseOrderNumber: 'PO other', commercialAmount: null }, 'po_mismatch'],
      [configured, { commercialAmount: null }, 'commercial_amount_not_provided'],
    ];
    for (const [request, patch, expectedReason] of cases) {
      const result = evaluate(request, response(request, document(patch)));
      expect(result).toMatchObject({ outcome: 'observed', comparisons: { amount: { outcome: 'unknown', reason: expectedReason,
        observed: null, asOf: null, deltaCents: null, position: null } } });
    }
  });

  it('compares exact safe integers with signed deltas, including observed zero and MAX_SAFE', () => {
    const request = query();
    for (const amountCents of [0, 1, 7200, 7700, 8200, Number.MAX_SAFE_INTEGER]) {
      const result = evaluate(request, response(request, document({ commercialAmount: {
        basis: 'bound_offer_total_as_declared', currency: 'EUR', amountCents,
      } })));
      const deltaCents = Number(BigInt(amountCents) - 7700n);
      expect(result).toMatchObject({ comparisons: { amount: { outcome: 'compared', deltaCents,
        position: deltaCents < 0 ? 'below_declared' : deltaCents > 0 ? 'above_declared' : 'equal_declared' } } });
    }
    expect(COMPANY_DOCUMENT_EVIDENCE_LIMITS.amountCents).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('derives minimum and maximum offered totals rather than trusting the catalog price or caller money', () => {
    for (const expected of [1, 1_000_000_000]) {
      const request = copy(query()); const negotiation = request.declaration.binding.negotiation;
      negotiation.revisions = [{ ...negotiation.revisions[0]!,
        lines: [{ productId: 1, variantId: 11, quantityUnits: 1, unitPriceCents: expected }], shippingCents: 0 }];
      negotiation.version = 2;
      for (const observed of [0, Number.MAX_SAFE_INTEGER]) {
        const result = evaluate(request, response(request, document({ commercialAmount: {
          basis: 'bound_offer_total_as_declared', currency: 'EUR', amountCents: observed,
        } })));
        expect(result).toMatchObject({ expected: { commercialAmount: { amountCents: expected } },
          comparisons: { amount: { deltaCents: Number(BigInt(observed) - BigInt(expected)) } } });
      }
    }
  });
});

describe('correlación completa y frontera estricta', () => {
  it('rejects every valid changed query before unavailable/future can conceal the mismatch', () => {
    const request = query();
    const mutations: ((input: Mutable<CompanyDocumentRequest>) => void)[] = [
      q => { q.id = 'query.changed'; },
      q => { q.declaration.id = 'po.changed'; },
      q => { q.declaration.version = 2; },
      q => { q.declaration.recordedAt = AFTER; },
      q => { q.declaration.purchaseOrder!.number = 'PO other'; },
      q => { q.declaration.purchaseOrder!.documentReference = 'support.other'; },
      q => { q.declaration.purchaseOrder = null; },
      q => { q.declaration.binding.revisionId = 'offer.two'; },
      q => { q.declaration.binding.negotiation.revisions[2]!.shippingCents = 999; },
      q => { q.declaration.binding.negotiation.context.catalog.products[2]!.variants[0]!.priceCents = 3333; },
      q => { q.declaration.binding.negotiation.context.directory.companies[1]!.displayName = 'Otro alias'; },
      q => { q.declaration.binding.negotiation.context.request.version = 2; },
      q => { const c = q.declaration.binding.negotiation.context; c.catalog.ref = c.request.catalogRef.ref = 'catalog.changed'; },
      q => { const c = q.declaration.binding.negotiation.context; c.directory.version = c.request.directoryRef.version = 3; },
    ];
    for (const mutate of mutations) {
      const foreign = copy(request); mutate(foreign);
      expect(defineCompanyDocumentRequest(foreign)).not.toEqual(defineCompanyDocumentRequest(request));
      const unavailable = defineCompanyDocumentResponse({ source: 'fixture', adapterId: ADAPTER, request: foreign,
        outcome: 'unavailable', reason: 'not_configured' });
      reason(() => evaluate(request, unavailable), 'request_mismatch');
      reason(() => evaluate(request, response(foreign), RECORDED), 'request_mismatch');
    }
    reason(() => evaluate(request, { ...response(request), adapterId: 'adapter.other' }, RECORDED), 'adapter_mismatch');
    reason(() => evaluateCompanyDocumentEvidence({ request, expectedAdapterId: undefined, evaluatedAt: EVALUATED, response: null }));
  });

  it('accepts canonical collection permutations but not arbitrary extra money or context', () => {
    const request = query(); const reordered = copy(request); const n = reordered.declaration.binding.negotiation;
    n.context.directory.companies.reverse(); n.context.directory.contacts.reverse(); n.context.catalog.products.reverse();
    n.context.request.lines.reverse(); n.revisions[0]!.lines.reverse();
    expect(evaluate(request, response(reordered))).toMatchObject({ outcome: 'observed' });
    reason(() => defineCompanyDocumentRequest({ ...request, expectedAmountCents: 1 }));
    reason(() => evaluateCompanyDocumentEvidence({ request, expectedAdapterId: ADAPTER, evaluatedAt: EVALUATED, response: null, expected: {} }));
  });

  it('validates the full historical context even for missing responses and absent PO', () => {
    const request = copy(query()); request.declaration.purchaseOrder = null;
    request.declaration.binding.negotiation.context.catalog.products[2]!.variants[0]!.productId = 1;
    reason(() => evaluate(request, null), 'purchase_order_invalid');
    const invalidHistorical = copy(query()); invalidHistorical.declaration.binding.negotiation.revisions[2]!.lines[0]!.unitPriceCents = -1;
    reason(() => evaluate(invalidHistorical, null), 'purchase_order_invalid');
  });

  it('rejects malformed observed data before future/incomplete or mismatched adapter diagnoses', () => {
    const request = query(); const input = copy(response(request)); input.evidence.observedAt = '2026-10-04T00:00:00.000Z';
    input.evidence.document!.commercialAmount!.amountCents = -1;
    reason(() => evaluate(request, input));
    reason(() => evaluate(request, { ...input, adapterId: 'adapter.other' }));
    reason(() => defineCompanyDocumentResponse({ ...response(request), evidence: { ...response(request).evidence, coverage: 'incomplete' } }));
    reason(() => defineCompanyDocumentResponse({ source: 'fixture', adapterId: ADAPTER, request, outcome: 'unavailable', reason: 'unavailable', evidence: null }));
  });

  it('requires explicit EUR commercial basis and never treats a fiscal amount as a comparable alternative', () => {
    const request = query(); const input = response(request); const amount = document().commercialAmount!;
    const invalidAmounts: unknown[] = [-0, -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '7700', null, undefined]
      .map(amountCents => ({ ...amount, amountCents }));
    invalidAmounts.push({ ...amount, currency: 'USD' }, { ...amount, basis: 'invoice_total' }, { ...amount, taxCents: 100 });
    for (const commercialAmount of invalidAmounts) {
      reason(() => defineCompanyDocumentResponse({ ...input, evidence: { ...input.evidence, document: { ...document(), commercialAmount } } }));
    }
    expect(evaluate(request, response(request, document({ commercialAmount: null })))).toMatchObject({
      comparisons: { amount: { reason: 'commercial_amount_not_provided' } },
    });
  });

  it('shares the exact PO grammar while preserving Unicode/case differences and rejecting invisibles', () => {
    const valid = ['PO 42', '000042', 'Á-1', 'A\u0301-1', '企業-42', 'PO.#/_- 42', 'A'.repeat(120)];
    for (const number of valid) {
      const d = declaration(); const request = query({ declaration: { ...d, purchaseOrder: { ...d.purchaseOrder!, number } } });
      expect(evaluate(request, response(request, document({ purchaseOrderNumber: number })))).toMatchObject({ comparisons: { purchaseOrder: { outcome: 'matches', observed: number } } });
    }
    const request = query(); const full = response(request);
    for (const number of ['', 'A'.repeat(121), ' PO', 'PO ', '\u0301A', 'PO\u034f42', 'PO\ufe0f42', '1\u20e3', 'PO\u200b42', 'PO\u202e42', 'PO\n42', 'PO:42', 'PO😀']) {
      reason(() => defineCompanyDocumentResponse({ ...full, evidence: { ...full.evidence, document: { ...document(), purchaseOrderNumber: number } } }));
      const d = declaration();
      reason(() => defineCompanyDocumentRequest(query({ declaration: { ...d, purchaseOrder: { ...d.purchaseOrder!, number } } })), 'purchase_order_invalid');
    }
    for (const number of ['PO 2026/0042-á', 'PO 2026/0042-A\u0301']) {
      expect(evaluate(request, response(request, document({ purchaseOrderNumber: number })))).toMatchObject({
        comparisons: { purchaseOrder: { outcome: 'differs' }, amount: { reason: 'po_mismatch', deltaCents: null } },
      });
    }
  });

  it('bounds opaque IDs separately from readable numbers and accepts no URL or omission as null', () => {
    const request = query(); const input = response(request);
    const maximum = 'a'.repeat(100);
    expect(defineCompanyDocumentRequest({ ...request, id: maximum }).id).toBe(maximum);
    expect(evaluate(request, response(request, document({ reference: maximum, companyId: maximum })))).toMatchObject({
      comparisons: { company: { outcome: 'differs' } },
    });
    for (const value of ['', 'A', 'a'.repeat(101), 'https://example.test', 'path/file', undefined, 1]) {
      reason(() => defineCompanyDocumentRequest({ ...request, id: value }));
      reason(() => defineCompanyDocumentResponse({ ...input, evidence: { ...input.evidence, ref: value } }));
      reason(() => defineCompanyDocumentResponse({ ...input, evidence: { ...input.evidence, document: { ...document(), reference: value } } }));
    }
    for (const key of ['companyId', 'purchaseOrderNumber', 'commercialAmount'] as const) {
      const doc = { ...document() }; delete (doc as Record<string, unknown>)[key];
      reason(() => defineCompanyDocumentResponse({ ...input, evidence: { ...input.evidence, document: doc } }));
      reason(() => defineCompanyDocumentResponse({ ...input, evidence: { ...input.evidence, document: { ...document(), [key]: undefined } } }));
    }
  });

  it('uses real canonical UTC years for evaluation and observation without restricting inherited capture metadata', () => {
    const request = query(); const input = response(request);
    for (const at of ['0000-01-01T00:00:00.000Z', '1900-02-29T00:00:00.000Z', '2026-02-30T00:00:00.000Z',
      '2026-10-03T14:15:00Z', '2026-10-03T24:00:00.000Z', '+010000-01-01T00:00:00.000Z', '', null, 1]) {
      reason(() => defineCompanyDocumentResponse({ ...input, evidence: { ...input.evidence, observedAt: at } }));
      reason(() => evaluateCompanyDocumentEvidence({ request, expectedAdapterId: ADAPTER, evaluatedAt: at, response: null }));
    }
  });

  it('returns detached frozen copies and keeps request correlation independent of key insertion order', () => {
    const request = copy(query()); const raw = copy(response(request));
    const canonical = defineCompanyDocumentRequest(request); const normalized = defineCompanyDocumentResponse(raw);
    const result = evaluate(request, raw); const before = copy(result);
    request.declaration.purchaseOrder!.number = 'CHANGED'; raw.evidence.document!.commercialAmount!.amountCents = 0;
    expect(result).toEqual(before); expect(normalized.request).toEqual(canonical);
    expect(normalized).not.toBe(raw); expect(result.request).not.toBe(request);
    frozen(canonical); frozen(normalized); frozen(result);
    expect(defineCompanyDocumentRequest(Object.assign(Object.create(null) as object, canonical))).toEqual(canonical);
  });

  it('captures the normalized request and evaluation before a later response introspection mutates originals', () => {
    const request = copy(query()); const payload = {
      request, expectedAdapterId: ADAPTER, evaluatedAt: EVALUATED, response: response(copy(request)) as unknown,
    };
    const expected = evaluate(request, payload.response);
    const raw = payload.response as object;
    payload.response = new Proxy(raw, { getPrototypeOf(target) {
      request.declaration.purchaseOrder!.number = 'CHANGED'; request.declaration.binding.negotiation.context.request.version = 42;
      payload.expectedAdapterId = 'adapter.changed'; payload.evaluatedAt = '2026-10-03T00:00:00.000Z';
      return Object.getPrototypeOf(target);
    } });
    expect(evaluateCompanyDocumentEvidence(payload)).toEqual(expected);
  });

  it('rejects accessors, symbol/nonenumerable extras and foreign prototypes without executing getters', () => {
    const request = query(); const input = response(request); let calls = 0;
    const getter = { enumerable: true, get() { calls++; throw new Error('private@example.test'); } };
    const q = { ...request }; Object.defineProperty(q, 'declaration', getter);
    reason(() => defineCompanyDocumentRequest(q));
    const r = { ...input }; Object.defineProperty(r, 'outcome', getter);
    reason(() => defineCompanyDocumentResponse(r));
    const doc = { ...document() }; Object.defineProperty(doc, 'commercialAmount', getter);
    reason(() => evaluate(request, { ...input, evidence: { ...input.evidence, document: doc } }));
    const evaluation = { request, expectedAdapterId: ADAPTER, evaluatedAt: EVALUATED, response: input };
    Object.defineProperty(evaluation, 'response', getter); reason(() => evaluateCompanyDocumentEvidence(evaluation));
    for (const bad of [Object.assign(Object.create({ inherited: true }) as object, request), { ...request, [Symbol('extra')]: true },
      Object.defineProperty({ ...request }, 'extra', { value: 1 }), [], new String('query')]) reason(() => defineCompanyDocumentRequest(bad));
    expect(calls).toBe(0);
  });

  it('redacts arbitrary proxy errors and does not execute an error reason accessor', () => {
    const hidden = new Error('private@example.test');
    reason(() => defineCompanyDocumentRequest(new Proxy({}, { ownKeys() { throw hidden; } })));
    const request = query(); const malicious = new CompanyDocumentContractError('adapter_mismatch'); let reads = 0;
    Object.defineProperty(malicious, 'reason', { get() { reads++; throw hidden; } });
    const bad = new Proxy({}, { getPrototypeOf() { throw malicious; } });
    const error = errorFrom(() => defineCompanyDocumentRequest(bad));
    expect(error.reason).toBe('invalid_data'); expect(error.message).not.toContain('private'); expect(error).not.toHaveProperty('cause');
    const nested = { ...request, declaration: new Proxy({}, { getPrototypeOf() { throw hidden; } }) };
    expect(errorFrom(() => defineCompanyDocumentRequest(nested)).reason).toBe('purchase_order_invalid');
    expect(reads).toBe(0);
  });

  it('delegates declaration and selected-offer validation to the existing public sibling contract', () => {
    const request = query(); const define = vi.spyOn(purchaseContract, 'defineCompanyPurchaseOrderDeclaration');
    const preview = vi.spyOn(purchaseContract, 'previewCompanyPurchaseOrderDeclaration');
    expect(evaluate(request)).toMatchObject({ outcome: 'observed' });
    expect(define).toHaveBeenCalled(); expect(preview).toHaveBeenCalledWith(expect.objectContaining({ declaration: request.declaration, binding: request.declaration.binding }));
    preview.mockImplementationOnce(() => { throw new Error('private@example.test'); });
    reason(() => evaluate(request, null), 'purchase_order_invalid');
  });

  it('performs evaluation without IO, timers, random IDs or an implicit clock', () => {
    const request = query(); const input = response(request); const NativeDate = Date;
    const forbidden = vi.fn(() => { throw new Error('Efecto inesperado'); });
    class ExplicitDate extends NativeDate {
      constructor(value: string) { if (arguments.length === 0) forbidden(); super(value); }
      static override now(): number { return forbidden(); }
    }
    vi.stubGlobal('Date', ExplicitDate);
    for (const key of ['fetch', 'setTimeout', 'setInterval', 'queueMicrotask']) vi.stubGlobal(key, forbidden);
    vi.stubGlobal('localStorage', { getItem: forbidden, setItem: forbidden });
    vi.stubGlobal('sessionStorage', { getItem: forbidden, setItem: forbidden });
    vi.stubGlobal('crypto', { randomUUID: forbidden, getRandomValues: forbidden });
    expect(defineCompanyDocumentRequest(request).id).toBe(request.id);
    expect(defineCompanyDocumentResponse(input).outcome).toBe('evidence');
    expect(evaluate(request, input)).toMatchObject({ outcome: 'observed' });
    expect(forbidden).not.toHaveBeenCalled();
  });
});

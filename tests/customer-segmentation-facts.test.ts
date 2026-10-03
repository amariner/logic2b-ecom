import { describe, expect, it, vi } from 'vitest';
import {
  defineCustomerSegmentFactsPolicy,
  projectCustomerSegmentFacts,
  type CustomerSegmentFactsPolicy,
  type CustomerSegmentOrderEvidence,
} from '../src/modules/customers/application/customer-segmentation-facts';
import { CustomerSegmentationContractError } from '../src/modules/customers/application/customer-segmentation-contract';

const NOW = '2026-10-03T00:30:00.000Z';
const CREATED = '2026-09-01T12:00:00.000Z';
const FIRST = '2026-09-02T13:00:00.000Z';
const LAST = '2026-10-01T12:00:00.000Z';

// Opciones deliberadamente sintéticas; no fijan la política de ningún comercio.
const policy = (overrides: Partial<CustomerSegmentFactsPolicy> = {}): CustomerSegmentFactsPolicy => ({
  schemaVersion: 1, id: 'test.only', version: 1, population: 'active_profiles',
  orderStatuses: ['paid', 'shipped', 'delivered'], orderEligibility: 'successful_capture',
  activityBasis: 'last_successful_capture', amountBasis: 'captured_payments',
  refunds: 'subtract', storedValue: 'include', paymentAdjustments: 'reject',
  unsettledPayments: 'reject', missingPaymentEvidence: 'null', currency: 'EUR',
  foreignCurrency: 'exclude_orders', dayBoundary: 'elapsed_24h_floor', ...overrides,
});
const order = (overrides: Partial<CustomerSegmentOrderEvidence> = {}): CustomerSegmentOrderEvidence => ({
  id: 1, status: 'paid', createdAt: CREATED, currency: 'EUR',
  originalTotalCents: 1_000, currentTotalCents: 1_200, paymentCount: 3,
  externalPaymentEvidence: 'complete', storedValueEvidence: 'complete',
  captureCount: 2, capturedCents: 800, refundedCents: 150,
  storedValueCaptureCount: 1, storedValueCapturedCents: 200, storedValueRefundedCents: 50,
  firstCaptureAt: FIRST, lastCaptureAt: LAST,
  firstStoredValueCaptureAt: '2026-09-03T13:00:00.000Z',
  lastStoredValueCaptureAt: '2026-09-03T13:00:00.000Z',
  adjustmentCount: 0, unsettledPaymentCount: 0, ...overrides,
});
const emptyPayments = {
  paymentCount: 0, captureCount: 0, capturedCents: 0, refundedCents: 0,
  externalPaymentEvidence: 'missing', storedValueEvidence: 'missing',
  storedValueCaptureCount: 0, storedValueCapturedCents: 0, storedValueRefundedCents: 0,
  firstCaptureAt: null, lastCaptureAt: null,
  firstStoredValueCaptureAt: null, lastStoredValueCaptureAt: null,
} as const;
const evidence = (orders: readonly CustomerSegmentOrderEvidence[] = [order()], createdAt: string | null = CREATED) => ({
  createdAt, orders,
});

describe('explicit customer facts policy', () => {
  it('detaches and freezes a complete canonical policy without choosing defaults', () => {
    const statuses: CustomerSegmentOrderEvidence['status'][] = ['delivered', 'paid'];
    const input = policy({ orderStatuses: statuses });
    const normalized = defineCustomerSegmentFactsPolicy(input);
    statuses.push('cancelled');
    expect(normalized.orderStatuses).toEqual(['paid', 'delivered']);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.orderStatuses)).toBe(true);
    expect(defineCustomerSegmentFactsPolicy(normalized)).toEqual(normalized);
    for (const key of Object.keys(input)) {
      const incomplete = { ...input } as Record<string, unknown>;
      delete incomplete[key];
      expect(() => defineCustomerSegmentFactsPolicy(incomplete)).toThrow(CustomerSegmentationContractError);
    }
  });

  it.each([
    ['schemaVersion', 2], ['schemaVersion', '1'], ['id', 'test..only'], ['id', 'test:only'],
    ['version', 0], ['version', Number.MAX_SAFE_INTEGER + 1], ['population', 'all_profiles'],
    ['orderStatuses', []], ['orderStatuses', ['paid', 'paid']], ['orderStatuses', ['refunded']],
    ['orderEligibility', 'paid'], ['activityBasis', 'updated_at'], ['amountBasis', 'net'],
    ['refunds', 'clamp'], ['storedValue', 'automatic'], ['paymentAdjustments', 'apply'],
    ['unsettledPayments', 'include'], ['missingPaymentEvidence', 'zero'],
    ['currency', 'eur'], ['currency', ''], ['currency', 978], ['foreignCurrency', 'convert'],
    ['dayBoundary', 'local_calendar'], ['extra', true],
  ])('rejects noncanonical or undeclared %s=%s', (key, value) => {
    expect(() => defineCustomerSegmentFactsPolicy({ ...policy(), [key]: value })).toThrow(CustomerSegmentationContractError);
  });

  it('requires stored value already included for either order total and explicit inclusion for payment totals', () => {
    for (const amountBasis of ['original_order_total', 'current_order_total'] as const) {
      expect(defineCustomerSegmentFactsPolicy(policy({ amountBasis, storedValue: 'included_in_order_total', refunds: 'ignore' })).amountBasis)
        .toBe(amountBasis);
      for (const storedValue of ['include', 'exclude'] as const) {
        expect(() => defineCustomerSegmentFactsPolicy(policy({ amountBasis, storedValue }))).toThrow(/storedValue/);
      }
    }
    expect(() => defineCustomerSegmentFactsPolicy(policy({ storedValue: 'included_in_order_total' }))).toThrow(/storedValue/);
  });

  it('requires payment capture amounts to subtract refunds without netting an amended order total twice', () => {
    for (const amountBasis of ['original_order_total', 'current_order_total'] as const) {
      expect(() => defineCustomerSegmentFactsPolicy(policy({ amountBasis, storedValue: 'included_in_order_total', refunds: 'subtract' })))
        .toThrow(/refunds/);
    }
  });

  it('rejects accessors, symbols, hidden fields and sparse or decorated arrays without invoking code', () => {
    const getter = vi.fn(() => 'paid');
    const invalidPolicies = [
      Object.defineProperty(policy(), 'currency', { enumerable: true, get: getter }),
      Object.defineProperty(policy(), 'private', { value: 1 }),
      Object.assign(policy(), { [Symbol('private')]: 1 }),
      { ...policy(), orderStatuses: Array(1) },
      { ...policy(), orderStatuses: Object.assign(['paid'], { extra: true }) },
      { ...policy(), orderStatuses: Object.defineProperty(['paid'], '0', { enumerable: true, get: getter }) },
      Object.create(policy()) as object,
    ];
    for (const input of invalidPolicies) expect(() => defineCustomerSegmentFactsPolicy(input)).toThrow(CustomerSegmentationContractError);
    expect(getter).not.toHaveBeenCalled();
  });
});

describe('pure customer facts projection', () => {
  it('counts each order once across multiple captures and keeps money in integer cents', () => {
    const facts = projectCustomerSegmentFacts(policy(), evidence(), NOW);
    expect(facts).toEqual({
      'customer.age_days': 31, 'orders.count': 1,
      'orders.days_since_last': 1, 'orders.total_spent_cents': 800,
    });
    expect(Object.isFrozen(facts)).toBe(true);
    expect(() => projectCustomerSegmentFacts(policy(), evidence([order(), order()]), NOW)).toThrow(/duplicado/);
  });

  it.each([
    ['include', 'subtract', 800], ['include', 'ignore', 1000],
    ['exclude', 'subtract', 650], ['exclude', 'ignore', 800],
  ] as const)('uses stored value %s and refunds %s without double counting', (storedValue, refunds, expected) => {
    expect(projectCustomerSegmentFacts(policy({ storedValue, refunds }), evidence(), NOW)['orders.total_spent_cents']).toBe(expected);
  });

  it.each([
    ['original_order_total', 'ignore', 1000], ['current_order_total', 'ignore', 1200],
  ] as const)('selects %s with refunds %s and never adds stored value twice', (amountBasis, refunds, expected) => {
    expect(projectCustomerSegmentFacts(policy({ amountBasis, refunds, storedValue: 'included_in_order_total' }), evidence(), NOW)
      ['orders.total_spent_cents']).toBe(expected);
  });

  it('returns authoritative zeros for an empty order history and null for absent dates', () => {
    expect(projectCustomerSegmentFacts(policy(), evidence([], null), NOW)).toEqual({
      'customer.age_days': null, 'orders.count': 0, 'orders.days_since_last': null, 'orders.total_spent_cents': 0,
    });
  });

  it('does not infer captures or zero money from the paid status without payment evidence', () => {
    const legacy = evidence([order(emptyPayments)]);
    expect(projectCustomerSegmentFacts(policy(), legacy, NOW)).toEqual({
      'customer.age_days': 31, 'orders.count': null, 'orders.days_since_last': null, 'orders.total_spent_cents': null,
    });
    expect(() => projectCustomerSegmentFacts(policy({ missingPaymentEvidence: 'reject' }), legacy, NOW)).toThrow(/evidencia/);
    expect(projectCustomerSegmentFacts(policy({ orderEligibility: 'selected_status', activityBasis: 'order_created' }), legacy, NOW))
      .toEqual({ 'customer.age_days': 31, 'orders.count': 1, 'orders.days_since_last': 31, 'orders.total_spent_cents': null });
  });

  it('propagates missing data independently and only requires payment evidence for dependent decisions', () => {
    const noPayment = order(emptyPayments);
    const independent = policy({ orderEligibility: 'selected_status', activityBasis: 'order_created',
      amountBasis: 'original_order_total', storedValue: 'included_in_order_total', refunds: 'ignore', missingPaymentEvidence: 'reject' });
    expect(projectCustomerSegmentFacts(independent, evidence([noPayment]), NOW)['orders.total_spent_cents']).toBe(1000);
    expect(projectCustomerSegmentFacts({ ...independent, activityBasis: 'first_successful_capture', missingPaymentEvidence: 'null' },
      evidence([order(), { ...noPayment, id: 2 }]), NOW)).toEqual({
      'customer.age_days': 31, 'orders.count': 2, 'orders.days_since_last': null, 'orders.total_spent_cents': 2000,
    });
    expect(projectCustomerSegmentFacts(policy(), evidence([order(), { ...noPayment, id: 2 }]), NOW)['orders.count']).toBeNull();
  });

  it('distinguishes successful zero captures from known payment histories with no successful capture', () => {
    const freeCapture = order({ ...emptyPayments, externalPaymentEvidence: 'complete', storedValueEvidence: 'complete',
      paymentCount: 1, captureCount: 1, firstCaptureAt: LAST, lastCaptureAt: LAST });
    expect(projectCustomerSegmentFacts(policy(), evidence([freeCapture]), NOW)).toEqual({
      'customer.age_days': 31, 'orders.count': 1, 'orders.days_since_last': 1, 'orders.total_spent_cents': 0,
    });
    const noSuccess = order({ ...emptyPayments, paymentCount: 1,
      externalPaymentEvidence: 'complete', storedValueEvidence: 'complete' });
    expect(projectCustomerSegmentFacts(policy({ missingPaymentEvidence: 'reject' }), evidence([noSuccess]), NOW)['orders.count']).toBe(0);
    const selected = policy({ orderEligibility: 'selected_status', missingPaymentEvidence: 'reject' });
    expect(projectCustomerSegmentFacts(selected, evidence([noSuccess]), NOW)['orders.total_spent_cents']).toBe(0);
    expect(projectCustomerSegmentFacts(selected, evidence([noSuccess]), NOW)['orders.days_since_last']).toBeNull();
    expect(projectCustomerSegmentFacts(selected, evidence([noSuccess, order({ id: 2 })]), NOW)['orders.days_since_last']).toBe(1);
  });

  it('treats stored value only histories according to eligibility and never fabricates an external capture', () => {
    const storedOnly = order({ ...emptyPayments, storedValueCaptureCount: 1,
      externalPaymentEvidence: 'complete', storedValueEvidence: 'complete',
      storedValueCapturedCents: 400, storedValueRefundedCents: 100,
      firstStoredValueCaptureAt: LAST, lastStoredValueCaptureAt: LAST });
    expect(projectCustomerSegmentFacts(policy({ missingPaymentEvidence: 'reject' }), evidence([storedOnly]), NOW)).toEqual({
      'customer.age_days': 31, 'orders.count': 1, 'orders.days_since_last': 1, 'orders.total_spent_cents': 300,
    });
    expect(projectCustomerSegmentFacts(policy({ storedValue: 'exclude' }), evidence([storedOnly]), NOW)).toEqual({
      'customer.age_days': 31, 'orders.count': 0, 'orders.days_since_last': null, 'orders.total_spent_cents': 0,
    });
  });

  it.each([
    ['missing', 'complete', 'include', null, null],
    ['complete', 'missing', 'include', null, null],
    ['missing', 'missing', 'include', null, null],
    ['missing', 'complete', 'exclude', null, null],
    ['complete', 'missing', 'exclude', 650, 1],
  ] as const)('preserves known eligibility but requires each applicable payment channel: external=%s stored=%s mode=%s',
    (externalPaymentEvidence, storedValueEvidence, storedValue, amount, days) => {
      const partial = evidence([order({ externalPaymentEvidence, storedValueEvidence })]);
      const facts = projectCustomerSegmentFacts(policy({ storedValue }), partial, NOW);
      expect(facts).toMatchObject({ 'orders.count': 1, 'orders.total_spent_cents': amount, 'orders.days_since_last': days });
      if (amount === null) {
        expect(() => projectCustomerSegmentFacts(policy({ storedValue, missingPaymentEvidence: 'reject' }), partial, NOW))
          .toThrow(/evidencia/);
      }
    });

  it('does not convert a missing external amount to zero after observing a stored value capture', () => {
    const partial = evidence([order({ ...emptyPayments, storedValueEvidence: 'complete', storedValueCaptureCount: 1,
      storedValueCapturedCents: 100, firstStoredValueCaptureAt: LAST, lastStoredValueCaptureAt: LAST })]);
    expect(projectCustomerSegmentFacts(policy(), partial, NOW)).toMatchObject({
      'orders.count': 1, 'orders.total_spent_cents': null, 'orders.days_since_last': null,
    });
    expect(projectCustomerSegmentFacts(policy({ storedValue: 'exclude' }), partial, NOW)).toMatchObject({
      'orders.count': null, 'orders.total_spent_cents': null, 'orders.days_since_last': null,
    });
  });

  it('does not convert a missing stored value amount to zero after observing an external capture', () => {
    const partial = evidence([order({ ...emptyPayments, externalPaymentEvidence: 'complete',
      paymentCount: 1, captureCount: 1, capturedCents: 800, firstCaptureAt: LAST, lastCaptureAt: LAST })]);
    expect(projectCustomerSegmentFacts(policy(), partial, NOW)).toMatchObject({
      'orders.count': 1, 'orders.total_spent_cents': null, 'orders.days_since_last': null,
    });
    expect(projectCustomerSegmentFacts(policy({ storedValue: 'exclude' }), partial, NOW)).toMatchObject({
      'orders.count': 1, 'orders.total_spent_cents': 800, 'orders.days_since_last': 1,
    });
  });

  it.each([
    ['complete', 'complete', 'include', 0],
    ['complete', 'missing', 'include', null],
    ['complete', 'missing', 'exclude', 0],
    ['missing', 'complete', 'include', null],
    ['missing', 'complete', 'exclude', null],
  ] as const)('distinguishes complete no-capture histories from unknown eligibility: %s/%s/%s',
    (externalPaymentEvidence, storedValueEvidence, storedValue, count) => {
      const noCaptures = evidence([order({ ...emptyPayments, externalPaymentEvidence, storedValueEvidence })]);
      expect(projectCustomerSegmentFacts(policy({ storedValue }), noCaptures, NOW)).toMatchObject({
        'orders.count': count, 'orders.total_spent_cents': count === null ? null : 0, 'orders.days_since_last': null,
      });
    });

  it.each(['first_successful_capture', 'last_successful_capture'] as const)(
    'requires complete applicable channels to assert the %s extreme even when a capture exists', (activityBasis) => {
      const partial = evidence([order({ storedValueEvidence: 'missing' })]);
      expect(projectCustomerSegmentFacts(policy({ activityBasis }), partial, NOW)['orders.days_since_last']).toBeNull();
      expect(projectCustomerSegmentFacts(policy({ activityBasis, storedValue: 'exclude' }), partial, NOW)['orders.days_since_last'])
        .toBe(activityBasis === 'first_successful_capture' ? 30 : 1);
    });

  it('keeps commercial totals and creation dates calculable when existing captures already prove eligibility', () => {
    const partial = evidence([order({ externalPaymentEvidence: 'missing', storedValueEvidence: 'missing' })]);
    const commercial = policy({ amountBasis: 'original_order_total', storedValue: 'included_in_order_total',
      refunds: 'ignore', activityBasis: 'order_created', missingPaymentEvidence: 'reject' });
    expect(projectCustomerSegmentFacts(commercial, partial, NOW)).toMatchObject({
      'orders.count': 1, 'orders.total_spent_cents': 1000, 'orders.days_since_last': 31,
    });
  });

  it('preserves known order counts across a partially observed payment history without exposing a partial sum', () => {
    const partial = evidence([order(), order({ id: 2, externalPaymentEvidence: 'missing' })]);
    expect(projectCustomerSegmentFacts(policy(), partial, NOW)).toMatchObject({
      'orders.count': 2, 'orders.total_spent_cents': null, 'orders.days_since_last': null,
    });
  });

  it('filters statuses and currency before eligibility while refusing missing currency as a foreign order', () => {
    const orders = [order(), order({ id: 2, status: 'cancelled' }), order({ id: 3, currency: 'USD' })];
    expect(projectCustomerSegmentFacts(policy(), evidence(orders), NOW)['orders.count']).toBe(1);
    expect(projectCustomerSegmentFacts(policy({ orderStatuses: ['cancelled'] }), evidence(orders), NOW)['orders.count']).toBe(1);
    expect(() => projectCustomerSegmentFacts(policy({ foreignCurrency: 'reject' }), evidence(orders), NOW)).toThrow(/moneda ajena/);
    expect(() => projectCustomerSegmentFacts(policy(), evidence([order({ status: 'cancelled', currency: '' })]), NOW)).toThrow(/currency/);
  });

  it('applies explicit adjustments and unsettled transaction policies without treating pending amounts as succeeded', () => {
    const adjusted = evidence([order({ adjustmentCount: 1 })]);
    const unsettled = evidence([order({ unsettledPaymentCount: 1 })]);
    expect(() => projectCustomerSegmentFacts(policy(), adjusted, NOW)).toThrow(/ajustes/);
    expect(() => projectCustomerSegmentFacts(policy(), unsettled, NOW)).toThrow(/no resueltos/);
    expect(projectCustomerSegmentFacts(policy({ paymentAdjustments: 'ignore' }), adjusted, NOW)['orders.total_spent_cents']).toBe(800);
    expect(projectCustomerSegmentFacts(policy({ unsettledPayments: 'exclude' }), unsettled, NOW)['orders.total_spent_cents']).toBe(800);
    expect(projectCustomerSegmentFacts(policy(), evidence([order({ status: 'pending', adjustmentCount: 1, unsettledPaymentCount: 1 })]), NOW)
      ['orders.count']).toBe(0);
    const paymentWithoutTransactions = evidence([order({ ...emptyPayments, unsettledPaymentCount: 1 })]);
    expect(() => projectCustomerSegmentFacts(policy(), paymentWithoutTransactions, NOW)).toThrow(/no resueltos/);
    expect(projectCustomerSegmentFacts(policy({ unsettledPayments: 'exclude' }), paymentWithoutTransactions, NOW)['orders.count']).toBeNull();
  });

  it('selects order creation, first capture and last capture consistently across channels', () => {
    const withLateStored = evidence([order({ storedValueCaptureCount: 2, lastStoredValueCaptureAt: '2026-10-02T23:50:00.000Z' })]);
    expect(projectCustomerSegmentFacts(policy({ activityBasis: 'order_created' }), withLateStored, NOW)['orders.days_since_last']).toBe(31);
    expect(projectCustomerSegmentFacts(policy({ activityBasis: 'first_successful_capture' }), withLateStored, NOW)['orders.days_since_last']).toBe(30);
    expect(projectCustomerSegmentFacts(policy(), withLateStored, NOW)['orders.days_since_last']).toBe(0);
    expect(projectCustomerSegmentFacts(policy({ storedValue: 'exclude' }), withLateStored, NOW)['orders.days_since_last']).toBe(1);
    const storedFirst = evidence([order({ storedValueCaptureCount: 2, firstStoredValueCaptureAt: '2026-09-01T13:00:00.000Z' })]);
    expect(projectCustomerSegmentFacts(policy({ activityBasis: 'first_successful_capture' }), storedFirst, NOW)['orders.days_since_last']).toBe(31);
  });

  it('takes the latest chosen activity across orders independently of their source ordering', () => {
    const early = order({ id: 2, lastCaptureAt: FIRST });
    const latest = order({ id: 3, lastCaptureAt: NOW });
    for (const orders of [[early, latest, order()], [order(), latest, early]]) {
      expect(projectCustomerSegmentFacts(policy(), evidence(orders), NOW)['orders.days_since_last']).toBe(0);
    }
  });

  it('preserves deposits captured before preliminary order conversion rather than inventing later payment dates', () => {
    const deposit = evidence([order({ createdAt: '2026-10-02T12:00:00.000Z' })]);
    expect(projectCustomerSegmentFacts(policy({ activityBasis: 'first_successful_capture' }), deposit, NOW)['orders.days_since_last']).toBe(30);
    expect(projectCustomerSegmentFacts(policy(), deposit, NOW)['orders.days_since_last']).toBe(1);
  });

  it('distinguishes complete elapsed days from UTC boundaries without using the host timezone or clock', () => {
    const yesterday = '2026-10-02T23:30:00.000Z';
    const recent = evidence([order({ createdAt: yesterday, firstCaptureAt: yesterday, lastCaptureAt: yesterday,
      firstStoredValueCaptureAt: yesterday, lastStoredValueCaptureAt: yesterday })], yesterday);
    expect(projectCustomerSegmentFacts(policy(), recent, NOW)['customer.age_days']).toBe(0);
    expect(projectCustomerSegmentFacts(policy(), recent, NOW)['orders.days_since_last']).toBe(0);
    const utcPolicy = policy({ dayBoundary: 'utc_calendar_days' });
    expect(projectCustomerSegmentFacts(utcPolicy, recent, NOW)['customer.age_days']).toBe(1);
    expect(projectCustomerSegmentFacts(utcPolicy, recent, NOW)['orders.days_since_last']).toBe(1);
    const beforeEpoch = evidence([], '1969-12-31T23:30:00.000Z');
    expect(projectCustomerSegmentFacts(utcPolicy, beforeEpoch, '1970-01-01T00:30:00.000Z')['customer.age_days']).toBe(1);
    expect(projectCustomerSegmentFacts(policy(), evidence([], NOW), NOW)['customer.age_days']).toBe(0);
  });

  it('rejects negative outcomes and unsafe sums instead of rounding, clamping or losing precision', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const huge = order({ ...emptyPayments, paymentCount: 2, captureCount: 2,
      externalPaymentEvidence: 'complete', storedValueEvidence: 'complete',
      capturedCents: max, firstCaptureAt: FIRST, lastCaptureAt: LAST });
    expect(projectCustomerSegmentFacts(policy(), evidence([huge]), NOW)['orders.total_spent_cents']).toBe(max);
    expect(() => projectCustomerSegmentFacts(policy(), evidence([huge, order({ id: 2 })]), NOW)).toThrow(/entero seguro/);
    expect(() => projectCustomerSegmentFacts(policy(), evidence([{ ...huge, storedValueCaptureCount: 1,
      storedValueCapturedCents: 1, firstStoredValueCaptureAt: LAST, lastStoredValueCaptureAt: LAST }]), NOW)).toThrow(/entero seguro/);
  });
});

describe('hostile or corrupt facts evidence', () => {
  it.each([
    ['id', 0], ['id', '1'], ['status', 'refunded'], ['currency', 'eur'],
    ['originalTotalCents', -1], ['currentTotalCents', 1.5], ['paymentCount', NaN],
    ['externalPaymentEvidence', undefined], ['externalPaymentEvidence', true],
    ['storedValueEvidence', undefined], ['storedValueEvidence', 'unknown'],
    ['captureCount', Infinity], ['capturedCents', Number.MAX_SAFE_INTEGER + 1],
    ['refundedCents', -1], ['storedValueCaptureCount', null],
    ['storedValueCapturedCents', '200'], ['storedValueRefundedCents', true],
    ['adjustmentCount', -1], ['unsettledPaymentCount', -1],
    ['createdAt', null], ['createdAt', '2026-02-30T12:00:00.000Z'],
    ['createdAt', '2026-09-01T12:00:00Z'], ['createdAt', '2026-10-04T12:00:00.000Z'],
    ['firstCaptureAt', null], ['lastCaptureAt', '2026-10-04T12:00:00.000Z'],
    ['firstStoredValueCaptureAt', null], ['lastStoredValueCaptureAt', '2026-09-01T12:00:00.000Z'],
    ['email', 'private@example.test'],
  ])('fails closed on invalid %s before filtering or calculation', (key, value) => {
    const corrupt = { ...order({ status: 'cancelled' }), [key]: value };
    expect(() => projectCustomerSegmentFacts(policy(), { createdAt: CREATED, orders: [corrupt] }, NOW))
      .toThrow(CustomerSegmentationContractError);
  });

  it.each([
    { refundedCents: 801 }, { storedValueRefundedCents: 201 },
    { captureCount: 0 }, { storedValueCaptureCount: 0 }, { paymentCount: 0 },
    { captureCount: 4 }, { adjustmentCount: 2 }, { captureCount: 1 },
    { firstCaptureAt: LAST, lastCaptureAt: FIRST },
    { firstStoredValueCaptureAt: LAST },
  ])('rejects incoherent capture aggregates %s', (changes) => {
    expect(() => projectCustomerSegmentFacts(policy(), evidence([order(changes)]), NOW)).toThrow(CustomerSegmentationContractError);
  });

  it('requires exact own records and arrays without invoking accessors at any level', () => {
    const getter = vi.fn(() => 800);
    const inputOrder = order();
    const getterOrder = Object.defineProperty(order(), 'capturedCents', { enumerable: true, get: getter });
    const badInputs: unknown[] = [
      {}, null, [], { ...evidence(), private: 1 },
      Object.create(evidence()) as object,
      Object.defineProperty(evidence(), 'createdAt', { enumerable: true, get: getter }),
      { ...evidence(), orders: Object.defineProperty([inputOrder], '0', { enumerable: true, get: getter }) },
      { ...evidence(), orders: Object.assign([inputOrder], { private: true }) },
      { ...evidence(), orders: Array(1) },
      { ...evidence(), orders: [getterOrder] },
      { ...evidence(), orders: [Object.assign(inputOrder, { [Symbol('private')]: true })] },
      { ...evidence(), orders: [Object.defineProperty(order(), 'private', { value: 1 })] },
    ];
    for (const input of badInputs) expect(() => projectCustomerSegmentFacts(policy(), input, NOW)).toThrow(CustomerSegmentationContractError);
    expect(getter).not.toHaveBeenCalled();
  });

  it('validates the explicit capture instant and profile creation date', () => {
    for (const captured of [undefined, NaN, '', '2026-10-03', '2026-10-03T02:30:00.000+02:00', new Date(NOW)]) {
      expect(() => projectCustomerSegmentFacts(policy(), evidence(), captured)).toThrow(CustomerSegmentationContractError);
    }
    for (const createdAt of ['2026-10-04T00:00:00.000Z', '2026-02-30T12:00:00.000Z', '']) {
      expect(() => projectCustomerSegmentFacts(policy(), evidence([], createdAt), NOW)).toThrow(CustomerSegmentationContractError);
    }
    const input = { ...evidence(), createdAt: undefined };
    expect(() => projectCustomerSegmentFacts(policy(), input, NOW)).toThrow(CustomerSegmentationContractError);
  });
});

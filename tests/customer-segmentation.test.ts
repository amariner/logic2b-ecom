import { describe, expect, it } from 'vitest';
import {
  CustomerSegmentationContractError,
  assertCustomerSegmentRecalculation,
  createCustomerSegmentFacts,
  defineCustomerSegmentTemplate,
  evaluateCustomerSegment,
  instantiateCustomerSegment,
  type CustomerSegmentRecalculation,
  type CustomerSegmentTemplate,
} from '../src/modules/customers';

const NOW = Date.parse('2026-08-26T12:00:00.000Z');
const TEMPLATE: CustomerSegmentTemplate = {
  id: 'repeat_buyers',
  version: 2,
  parameters: [
    { name: 'minimum_orders', min: 1, max: 100 },
    { name: 'maximum_inactivity_days', min: 0, max: 730 },
  ],
  conditions: [
    { fact: 'orders.count', operator: 'gte', parameter: 'minimum_orders' },
    { fact: 'orders.days_since_last', operator: 'lte', parameter: 'maximum_inactivity_days' },
  ],
};

const completed = (): CustomerSegmentRecalculation => ({
  segmentId: 'repeat_buyers',
  definitionVersion: 2,
  state: 'completed',
  requestedAt: '2026-08-26T10:00:00.000Z',
  startedAt: '2026-08-26T10:00:01.000Z',
  finishedAt: '2026-08-26T10:00:03.000Z',
  cursor: null,
  totalCandidates: 12,
  processedCandidates: 12,
  matchedCustomers: 4,
  errorCode: null,
});

const segment = () => instantiateCustomerSegment(TEMPLATE, {
  minimum_orders: 2,
  maximum_inactivity_days: 30,
});

describe('R5.6a customer segmentation contract', () => {
  it('represents missing facts as null and never as a numeric sentinel', () => {
    const facts = createCustomerSegmentFacts({ 'orders.count': 3 });
    expect(facts).toEqual({
      'customer.age_days': null,
      'orders.count': 3,
      'orders.days_since_last': null,
      'orders.total_spent_cents': null,
    });
    const segment = instantiateCustomerSegment(TEMPLATE, {
      minimum_orders: 2,
      maximum_inactivity_days: 30,
    });
    expect(evaluateCustomerSegment(segment, facts)).toEqual({
      matches: false,
      missingFacts: ['orders.days_since_last'],
    });
  });

  it('defines versioned templates and produces a detached deeply frozen instance', () => {
    const mutable = structuredClone(TEMPLATE);
    const template = defineCustomerSegmentTemplate(mutable);
    const segment = instantiateCustomerSegment(template, {
      minimum_orders: 2,
      maximum_inactivity_days: 30,
    });
    (mutable.parameters as Array<{ name: string; min: number; max: number }>)[0]!.min = 99;
    expect(segment.templateVersion).toBe(2);
    expect(segment.conditions[0]?.value).toBe(2);
    expect(Object.isFrozen(segment)).toBe(true);
    expect(Object.isFrozen(segment.parameters)).toBe(true);
    expect(Object.isFrozen(segment.conditions)).toBe(true);
    expect(Object.isFrozen(segment.conditions[0])).toBe(true);
  });

  it('requires exactly the declared parameters', () => {
    expect(() => instantiateCustomerSegment(TEMPLATE, { minimum_orders: 2 } as never))
      .toThrow(CustomerSegmentationContractError);
    expect(() => instantiateCustomerSegment(TEMPLATE, {
      minimum_orders: 2,
      maximum_inactivity_days: 30,
      hidden_threshold: 1,
    })).toThrow(CustomerSegmentationContractError);
  });

  it('rejects reused parameters, invalid parameter ranges and incoherent fact ranges', () => {
    expect(() => defineCustomerSegmentTemplate({
      ...TEMPLATE,
      conditions: [...TEMPLATE.conditions, {
        fact: 'orders.total_spent_cents', operator: 'gte', parameter: 'minimum_orders',
      }],
    })).toThrow(/exactamente una vez/);
    expect(() => defineCustomerSegmentTemplate({
      ...TEMPLATE,
      parameters: [{ name: 'bad', min: 8, max: 2 }],
      conditions: [{ fact: 'orders.count', operator: 'gte', parameter: 'bad' }],
    })).toThrow(/rango incoherente/);
    expect(() => instantiateCustomerSegment({
      id: 'impossible', version: 1,
      parameters: [{ name: 'lower', min: 0, max: 100 }, { name: 'upper', min: 0, max: 100 }],
      conditions: [
        { fact: 'orders.count', operator: 'gte', parameter: 'lower' },
        { fact: 'orders.count', operator: 'lte', parameter: 'upper' },
      ],
    }, { lower: 10, upper: 2 })).toThrow(/rango incoherente/);
  });

  it('rejects unknown states, non-positive versions and future timestamps', () => {
    expect(() => assertCustomerSegmentRecalculation({
      ...completed(), definitionVersion: 0,
    }, NOW)).toThrow(/positivo/);
    expect(() => assertCustomerSegmentRecalculation({
      ...completed(), state: 'unknown' as never,
    }, NOW)).toThrow(/state/);
    expect(() => assertCustomerSegmentRecalculation({
      ...completed(), finishedAt: '2026-08-27T10:00:03.000Z',
    }, NOW)).toThrow(/futuro/);
  });

  it('rejects impossible counters and chronology', () => {
    expect(() => assertCustomerSegmentRecalculation({
      ...completed(), processedCandidates: 13,
    }, NOW)).toThrow(/contadores/);
    expect(() => assertCustomerSegmentRecalculation({
      ...completed(), matchedCustomers: 13,
    }, NOW)).toThrow(/contadores/);
    expect(() => assertCustomerSegmentRecalculation({
      ...completed(), startedAt: '2026-08-26T09:59:59.000Z',
    }, NOW)).toThrow(/precede/);
  });

  it('accepts only coherent requested, running, completed and failed snapshots', () => {
    const requested = assertCustomerSegmentRecalculation({
      ...completed(), state: 'requested', startedAt: null, finishedAt: null,
      totalCandidates: 0, processedCandidates: 0, matchedCustomers: 0,
    }, NOW);
    const running = assertCustomerSegmentRecalculation({
      ...completed(), state: 'running', finishedAt: null, cursor: 'cursor_0001',
      processedCandidates: 5, matchedCustomers: 2,
    }, NOW);
    const done = assertCustomerSegmentRecalculation(completed(), NOW);
    const failed = assertCustomerSegmentRecalculation({
      ...completed(), state: 'failed', processedCandidates: 5, matchedCustomers: 2,
      errorCode: 'segment.source_unavailable',
    }, NOW);
    expect([requested.state, running.state, done.state, failed.state]).toEqual([
      'requested', 'running', 'completed', 'failed',
    ]);
    expect(Object.isFrozen(done)).toBe(true);
    expect(() => assertCustomerSegmentRecalculation({
      ...completed(), state: 'completed', cursor: 'cursor_0001',
    }, NOW)).toThrow(/completed/);
    expect(() => assertCustomerSegmentRecalculation({
      ...completed(), state: 'failed', errorCode: null,
    }, NOW)).toThrow(/failed/);
  });

  it.each([null, undefined, false, 3, 'object', [], new Date(NOW)].map((value) => ({ value })))(
    'rejects non-record inputs with a typed error: $value',
    ({ value }) => {
      expect(() => createCustomerSegmentFacts(value as never)).toThrow(CustomerSegmentationContractError);
      expect(() => defineCustomerSegmentTemplate(value as never)).toThrow(CustomerSegmentationContractError);
      expect(() => instantiateCustomerSegment(TEMPLATE, value as never)).toThrow(CustomerSegmentationContractError);
      expect(() => evaluateCustomerSegment(value as never, createCustomerSegmentFacts({})))
        .toThrow(CustomerSegmentationContractError);
      expect(() => evaluateCustomerSegment(segment(), value as never)).toThrow(CustomerSegmentationContractError);
      expect(() => assertCustomerSegmentRecalculation(value as never, NOW)).toThrow(CustomerSegmentationContractError);
    },
  );

  it('accepts plain dictionaries with a null prototype and detaches facts', () => {
    const input = Object.assign(Object.create(null) as Record<string, number>, { 'orders.count': 0 });
    const facts = createCustomerSegmentFacts(input);
    input['orders.count'] = 99;
    expect(facts['orders.count']).toBe(0);
    expect(facts['orders.days_since_last']).toBeNull();
    expect(Object.isFrozen(facts)).toBe(true);
    expect(defineCustomerSegmentTemplate(Object.assign(Object.create(null), TEMPLATE))).toEqual(TEMPLATE);
  });

  it('rejects unknown, inherited, hidden, symbol and accessor fields without invoking getters', () => {
    let getterCalls = 0;
    const getter = Object.defineProperty({}, 'orders.count', {
      enumerable: true,
      get() { getterCalls++; return 3; },
    });
    const inherited = Object.create({ 'orders.count': 3 }) as unknown;
    const hidden = Object.defineProperty({}, 'orders.count', { value: 3 });
    for (const facts of [{ 'orders.typo': 3 }, { [Symbol('extra')]: 3 }, getter, inherited, hidden]) {
      expect(() => createCustomerSegmentFacts(facts as never)).toThrow(CustomerSegmentationContractError);
    }
    expect(getterCalls).toBe(0);
    expect(() => defineCustomerSegmentTemplate({ ...TEMPLATE, hidden_policy: true } as never))
      .toThrow(CustomerSegmentationContractError);
    expect(() => defineCustomerSegmentTemplate({
      ...TEMPLATE, parameters: [{ ...TEMPLATE.parameters[0], extra: 3 }],
    } as never)).toThrow(CustomerSegmentationContractError);
    expect(() => defineCustomerSegmentTemplate({
      ...TEMPLATE, conditions: [{ ...TEMPLATE.conditions[0], extra: 3 }],
    } as never)).toThrow(CustomerSegmentationContractError);
    expect(() => assertCustomerSegmentRecalculation({ ...completed(), extra: 3 } as never, NOW))
      .toThrow(CustomerSegmentationContractError);
  });

  it.each([null, undefined, 12, true, { toString: () => 'repeat_buyers' }])(
    'rejects coerced identifiers and parameter names: %j',
    (value) => {
      expect(() => defineCustomerSegmentTemplate({ ...TEMPLATE, id: value } as never))
        .toThrow(CustomerSegmentationContractError);
      expect(() => assertCustomerSegmentRecalculation({ ...completed(), segmentId: value } as never, NOW))
        .toThrow(CustomerSegmentationContractError);
      expect(() => defineCustomerSegmentTemplate({
        ...TEMPLATE,
        parameters: [{ name: value, min: 0, max: 10 }],
        conditions: [{ fact: 'orders.count', operator: 'gte', parameter: value }],
      } as never)).toThrow(CustomerSegmentationContractError);
    },
  );

  it('rejects missing required fields rather than coercing undefined to an identifier', () => {
    expect(() => defineCustomerSegmentTemplate({
      version: 1, parameters: TEMPLATE.parameters, conditions: TEMPLATE.conditions,
    } as never)).toThrow(CustomerSegmentationContractError);
    expect(() => defineCustomerSegmentTemplate({
      ...TEMPLATE, parameters: [{ min: 0, max: 10 }],
    } as never)).toThrow(CustomerSegmentationContractError);
    expect(() => defineCustomerSegmentTemplate({
      ...TEMPLATE, conditions: [{ fact: 'orders.count', operator: 'gte' }],
    } as never)).toThrow(CustomerSegmentationContractError);
  });

  it('rejects sparse arrays, malformed elements and extra array properties', () => {
    const accessor = Object.defineProperty([TEMPLATE.parameters[0]], '0', {
      enumerable: true,
      get() { throw new Error('Accessor must not execute'); },
    });
    const arrays: unknown[] = [
      [], new Array(1), [null], [undefined],
      Object.assign([TEMPLATE.parameters[0]], { extra: true }),
      Object.setPrototypeOf([TEMPLATE.parameters[0]], null), accessor,
    ];
    for (const value of arrays) {
      expect(() => defineCustomerSegmentTemplate({ ...TEMPLATE, parameters: value } as never))
        .toThrow(CustomerSegmentationContractError);
      expect(() => defineCustomerSegmentTemplate({ ...TEMPLATE, conditions: value } as never))
        .toThrow(CustomerSegmentationContractError);
      expect(() => evaluateCustomerSegment({ ...segment(), conditions: value } as never, createCustomerSegmentFacts({})))
        .toThrow(CustomerSegmentationContractError);
    }
  });

  it.each([-1, 0.1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '3', true])(
    'rejects unsafe facts and condition thresholds: %s',
    (value) => {
      expect(() => createCustomerSegmentFacts({ 'orders.count': value } as never))
        .toThrow(CustomerSegmentationContractError);
      expect(() => instantiateCustomerSegment(TEMPLATE, {
        minimum_orders: value, maximum_inactivity_days: 30,
      } as never)).toThrow(CustomerSegmentationContractError);
      expect(() => evaluateCustomerSegment({
        ...segment(), conditions: [{ ...segment().conditions[0], value }, segment().conditions[1]],
      } as never, createCustomerSegmentFacts({}))).toThrow(CustomerSegmentationContractError);
      expect(() => assertCustomerSegmentRecalculation({ ...completed(), totalCandidates: value } as never, NOW))
        .toThrow(CustomerSegmentationContractError);
    },
  );

  it('validates every condition before short-circuiting on missing or nonmatching facts', () => {
    const corruptions = [
      { ...segment().conditions[1], operator: 'unknown' },
      { ...segment().conditions[1], fact: 'orders.typo' },
      { ...segment().conditions[1], value: -1 },
      { ...segment().conditions[1], extra: true },
      { fact: 'orders.count', operator: 'lte' },
      null,
    ];
    for (const condition of corruptions) {
      const invalidSegment = { ...segment(), conditions: [segment().conditions[0], condition] };
      for (const facts of [
        createCustomerSegmentFacts({}),
        createCustomerSegmentFacts({ 'orders.count': 0 }),
        createCustomerSegmentFacts({ 'orders.count': 2, 'orders.days_since_last': 0 }),
      ]) {
        expect(() => evaluateCustomerSegment(invalidSegment as never, facts))
          .toThrow(CustomerSegmentationContractError);
      }
    }
  });

  it('rejects corrupt segment metadata and incompatible bounds before evaluation', () => {
    const corruptions = [
      { templateId: null }, { templateVersion: 0 }, { parameters: null },
      { parameters: {} }, { parameters: { minimum_orders: 2 } },
      { parameters: { minimum_orders: 2, maximum_inactivity_days: NaN } },
      { parameters: { 'invalid-name': 2, maximum_inactivity_days: 30 } },
      { extra: true },
      { conditions: [
        { fact: 'orders.count', operator: 'eq', value: 2 },
        { fact: 'orders.count', operator: 'gte', value: 3 },
      ] },
    ];
    for (const fields of corruptions) {
      expect(() => evaluateCustomerSegment({ ...segment(), ...fields } as never, createCustomerSegmentFacts({})))
        .toThrow(CustomerSegmentationContractError);
    }
    expect(() => evaluateCustomerSegment(segment(), { 'orders.typo': 3 } as never))
      .toThrow(CustomerSegmentationContractError);
  });

  it.each([
    ['eq', 4, false], ['eq', 5, true], ['eq', 6, false],
    ['gte', 4, false], ['gte', 5, true], ['gte', 6, true],
    ['lte', 4, true], ['lte', 5, true], ['lte', 6, false],
  ] as const)('evaluates %s inclusively at %d', (operator, value, matches) => {
    const rule = instantiateCustomerSegment({
      id: 'order_count', version: 1,
      parameters: [{ name: 'threshold', min: 0, max: Number.MAX_SAFE_INTEGER }],
      conditions: [{ fact: 'orders.count', operator, parameter: 'threshold' }],
    }, { threshold: 5 });
    expect(evaluateCustomerSegment(rule, createCustomerSegmentFacts({ 'orders.count': value })))
      .toEqual({ matches, missingFacts: [] });
  });

  it('normalizes omitted facts in evaluation, distinguishes zero and deduplicates missing facts', () => {
    const rule = instantiateCustomerSegment({
      id: 'no_orders', version: 1,
      parameters: [{ name: 'lower', min: 0, max: 10 }, { name: 'upper', min: 0, max: 10 }],
      conditions: [
        { fact: 'orders.count', operator: 'gte', parameter: 'lower' },
        { fact: 'orders.count', operator: 'lte', parameter: 'upper' },
      ],
    }, { lower: 0, upper: 0 });
    const missing = evaluateCustomerSegment(rule, {} as never);
    expect(missing).toEqual({ matches: false, missingFacts: ['orders.count'] });
    expect(evaluateCustomerSegment(rule, { 'orders.count': undefined } as never)).toEqual(missing);
    expect(evaluateCustomerSegment(rule, createCustomerSegmentFacts({ 'orders.count': 0 })))
      .toEqual({ matches: true, missingFacts: [] });
    expect(Object.isFrozen(missing)).toBe(true);
    expect(Object.isFrozen(missing.missingFacts)).toBe(true);
  });

  it.each([NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER, '2026-08-26', null])(
    'rejects invalid clocks before accepting future timestamps: %s',
    (clock) => {
      expect(() => assertCustomerSegmentRecalculation({
        ...completed(), requestedAt: '2999-01-01T00:00:00.000Z',
        startedAt: '2999-01-01T00:00:01.000Z', finishedAt: '2999-01-01T00:00:02.000Z',
      }, clock as never)).toThrow(CustomerSegmentationContractError);
    },
  );

  it.each(['2026-08-26T10:00:03Z', '2026-08-26T12:00:03.000+02:00', '2026-02-30T10:00:03.000Z'])(
    'rejects noncanonical timestamps: %s',
    (finishedAt) => {
      expect(() => assertCustomerSegmentRecalculation({ ...completed(), finishedAt }, NOW))
        .toThrow(CustomerSegmentationContractError);
    },
  );

  it('allows a failure before starting only without candidates or progress', () => {
    const failed: CustomerSegmentRecalculation = {
      ...completed(), state: 'failed', startedAt: null,
      totalCandidates: 0, processedCandidates: 0, matchedCustomers: 0,
      errorCode: 'segment.source_unavailable',
    };
    expect(assertCustomerSegmentRecalculation(failed, NOW)).toEqual(failed);
    for (const counters of [
      { totalCandidates: 12 },
      { totalCandidates: 12, processedCandidates: 3, matchedCustomers: 2 },
    ]) {
      expect(() => assertCustomerSegmentRecalculation({ ...failed, ...counters }, NOW))
        .toThrow(CustomerSegmentationContractError);
    }
    expect(assertCustomerSegmentRecalculation({
      ...failed, startedAt: completed().startedAt,
      totalCandidates: 12, processedCandidates: 3, matchedCustomers: 2,
    }, NOW).processedCandidates).toBe(3);
  });

  it('accepts completion of an empty run and timestamps exactly at the clock', () => {
    const empty = {
      ...completed(), totalCandidates: 0, processedCandidates: 0, matchedCustomers: 0,
      requestedAt: new Date(NOW).toISOString(), startedAt: new Date(NOW).toISOString(),
      finishedAt: new Date(NOW).toISOString(),
    };
    expect(assertCustomerSegmentRecalculation(empty, NOW)).toEqual(empty);
    expect(() => assertCustomerSegmentRecalculation(empty, NOW - 1)).toThrow(/futuro/);
  });
});

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
});

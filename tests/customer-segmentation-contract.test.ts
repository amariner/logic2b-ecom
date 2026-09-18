import { describe, expect, it, vi } from 'vitest';
import {
  canonicalSegmentJson,
  CustomerSegmentationContractError,
  MAX_CUSTOMER_SEGMENT_CANDIDATES,
  MAX_CUSTOMER_SEGMENT_SNAPSHOT_BYTES,
  normalizeCustomerSegmentFactsSnapshot,
  segmentFingerprint,
  segmentInteger,
  segmentOpaqueId,
  segmentRecord,
  segmentTimestamp,
  type CustomerSegmentFactsSource,
} from '../src/modules/customers/application/customer-segmentation-contract';

const NOW = Date.parse('2026-09-18T12:00:00.000Z');
const CAPTURED_AT = '2026-09-18T11:00:00.000Z';
const candidate = (customerProfileId = 'customer:alpha') => ({
  customerProfileId,
  customerProfileVersion: 3,
  facts: { 'orders.count': 2 },
});
const snapshot = () => ({
  ref: 'snapshot:synthetic-1',
  policyId: 'test.only',
  policyVersion: 1,
  capturedAt: CAPTURED_AT,
  currency: 'EUR',
  candidates: [candidate()],
});

describe('canonical customer segment JSON and fingerprints', () => {
  it('sorts every object by key while preserving array order and JSON scalars', () => {
    const input = { z: [null, true, 'a\n"b', { z: 2, a: 1 }], b: -1.5, a: { 2: 'two', 10: 'ten' } };
    expect(canonicalSegmentJson(input)).toBe('{"a":{"10":"ten","2":"two"},"b":-1.5,"z":[null,true,"a\\n\\\"b",{"a":1,"z":2}]}');
    expect(input.z[3]).toEqual({ z: 2, a: 1 });
    expect(canonicalSegmentJson(-0)).toBe('0');
  });

  it('preserves own __proto__ and constructor keys without changing prototypes', () => {
    const input: unknown = JSON.parse('{"constructor":2,"__proto__":{"z":1,"a":2}}');
    expect(canonicalSegmentJson(input)).toBe('{"__proto__":{"a":2,"z":1},"constructor":2}');
    expect(canonicalSegmentJson(Object.assign(Object.create(null) as object, { b: 2, a: 1 })))
      .toBe('{"a":1,"b":2}');
  });

  it('computes stable SHA-256 with WebCrypto for semantic object content', async () => {
    expect(await segmentFingerprint({})).toBe('44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a');
    expect(await segmentFingerprint({ z: { y: 1, x: 2 }, a: [1, 2] }))
      .toBe(await segmentFingerprint({ a: [1, 2], z: { x: 2, y: 1 } }));
    expect(await segmentFingerprint([1, 2])).not.toBe(await segmentFingerprint([2, 1]));
  });

  it.each([
    ['undefined', undefined], ['function', () => 1], ['symbol', Symbol('x')],
    ['bigint', 1n], ['NaN', NaN], ['infinity', Infinity], ['negative infinity', -Infinity],
    ['Date', new Date(NOW)], ['Map', new Map()], ['boxed number', new Number(1)],
    ['prototype instance', Object.create({ inherited: 1 }) as object],
  ])('rejects unsupported %s values at root and nested levels', (_label, value) => {
    expect(() => canonicalSegmentJson(value)).toThrow(CustomerSegmentationContractError);
    expect(() => canonicalSegmentJson({ nested: [value] })).toThrow(CustomerSegmentationContractError);
  });

  it('does not invoke getters or toJSON while rejecting their representations', async () => {
    const getter = vi.fn(() => 1);
    const accessor = Object.defineProperty({}, 'value', { enumerable: true, get: getter });
    const toJSON = vi.fn(() => ({ silently: 'changed' }));
    expect(() => canonicalSegmentJson(accessor)).toThrow(CustomerSegmentationContractError);
    await expect(segmentFingerprint({ toJSON })).rejects.toThrow(CustomerSegmentationContractError);
    expect(getter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
  });

  it('rejects nonenumerable fields and symbol keys instead of silently omitting them', () => {
    expect(() => canonicalSegmentJson(Object.defineProperty({}, 'hidden', { value: 1 })))
      .toThrow(CustomerSegmentationContractError);
    expect(() => canonicalSegmentJson({ [Symbol('private')]: 1 }))
      .toThrow(CustomerSegmentationContractError);
  });

  it('rejects sparse, decorated and accessor arrays before reading any element', () => {
    const getter = vi.fn(() => 1);
    const accessor = Object.defineProperty([1], '0', { enumerable: true, get: getter });
    const withSymbol = Object.assign([1], { [Symbol('private')]: 1 });
    const withHidden = Object.defineProperty([1], 'hidden', { value: 1 });
    for (const value of [Array(2), [, 1], Object.assign([1], { extra: 2 }), accessor, withSymbol, withHidden]) {
      expect(() => canonicalSegmentJson(value)).toThrow(CustomerSegmentationContractError);
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects cycles while accepting repeated references with equal data', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => canonicalSegmentJson(cycle)).toThrow(/circular/);
    const array: unknown[] = [];
    array.push(array);
    expect(() => canonicalSegmentJson(array)).toThrow(/circular/);
    const shared = { b: 2, a: 1 };
    expect(canonicalSegmentJson([shared, shared])).toBe('[{"a":1,"b":2},{"a":1,"b":2}]');
  });
});

describe('customer segment persistence boundary helpers', () => {
  it('requires exact own data keys and accepts detached null-prototype records', () => {
    const value = Object.assign(Object.create(null) as Record<string, unknown>, { a: 1 });
    expect(segmentRecord(value, ['a'], 'command')).toBe(value);
    for (const input of [{}, { a: 1, b: 2 }, [], null, Object.create({ a: 1 }) as object]) {
      expect(() => segmentRecord(input, ['a'], 'command')).toThrow(CustomerSegmentationContractError);
    }
  });

  it('accepts only bounded canonical opaque identifiers without coercion', () => {
    expect(segmentOpaqueId('customer:profile-1.version_2', 'id')).toBe('customer:profile-1.version_2');
    expect(segmentOpaqueId('a'.repeat(200), 'id')).toHaveLength(200);
    for (const input of ['a'.repeat(201), '', 'UPPER', '1profile', ' x', 'x ', 'a/b', null, undefined, 1, ['a']]) {
      expect(() => segmentOpaqueId(input, 'id')).toThrow(CustomerSegmentationContractError);
    }
  });

  it('accepts safe integers at inclusive bounds and rejects coercion or unsafe values', () => {
    expect(segmentInteger(0, 0, 'version')).toBe(0);
    expect(segmentInteger(1, 1, 'version')).toBe(1);
    expect(segmentInteger(Number.MAX_SAFE_INTEGER, 1, 'version')).toBe(Number.MAX_SAFE_INTEGER);
    for (const input of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '1', true, null]) {
      expect(() => segmentInteger(input, 1, 'version')).toThrow(CustomerSegmentationContractError);
    }
    expect(() => segmentInteger(1, NaN, 'version')).toThrow(CustomerSegmentationContractError);
  });

  it('requires canonical UTC timestamps no later than a valid injected clock', () => {
    expect(segmentTimestamp(CAPTURED_AT, NOW, 'at')).toBe(CAPTURED_AT);
    expect(segmentTimestamp(new Date(NOW).toISOString(), NOW, 'at')).toBe(new Date(NOW).toISOString());
    for (const input of [new Date(NOW + 1).toISOString(), '2026-09-18T11:00:00Z',
      '2026-09-18T13:00:00.000+02:00', '2026-02-30T11:00:00.000Z', '-000001-01-01T00:00:00.000Z', '', NOW, new Date(NOW)]) {
      expect(() => segmentTimestamp(input, NOW, 'at')).toThrow(CustomerSegmentationContractError);
    }
    for (const now of [NaN, Infinity, -Infinity, 8.64e15 + 1]) {
      expect(() => segmentTimestamp(CAPTURED_AT, now, 'at')).toThrow(/nowMs/);
    }
  });
});

describe('bounded complete customer segment facts snapshots', () => {
  it('creates a detached frozen snapshot with all four facts and preserved candidate order', () => {
    const input = { ...snapshot(), candidates: [candidate('customer:z'), candidate('customer:a')] };
    const normalized = normalizeCustomerSegmentFactsSnapshot(input, NOW);
    expect(normalized.candidates.map(({ customerProfileId }) => customerProfileId)).toEqual(['customer:z', 'customer:a']);
    expect(normalized.candidates[0]?.facts).toEqual({
      'customer.age_days': null,
      'orders.count': 2,
      'orders.days_since_last': null,
      'orders.total_spent_cents': null,
    });
    input.candidates[0]!.facts['orders.count'] = 99;
    input.candidates.reverse();
    input.ref = 'replaced';
    expect(normalized.ref).toBe('snapshot:synthetic-1');
    expect(normalized.candidates[0]?.customerProfileId).toBe('customer:z');
    expect(normalized.candidates[0]?.facts['orders.count']).toBe(2);
    for (const value of [normalized, normalized.candidates, normalized.candidates[0], normalized.candidates[0]?.facts]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it('preserves a legitimately empty population and accepts the exact technical bound', () => {
    expect(normalizeCustomerSegmentFactsSnapshot({ ...snapshot(), candidates: [] }, NOW).candidates).toEqual([]);
    const candidates = Array.from({ length: MAX_CUSTOMER_SEGMENT_CANDIDATES }, (_, index) => candidate(`customer:${index}`));
    const normalized = normalizeCustomerSegmentFactsSnapshot({ ...snapshot(), candidates }, NOW);
    expect(normalized.candidates).toHaveLength(MAX_CUSTOMER_SEGMENT_CANDIDATES);
    expect(new TextEncoder().encode(canonicalSegmentJson(normalized)).byteLength).toBeLessThanOrEqual(MAX_CUSTOMER_SEGMENT_SNAPSHOT_BYTES);
    expect(() => normalizeCustomerSegmentFactsSnapshot({ ...snapshot(), candidates: [...candidates, candidate('customer:overflow')] }, NOW))
      .toThrow(/límite técnico/);
  });

  it('rejects duplicate profiles even if their observed versions differ', () => {
    expect(() => normalizeCustomerSegmentFactsSnapshot({
      ...snapshot(), candidates: [candidate(), { ...candidate(), customerProfileVersion: 4 }],
    }, NOW)).toThrow(/duplicado/);
  });

  it.each([
    ['extra snapshot key', { ...snapshot(), private: true }],
    ['missing snapshot key', { ...snapshot(), ref: undefined }],
    ['wrong root type', []],
    ['invalid ref', { ...snapshot(), ref: 123 }],
    ['invalid policy id', { ...snapshot(), policyId: ' policy' }],
    ['opaque rather than canonical policy', { ...snapshot(), policyId: 'test:policy' }],
    ['repeated policy separators', { ...snapshot(), policyId: 'test..policy' }],
    ['trailing policy separator', { ...snapshot(), policyId: 'test_policy-' }],
    ['zero policy version', { ...snapshot(), policyVersion: 0 }],
    ['string policy version', { ...snapshot(), policyVersion: '1' }],
    ['future capture', { ...snapshot(), capturedAt: new Date(NOW + 1).toISOString() }],
    ['lowercase currency', { ...snapshot(), currency: 'eur' }],
    ['numeric currency', { ...snapshot(), currency: 978 }],
    ['long currency', { ...snapshot(), currency: 'EURO' }],
    ['missing candidates', { ...snapshot(), candidates: undefined }],
    ['sparse candidates', { ...snapshot(), candidates: Array(1) }],
    ['extra candidate key', { ...snapshot(), candidates: [{ ...candidate(), email: 'hidden@example.test' }] }],
    ['wrong candidate type', { ...snapshot(), candidates: [null] }],
    ['invalid profile', { ...snapshot(), candidates: [{ ...candidate(), customerProfileId: 'p/1' }] }],
    ['zero profile version', { ...snapshot(), candidates: [{ ...candidate(), customerProfileVersion: 0 }] }],
    ['unsafe profile version', { ...snapshot(), candidates: [{ ...candidate(), customerProfileVersion: Number.MAX_SAFE_INTEGER + 1 }] }],
    ['unknown fact', { ...snapshot(), candidates: [{ ...candidate(), facts: { arbitrary: 0 } }] }],
    ['invalid fact type', { ...snapshot(), candidates: [{ ...candidate(), facts: { 'orders.count': true } }] }],
    ['negative fact', { ...snapshot(), candidates: [{ ...candidate(), facts: { 'orders.count': -1 } }] }],
    ['unsafe fact', { ...snapshot(), candidates: [{ ...candidate(), facts: { 'orders.total_spent_cents': Number.MAX_SAFE_INTEGER + 1 } }] }],
  ])('rejects %s before producing any snapshot', (_label, input) => {
    expect(() => normalizeCustomerSegmentFactsSnapshot(input, NOW)).toThrow(CustomerSegmentationContractError);
  });

  it('does not invoke accessor fields at any snapshot boundary', () => {
    const getter = vi.fn(() => 'private');
    const root = Object.defineProperty(snapshot(), 'ref', { enumerable: true, get: getter });
    const entry = Object.defineProperty(candidate(), 'customerProfileId', { enumerable: true, get: getter });
    const facts = Object.defineProperty({}, 'orders.count', { enumerable: true, get: getter });
    for (const input of [root, { ...snapshot(), candidates: [entry] }, { ...snapshot(), candidates: [{ ...candidate(), facts }] }]) {
      expect(() => normalizeCustomerSegmentFactsSnapshot(input, NOW)).toThrow(CustomerSegmentationContractError);
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it('uses the injected clock and normalizes known undefined facts as missing', () => {
    expect(() => normalizeCustomerSegmentFactsSnapshot(snapshot(), NaN)).toThrow(/nowMs/);
    const normalized = normalizeCustomerSegmentFactsSnapshot({
      ...snapshot(), candidates: [{ ...candidate(), facts: { 'orders.count': undefined } }],
    }, NOW);
    expect(Object.values(normalized.candidates[0]!.facts)).toEqual([null, null, null, null]);
  });

  it('fingerprints normalized content including metadata, positions, profile versions and facts', async () => {
    const original = { ...snapshot(), candidates: [candidate('customer:a'), candidate('customer:b')] };
    const base = await segmentFingerprint(normalizeCustomerSegmentFactsSnapshot(original, NOW));
    const same = {
      candidates: original.candidates.map((entry) => ({
        facts: { 'orders.total_spent_cents': null, ...entry.facts, 'customer.age_days': null, 'orders.days_since_last': null },
        customerProfileVersion: entry.customerProfileVersion, customerProfileId: entry.customerProfileId,
      })),
      currency: 'EUR', capturedAt: CAPTURED_AT, policyVersion: 1, policyId: 'test.only', ref: original.ref,
    };
    expect(await segmentFingerprint(normalizeCustomerSegmentFactsSnapshot(same, NOW))).toBe(base);
    for (const changed of [
      { ...original, ref: 'snapshot:another' },
      { ...original, policyId: 'another.policy' },
      { ...original, policyVersion: 2 },
      { ...original, capturedAt: '2026-09-18T10:00:00.000Z' },
      { ...original, currency: 'USD' },
      { ...original, candidates: [...original.candidates].reverse() },
      { ...original, candidates: [candidate('customer:c'), candidate('customer:b')] },
      { ...original, candidates: [{ ...candidate('customer:a'), customerProfileVersion: 4 }, candidate('customer:b')] },
      { ...original, candidates: [{ ...candidate('customer:a'), facts: { 'orders.count': 3 } }, candidate('customer:b')] },
    ]) {
      expect(await segmentFingerprint(normalizeCustomerSegmentFactsSnapshot(changed, NOW))).not.toBe(base);
    }
  });

  it('supports a test-only synthetic source without choosing a production facts policy', async () => {
    const source: CustomerSegmentFactsSource = {
      capture: async () => normalizeCustomerSegmentFactsSnapshot(snapshot(), NOW),
    };
    expect(await source.capture()).toEqual(normalizeCustomerSegmentFactsSnapshot(snapshot(), NOW));
  });
});

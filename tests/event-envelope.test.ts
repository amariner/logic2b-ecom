import { describe, expect, it } from 'vitest';
import {
  EventEnvelopeError,
  causedBy,
  createEventFactory,
  isEventEnvelope,
  validateEventEnvelope,
  type EventClock,
  type EventIdSource,
} from '../src/shared-kernel/events';

/** Reloj y contador deterministas: el sobre no debe depender de nada ambiental. */
function testFactory(start = '2026-08-06T10:00:00.000Z') {
  let tick = 0;
  const clock: EventClock = { now: () => new Date(Date.parse(start) + tick * 1000) };
  const ids: EventIdSource = {
    next: () => {
      tick += 1;
      return `evt_${tick}`;
    },
  };
  return createEventFactory({ clock, ids });
}

const draft = {
  type: 'orders.order_paid',
  version: 1,
  actor: { kind: 'provider', id: 'stripe' },
  entity: { type: 'order', id: '7', reference: 'BM-260806-TEST' },
  idempotency_key: 'order:BM-260806-TEST:order_paid',
  payload: { total_cents: 2270 },
} as const;

describe('sobre de evento (R1.5)', () => {
  it('completa id, instante ISO y correlación raíz', () => {
    const emit = testFactory();
    const event = emit(draft);
    expect(event.event_id).toBe('evt_1');
    expect(event.occurred_at).toBe('2026-08-06T10:00:01.000Z');
    expect(event.correlation_id).toBe('evt_1'); // sin flujo previo, se correlaciona consigo mismo
    expect(event.causation_id).toBeNull();
    expect(validateEventEnvelope(event)).toEqual([]);
  });

  it('respeta la correlación y la causación que declara el productor', () => {
    const emit = testFactory();
    const event = emit({ ...draft, correlation_id: 'order:BM-260806-TEST', causation_id: 'evt_stripe_1' });
    expect(event.correlation_id).toBe('order:BM-260806-TEST');
    expect(event.causation_id).toBe('evt_stripe_1');
  });

  it('`causedBy` encadena hechos: mismo flujo, causación al padre', () => {
    const emit = testFactory();
    const parent = emit({ ...draft, type: 'orders.order_placed', idempotency_key: 'k1' });
    const child = emit({ ...draft, idempotency_key: 'k2', ...causedBy(parent) });
    expect(child.correlation_id).toBe(parent.correlation_id);
    expect(child.causation_id).toBe(parent.event_id);
    expect(child.event_id).not.toBe(parent.event_id);
  });

  it('el sobre es inmutable, incluidos actor y entidad', () => {
    const event = testFactory()(draft);
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.actor)).toBe(true);
    expect(Object.isFrozen(event.entity)).toBe(true);
  });

  it('falla al emitir un sobre inválido, en vez de dejarlo viajar', () => {
    const emit = testFactory();
    expect(() => emit({ ...draft, idempotency_key: '   ' })).toThrow(EventEnvelopeError);
    expect(() => emit({ ...draft, version: 0 })).toThrow(EventEnvelopeError);
    expect(() => emit({ ...draft, type: 'OrdersOrderPaid' })).toThrow(EventEnvelopeError);
    expect(() => emit({ ...draft, actor: { kind: 'robot' as unknown as 'system', id: 'x' } })).toThrow(EventEnvelopeError);
  });

  it('la validación señala cada defecto por su ruta', () => {
    const issues = validateEventEnvelope({
      event_id: '',
      type: 'mal tipo',
      version: 1.5,
      occurred_at: '2026-08-06',
      actor: { kind: 'system' },
      entity: {},
      correlation_id: '',
      causation_id: '',
      idempotency_key: '',
    });
    expect(issues.map((issue) => issue.path).toSorted()).toEqual([
      'actor.id',
      'causation_id',
      'correlation_id',
      'entity.id',
      'entity.type',
      'event_id',
      'idempotency_key',
      'occurred_at',
      'payload',
      'type',
      'version',
    ]);
  });

  it('admite causación nula explícita pero no vacía', () => {
    expect(isEventEnvelope({ ...testFactory()(draft), causation_id: null })).toBe(true);
    expect(isEventEnvelope({ ...testFactory()(draft), causation_id: '' })).toBe(false);
  });

  it('rechaza lo que no es un objeto', () => {
    for (const value of [null, undefined, 'evento', 42, []]) {
      expect(isEventEnvelope(value)).toBe(false);
    }
  });
});

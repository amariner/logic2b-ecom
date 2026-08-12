import { describe, expect, it } from 'vitest';
import { createEventFactory, type EventClock, type EventIdSource } from '../src/shared-kernel/events';
import {
  ORDER_EVENT_VERSION,
  orderCancelledEvent,
  orderCorrelationId,
  orderDeliveredEvent,
  orderPaidEvent,
  orderPartiallyRefundedEvent,
  orderPlacedEvent,
  orderRefundedEvent,
  orderShippedEvent,
  orderTimelineEntry,
  orderTimelineNote,
} from '../src/modules/orders/domain/order-events';
import { orderNotificationsFor } from '../src/modules/notifications/application/order-messages';
import { MODULE_REGISTRY } from '../src/platform/configuration';
import type { OrderEmailData } from '../src/lib/emails';

function testFactory() {
  let tick = 0;
  const clock: EventClock = { now: () => new Date(Date.parse('2026-08-06T10:00:00.000Z') + tick * 1000) };
  const ids: EventIdSource = {
    next: () => {
      tick += 1;
      return `evt_${tick}`;
    },
  };
  return createEventFactory({ clock, ids });
}

const subject = { order_id: 7, order_number: 'BM-260806-TEST' } as const;

const emailData: OrderEmailData = {
  order_number: subject.order_number,
  customer_name: 'Marta Ferrer',
  email: 'clienta@example.com',
  subtotal_cents: 1780,
  shipping_cents: 490,
  total_cents: 2270,
  items: [{ order_item_id: 71, name_snapshot: 'AOVE Picual 500 ml', unit_price_cents: 890, qty: 2 }],
};

describe('eventos de pedido (R1.5)', () => {
  it('todo hecho del pedido comparte flujo y trae entidad, versión y clave propias', () => {
    const emit = testFactory();
    const placed = orderPlacedEvent(emit, subject);
    const paid = orderPaidEvent(emit, { ...subject, payment_intent: 'pi_1', source: 'stripe' }, {
      causationId: placed.event_id,
    });

    for (const event of [placed, paid]) {
      expect(event.version).toBe(ORDER_EVENT_VERSION);
      expect(event.correlation_id).toBe(orderCorrelationId(subject.order_number));
      expect(event.entity).toEqual({ type: 'order', id: '7', reference: 'BM-260806-TEST' });
    }
    expect(placed.causation_id).toBeNull();
    expect(paid.causation_id).toBe(placed.event_id);
    expect(placed.idempotency_key).toBe('order:BM-260806-TEST:order_placed');
    expect(paid.idempotency_key).toBe('order:BM-260806-TEST:order_paid');
  });

  it('la clave de idempotencia identifica el hecho, no la entrega', () => {
    const first = orderPaidEvent(testFactory(), { ...subject, payment_intent: 'pi_1', source: 'stripe' });
    const redelivery = orderPaidEvent(testFactory(), { ...subject, payment_intent: 'pi_1', source: 'stripe' });
    expect(redelivery.idempotency_key).toBe(first.idempotency_key);
    expect(redelivery.event_id).toBe(first.event_id); // ids deterministas del doble; en runtime difieren
  });

  it('el actor identifica el canal, nunca a la persona', () => {
    const emit = testFactory();
    expect(orderPlacedEvent(emit, subject).actor).toMatchObject({ kind: 'customer', id: 'guest-checkout' });
    expect(orderPaidEvent(emit, { ...subject, payment_intent: null, source: 'stripe' }).actor.kind).toBe('provider');
    expect(orderPaidEvent(emit, { ...subject, payment_intent: null, source: 'simulated' }).actor.kind).toBe('system');
    expect(orderDeliveredEvent(emit, { ...subject, from_status: 'shipped' }).actor.kind).toBe('admin');
    expect(
      orderCancelledEvent(emit, { ...subject, from_status: 'pending', reason: 'payment_session_expired' }).actor.id,
    ).toBe('stripe');
  });

  it('el sobre no transporta datos personales', () => {
    const emit = testFactory();
    const events = [
      orderPlacedEvent(emit, subject),
      orderPaidEvent(emit, { ...subject, payment_intent: 'pi_1', source: 'stripe' }),
      orderShippedEvent(emit, { ...subject, from_status: 'paid', tracking: { carrier: 'SEUR', number: 'ES1' } }),
    ];
    for (const event of events) {
      const serialized = JSON.stringify(event);
      expect(serialized).not.toContain('clienta@example.com');
      expect(serialized).not.toContain('Marta Ferrer');
    }
  });

  it('proyecta el timeline exactamente como lo escribía la Fase 3', () => {
    const emit = testFactory();
    expect(orderTimelineEntry(orderPlacedEvent(emit, subject))).toEqual({
      from_status: null,
      to_status: 'pending',
      note: 'Pedido creado, esperando pago',
    });
    expect(orderTimelineEntry(orderPaidEvent(emit, { ...subject, payment_intent: 'pi_1', source: 'stripe' }))).toEqual({
      from_status: 'pending',
      to_status: 'paid',
      note: 'Pago confirmado por Stripe',
    });
    expect(
      orderTimelineEntry(orderPaidEvent(emit, { ...subject, payment_intent: 'sim', source: 'simulated' })).note,
    ).toBe('Pago confirmado (simulado)');
    expect(
      orderTimelineEntry(
        orderShippedEvent(emit, { ...subject, from_status: 'paid', tracking: { carrier: 'SEUR', number: 'ES123' } }),
      ),
    ).toEqual({ from_status: 'paid', to_status: 'shipped', note: 'Enviado con SEUR (ES123)' });
    expect(orderTimelineEntry(orderDeliveredEvent(emit, { ...subject, from_status: 'shipped' })).note).toBe(
      'Marcado como entregado',
    );
    expect(
      orderTimelineEntry(orderCancelledEvent(emit, { ...subject, from_status: 'paid', reason: 'admin' })).note,
    ).toBe('Cancelado desde el panel');
    expect(
      orderTimelineEntry(
        orderCancelledEvent(emit, { ...subject, from_status: 'pending', reason: 'payment_session_expired' }),
      ).note,
    ).toBe('Sesión de pago caducada');
    expect(
      orderTimelineEntry(orderRefundedEvent(emit, {
        ...subject,
        total_cents: 2270,
        currency: 'EUR',
        restock: true,
      })).note,
    ).toBe('Reembolso total confirmado y pedido cancelado');
    expect(
      orderTimelineEntry(orderPartiallyRefundedEvent(emit, {
        ...subject,
        to_status: 'paid',
        refund_id: 4,
        subtotal_cents: 890,
        shipping_cents: 0,
        total_cents: 890,
        currency: 'EUR',
        restock: true,
        allocations: [{ order_item_id: 71, quantity: 1 }],
        remaining_quantity: 1,
      })).note,
    ).toBe('Reembolso parcial confirmado: 1 unidad');
  });

  it('la nota de envío sin tracking (solo posible en fixtures) no inventa paréntesis vacíos', () => {
    expect(orderTimelineNote({ to_status: 'shipped', tracking: null })).toBe('Enviado');
  });
});

describe('notificaciones como consumidor de eventos (R1.5)', () => {
  const emit = testFactory();

  it('el cobro genera confirmación al comprador y aviso al comercio', () => {
    const messages = orderNotificationsFor(
      orderPaidEvent(emit, { ...subject, payment_intent: 'pi_1', source: 'stripe' }),
      emailData,
    );
    expect(messages).toHaveLength(2);
    expect(messages[0]?.to_addr).toBe('clienta@example.com');
    expect(messages[0]?.subject).toContain('BM-260806-TEST');
    expect(messages[1]?.body_html).toContain('AOVE Picual 500 ml');
  });

  it('el envío genera un solo aviso, con el tracking leído del propio hecho', () => {
    const messages = orderNotificationsFor(
      orderShippedEvent(emit, { ...subject, from_status: 'paid', tracking: { carrier: 'SEUR', number: 'ES123' } }),
      emailData,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.body_html).toContain('SEUR');
    expect(messages[0]?.body_html).toContain('ES123');
  });

  it('un reembolso confirmado avisa al comprador sin exponer la referencia PSP', () => {
    const messages = orderNotificationsFor(
      orderRefundedEvent(emit, {
        ...subject,
        total_cents: 2270,
        currency: 'EUR',
        restock: true,
      }),
      emailData,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.subject).toContain('Reembolso');
    expect(messages[0]?.body_html).toContain('importe completo');
  });

  it('un reembolso parcial enumera solo las unidades seleccionadas y si incluye envío', () => {
    const messages = orderNotificationsFor(
      orderPartiallyRefundedEvent(emit, {
        ...subject,
        to_status: 'paid',
        refund_id: 8,
        subtotal_cents: 890,
        shipping_cents: 0,
        total_cents: 890,
        currency: 'EUR',
        restock: false,
        allocations: [{ order_item_id: 71, quantity: 1 }],
        remaining_quantity: 1,
      }),
      emailData,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.subject).toContain('Reembolso parcial');
    expect(messages[0]?.body_html).toContain('AOVE Picual 500 ml × 1');
    expect(messages[0]?.body_html).toContain('no incluye los gastos de envío');
  });

  it('los hechos a los que no está suscrito no producen nada', () => {
    for (const event of [
      orderPlacedEvent(emit, subject),
      orderDeliveredEvent(emit, { ...subject, from_status: 'shipped' }),
      orderCancelledEvent(emit, { ...subject, from_status: 'paid', reason: 'admin' }),
    ]) {
      expect(orderNotificationsFor(event, emailData)).toEqual([]);
    }
  });

  it('escapa el nombre del cliente en el HTML (el checkout no lo restringe)', () => {
    const messages = orderNotificationsFor(orderPaidEvent(emit, { ...subject, payment_intent: null, source: 'stripe' }), {
      ...emailData,
      customer_name: '<img src=x onerror=alert(1)>Marta',
    });
    expect(messages).toHaveLength(2);
    for (const message of messages) {
      expect(message.body_html).not.toContain('<img src=x onerror');
      expect(message.body_html).toContain('&lt;img src=x onerror=alert(1)&gt;Marta');
    }
  });

  it('un payload manipulado sin tracking no encola un email a medias', () => {
    const event = orderShippedEvent(emit, {
      ...subject,
      from_status: 'paid',
      tracking: { carrier: 'SEUR', number: 'ES1' },
    });
    expect(orderNotificationsFor({ ...event, payload: { tracking: null } }, emailData)).toEqual([]);
  });
});

describe('registro de módulos y eventos (R1.5)', () => {
  it('cada hecho tiene un emisor único y es el que declara el dominio', () => {
    expect(MODULE_REGISTRY.byId.orders.events).toEqual([
      'orders.order_placed',
      'orders.order_paid',
      'orders.order_shipped',
      'orders.order_delivered',
      'orders.order_cancelled',
      'orders.order_refunded',
      'orders.order_partially_refunded',
      'orders.order_amendment_requested',
      'orders.order_amendment_applied',
      'orders.order_amendment_expired',
    ]);
    for (const event of MODULE_REGISTRY.byId.orders.events) {
      expect(MODULE_REGISTRY.eventOwners[event]).toBe('orders');
    }
  });

  it('notificaciones consume pedidos y envíos sin depender de sus módulos', () => {
    const notifications = MODULE_REGISTRY.byId.notifications;
    expect(notifications.subscriptions).toEqual([
      'orders.order_paid',
      'orders.order_shipped',
      'orders.order_refunded',
      'orders.order_partially_refunded',
      'fulfillment.fulfillment_shipped',
    ]);
    expect(notifications.dependencies).not.toContain('orders');
    expect(notifications.dependencies).not.toContain('fulfillment');
    for (const event of notifications.subscriptions.filter((event) => event.startsWith('orders.'))) {
      expect(MODULE_REGISTRY.eventOwners[event]).toBe('orders');
    }
    expect(MODULE_REGISTRY.eventOwners['fulfillment.fulfillment_shipped']).toBe('fulfillment');
  });
});

/**
 * Fixtures de PEDIDOS de la demo genérica (Fase 9B.2).
 * ============================================================================
 *
 * Objetivo: que el backoffice se pueda enseñar en una llamada de venta sin
 * fabricar el estado a mano. Deja sembrado un panel realista que cubre TODAS las
 * variantes que el sistema sabe representar:
 *
 *   · Pedidos en los cinco estados (pending, paid, shipped, delivered, cancelled).
 *   · Formas distintas: una línea, varias líneas, envío gratis por umbral y sin
 *     alcanzarlo, y las cuatro zonas (península, Baleares, Canarias, Ceuta/Melilla).
 *   · Los dos tipos de email de cliente (confirmación y aviso de envío con
 *     tracking) — más el aviso interno al comercio, que es lo que de verdad
 *     produce el flujo de pago.
 *   · `order_events` con timeline real, no un único evento.
 *
 * SOLO DEMO. Estos pedidos son del catálogo genérico (`collection = 'demo'`). Un
 * cliente real sustituye `seed/products.ts` por el suyo y borra la llamada a
 * `demoOrderStatements()` en `seed/seed.ts`: sus productos nunca heredan estos
 * pedidos ficticios.
 *
 * COHERENCIA. Los totales se calculan con `lib/pricing` (la misma lógica que
 * cobra) y el HTML de los emails con `lib/emails` (el mismo que enviaría el
 * webhook). Nada de números ni HTML escritos a mano: si el motor cambia, estas
 * fixtures cambian con él.
 *
 * FRESCURA. Todos los timestamps son relativos (`datetime('now', …)`), no fechas
 * absolutas: el reset corre en vivo cada 6 h por cron y el panel debe verse
 * siempre reciente, nunca anclado a julio de 2026.
 */

import { shopConfig } from '../shop.config.ts';
import {
  merchantNewOrderEmail,
  orderConfirmationEmail,
  orderShippedEmail,
  type EmailMessage,
  type OrderEmailData,
} from '../src/lib/emails.ts';
import type { OrderStatus } from '../src/lib/order-transitions.ts';
import { computeShippingCents, computeSubtotalCents } from '../src/lib/pricing.ts';

// —————————————————————————————————————————————————————————————————————————
// SQL helpers (mismos idioms que seed.ts)
// —————————————————————————————————————————————————————————————————————————

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** `datetime('now', …mods)` — timestamp relativo. Ej.: sqlNow(['-7 days','+11 minutes']). */
function sqlNow(mods: readonly string[]): string {
  const suffix = mods.map((mod) => `, '${mod}'`).join('');
  return `datetime('now'${suffix})`;
}

/** Subconsulta que resuelve el id de un pedido por su número (único). */
function orderIdByNumber(orderNumber: string): string {
  return `(SELECT id FROM orders WHERE order_number = ${sqlString(orderNumber)})`;
}

/** Subconsulta que resuelve el id de un producto por su slug (único global). */
function productIdBySlug(slug: string): string {
  return `(SELECT id FROM products WHERE slug = ${sqlString(slug)})`;
}

// —————————————————————————————————————————————————————————————————————————
// Modelo de las fixtures
// —————————————————————————————————————————————————————————————————————————

type FixtureLine = {
  slug: string;
  /** Nombre congelado en el momento de la compra (name_snapshot). */
  name: string;
  unit_price_cents: number;
  qty: number;
};

type FixtureCustomer = {
  name: string;
  email: string;
  phone?: string;
  street: string;
  city: string;
  postal_code: string;
  /** Id de zona (peninsula | baleares | canarias | ceuta-melilla). */
  zone: string;
  // Facturación opcional: dispara el aviso de factura en el detalle del panel.
  nif?: string;
  company?: string;
};

type FixtureOrder = {
  order_number: string;
  status: OrderStatus;
  customer: FixtureCustomer;
  lines: FixtureLine[];
  /** Solo para shipped/delivered. */
  tracking?: { carrier: string; number: string };
  /**
   * Momentos de la vida del pedido, en orden. El primero es la creación
   * (from = null); cada modificador es relativo a `now`. `updated_at` del pedido
   * es el del último hito.
   */
  timeline: { to: OrderStatus; at: readonly string[] }[];
};

/** Tarifa de envío por zona, leída del motor (shop.config). */
const rateByZone = new Map(
  shopConfig.shipping.seedRates.map((rate) => [
    rate.zone,
    { price_cents: rate.price_cents, free_over_cents: rate.free_over_cents },
  ]),
);

// —————————————————————————————————————————————————————————————————————————
// Los pedidos. Ordenados de más ANTIGUO a más reciente para que los ids
// (y con ellos el orden de la bandeja de emails, que va por id DESC) asciendan
// con el tiempo. El listado del panel ordena por created_at, así que ahí da igual.
// —————————————————————————————————————————————————————————————————————————

const fixtures: FixtureOrder[] = [
  // ── DELIVERED · península · varias líneas · ENVÍO GRATIS (subtotal ≥ 5000) ──
  {
    order_number: 'BM-DEMO-1001',
    status: 'delivered',
    customer: {
      name: 'Marta Ferrer Gil',
      email: 'marta.ferrer@example.com',
      phone: '600112233',
      street: 'Carrer Major, 14, 2n',
      city: 'Castelló de la Plana',
      postal_code: '12001',
      zone: 'peninsula',
    },
    lines: [
      { slug: 'lata-aove-5l', name: 'Lata AOVE cosecha propia 5 L', unit_price_cents: 4990, qty: 1 },
      { slug: 'miel-romero-500', name: 'Miel de romero 500 g', unit_price_cents: 750, qty: 1 },
    ],
    tracking: { carrier: 'SEUR', number: 'SEUR-8842013776' },
    timeline: [
      { to: 'pending', at: ['-8 days'] },
      { to: 'paid', at: ['-8 days', '+7 minutes'] },
      { to: 'shipped', at: ['-7 days'] },
      { to: 'delivered', at: ['-5 days'] },
    ],
  },

  // ── DELIVERED · península · varias líneas · porte cobrado (subtotal < 5000) ──
  {
    order_number: 'BM-DEMO-1002',
    status: 'delivered',
    customer: {
      name: 'Joan Beltran Ros',
      email: 'joan.beltran@example.com',
      street: 'Avinguda del Mar, 3',
      city: 'Benicàssim',
      postal_code: '12560',
      zone: 'peninsula',
    },
    lines: [
      { slug: 'aove-picual-500', name: 'AOVE Picual 500 ml', unit_price_cents: 890, qty: 2 },
      { slug: 'miel-azahar-500', name: 'Miel de azahar 500 g', unit_price_cents: 750, qty: 1 },
    ],
    tracking: { carrier: 'GLS', number: 'GLS-0099441122' },
    timeline: [
      { to: 'pending', at: ['-7 days'] },
      { to: 'paid', at: ['-7 days', '+3 minutes'] },
      { to: 'shipped', at: ['-6 days', '+4 hours'] },
      { to: 'delivered', at: ['-4 days'] },
    ],
  },

  // ── SHIPPED · Canarias · una línea · porte SIEMPRE cobrado (free_over null) ──
  {
    order_number: 'BM-DEMO-1003',
    status: 'shipped',
    customer: {
      name: 'Aitor Santana Díaz',
      email: 'aitor.santana@example.com',
      phone: '650778899',
      street: 'Calle Triana, 88',
      city: 'Las Palmas de Gran Canaria',
      postal_code: '35002',
      zone: 'canarias',
    },
    lines: [
      { slug: 'aove-farga-centenaria-500', name: 'AOVE Farga Centenaria 500 ml', unit_price_cents: 1890, qty: 2 },
    ],
    tracking: { carrier: 'Correos Express', number: 'CEX-CAN-771200934' },
    timeline: [
      { to: 'pending', at: ['-4 days'] },
      { to: 'paid', at: ['-4 days', '+2 minutes'] },
      { to: 'shipped', at: ['-3 days'] },
    ],
  },

  // ── SHIPPED · península · una línea · con datos de FACTURA (empresa + NIF) ──
  {
    order_number: 'BM-DEMO-1004',
    status: 'shipped',
    customer: {
      name: 'Lucía Marín Prats',
      email: 'compras@hostalelpont.example',
      phone: '964221100',
      street: 'Plaça de l’Ajuntament, 1',
      city: 'Morella',
      postal_code: '12300',
      zone: 'peninsula',
      nif: 'B12345678',
      company: 'Hostal El Pont S.L.',
    },
    lines: [
      { slug: 'tabla-degustacion-embutidos', name: 'Tabla degustación de embutidos', unit_price_cents: 1990, qty: 2 },
      { slug: 'estuche-tres-vinos', name: 'Estuche selección 3 vinos', unit_price_cents: 2790, qty: 1 },
    ],
    tracking: { carrier: 'MRW', number: 'MRW-5521006643' },
    timeline: [
      { to: 'pending', at: ['-3 days'] },
      { to: 'paid', at: ['-3 days', '+9 minutes'] },
      { to: 'shipped', at: ['-2 days', '+6 hours'] },
    ],
  },

  // ── PAID · Baleares · varias líneas · porte cobrado (subtotal < 8000) ──
  {
    order_number: 'BM-DEMO-1005',
    status: 'paid',
    customer: {
      name: 'Neus Colom Vidal',
      email: 'neus.colom@example.com',
      street: 'Carrer de la Mar, 27',
      city: 'Palma',
      postal_code: '07001',
      zone: 'baleares',
    },
    lines: [
      { slug: 'tabla-quesos-seleccion', name: 'Tabla selección 4 quesos', unit_price_cents: 2490, qty: 1 },
      { slug: 'tinto-crianza-garnacha', name: 'Tinto crianza Garnacha 75 cl', unit_price_cents: 1150, qty: 2 },
    ],
    timeline: [
      { to: 'pending', at: ['-2 days'] },
      { to: 'paid', at: ['-2 days', '+4 minutes'] },
    ],
  },

  // ── PAID · Baleares · varias líneas · ENVÍO GRATIS (subtotal ≥ 8000) ──
  {
    order_number: 'BM-DEMO-1006',
    status: 'paid',
    customer: {
      name: 'Pau Riera Font',
      email: 'pau.riera@example.com',
      phone: '620443311',
      street: 'Camí de Son Rapinya, 45',
      city: 'Palma',
      postal_code: '07013',
      zone: 'baleares',
    },
    lines: [
      { slug: 'estuche-tres-vinos', name: 'Estuche selección 3 vinos', unit_price_cents: 2790, qty: 2 },
      { slug: 'tabla-quesos-seleccion', name: 'Tabla selección 4 quesos', unit_price_cents: 2490, qty: 1 },
    ],
    timeline: [
      { to: 'pending', at: ['-1 day', '-3 hours'] },
      { to: 'paid', at: ['-1 day', '-3 hours', '+5 minutes'] },
    ],
  },

  // ── PENDING · Ceuta/Melilla · una línea · esperando pago (sin emails) ──
  {
    order_number: 'BM-DEMO-1007',
    status: 'pending',
    customer: {
      name: 'Rocío Navarro León',
      email: 'rocio.navarro@example.com',
      street: 'Avenida de España, 12',
      city: 'Melilla',
      postal_code: '52001',
      zone: 'ceuta-melilla',
    },
    lines: [
      { slug: 'queso-oveja-viejo-400', name: 'Queso de oveja viejo 400 g', unit_price_cents: 1290, qty: 1 },
    ],
    timeline: [{ to: 'pending', at: ['-3 hours'] }],
  },

  // ── CANCELLED · península · una línea · sesión de pago caducada (sin emails) ──
  {
    order_number: 'BM-DEMO-1008',
    status: 'cancelled',
    customer: {
      name: 'Sergio Ibáñez Mora',
      email: 'sergio.ibanez@example.com',
      street: 'Ronda Magdalena, 60',
      city: 'Vila-real',
      postal_code: '12540',
      zone: 'peninsula',
    },
    lines: [
      { slug: 'fuet-artesa-200', name: 'Fuet artesà 200 g', unit_price_cents: 420, qty: 2 },
    ],
    timeline: [
      { to: 'pending', at: ['-1 hour'] },
      { to: 'cancelled', at: ['-1 hour', '+31 minutes'] },
    ],
  },
];

// —————————————————————————————————————————————————————————————————————————
// Derivación: totales, notas de evento y emails
// —————————————————————————————————————————————————————————————————————————

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pendiente de pago',
  paid: 'Pagado',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

/** Nota humana de cada transición, alineada con el flujo real (orders.ts / order-transitions.ts). */
function eventNote(order: FixtureOrder, to: OrderStatus): string {
  switch (to) {
    case 'pending':
      return 'Pedido creado, esperando pago';
    case 'paid':
      return 'Pago confirmado (simulado)';
    case 'shipped':
      return order.tracking
        ? `Enviado con ${order.tracking.carrier} (${order.tracking.number})`
        : 'Enviado';
    case 'delivered':
      return 'Marcado como entregado';
    case 'cancelled':
      return 'Sesión de pago caducada';
  }
}

/** ¿Qué estados alcanzó el pedido a lo largo de su timeline? */
function reached(order: FixtureOrder): Set<OrderStatus> {
  return new Set(order.timeline.map((step) => step.to));
}

function totalsFor(order: FixtureOrder): { subtotal: number; shipping: number; total: number } {
  const rate = rateByZone.get(order.customer.zone);
  if (!rate) throw new Error(`Zona sin tarifa en el seed: ${order.customer.zone}`);
  const subtotal = computeSubtotalCents(order.lines);
  const shipping = computeShippingCents(subtotal, rate);
  return { subtotal, shipping, total: subtotal + shipping };
}

function emailDataFor(order: FixtureOrder): OrderEmailData {
  const { subtotal, shipping, total } = totalsFor(order);
  return {
    order_number: order.order_number,
    customer_name: order.customer.name,
    email: order.customer.email,
    subtotal_cents: subtotal,
    shipping_cents: shipping,
    total_cents: total,
    items: order.lines.map((line) => ({
      name_snapshot: line.name,
      unit_price_cents: line.unit_price_cents,
      qty: line.qty,
    })),
  };
}

function emailInsert(email: EmailMessage, at: readonly string[]): string {
  return (
    `INSERT INTO emails_outbox (to_addr, subject, body_html, created_at) VALUES (` +
    `${sqlString(email.to_addr)}, ${sqlString(email.subject)}, ${sqlString(email.body_html)}, ${sqlNow(at)})`
  );
}

// —————————————————————————————————————————————————————————————————————————
// Emisión de SQL
// —————————————————————————————————————————————————————————————————————————

/**
 * Sentencias que siembran los pedidos de demo. Se ejecutan DESPUÉS de products y
 * shipping_rates (las subconsultas por slug/order_number los necesitan ya
 * insertados en la misma batch transaccional).
 */
export function demoOrderStatements(): string[] {
  const statements: string[] = [];

  for (const order of fixtures) {
    const { subtotal, shipping, total } = totalsFor(order);
    const reachedStatuses = reached(order);
    const created = order.timeline[0]!;
    const last = order.timeline[order.timeline.length - 1]!;

    const addressJson = JSON.stringify({
      name: order.customer.name,
      phone: order.customer.phone ?? null,
      street: order.customer.street,
      city: order.customer.city,
      postal_code: order.customer.postal_code,
      zone: order.customer.zone,
      nif: order.customer.nif ?? null,
      company: order.customer.company ?? null,
    });

    const paymentIntent = reachedStatuses.has('paid') ? `sim_pi_${order.order_number}` : null;
    const trackingCarrier = order.tracking && reachedStatuses.has('shipped') ? order.tracking.carrier : null;
    const trackingNumber = order.tracking && reachedStatuses.has('shipped') ? order.tracking.number : null;

    // 1) El pedido.
    statements.push(
      `INSERT INTO orders (order_number, email, customer_name, address_json, ` +
        `subtotal_cents, shipping_cents, total_cents, status, stripe_session_id, ` +
        `stripe_payment_intent, tracking_carrier, tracking_number, created_at, updated_at) VALUES (` +
        `${sqlString(order.order_number)}, ${sqlString(order.customer.email)}, ` +
        `${sqlString(order.customer.name)}, ${sqlString(addressJson)}, ` +
        `${subtotal}, ${shipping}, ${total}, ${sqlString(order.status)}, ` +
        `${sqlString(`sim_sess_${order.order_number}`)}, ` +
        `${paymentIntent === null ? 'NULL' : sqlString(paymentIntent)}, ` +
        `${trackingCarrier === null ? 'NULL' : sqlString(trackingCarrier)}, ` +
        `${trackingNumber === null ? 'NULL' : sqlString(trackingNumber)}, ` +
        `${sqlNow(created.at)}, ${sqlNow(last.at)})`,
    );

    // 2) Las líneas (product_id por subconsulta de slug — integridad referencial real).
    for (const line of order.lines) {
      statements.push(
        `INSERT INTO order_items (order_id, product_id, name_snapshot, unit_price_cents, qty) VALUES (` +
          `${orderIdByNumber(order.order_number)}, ${productIdBySlug(line.slug)}, ` +
          `${sqlString(line.name)}, ${line.unit_price_cents}, ${line.qty})`,
      );
    }

    // 3) El timeline de eventos (uno por hito, con su propio timestamp).
    let previous: OrderStatus | null = null;
    for (const step of order.timeline) {
      const from = previous === null ? 'NULL' : sqlString(previous);
      statements.push(
        `INSERT INTO order_events (order_id, from_status, to_status, note, created_at) VALUES (` +
          `${orderIdByNumber(order.order_number)}, ${from}, ${sqlString(step.to)}, ` +
          `${sqlString(eventNote(order, step.to))}, ${sqlNow(step.at)})`,
      );
      previous = step.to;
    }

    // 4) Los emails que el flujo real habría generado.
    if (reachedStatuses.has('paid')) {
      const paidStep = order.timeline.find((step) => step.to === 'paid')!;
      const data = emailDataFor(order);
      // Confirmación al comprador + aviso interno al comercio (lo que emite el webhook).
      statements.push(emailInsert(orderConfirmationEmail(data), paidStep.at));
      statements.push(emailInsert(merchantNewOrderEmail(data), paidStep.at));
    }
    if (reachedStatuses.has('shipped') && order.tracking) {
      const shippedStep = order.timeline.find((step) => step.to === 'shipped')!;
      statements.push(
        emailInsert(orderShippedEmail(emailDataFor(order), order.tracking), shippedStep.at),
      );
    }
  }

  return statements;
}

/**
 * Metadatos de las fixtures — los consume el test de cobertura (`tests/demo-seed.test.ts`)
 * para verificar que el panel de demo sigue mostrando todas las variantes.
 */
export const demoOrderFixtures = fixtures;
export const demoOrderStatusLabels = STATUS_LABEL;

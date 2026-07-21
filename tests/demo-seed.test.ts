/**
 * Cobertura del seed de demo (Fase 9B.2).
 * ============================================================================
 *
 * El seed corre en vivo en `/api/demo/reset` y en el cron cada 6 h. Si genera SQL
 * incoherente (un slug que no existe → product_id NULL → viola NOT NULL) la demo
 * se rompe en silencio. Estos tests fijan que:
 *
 *   · las fixtures siguen cubriendo TODAS las variantes que el panel enseña;
 *   · cada línea apunta a un producto que el seed inserta de verdad;
 *   · el generador de SQL no revienta y emite lo esperado por tabla.
 */
import { describe, expect, it } from 'vitest';
import { shopConfig } from '../shop.config';
import { demoOrderFixtures, demoOrderStatements } from '../seed/demo-orders';
import { seedProducts } from '../seed/products';
import { seedStatements } from '../seed/seed';
import { demoCollection } from '../src/collections/demo';
import { ORDER_STATUSES } from '../src/lib/order-transitions';
import { computeShippingCents, computeSubtotalCents } from '../src/lib/pricing';

const DEMO = 'demo';
const slugsInSeed = new Set(seedProducts.map((prod) => prod.slug));
const rateByZone = new Map(shopConfig.shipping.seedRates.map((rate) => [rate.zone, rate]));

describe('fixtures de pedidos: cobertura del panel', () => {
  it('cubre los cinco estados de pedido', () => {
    const present = new Set(demoOrderFixtures.map((order) => order.status));
    for (const status of ORDER_STATUSES) {
      expect(present, `falta un pedido en estado «${status}»`).toContain(status);
    }
  });

  it('cubre las cuatro zonas de envío', () => {
    const zonesInFixtures = new Set(demoOrderFixtures.map((order) => order.customer.zone));
    for (const zone of shopConfig.shipping.zones) {
      expect(zonesInFixtures, `ninguna fixture usa la zona «${zone.id}»`).toContain(zone.id);
    }
  });

  it('cubre las formas: una línea, varias líneas, envío gratis y porte cobrado', () => {
    const shapes = demoOrderFixtures.map((order) => {
      const rate = rateByZone.get(order.customer.zone)!;
      const subtotal = computeSubtotalCents(order.lines);
      return { lines: order.lines.length, shipping: computeShippingCents(subtotal, rate) };
    });
    expect(shapes.some((s) => s.lines === 1)).toBe(true);
    expect(shapes.some((s) => s.lines > 1)).toBe(true);
    expect(shapes.some((s) => s.shipping === 0)).toBe(true); // envío gratis por umbral
    expect(shapes.some((s) => s.shipping > 0)).toBe(true); // porte cobrado
  });

  it('al menos un pedido tiene timeline con más de un evento', () => {
    expect(demoOrderFixtures.some((order) => order.timeline.length > 1)).toBe(true);
  });

  it('todo pedido nace en pending (primer evento, from = null)', () => {
    for (const order of demoOrderFixtures) {
      expect(order.timeline[0]?.to, `${order.order_number} no arranca en pending`).toBe('pending');
    }
  });

  it('los pedidos shipped/delivered llevan tracking', () => {
    for (const order of demoOrderFixtures) {
      const reached = new Set(order.timeline.map((step) => step.to));
      if (reached.has('shipped')) {
        expect(order.tracking?.carrier, `${order.order_number} enviado sin transportista`).toBeTruthy();
        expect(order.tracking?.number, `${order.order_number} enviado sin nº de seguimiento`).toBeTruthy();
      }
    }
  });

  it('cada línea apunta a un producto que el seed inserta (integridad referencial)', () => {
    for (const order of demoOrderFixtures) {
      for (const line of order.lines) {
        expect(slugsInSeed, `${order.order_number} referencia un slug inexistente: ${line.slug}`).toContain(
          line.slug,
        );
      }
    }
  });
});

describe('generación de SQL del seed de demo', () => {
  it('no lanza y emite una fila por pedido, línea y evento', () => {
    const statements = demoOrderStatements();
    const count = (table: string): number =>
      statements.filter((sql) => sql.startsWith(`INSERT INTO ${table}`)).length;

    const totalLines = demoOrderFixtures.reduce((sum, o) => sum + o.lines.length, 0);
    const totalEvents = demoOrderFixtures.reduce((sum, o) => sum + o.timeline.length, 0);

    expect(count('orders')).toBe(demoOrderFixtures.length);
    expect(count('order_items')).toBe(totalLines);
    expect(count('order_events')).toBe(totalEvents);
  });

  it('genera los dos tipos de email de cliente: confirmación y aviso de envío', () => {
    const emails = demoOrderStatements().filter((sql) => sql.startsWith('INSERT INTO emails_outbox'));
    expect(emails.some((sql) => sql.includes('confirmado'))).toBe(true); // confirmación de pedido
    expect(emails.some((sql) => sql.includes('en camino'))).toBe(true); // aviso de envío con tracking
  });

  it('seedStatements() completo no lanza e incluye los pedidos de demo', () => {
    const all = seedStatements();
    expect(all.some((sql) => sql.startsWith('INSERT INTO orders'))).toBe(true);
    expect(all.some((sql) => sql.startsWith('INSERT INTO order_events'))).toBe(true);
    expect(all.some((sql) => sql.startsWith('INSERT INTO emails_outbox'))).toBe(true);
  });
});

describe('estados de producto visibles en la demo', () => {
  it('incluye un producto agotado (stock 0)', () => {
    expect(seedProducts.some((prod) => prod.stock === 0)).toBe(true);
  });

  it('incluye un producto con stock bajo', () => {
    expect(seedProducts.some((prod) => prod.stock > 0 && prod.stock <= 5)).toBe(true);
  });

  it('incluye un producto inactivo', () => {
    expect(seedProducts.some((prod) => prod.active === 0)).toBe(true);
  });

  it('incluye un producto con oferta (compare_at > price)', () => {
    expect(
      seedProducts.some(
        (prod) => prod.compare_at_price_cents !== undefined && prod.compare_at_price_cents > prod.price_cents,
      ),
    ).toBe(true);
  });

  it('incluye un producto con subtítulo y otro con ficha técnica', () => {
    expect(seedProducts.some((prod) => prod.subtitle !== undefined)).toBe(true);
    expect(seedProducts.some((prod) => (prod.specs?.length ?? 0) > 0)).toBe(true);
  });
});

describe('estados vacíos alcanzables', () => {
  it('la colección demo tiene una categoría sin productos sembrados', () => {
    const withProducts = new Set(
      seedProducts.filter((prod) => (prod.collection ?? DEMO) === DEMO).map((prod) => prod.category),
    );
    const emptyCategories = demoCollection.categories.filter((cat) => !withProducts.has(cat.id));
    expect(emptyCategories.length, 'no hay ninguna categoría vacía para demostrar el estado vacío').toBeGreaterThan(
      0,
    );
  });
});

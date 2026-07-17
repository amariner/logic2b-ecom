/**
 * Cálculo de presupuesto de carrito contra D1.
 * El cliente SOLO envía slugs y cantidades — los precios salen siempre de la base.
 */

import { z } from 'zod';
import { getProductsBySlugs, getRateForZone } from './db';
import { computeShippingCents, computeSubtotalCents } from './pricing';
import { resolveZone } from './shipping';

export const quoteRequestSchema = z.object({
  lines: z
    .array(
      z.object({
        slug: z.string().min(1).max(120),
        qty: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(50),
  postal_code: z.string().trim().min(1).max(10).optional(),
});

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export type QuoteLine = {
  slug: string;
  name: string;
  image: string;
  unit_price_cents: number;
  qty: number;
  line_total_cents: number;
  available_stock: number;
  /** ok = servible; el resto son motivos por los que la línea no puede comprarse tal cual */
  status: 'ok' | 'not-found' | 'out-of-stock' | 'insufficient-stock';
};

export type QuoteResult = {
  lines: QuoteLine[];
  subtotal_cents: number;
  /** null cuando aún no hay CP válido con cobertura */
  shipping_cents: number | null;
  total_cents: number | null;
  shipping: { zone: string; label: string; free_over_cents: number | null } | null;
  /** true si todas las líneas son servibles */
  purchasable: boolean;
};

export async function quoteCart(db: D1Database, request: QuoteRequest): Promise<QuoteResult> {
  // Colapsar duplicados del mismo slug antes de tocar la base
  const qtyBySlug = new Map<string, number>();
  for (const line of request.lines) {
    qtyBySlug.set(line.slug, (qtyBySlug.get(line.slug) ?? 0) + line.qty);
  }

  const products = await getProductsBySlugs(db, [...qtyBySlug.keys()]);
  const bySlug = new Map(products.map((prod) => [prod.slug, prod]));

  const lines: QuoteLine[] = [...qtyBySlug.entries()].map(([slug, qty]) => {
    const prod = bySlug.get(slug);
    if (!prod) {
      return { slug, name: slug, image: '', unit_price_cents: 0, qty, line_total_cents: 0, available_stock: 0, status: 'not-found' };
    }
    const status = prod.stock === 0 ? 'out-of-stock' : prod.stock < qty ? 'insufficient-stock' : 'ok';
    return {
      slug,
      name: prod.name,
      image: prod.image,
      unit_price_cents: prod.price_cents,
      qty,
      line_total_cents: status === 'ok' ? prod.price_cents * qty : 0,
      available_stock: prod.stock,
      status,
    };
  });

  const servable = lines.filter((line) => line.status === 'ok');
  const subtotal_cents = computeSubtotalCents(servable);

  let shipping_cents: number | null = null;
  let shipping: QuoteResult['shipping'] = null;
  if (request.postal_code !== undefined) {
    const zone = resolveZone(request.postal_code);
    if (zone !== null) {
      const rate = await getRateForZone(db, zone);
      if (rate !== null) {
        shipping_cents = computeShippingCents(subtotal_cents, rate);
        shipping = { zone: rate.zone, label: rate.label, free_over_cents: rate.free_over_cents };
      }
    }
  }

  return {
    lines,
    subtotal_cents,
    shipping_cents,
    total_cents: shipping_cents === null ? null : subtotal_cents + shipping_cents,
    shipping,
    purchasable: lines.length > 0 && lines.every((line) => line.status === 'ok'),
  };
}

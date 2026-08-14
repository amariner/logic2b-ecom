/**
 * Cálculo de presupuesto de carrito contra D1.
 * El cliente SOLO envía slugs y cantidades — los precios salen siempre de la base.
 */

import { z } from 'zod';
import { getProductsBySlugs, getRateForZone } from './db';
import type { CatalogReadMode } from '../modules/catalog';
import {
  evaluatePriceRules,
  createD1PromotionCodes,
  resolvePromotionCode,
  type PriceBreakdown,
  type PriceRuleCandidate,
  type PriceRuleContext,
} from '../modules/pricing';
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
  promotion_code: z.string().trim().min(3).max(32).optional(),
});

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

/** Tope por producto tras agrupar líneas duplicadas (ver `aggregateLineQuantities`). */
const MAX_QTY_PER_LINE = 99;

/**
 * Agrupa líneas duplicadas del mismo slug sumando qty, con el mismo tope de 99
 * uds que ya aplica el cliente en `cart-client.ts`. Sin este tope, una petición
 * fabricada a mano con el mismo slug repetido en varias líneas (cada una ≤ 99,
 * el máximo que valida el schema por línea) podría acumular una cantidad muy
 * superior a 99 para ese producto.
 */
export function aggregateLineQuantities(lines: readonly { slug: string; qty: number }[]): Map<string, number> {
  const qtyBySlug = new Map<string, number>();
  for (const line of lines) {
    const next = (qtyBySlug.get(line.slug) ?? 0) + line.qty;
    qtyBySlug.set(line.slug, Math.min(next, MAX_QTY_PER_LINE));
  }
  return qtyBySlug;
}

export type QuoteLine = {
  slug: string;
  name: string;
  image: string;
  unit_price_cents: number;
  qty: number;
  line_total_cents: number;
  available_stock: number;
  /** Desglose servidor; null únicamente cuando el producto no existe. */
  pricing: PriceBreakdown | null;
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
  promotion:
    | Readonly<{ status: 'not_provided' }>
    | Readonly<{ status: 'rejected'; reason: 'invalid_or_unavailable' }>
    | Readonly<{
      status: 'applied'; promotion_id: string; version: number; label: string; discount_cents: number;
    }>;
};

export async function quoteCart(
  db: D1Database,
  request: QuoteRequest,
  options: Readonly<{
    catalogReadMode?: CatalogReadMode;
    pricingContext?: PriceRuleContext;
    priceRulesBySlug?: Readonly<Record<string, readonly PriceRuleCandidate[]>>;
    promotionCustomerKeyHash?: string;
    promotionCodesEnabled?: boolean;
  }> = {},
): Promise<QuoteResult> {
  // Colapsar duplicados del mismo slug antes de tocar la base
  const qtyBySlug = aggregateLineQuantities(request.lines);

  const products = await getProductsBySlugs(
    db,
    [...qtyBySlug.keys()],
    options.catalogReadMode ?? 'legacy',
  );
  const bySlug = new Map(products.map((prod) => [prod.slug, prod]));
  const pricingContext = options.pricingContext ?? {
    at: new Date().toISOString(),
    currency: 'EUR',
    market: 'ES',
    channel: 'storefront',
  };
  let promotionResolution: ReturnType<typeof resolvePromotionCode> | null = null;
  if (request.promotion_code !== undefined && options.promotionCodesEnabled === true) {
    let lookup: Awaited<ReturnType<ReturnType<typeof createD1PromotionCodes>['lookup']>> = null;
    try {
      lookup = await createD1PromotionCodes(db).lookup(
        request.promotion_code,
        options.promotionCustomerKeyHash ?? null,
      );
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
    }
    if (lookup !== null) {
      const baseSubtotalCents = [...qtyBySlug.entries()].reduce((total, [slug, qty]) => {
        const product = bySlug.get(slug);
        return total + (product === undefined ? 0 : product.price_cents * qty);
      }, 0);
      promotionResolution = resolvePromotionCode({
        promotion: lookup.promotion,
        context: pricingContext,
        baseSubtotalCents,
        cartProductIds: products.map((product) => product.id),
        globalUsageCount: lookup.globalUsageCount,
        customerUsageCount: lookup.customerUsageCount,
      });
    }
  }
  const promotionProductIds = new Set(
    promotionResolution?.status === 'eligible' ? promotionResolution.eligibleProductIds : [],
  );

  const lines: QuoteLine[] = [...qtyBySlug.entries()].map(([slug, qty]) => {
    const prod = bySlug.get(slug);
    if (!prod) {
      return {
        slug, name: slug, image: '', unit_price_cents: 0, qty,
        line_total_cents: 0, available_stock: 0, pricing: null, status: 'not-found',
      };
    }
    const status = prod.stock === 0 ? 'out-of-stock' : prod.stock < qty ? 'insufficient-stock' : 'ok';
    const configuredCandidates = options.priceRulesBySlug?.[slug];
    const promotionCandidates = promotionResolution?.status === 'eligible' && promotionProductIds.has(prod.id)
      ? [promotionResolution.candidate]
      : undefined;
    if (configuredCandidates !== undefined && promotionCandidates !== undefined) {
      throw new Error('La combinación de fuentes de descuento requiere PRC-008.');
    }
    const candidates = configuredCandidates ?? promotionCandidates;
    const pricing = evaluatePriceRules({
      baseUnitPriceCents: prod.price_cents,
      quantity: qty,
      context: pricingContext,
      ...(candidates === undefined
        ? {}
        : { candidates }),
    });
    return {
      slug,
      name: prod.name,
      image: prod.image,
      unit_price_cents: pricing.unit_price_cents,
      qty,
      line_total_cents: status === 'ok' ? pricing.subtotal_cents : 0,
      available_stock: prod.stock,
      pricing,
      status,
    };
  });

  const servable = lines.filter((line) => line.status === 'ok');
  const subtotal_cents = computeSubtotalCents(servable);
  const promotionDiscountCents = servable.reduce((total, line) =>
    total + (line.pricing?.applied_rule?.id.startsWith('promotion:') ? line.pricing.discount_cents : 0), 0);
  const promotion: QuoteResult['promotion'] = request.promotion_code === undefined
    ? { status: 'not_provided' }
    : promotionResolution?.status === 'eligible' && promotionDiscountCents > 0
      ? {
        status: 'applied',
        promotion_id: promotionResolution.candidate.id.slice('promotion:'.length),
        version: promotionResolution.candidate.version,
        label: promotionResolution.candidate.label,
        discount_cents: promotionDiscountCents,
      }
      : { status: 'rejected', reason: 'invalid_or_unavailable' };

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
    promotion,
  };
}

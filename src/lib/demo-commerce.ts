/** Simulación local de compra para los escaparates públicos. Cero red y cero D1. */
import type { CartLine } from './cart-client';
import type { DemoProductSummary } from './demo-catalog';

export type DemoShippingConfig = {
  zones: readonly { id: string; label: string; postalPrefixes: readonly string[] }[];
  rates: readonly {
    zone: string;
    label: string;
    price_cents: number;
    free_over_cents: number | null;
  }[];
};

export type DemoQuoteLine = DemoProductSummary & {
  qty: number;
  line_total_cents: number;
  status: 'ok' | 'not-found' | 'out-of-stock' | 'insufficient-stock';
};

export type DemoQuote = {
  lines: DemoQuoteLine[];
  subtotal_cents: number;
  shipping_cents: number | null;
  total_cents: number | null;
  purchasable: boolean;
  shipping_label: string | null;
  free_over_cents: number | null;
};

export type DemoOrder = {
  order_number: string;
  customer_name: string;
  email: string;
  total_cents: number;
};

export const DEMO_POSTAL_STORAGE_KEY = 'ecom-demo-cp';

export function demoOrderStorageKey(collection: string): string {
  return `ecom-demo-order:${collection}`;
}

export function buildDemoQuote(
  products: readonly DemoProductSummary[],
  cart: readonly CartLine[],
  postalCode: string,
  shippingConfig: DemoShippingConfig,
): DemoQuote {
  const productBySlug = new Map(products.map((product) => [product.slug, product]));
  const lines = cart.map((cartLine): DemoQuoteLine => {
    const product = productBySlug.get(cartLine.slug);
    if (!product) {
      return {
        slug: cartLine.slug,
        name: cartLine.slug,
        price_cents: 0,
        stock: 0,
        image: '',
        qty: cartLine.qty,
        line_total_cents: 0,
        status: 'not-found',
      };
    }
    const status =
      product.stock === 0
        ? 'out-of-stock'
        : cartLine.qty > product.stock
          ? 'insufficient-stock'
          : 'ok';
    return {
      ...product,
      qty: cartLine.qty,
      line_total_cents: status === 'ok' ? product.price_cents * cartLine.qty : 0,
      status,
    };
  });

  const subtotalCents = lines.reduce((sum, line) => sum + line.line_total_cents, 0);
  const zone =
    postalCode.length === 5
      ? shippingConfig.zones.find((candidate) =>
          candidate.postalPrefixes.some((prefix) => postalCode.startsWith(prefix)),
        )
      : undefined;
  const rate = zone ? shippingConfig.rates.find((candidate) => candidate.zone === zone.id) : undefined;
  const shippingCents = rate
    ? rate.free_over_cents !== null && subtotalCents >= rate.free_over_cents
      ? 0
      : rate.price_cents
    : null;
  const purchasable = lines.length > 0 && lines.every((line) => line.status === 'ok');

  return {
    lines,
    subtotal_cents: subtotalCents,
    shipping_cents: shippingCents,
    total_cents: purchasable && shippingCents !== null ? subtotalCents + shippingCents : null,
    purchasable,
    shipping_label: rate?.label ?? null,
    free_over_cents: rate?.free_over_cents ?? null,
  };
}

export function createDemoOrder(customerName: string, email: string, totalCents: number): DemoOrder {
  const token = crypto.randomUUID().slice(0, 8).toUpperCase();
  return {
    order_number: `DEMO-${token}`,
    customer_name: customerName,
    email,
    total_cents: totalCents,
  };
}

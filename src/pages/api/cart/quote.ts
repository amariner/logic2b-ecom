import type { APIRoute } from 'astro';
import { shopConfig } from '../../../../shop.config';
import { quoteCart, quoteRequestSchema } from '../../../lib/quote';
import { resolveCatalogReadMode } from '../../../modules/catalog';
import { runtimePlatform } from '../../../composition/runtime-platform';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json(
      { error: 'La demo pública calcula el carrito localmente y no expone cotización remota.' },
      { status: 410 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Payload inválido', details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await quoteCart(locals.runtime.env.DB, parsed.data, {
    catalogReadMode: resolveCatalogReadMode(locals.runtime.env.CATALOG_READ_MODE),
    pricingContext: {
      at: new Date().toISOString(),
      currency: shopConfig.currency.toUpperCase(),
      market: 'ES',
      channel: 'storefront',
    },
    promotionCodesEnabled: runtimePlatform.isCapabilityActive('PRC-004'),
    automaticDiscountsEnabled: runtimePlatform.isCapabilityActive('PRC-005'),
    quantityTiersEnabled: runtimePlatform.isCapabilityActive('PRC-006'),
    buyXGetYEnabled: runtimePlatform.isCapabilityActive('PRC-007'),
    discountCombinationsEnabled: runtimePlatform.isCapabilityActive('PRC-008'),
  });
  return Response.json(result);
};

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { shopConfig } from '../../../../shop.config';
import { createOrderOperations } from '../../../composition/order-operations';
import { getProductIdsBySlugs } from '../../../lib/db';
import { generateOrderNumber, generateSimulatedSessionToken } from '../../../lib/orders';
import { isSimulatedPayment } from '../../../lib/payment-mode';
import { DEFAULT_COLLECTION_ID, resolveCollection, storePaths } from '../../../collections';
import { quoteCart } from '../../../lib/quote';
import { flushEventOutbox } from '../../../composition/outbox-dispatcher';
import { stripeClient } from '../../../lib/stripe';
import type { NewOrderLine } from '../../../modules/orders';
import { promotionCustomerHash } from '../../../modules/pricing';
import { resolveCatalogReadMode } from '../../../modules/catalog';
import { INVENTORY_RESERVATION_POLICY } from '../../../modules/inventory';
import { runtimePlatform } from '../../../composition/runtime-platform';
import {
  OperationalError,
  asOperationalError,
  createConsoleObservability,
  createOperationId,
} from '../../../platform/operations';

export const prerender = false;

const checkoutRequestSchema = z.object({
  lines: z
    .array(z.object({
      slug: z.string().min(1).max(120), qty: z.number().int().min(1).max(99),
      bundle_selections: z.array(z.object({
        group_id: z.string().trim().min(1).max(100),
        product_slug: z.string().trim().min(1).max(120),
      }).strict()).max(100).optional(),
    }))
    .min(1)
    .max(50),
  // Tienda desde la que se compra (9B.4): decide SOLO adónde se vuelve tras el
  // pago (gracias/carrito de esa tienda). Se valida contra el registro — un id
  // desconocido cae a la tienda genérica, nunca a una URL construida del input.
  collection: z.string().trim().max(40).optional(),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().max(30).optional(),
    street: z.string().trim().min(3).max(200),
    city: z.string().trim().min(2).max(100),
    postal_code: z.string().trim().regex(/^\d{5}$/, 'CP de 5 dígitos'),
    // Datos de facturación opcionales: el kit no emite facturas (ver ROADMAP),
    // pero el pedido nace con lo necesario para que el comercio la haga fuera.
    nif: z.string().trim().max(20).optional(),
    company: z.string().trim().max(160).optional(),
  }),
  promotion_code: z.string().trim().min(3).max(32).optional(),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json(
      { error: 'La demo pública no crea pedidos ni sesiones de pago.' },
      { status: 410 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  const operationId = createOperationId();
  const observability = createConsoleObservability();
  const started = performance.now();
  try {
    const { lines, customer } = parsed.data;
    const promotionsEnabled = runtimePlatform.isCapabilityActive('PRC-004');
    const automaticDiscountsEnabled = runtimePlatform.isCapabilityActive('PRC-005');
    const quantityTiersEnabled = runtimePlatform.isCapabilityActive('PRC-006');
    const buyXGetYEnabled = runtimePlatform.isCapabilityActive('PRC-007');
    const discountCombinationsEnabled = runtimePlatform.isCapabilityActive('PRC-008');
    const priceListsEnabled = runtimePlatform.isCapabilityActive('PRC-009');
    const bundlesEnabled = runtimePlatform.isCapabilityActive('PRC-012');
    const promotionCustomerKeyHash = parsed.data.promotion_code === undefined
      ? null
      : await promotionCustomerHash(customer.email);
    const storeCollection = resolveCollection(parsed.data.collection);
    const paths = storePaths(storeCollection?.id ?? DEFAULT_COLLECTION_ID);

    // Revalidar TODO contra D1: precios, stock y cobertura de envío (§7.4)
    const quote = await quoteCart(env.DB, {
      lines,
      postal_code: customer.postal_code,
      ...(parsed.data.promotion_code === undefined
        ? {}
        : { promotion_code: parsed.data.promotion_code }),
    }, {
      catalogReadMode: resolveCatalogReadMode(env.CATALOG_READ_MODE),
      pricingContext: {
        at: new Date().toISOString(),
        currency: shopConfig.currency.toUpperCase(),
        market: 'ES',
        channel: 'storefront',
      },
      promotionCodesEnabled: promotionsEnabled,
      automaticDiscountsEnabled,
      quantityTiersEnabled,
      buyXGetYEnabled,
      discountCombinationsEnabled,
      priceListsEnabled,
      bundlesEnabled,
      ...(promotionCustomerKeyHash === null ? {} : { promotionCustomerKeyHash }),
    });
    if (parsed.data.promotion_code !== undefined && quote.promotion.status !== 'applied') {
      return Response.json(
        { error: 'El código promocional no está disponible para este pedido.' },
        { status: 422, headers: { 'cache-control': 'no-store' } },
      );
    }
    if (!quote.purchasable) {
      return Response.json({ error: 'Hay productos no disponibles en el carrito', quote }, { status: 409 });
    }
    if (quote.shipping_cents === null || quote.total_cents === null || quote.shipping === null) {
      return Response.json({ error: 'No hay cobertura de envío para ese código postal' }, { status: 422 });
    }

    const orderNumber = generateOrderNumber();
    const origin = new URL(request.url).origin;
    const simulate = isSimulatedPayment(env);
    const reservationsEnabled = runtimePlatform.hasCapabilityFlag('INV-004', 'sideEffects');
    const reservationExpiresAt = reservationsEnabled
      ? new Date(Date.now() + INVENTORY_RESERVATION_POLICY.ttlSeconds * 1000).toISOString()
      : null;

    const addressJson = JSON.stringify({
      name: customer.name,
      phone: customer.phone ?? null,
      street: customer.street,
      city: customer.city,
      postal_code: customer.postal_code,
      zone: quote.shipping.zone,
      nif: customer.nif ?? null,
      company: customer.company ?? null,
    });

    // Mapa slug → id de producto para el snapshot de líneas (y el decremento de stock).
    const idBySlug = await getProductIdsBySlugs(
      env.DB,
      quote.lines.map((line) => line.slug),
    );

    // En pago real, el session_id lo da Stripe (alta entropía propia). En
    // simulación lo sintetizamos con un token aleatorio independiente del nº de
    // pedido: /demo/gracias no requiere login y lo usa para exponer nombre/email/total.
    let sessionId = `sim_${generateSimulatedSessionToken()}`;
    let redirectUrl = `${origin}${paths.thanks}?session_id=${sessionId}`;

    if (!simulate) {
      const stripe = stripeClient(env.STRIPE_SECRET_KEY!);

      // line_items construidos EN SERVIDOR desde la quote (nunca del cliente)
      const lineItems = quote.lines.map((line) => ({
        quantity: line.qty,
        price_data: {
          currency: shopConfig.currency,
          unit_amount: line.unit_price_cents,
          product_data: { name: line.name },
        },
      }));
      if (quote.shipping_cents > 0) {
        lineItems.push({
          quantity: 1,
          price_data: {
            currency: shopConfig.currency,
            unit_amount: quote.shipping_cents,
            product_data: { name: `Envío — ${quote.shipping.label}` },
          },
        });
      }

      try {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          line_items: lineItems,
          customer_email: customer.email,
          metadata: { order_number: orderNumber },
          success_url: `${origin}${paths.thanks}?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}${paths.cart}`,
          ...(reservationExpiresAt === null
            ? {}
            : { expires_at: Math.floor(Date.parse(reservationExpiresAt) / 1000) }),
        });
        sessionId = session.id;
        redirectUrl = session.url ?? redirectUrl;
      } catch {
        throw new OperationalError('checkout.provider_failed', true);
      }
    }

    const orderLines: NewOrderLine[] = quote.lines.map((line) => ({
      product_id: idBySlug.get(line.slug) ?? 0,
      name_snapshot: line.name,
      unit_price_cents: line.unit_price_cents,
      base_unit_price_cents: line.pricing!.base_unit_price_cents,
      pricing_snapshot_json: JSON.stringify(line.pricing),
      qty: line.qty,
    }));

    // Pedido en 'pending' + líneas con snapshot de nombre y precio + primer hecho
    // del flujo (`orders.order_placed`), del que sale la entrada del timeline.
    const orders = createOrderOperations(env.DB, undefined, undefined, {
      reservationsEnabled,
      ...(reservationExpiresAt === null ? {} : { reservationExpiresAt }),
      ...(quote.bundles.status !== 'applied'
        ? {}
        : {
          bundleApplications: quote.bundles.applications.map((application) => ({
            bundleId: application.bundle_id,
            bundleVersion: application.version,
            bundleProductId: application.product_id,
            unitPriceCents: application.unit_price_cents,
            quantity: application.quantity,
            snapshot: application.snapshot,
            components: application.components,
          })),
        }),
      ...(quote.price_lists.status !== 'applied'
        ? {}
        : {
          priceListApplications: quote.price_lists.applications.map((application) => ({
            priceListId: application.price_list_id,
            priceListVersion: application.version,
            catalogSubtotalCents: application.catalog_subtotal_cents,
            effectiveSubtotalCents: application.effective_subtotal_cents,
            lineCount: application.line_count,
            snapshot: {
              schema: 1,
              price_list_id: application.price_list_id,
              version: application.version,
              label: application.label,
              line_count: application.line_count,
              catalog_subtotal_cents: application.catalog_subtotal_cents,
              effective_subtotal_cents: application.effective_subtotal_cents,
              delta_cents: application.delta_cents,
              fallback_policy: 'company_then_general_then_catalog_per_product',
              price_rule_policy: 'price_list_before_promotions',
              amendment_policy: 'frozen_unit_price',
              refund_policy: 'proportional_frozen_unit_price',
            },
          })),
        }),
      ...(quote.promotion.status !== 'applied' || promotionCustomerKeyHash === null
        ? {}
        : {
          promotionReservation: {
            promotionId: quote.promotion.promotion_id,
            promotionVersion: quote.promotion.version,
            customerKeyHash: promotionCustomerKeyHash,
            discountCents: quote.promotion.discount_cents,
            snapshot: {
              schema: 1,
              promotion_id: quote.promotion.promotion_id,
              version: quote.promotion.version,
              label: quote.promotion.label,
              discount_cents: quote.promotion.discount_cents,
            },
          },
        }),
      ...(quote.automatic_discount.status !== 'applied'
          || quote.discount_combination.status === 'applied'
        ? {}
        : {
          automaticDiscountApplication: {
            discountId: quote.automatic_discount.discount_id,
            discountVersion: quote.automatic_discount.version,
            discountCents: quote.automatic_discount.discount_cents,
            snapshot: {
              schema: 1,
              discount_id: quote.automatic_discount.discount_id,
              version: quote.automatic_discount.version,
              reason: quote.automatic_discount.reason,
              discount_cents: quote.automatic_discount.discount_cents,
              conflict_policy: 'promotion_code_precedence',
            },
          },
        }),
      ...(quote.quantity_offer.status !== 'applied'
          || quote.discount_combination.status === 'applied'
        ? {}
        : {
          quantityOfferApplication: {
            offerId: quote.quantity_offer.offer_id,
            offerVersion: quote.quantity_offer.version,
            discountCents: quote.quantity_offer.discount_cents,
            snapshot: {
              schema: 1,
              offer_id: quote.quantity_offer.offer_id,
              version: quote.quantity_offer.version,
              kind: quote.quantity_offer.kind,
              reason: quote.quantity_offer.reason,
              discount_cents: quote.quantity_offer.discount_cents,
              evidence: quote.quantity_offer.evidence,
              conflict_policy: 'promotion_code_then_campaign_priority',
              amendment_policy: 'frozen_unit_price',
              refund_policy: 'proportional_frozen_unit_price',
            },
          },
        }),
      ...(quote.discount_combination.status !== 'applied'
        ? {}
        : {
          discountCombinationApplication: {
            policyId: quote.discount_combination.policy_id,
            policyVersion: quote.discount_combination.version,
            discountCents: quote.discount_combination.discount_cents,
            snapshot: {
              schema: 1,
              policy_id: quote.discount_combination.policy_id,
              version: quote.discount_combination.version,
              label: quote.discount_combination.label,
              maximum_discount_basis_points:
                quote.discount_combination.maximum_discount_basis_points,
              discount_cents: quote.discount_combination.discount_cents,
              selected_sources: quote.discount_combination.selected_sources,
              excluded_sources: quote.discount_combination.excluded_sources,
              quantity_evidence: quote.quantity_offer.status === 'applied'
                ? quote.quantity_offer.evidence
                : null,
              evaluation_policy: 'additive_on_base_priority_cap',
              amendment_policy: 'frozen_unit_price',
              refund_policy: 'proportional_frozen_unit_price',
            },
          },
        }),
    });
    const placed = await orders.placeOrder(
      {
        order_number: orderNumber,
        email: customer.email,
        customer_name: customer.name,
        address_json: addressJson,
        subtotal_cents: quote.subtotal_cents,
        shipping_cents: quote.shipping_cents,
        total_cents: quote.total_cents,
        stripe_session_id: sessionId,
        currency: shopConfig.currency.toUpperCase(),
      },
      orderLines,
      simulate ? 'simulated' : 'stripe',
    );
    if (placed === null) throw new OperationalError('checkout.persistence_failed', true);

    // Pago simulado: marcamos pagado al instante (sin Stripe ni webhook). Recorre
    // exactamente el mismo caso de uso que el webhook real → stock, evento y emails;
    // solo cambian el origen del cobro y el hecho que lo causa (el alta del pedido).
    let paymentOutcome: 'pending' | 'confirmed' | 'conflict' = 'pending';
    if (simulate) {
      const confirmed = await orders.confirmPayment({
        lookup: { by: 'id', orderId: placed.orderId },
        paymentIntent: `sim_pi_${orderNumber}`,
        source: 'simulated',
        causationId: placed.event.event_id,
      });
      paymentOutcome = confirmed ? 'confirmed' : 'conflict';
      if (confirmed) {
        locals.runtime.ctx.waitUntil(flushEventOutbox(env.DB, env));
      }
    }

    observability.metric({
      name: 'checkout.completed',
      operationId,
      correlationId: placed.event.correlation_id,
      paymentMode: simulate ? 'simulated' : 'stripe',
      paymentOutcome,
      durationMs: performance.now() - started,
    });
    return Response.json(
      { url: redirectUrl, order_number: orderNumber },
      { headers: { 'x-operation-id': operationId } },
    );
  } catch (error) {
    const operationalError = asOperationalError(error, 'checkout.unexpected_failure');
    observability.failure(operationalError, {
      operation: 'checkout', operationId, durationMs: performance.now() - started,
    });
    return Response.json(
      { error: 'No se pudo iniciar el pago. Inténtalo de nuevo en unos minutos.' },
      { status: 503, headers: { 'x-operation-id': operationId, 'cache-control': 'no-store' } },
    );
  }
};

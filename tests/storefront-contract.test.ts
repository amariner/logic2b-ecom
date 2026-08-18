/** Guardarraíl: demos públicas locales, backend ficticio independiente. */
import { describe, expect, it } from 'vitest';
import cartPageSource from '../src/components/store/CartPage.astro?raw';
import catalogPageSource from '../src/components/store/CatalogPage.astro?raw';
import checkoutPageSource from '../src/components/store/CheckoutPage.astro?raw';
import productPageSource from '../src/components/store/ProductPage.astro?raw';
import thanksPageSource from '../src/components/store/ThanksPage.astro?raw';
import shopLayoutSource from '../src/layouts/Shop.astro?raw';
import dynamicProductRoute from '../src/pages/demo/tiendas/[collection]/[slug].astro?raw';
import dynamicThanksRoute from '../src/pages/demo/tiendas/[collection]/gracias.astro?raw';
import quoteApiSource from '../src/pages/api/cart/quote.ts?raw';
import checkoutApiSource from '../src/pages/api/checkout/session.ts?raw';
import webhookApiSource from '../src/pages/api/webhooks/stripe.ts?raw';
import resetApiSource from '../src/pages/api/demo/reset.ts?raw';
import orderPatchSource from '../src/pages/api/admin/orders/[id].ts?raw';
import productPatchSource from '../src/pages/api/admin/products/[id].ts?raw';
import shippingPatchSource from '../src/pages/api/admin/shipping-rates/[id].ts?raw';
import {
  BLOCKED_DEMO_ENDPOINTS,
  COMMERCE_ENGINE,
  COMMERCE_PARTS,
  COMMERCE_PRESENTATION_SLOTS,
  COMMERCE_SURFACES,
  PRODUCT_COMMERCE_SELECTORS,
} from '../src/lib/storefront-contract';

const storefrontRoutes = import.meta.glob<string>('../src/pages/demo/{tienda,tiendas}/**/*.astro', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const storefrontComponents = import.meta.glob<string>('../src/components/{store,themes}/**/*.{astro,ts}', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const catalogAdminMutationRoutes = import.meta.glob<string>(
  '../src/pages/api/admin/{catalog-options,catalog-option-values,catalog-variants}/**/*.ts',
  { eager: true, query: '?raw', import: 'default' },
);

describe('contrato de las demos de tienda', () => {
  it('fija catálogo embebido y recorrido efímero sin backend', () => {
    expect(COMMERCE_ENGINE).toEqual({
      productSource: 'embedded-seed',
      priceField: 'price_cents',
      cartState: 'namespaced-local-storage',
      quoteSource: 'local-demo-commerce',
      checkoutSource: 'session-storage',
      orderSource: 'ephemeral-session-storage',
      backendSource: 'independent-read-only-fixtures',
    });
    expect(BLOCKED_DEMO_ENDPOINTS).toEqual({
      quote: '/api/cart/quote',
      checkout: '/api/checkout/session',
    });
  });

  it('mantiene las cuatro superficies y sus slots de presentación', () => {
    expect(COMMERCE_SURFACES).toEqual(['product', 'cart', 'checkout', 'thanks']);
    expect(COMMERCE_PRESENTATION_SLOTS.product).toEqual(['presentation']);
    expect(COMMERCE_PRESENTATION_SLOTS.cart).toEqual(['heading', 'empty']);
    expect(COMMERCE_PRESENTATION_SLOTS.checkout).toEqual([
      'heading',
      'intro',
      'submit-label',
      'footnote',
    ]);
    expect(COMMERCE_PRESENTATION_SLOTS.thanks).toEqual(['success', 'missing', 'back-label']);
  });

  const sharedSources = {
    product: productPageSource,
    cart: cartPageSource,
    checkout: checkoutPageSource,
    thanks: thanksPageSource,
  } as const;

  for (const surface of COMMERCE_SURFACES) {
    it(`${surface} conserva hooks estables de presentación`, () => {
      const source = sharedSources[surface];
      expect(source).toContain(`data-commerce-surface="${surface}"`);
      for (const part of COMMERCE_PARTS[surface]) {
        expect(source).toContain(`data-commerce-part="${part}"`);
      }
      for (const slot of COMMERCE_PRESENTATION_SLOTS[surface]) {
        expect(source).toContain(`name="${slot}"`);
      }
    });
  }

  it('carrito, checkout y gracias solo usan estado local', () => {
    expect(cartPageSource).toContain('buildDemoQuote');
    expect(checkoutPageSource).toContain('buildDemoQuote');
    expect(checkoutPageSource).toContain('sessionStorage.setItem');
    expect(thanksPageSource).toContain('sessionStorage.getItem');
    for (const source of [cartPageSource, checkoutPageSource, thanksPageSource]) {
      expect(source).not.toContain("fetch('");
      expect(source).not.toContain('COMMERCE_ENDPOINTS');
    }
  });

  it('la ficha conserva acciones locales de carrito', () => {
    expect(PRODUCT_COMMERCE_SELECTORS).toEqual({
      addToCart: '[data-commerce-action="add-to-cart"]',
      quantity: '[data-commerce-input="quantity"]',
    });
    expect(productPageSource).toContain('PRODUCT_COMMERCE_SELECTORS.addToCart');
    expect(productPageSource).toContain('PRODUCT_COMMERCE_SELECTORS.quantity');
    expect(productPageSource).toContain('data-cart-feedback');
    expect(productPageSource).toContain('aria-live="polite"');
    expect(productPageSource).toContain('fetchpriority="high"');
  });

  it('mantiene navegación, canonical y recuperación sin JavaScript', () => {
    expect(shopLayoutSource).toContain('canonicalPath={Astro.url.pathname}');
    expect(shopLayoutSource).toContain('isImmersiveCatalog');
    expect(shopLayoutSource).toContain('data-store-switcher');
    expect(catalogPageSource).toContain('type="submit"');
    expect(catalogPageSource).toContain("index === 0 ? 'high' : 'auto'");
    for (const source of [productPageSource, cartPageSource, checkoutPageSource, thanksPageSource]) {
      expect(source).toContain('<noscript>');
    }
    expect(cartPageSource).toContain('Seguir comprando');
  });
});

describe('aislamiento de las rutas públicas', () => {
  it('catálogo, ficha y confirmación no consultan D1 ni pedidos', () => {
    expect(Object.keys(storefrontRoutes).length).toBeGreaterThanOrEqual(12);
    for (const id of ['noddo', 'sitega', 'stretch']) {
      expect(Object.keys(storefrontRoutes).some((path) => path.includes(`/tiendas/${id}/`)), id).toBe(false);
    }
    expect(Object.keys(storefrontComponents).length).toBeGreaterThan(30);
    expect(catalogPageSource).toContain('getDemoProducts');
    expect(dynamicProductRoute).toContain('getDemoProduct');
    expect(dynamicThanksRoute).toContain('ThanksPage');
    for (const [path, source] of Object.entries({ ...storefrontRoutes, ...storefrontComponents })) {
      expect(source, path).not.toContain('runtime.env.DB');
      expect(source, path).not.toContain('getProductBySlug');
      expect(source, path).not.toContain('getOrderBySessionId');
      expect(source, path).not.toContain(BLOCKED_DEMO_ENDPOINTS.quote);
      expect(source, path).not.toContain(BLOCKED_DEMO_ENDPOINTS.checkout);
    }
  });

  it('los endpoints transaccionales y el reset están cerrados en DEMO_MODE', () => {
    for (const source of [quoteApiSource, checkoutApiSource, webhookApiSource]) {
      expect(source).toContain("DEMO_MODE === 'true'");
      expect(source).toContain('status: 410');
    }
    expect(resetApiSource).not.toContain('seedStatements');
    expect(resetApiSource).toContain('status: 410');
  });

  it('el panel público rechaza todas las mutaciones', () => {
    expect(Object.keys(catalogAdminMutationRoutes).length).toBe(6);
    for (const source of [orderPatchSource, productPatchSource, shippingPatchSource]) {
      expect(source).toContain("DEMO_MODE === 'true'");
    }
    for (const source of [
      orderPatchSource,
      productPatchSource,
      shippingPatchSource,
      ...Object.values(catalogAdminMutationRoutes),
    ]) {
      expect(source).toContain('solo lectura');
      expect(source).toContain('status: 403');
    }
  });
});

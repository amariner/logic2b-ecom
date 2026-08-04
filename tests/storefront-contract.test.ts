/** Guardarraíl: demos públicas locales, backend ficticio independiente. */
import { describe, expect, it } from 'vitest';
import cartPageSource from '../src/components/store/CartPage.astro?raw';
import catalogPageSource from '../src/components/store/CatalogPage.astro?raw';
import checkoutPageSource from '../src/components/store/CheckoutPage.astro?raw';
import productPageSource from '../src/components/store/ProductPage.astro?raw';
import thanksPageSource from '../src/components/store/ThanksPage.astro?raw';
import dynamicProductRoute from '../src/pages/demo/tiendas/[collection]/[slug].astro?raw';
import dynamicThanksRoute from '../src/pages/demo/tiendas/[collection]/gracias.astro?raw';
import quoteApiSource from '../src/pages/api/cart/quote.ts?raw';
import checkoutApiSource from '../src/pages/api/checkout/session.ts?raw';
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
  });
});

describe('aislamiento de las rutas públicas', () => {
  it('catálogo, ficha y confirmación no consultan D1 ni pedidos', () => {
    expect(Object.keys(storefrontRoutes).length).toBeGreaterThan(20);
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
    for (const source of [quoteApiSource, checkoutApiSource]) {
      expect(source).toContain("DEMO_MODE === 'true'");
      expect(source).toContain('status: 410');
    }
    expect(resetApiSource).not.toContain('seedStatements');
    expect(resetApiSource).toContain('status: 410');
  });

  it('el panel público rechaza todas las mutaciones', () => {
    for (const source of [orderPatchSource, productPatchSource, shippingPatchSource]) {
      expect(source).toContain("DEMO_MODE === 'true'");
      expect(source).toContain('solo lectura');
      expect(source).toContain('status: 403');
    }
  });
});

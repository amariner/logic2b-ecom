/**
 * Guardarraíl de «N tiendas, un motor» (C14.1).
 *
 * La lista LEGACY_THEMES es deuda finita, no una arquitectura alternativa. El
 * test falla si aparece una quinta excepción o si una migración no reduce la
 * lista. C14.2 elimina Forma; C14.3 elimina las tres restantes y la lista.
 */
import { describe, expect, it } from 'vitest';
import cartPageSource from '../src/components/store/CartPage.astro?raw';
import checkoutPageSource from '../src/components/store/CheckoutPage.astro?raw';
import productPageSource from '../src/components/store/ProductPage.astro?raw';
import thanksPageSource from '../src/components/store/ThanksPage.astro?raw';
import dynamicCartRoute from '../src/pages/demo/tiendas/[collection]/carrito.astro?raw';
import dynamicCheckoutRoute from '../src/pages/demo/tiendas/[collection]/checkout.astro?raw';
import dynamicProductRoute from '../src/pages/demo/tiendas/[collection]/[slug].astro?raw';
import dynamicThanksRoute from '../src/pages/demo/tiendas/[collection]/gracias.astro?raw';
import {
  COMMERCE_ENGINE,
  COMMERCE_ENDPOINTS,
  COMMERCE_PARTS,
  COMMERCE_PRESENTATION_SLOTS,
  COMMERCE_SURFACES,
  PRODUCT_COMMERCE_SELECTORS,
} from '../src/lib/storefront-contract';

const routeModules = import.meta.glob<string>('../src/pages/demo/tiendas/**/*.astro', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const LEGACY_THEMES = ['noddo', 'sitega', 'stretch'] as const;

type LegacyTheme = (typeof LEGACY_THEMES)[number];
type Debt = {
  customCartKey: boolean;
  textPriceArithmetic: boolean;
  productMap: boolean;
  checkoutWithoutEngine: boolean;
  duplicatedSubmit: boolean;
};

function sourcesForTheme(theme: string): string[] {
  const marker = `/tiendas/${theme}/`;
  return Object.entries(routeModules)
    .filter(([path]) => path.includes(marker))
    .map(([, source]) => source);
}

function sourceForThemePage(theme: string, page: string): string {
  const suffix = `/tiendas/${theme}/${page}`;
  return Object.entries(routeModules).find(([path]) => path.endsWith(suffix))?.[1] ?? '';
}

function debtForTheme(theme: string): Debt {
  const sources = sourcesForTheme(theme);
  const joined = sources.join('\n');
  const checkout = sourceForThemePage(theme, 'checkout.astro');
  return {
    customCartKey: joined.includes(`${theme}-demo-cart`),
    textPriceArithmetic: joined.includes('price.replace('),
    productMap: joined.includes(`collections/${theme}-products`),
    checkoutWithoutEngine:
      checkout.length > 0 &&
      !checkout.includes('CheckoutPage.astro') &&
      !checkout.includes(COMMERCE_ENDPOINTS.checkout),
    duplicatedSubmit:
      checkout.includes("addEventListener('submit'") &&
      checkout.includes('window.location.assign') &&
      !checkout.includes(COMMERCE_ENDPOINTS.checkout),
  };
}

describe('contrato tipado de las superficies de comercio', () => {
  it('fija un único origen de producto, precio, carrito, quote, checkout y pedido', () => {
    expect(COMMERCE_ENGINE).toEqual({
      productSource: 'd1-seed',
      priceField: 'price_cents',
      cartState: 'cart-client',
      quoteEndpoint: '/api/cart/quote',
      checkoutEndpoint: '/api/checkout/session',
      orderSource: 'd1-session-id',
    });
  });

  it('declara las cuatro superficies y sus slots solo de presentación', () => {
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
    it(`${surface} expone hooks estables para que el tema no duplique lógica`, () => {
      const source = sharedSources[surface];
      expect(source).toContain(`data-commerce-surface="${surface}"`);
      for (const part of COMMERCE_PARTS[surface]) {
        expect(source, `${surface} no expone data-commerce-part="${part}"`).toContain(
          `data-commerce-part="${part}"`,
        );
      }
      for (const slot of COMMERCE_PRESENTATION_SLOTS[surface]) {
        expect(source, `${surface} no expone el slot ${slot}`).toContain(`name="${slot}"`);
      }
    });
  }

  it('carrito y checkout consumen los endpoints compartidos', () => {
    expect(cartPageSource).toContain('COMMERCE_ENDPOINTS.quote');
    expect(checkoutPageSource).toContain('COMMERCE_ENDPOINTS.quote');
    expect(checkoutPageSource).toContain('COMMERCE_ENDPOINTS.checkout');
  });

  it('el slot visual de ficha conserva las acciones del motor compartido', () => {
    expect(PRODUCT_COMMERCE_SELECTORS).toEqual({
      addToCart: '[data-commerce-action="add-to-cart"]',
      quantity: '[data-commerce-input="quantity"]',
    });
    expect(productPageSource).toContain('PRODUCT_COMMERCE_SELECTORS.addToCart');
    expect(productPageSource).toContain('PRODUCT_COMMERCE_SELECTORS.quantity');
  });
});

describe('rutas canónicas del motor', () => {
  it('ficha, carrito, checkout y gracias componen los cuatro componentes compartidos', () => {
    expect(dynamicProductRoute).toContain('ProductPage');
    expect(dynamicProductRoute).toContain('getProductBySlug');
    expect(dynamicCartRoute).toContain('CartPage');
    expect(dynamicCheckoutRoute).toContain('CheckoutPage');
    expect(dynamicThanksRoute).toContain('ThanksPage');
    expect(dynamicThanksRoute).toContain('getOrderBySessionId');
  });

  it('Forma compone el mismo motor de extremo a extremo', () => {
    const product = sourceForThemePage('forma', '[slug].astro');
    const cart = sourceForThemePage('forma', 'carrito.astro');
    const checkout = sourceForThemePage('forma', 'checkout.astro');
    const thanks = sourceForThemePage('forma', 'gracias.astro');

    expect(product).toContain('ProductPage');
    expect(product).toContain('getProductBySlug');
    expect(cart).toContain('CartPage');
    expect(checkout).toContain('CheckoutPage');
    expect(thanks).toContain('ThanksPage');
    expect(thanks).toContain('getOrderBySessionId');
    expect(debtForTheme('forma')).toEqual({
      customCartKey: false,
      textPriceArithmetic: false,
      productMap: false,
      checkoutWithoutEngine: false,
      duplicatedSubmit: false,
    });
  });
});

describe('deuda de migración cerrada y visible', () => {
  it('ninguna tienda nueva puede crear un segundo motor', () => {
    const legacy = Object.keys(routeModules)
      .map((path) => path.match(/\/tiendas\/([^/]+)\//)?.[1])
      .filter((theme): theme is string => Boolean(theme) && theme !== '[collection]')
      .filter((theme, index, themes) => themes.indexOf(theme) === index)
      .filter((theme) => Object.values(debtForTheme(theme)).some(Boolean))
      .sort();

    expect(legacy).toEqual([...LEGACY_THEMES].sort());
  });

  for (const theme of LEGACY_THEMES) {
    it(`${theme} conserva exactamente las cinco señales que debe eliminar su migración`, () => {
      expect(debtForTheme(theme satisfies LegacyTheme)).toEqual({
        customCartKey: true,
        textPriceArithmetic: true,
        productMap: true,
        checkoutWithoutEngine: true,
        duplicatedSubmit: true,
      });
    });
  }
});

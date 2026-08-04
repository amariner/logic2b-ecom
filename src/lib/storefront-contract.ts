/**
 * Contrato entre la presentación de una demo y su simulación local.
 *
 * Los temas pueden cambiar el contenido de los slots y estilizar los hooks
 * `data-commerce-*`. Ninguna superficie pública escribe en D1 ni llama a los
 * endpoints reales de quote/checkout.
 */

export const BLOCKED_DEMO_ENDPOINTS = {
  quote: '/api/cart/quote',
  checkout: '/api/checkout/session',
} as const;

export const COMMERCE_SURFACES = ['product', 'cart', 'checkout', 'thanks'] as const;
export type CommerceSurface = (typeof COMMERCE_SURFACES)[number];

export const COMMERCE_PARTS = {
  product: ['body', 'media', 'details', 'purchase', 'related'],
  cart: ['heading', 'empty', 'loading', 'lines', 'shipping', 'problems', 'actions'],
  checkout: ['heading', 'intro', 'summary', 'form', 'actions'],
  thanks: ['success', 'missing', 'actions'],
} as const satisfies Record<CommerceSurface, readonly string[]>;

export type CommercePart<Surface extends CommerceSurface> =
  (typeof COMMERCE_PARTS)[Surface][number];

/**
 * Slots puramente visuales. El componente compartido conserva la simulación
 * local aunque un tema reemplace el marcado de estos bloques.
 */
export const COMMERCE_PRESENTATION_SLOTS = {
  product: ['presentation'],
  cart: ['heading', 'empty'],
  checkout: ['heading', 'intro', 'submit-label', 'footnote'],
  thanks: ['success', 'missing', 'back-label'],
} as const satisfies Record<CommerceSurface, readonly string[]>;

export type CommercePresentationSlot<Surface extends CommerceSurface> =
  (typeof COMMERCE_PRESENTATION_SLOTS)[Surface][number];

/** Selectores que debe conservar un slot de ficha para reutilizar la simulación. */
export const PRODUCT_COMMERCE_SELECTORS = {
  addToCart: '[data-commerce-action="add-to-cart"]',
  quantity: '[data-commerce-input="quantity"]',
} as const;

/**
 * Fuente de verdad inmutable para todos los escaparates públicos.
 */
export const COMMERCE_ENGINE = {
  productSource: 'embedded-seed',
  priceField: 'price_cents',
  cartState: 'namespaced-local-storage',
  quoteSource: 'local-demo-commerce',
  checkoutSource: 'session-storage',
  orderSource: 'ephemeral-session-storage',
  backendSource: 'independent-read-only-fixtures',
} as const;

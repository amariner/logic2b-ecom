/**
 * Contrato entre la presentación de una tienda y el motor de comercio.
 *
 * Los temas pueden cambiar el contenido de los slots y estilizar los hooks
 * `data-commerce-*`. No pueden sustituir las fuentes de producto, carrito,
 * presupuesto, checkout ni confirmación descritas aquí.
 */

export const COMMERCE_ENDPOINTS = {
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
 * Slots puramente visuales. El componente compartido conserva el script, los
 * endpoints y el estado aunque un tema reemplace el marcado de estos bloques.
 */
export const COMMERCE_PRESENTATION_SLOTS = {
  product: ['presentation'],
  cart: ['heading', 'empty'],
  checkout: ['heading', 'intro', 'submit-label', 'footnote'],
  thanks: ['success', 'missing', 'back-label'],
} as const satisfies Record<CommerceSurface, readonly string[]>;

export type CommercePresentationSlot<Surface extends CommerceSurface> =
  (typeof COMMERCE_PRESENTATION_SLOTS)[Surface][number];

/** Selectores que debe conservar un slot de ficha para reutilizar su motor. */
export const PRODUCT_COMMERCE_SELECTORS = {
  addToCart: '[data-commerce-action="add-to-cart"]',
  quantity: '[data-commerce-input="quantity"]',
} as const;

/**
 * Fuente de verdad inmutable para todas las tiendas. Se exporta para que los
 * tests de arquitectura fallen si una ruta intenta introducir otro motor.
 */
export const COMMERCE_ENGINE = {
  productSource: 'd1-seed',
  priceField: 'price_cents',
  cartState: 'cart-client',
  quoteEndpoint: COMMERCE_ENDPOINTS.quote,
  checkoutEndpoint: COMMERCE_ENDPOINTS.checkout,
  orderSource: 'd1-session-id',
} as const;

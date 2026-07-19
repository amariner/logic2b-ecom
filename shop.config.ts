/**
 * shop.config.ts — TODO lo específico de una tienda vive aquí.
 * Para un cliente nuevo: clonar el repo, editar este fichero y el seed. Nada más.
 */

export type ShippingZone = {
  id: string;
  label: string;
  /** Prefijos de código postal español que pertenecen a la zona. Se evalúan en orden; gana el más largo. */
  postalPrefixes: string[];
};

export type ShopConfig = typeof shopConfig;

export const shopConfig = {
  /** Identidad */
  name: 'La Botiga del Maestrat',
  legalName: 'La Botiga del Maestrat S.L. (tienda ficticia de demostración)',
  email: 'hola@botigadelmaestrat.demo',
  baseUrl: 'https://ecom.logic2b.com',
  currency: 'eur' as const,
  /** Prefijo del nº de pedido legible (p. ej. BM-260719-K7M2). 2-4 letras mayúsculas. */
  orderNumberPrefix: 'BM',

  /** Marca (alimenta los tokens de Tailwind en global.css) */
  brand: {
    color: '#008060', // verde profundo (estética Shopify)
    colorDark: '#004c3f',
  },

  /** Categorías del catálogo. El seed y los filtros de tienda derivan de aquí. */
  categories: [
    { id: 'aceites', label: 'Aceites de oliva' },
    { id: 'embutidos', label: 'Embutidos' },
    { id: 'mieles', label: 'Mieles' },
    { id: 'vinos', label: 'Vinos' },
    { id: 'conservas', label: 'Conservas' },
    { id: 'quesos', label: 'Quesos' },
  ],

  /**
   * Envíos: zonas resueltas por prefijo de CP + tarifa plana por zona
   * con umbral de envío gratis. Las tarifas viven en D1 (shipping_rates,
   * editables desde el admin); aquí solo la definición de zonas y el seed inicial.
   */
  shipping: {
    zones: [
      {
        id: 'peninsula',
        label: 'Península',
        // Todo CP español de 5 dígitos que no caiga en otra zona.
        postalPrefixes: [
          '01','02','03','04','05','06','08','09','10','11','12','13','14','15',
          '16','17','18','19','20','21','22','23','24','25','26','27','28','29',
          '30','31','32','33','34','36','37','39','40','41','42','43','44','45',
          '46','47','48','49','50',
        ],
      },
      { id: 'baleares', label: 'Illes Balears', postalPrefixes: ['07'] },
      { id: 'canarias', label: 'Canarias', postalPrefixes: ['35', '38'] },
      { id: 'ceuta-melilla', label: 'Ceuta y Melilla', postalPrefixes: ['51', '52'] },
    ] satisfies ShippingZone[],
    /** Tarifas iniciales (seed). Céntimos. free_over_cents null = nunca gratis. */
    seedRates: [
      { zone: 'peninsula', label: 'Estándar 24/48h', price_cents: 490, free_over_cents: 5000 },
      { zone: 'baleares', label: 'Estándar 48/72h', price_cents: 890, free_over_cents: 8000 },
      { zone: 'canarias', label: 'Estándar 3-5 días', price_cents: 1490, free_over_cents: null },
      { zone: 'ceuta-melilla', label: 'Estándar 3-5 días', price_cents: 1490, free_over_cents: null },
    ],
  },

  /**
   * Cloudflare Web Analytics (gratis, sin cookies, sin banner).
   * Token del dashboard → Analytics → Web Analytics. Vacío = sin beacon.
   * Solo se inyecta en tienda y panel: la landing se mantiene con cero JS
   * (decisión 2026-07-19; las visitas a la landing ya salen en las métricas
   * de requests del Worker sin script alguno).
   */
  analytics: {
    cfBeaconToken: '',
  },

  /** Textos legales mínimos (páginas legales completas: por cliente) */
  legal: {
    shippingNote: 'Envío en 24/48h laborables a península. Portes según zona.',
    returnsNote: 'Devoluciones aceptadas en 14 días naturales desde la entrega.',
  },
};

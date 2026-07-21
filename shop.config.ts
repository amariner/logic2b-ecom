/**
 * shop.config.ts — configuración del MOTOR. Hay UNA, nunca una por tema.
 * ============================================================================
 *
 * Para un cliente nuevo: clonar el repo, editar este fichero, su colección en
 * `src/collections/` y el seed. Nada más.
 *
 * QUÉ VA AQUÍ Y QUÉ NO (Fase 9B, 2026-07-21). Aquí vive lo que influye en lo que
 * se COBRA, lo que se ENVÍA y lo que dice un EMAIL: divisa, zonas y tarifas,
 * numeración de pedido, identidad del operador, textos legales. Lo consumen
 * lib/pricing, lib/shipping, lib/orders, lib/emails y el checkout — que son uno
 * solo para todas las tiendas.
 *
 * La identidad y las categorías de cada ESCAPARATE viven en
 * `src/collections/<id>.ts`. Ocho `shop.config` serían ocho motores; por eso el
 * catálogo de categorías salió de aquí y ya no vuelve.
 *
 * `name`/`legalName` son la identidad del OPERADOR: es lo que firma los emails y
 * lo que rotula el backoffice, que es único. En un proyecto real hay una sola
 * colección y coincide con el nombre de su tienda; en la demo, el backoffice se
 * llama como la tienda genérica.
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

  /**
   * Marca — fuente única del color. Base.astro lo inyecta en :root, así que las
   * utilidades `*-brand` de Tailwind (y el preset por defecto del selector de
   * temas) lo siguen. Cambiar aquí basta; global.css solo guarda el fallback.
   */
  brand: {
    color: '#008060', // verde profundo (estética Shopify)
    colorDark: '#004c3f',
  },

  /**
   * Las CATEGORÍAS ya no viven aquí: son de cada escaparate y están en
   * `src/collections/<id>.ts`. Ver el bloque de cabecera de este fichero.
   */

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
    shippingNote: 'Envío en 24/48h laborables a península. Coste según zona.',
    returnsNote: 'Devoluciones aceptadas en 14 días naturales desde la entrega.',
  },
};

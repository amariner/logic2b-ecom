/**
 * Configuración de UNA colección — es decir, de UNA tienda del escaparate.
 * ============================================================================
 *
 * LA FRONTERA (Fase 9B, decisión del 2026-07-21). Hay dos capas de configuración
 * y confundirlas es exactamente cómo se bifurca el motor:
 *
 *   · `shop.config.ts`      → MOTOR. Uno solo, jamás por colección. Divisa,
 *     zonas y tarifas de envío, numeración de pedido, textos legales, analytics.
 *     Lo consumen lib/pricing, lib/shipping, lib/orders, lib/emails y el
 *     checkout. Ocho de estos serían ocho motores.
 *
 *   · `src/collections/<id>.ts` → PRESENTACIÓN. Uno por tienda. Identidad,
 *     categorías y copy del escaparate. No lo toca nada de la ruta de cobro.
 *
 * Regla práctica: si un campo acaba influyendo en lo que se cobra, en lo que se
 * envía o en lo que dice un email, NO va aquí.
 */

export type CollectionCategory = {
  /** Id estable: es el valor de `products.category` en D1 y el de `?categoria=`. */
  id: string;
  label: string;
};

export type CollectionConfig = {
  /** Id de la colección. Es el valor de `products.collection` y el segmento de URL. */
  id: string;
  /** Tema del catálogo de estilos con el que se renderiza (`demo-themes.ts`). */
  themeId: string;

  /** Nombre comercial de la tienda — wordmark y títulos del escaparate. */
  name: string;
  /** Una línea bajo el nombre. */
  tagline: string;
  /** Descripción para la meta description del escaparate. */
  description: string;

  /**
   * Categorías de esta tienda. El filtro de catálogo valida `?categoria=` contra
   * esta lista, así que un id que no esté aquí simplemente no filtra.
   */
  categories: readonly CollectionCategory[];
};

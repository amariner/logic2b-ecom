/**
 * Nº de variantes de foto disponibles por categoría en /public/images/products.
 * La variante 1 es `{categoria}.webp`; las siguientes, `{categoria}-2.webp`, etc.
 * El seed las reparte entre los productos de la categoría (round-robin).
 *
 * Lo actualiza `scripts/fetch-product-images.mjs` al descargar las fotos
 * generadas con Higgsfield — no subir los contadores a mano sin que existan
 * los ficheros, o el catálogo mostraría imágenes rotas.
 */
export const imageVariants: Record<string, number> = {
  aceites: 1,
  embutidos: 1,
  mieles: 1,
  vinos: 1,
  conservas: 1,
  quesos: 1,
};

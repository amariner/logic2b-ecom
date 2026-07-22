/**
 * Registro de COLECCIONES — el escaparate de tiendas.
 * ============================================================================
 *
 * Cada tema del catálogo de estilos tiene su propia tienda: su catálogo de
 * productos, su identidad y sus categorías. Todas comparten UN backend (D1,
 * precios, envíos, checkout, webhook, backoffice): la colección es lo único que
 * las separa, y es una columna, no un esquema aparte.
 *
 * RESOLUCIÓN. La colección activa sale SIEMPRE del segmento de URL, validado
 * contra este registro. Nunca de una cookie, de una cabecera ni de input libre:
 * un id desconocido es un 404, no un catálogo vacío ni —peor— una lectura de la
 * tabla entera.
 */
import { demoCollection } from '../collections/demo';
import { minimalCollection } from '../collections/minimal';
import { editorialCollection } from '../collections/editorial';
import { guideCollection } from '../collections/guide';
import { launchCollection } from '../collections/launch';
import { irisCollection } from '../collections/iris';
// new-theme:imports — no borrar: `pnpm new:theme <id>` añade aquí su import.
import type { CollectionCategory, CollectionConfig } from '../collections/types';

export type { CollectionCategory, CollectionConfig };

/**
 * Todas las colecciones registradas.
 *
 * De momento solo la genérica: las 8 del escaparate de estilos entran en 9B.4,
 * con su identidad y su catálogo. Lo que ya está fijado aquí es la FORMA — el
 * registro resuelve N colecciones sin tocar nada más.
 */
export const collections: readonly CollectionConfig[] = [
  demoCollection,
  minimalCollection,
  editorialCollection,
  guideCollection,
  launchCollection,
  irisCollection,
  // new-theme:entries — no borrar: `pnpm new:theme <id>` añade aquí su entrada.
];

/** Colección de la demo transaccional (carrito, checkout, panel, emails). */
export const DEFAULT_COLLECTION_ID = demoCollection.id;

/**
 * Resuelve una colección por id. Devuelve `null` si no existe — quien llama
 * decide (una ruta responde 404; nunca se cae a una colección por defecto, que
 * enseñaría el catálogo de otra tienda en la URL equivocada).
 */
export function resolveCollection(id: string | undefined): CollectionConfig | null {
  if (!id) return null;
  return collections.find((collection) => collection.id === id) ?? null;
}

/** La colección genérica. Existe siempre: el registro no puede quedarse vacío. */
export function defaultCollection(): CollectionConfig {
  return demoCollection;
}

/**
 * Valida una categoría CONTRA SU COLECCIÓN. Una categoría de otra tienda no
 * filtra: devuelve `undefined` y el catálogo se muestra entero.
 */
export function resolveCategory(
  collection: CollectionConfig,
  rawCategory: string | null | undefined,
): string | undefined {
  if (!rawCategory) return undefined;
  return collection.categories.some((cat) => cat.id === rawCategory) ? rawCategory : undefined;
}

/** Etiqueta legible de una categoría dentro de su colección. Cae al id si no está. */
export function categoryLabel(collection: CollectionConfig, categoryId: string): string {
  return collection.categories.find((cat) => cat.id === categoryId)?.label ?? categoryId;
}

/**
 * Rutas de UNA tienda. La genérica conserva sus URLs históricas (/demo/tienda…,
 * enlazadas desde la landing, /arquitectura y /dossier); cada colección del
 * escaparate vive bajo /demo/tiendas/<id>/. Misma implementación en ambas: lo
 * único que cambia es el prefijo.
 */
export type StorePaths = {
  catalog: string;
  product: (slug: string) => string;
  cart: string;
  checkout: string;
  thanks: string;
};

export function storePaths(collectionId: string): StorePaths {
  if (collectionId === DEFAULT_COLLECTION_ID) {
    return {
      catalog: '/demo/tienda',
      product: (slug) => `/demo/tienda/${slug}`,
      cart: '/demo/carrito',
      checkout: '/demo/checkout',
      thanks: '/demo/gracias',
    };
  }
  const base = `/demo/tiendas/${collectionId}`;
  return {
    catalog: base,
    product: (slug) => `${base}/${slug}`,
    cart: `${base}/carrito`,
    checkout: `${base}/checkout`,
    thanks: `${base}/gracias`,
  };
}

/**
 * Etiquetas de categoría de TODAS las colecciones, para el backoffice — que es
 * uno solo y ve productos de cualquier tienda. Si dos colecciones reutilizaran
 * un mismo id de categoría, gana la primera registrada; es cosmético (solo
 * afecta a la etiqueta del listado de productos del admin).
 */
export function allCategoryLabels(): Map<string, string> {
  const labels = new Map<string, string>();
  for (const collection of collections) {
    for (const cat of collection.categories) {
      if (!labels.has(cat.id)) labels.set(cat.id, cat.label);
    }
  }
  return labels;
}

/**
 * Catálogo de `street` — ASFALTO. 12 productos (reparto de 9B.0), repartidos en
 * las 4 categorías de `src/collections/street.ts`. Slugs namespaceados `str-`.
 *
 * Dos productos van a `stock: 0` a propósito: el tema Street enseña «Agotado»
 * en la rejilla y ese estado sale de D1, no de una etiqueta decorativa.
 *
 * Gotcha: imports relativos con extensión .ts (corre bajo node type-stripping).
 */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'street',
});

export const streetSeedProducts: readonly SeedProduct[] = [
  // ── Calzado (3) ────────────────────────────────────────────────────
  c({
    slug: 'str-vuelta-9',
    name: 'Vuelta 9',
    description:
      'Zapatilla de asfalto para rodajes diarios. Mediasuela de espuma supercrítica, upper de malla reciclada y drop de 8 mm.',
    price_cents: 13900,
    stock: 14,
    category: 'str-calzado',
  }),
  c({
    slug: 'str-ronda-trail',
    name: 'Ronda Trail',
    description:
      'Para salir de la ciudad sin cambiar de marca. Taqueado de 4 mm, refuerzo en puntera y horma algo más ancha.',
    price_cents: 15900,
    stock: 0,
    category: 'str-calzado',
  }),
  c({
    slug: 'str-plaza-lo',
    name: 'Plaza Lo',
    description:
      'La de después de correr. Silueta baja de piel curtida en Europa, suela de goma y forro textil.',
    price_cents: 10900,
    stock: 21,
    category: 'str-calzado',
  }),

  // ── Prendas (3) ────────────────────────────────────────────────────
  c({
    slug: 'str-sudadera-turno',
    name: 'Sudadera Turno',
    description:
      'Sudadera con capucha de felpa pesada de 420 g, algodón orgánico y corte recto. Serigrafía en el pecho.',
    price_cents: 8900,
    stock: 18,
    category: 'str-prendas',
  }),
  c({
    slug: 'str-cortavientos-nocturno',
    name: 'Cortavientos Nocturno',
    description:
      'Cortavientos plegable con detalles reflectantes en 360°, costuras selladas y bolsillo trasero que hace de funda.',
    price_cents: 12900,
    stock: 9,
    category: 'str-prendas',
  }),
  c({
    slug: 'str-camiseta-tempo',
    name: 'Camiseta Tempo',
    description:
      'Camiseta de series en tejido perforado ultraligero (98 g). Costuras planas y corte suelto.',
    price_cents: 3900,
    stock: 34,
    category: 'str-prendas',
  }),

  // ── Mallas y shorts (3) ────────────────────────────────────────────
  c({
    slug: 'str-mallas-medianoche',
    name: 'Mallas Medianoche',
    description:
      'Mallas largas de compresión media con cintura ancha, bolsillo lateral para el móvil y banda reflectante en el gemelo.',
    price_cents: 6900,
    stock: 16,
    category: 'str-mallas',
  }),
  c({
    slug: 'str-short-split-5',
    name: 'Short Split 5"',
    description:
      'Short de competición con abertura lateral, slip interior y bolsillo trasero con cremallera.',
    price_cents: 4900,
    stock: 0,
    category: 'str-mallas',
  }),
  c({
    slug: 'str-mallas-ritmo',
    name: 'Mallas cortas Ritmo',
    description:
      'Mallas cortas de 20 cm que no suben al correr. Tejido reciclado con recuperación y cintura con cordón plano.',
    price_cents: 5900,
    stock: 23,
    category: 'str-mallas',
  }),

  // ── Complementos (3) ───────────────────────────────────────────────
  c({
    slug: 'str-gorra-cinco-paneles',
    name: 'Gorra 5 paneles',
    description:
      'Gorra de cinco paneles en ripstop ligero, visera corta y cierre trasero regulable. Se dobla y cabe en el bolsillo.',
    price_cents: 2900,
    stock: 27,
    category: 'str-complementos',
  }),
  c({
    slug: 'str-rinonera-vuelta',
    name: 'Riñonera Vuelta',
    description:
      'Riñonera de 1,5 L que no bota: cincha elástica, dos compartimentos y salida para auriculares.',
    price_cents: 3400,
    stock: 12,
    category: 'str-complementos',
  }),
  c({
    slug: 'str-calcetines-pack',
    name: 'Calcetines ASFALTO (pack de 3)',
    description:
      'Tres pares de calcetines técnicos de caña media, punto acanalado y refuerzo en talón y puntera.',
    price_cents: 1800,
    stock: 41,
    category: 'str-complementos',
  }),
];

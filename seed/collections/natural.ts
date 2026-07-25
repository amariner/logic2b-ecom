/**
 * Catálogo de `natural` — ROMER. 12 productos (reparto de 9B.0), repartidos en
 * las 4 categorías de `src/collections/natural.ts`. Slugs `nat-`.
 *
 * 12 no es un número redondo por casualidad: la rejilla del tema es de 4
 * columnas uniformes, así que 12 son 3 filas EXACTAS sin hueco final — el
 * bloque compacto de la referencia AFF.
 *
 * CUATRO llevan `compare_at_price_cents`: es lo que enciende la pastilla `-30%`
 * de la referencia, y el porcentaje se CALCULA de los dos precios en vez de
 * escribirse a mano. Es SOLO presentación: no se cobra, no cuenta para el envío
 * gratis y hay guardia estática que muerde si se cuela en la ruta de cobro
 * (`tests/pricing-guard.test.ts`). El seed además valida que sea > price_cents.
 *
 * Un producto va a `stock: 0` y dos a stock bajo: «Agotado» y el aviso de
 * últimas unidades salen de D1, no de una etiqueta decorativa.
 *
 * `subtitle` = el FORMATO (50 ml, 250 ml…). En la rejilla del tema no se pinta
 * —la referencia pone ahí la categoría en versalitas— pero es dato verdadero y
 * la ficha Base lo aprovecha, igual que la pastilla `Size` de la referencia.
 *
 * Gotcha: imports relativos con extensión .ts (corre bajo node type-stripping).
 */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'natural',
});

export const naturalSeedProducts: readonly SeedProduct[] = [
  // ── Rostro (3) ─────────────────────────────────────────────────────
  c({
    slug: 'nat-crema-rostro',
    name: 'Crema de rostro',
    subtitle: '50 ml',
    description:
      'Hidratante de día y de noche con aceite de almendra y escualano vegetal. Textura ligera que se absorbe sin dejar película, pensada para usar bajo protección solar.',
    price_cents: 3200,
    stock: 24,
    category: 'nat-rostro',
  }),
  c({
    slug: 'nat-serum-niacinamida',
    name: 'Sérum de niacinamida',
    subtitle: '30 ml',
    description:
      'Niacinamida al 5 % con zinc para regular el brillo y afinar el poro. Se aplica sobre la piel limpia, antes de la crema, mañana o noche.',
    price_cents: 3900,
    compare_at_price_cents: 4900,
    stock: 16,
    category: 'nat-rostro',
  }),
  c({
    slug: 'nat-limpiador-facial',
    name: 'Limpiador facial',
    subtitle: '150 ml',
    description:
      'Gel de limpieza sin sulfatos que no reseca. Retira el exceso de grasa y los restos de maquillaje ligero y deja la piel preparada para el sérum.',
    price_cents: 2400,
    stock: 30,
    category: 'nat-rostro',
  }),

  // ── Cuerpo (3) ─────────────────────────────────────────────────────
  c({
    slug: 'nat-leche-corporal',
    name: 'Leche corporal',
    subtitle: '250 ml',
    description:
      'Emulsión de manteca de karité y avena coloidal para piel seca. Se extiende con la piel aún húmeda al salir de la ducha y no deja sensación grasa.',
    price_cents: 2600,
    stock: 22,
    category: 'nat-cuerpo',
  }),
  c({
    slug: 'nat-aceite-corporal',
    name: 'Aceite corporal',
    subtitle: '100 ml',
    description:
      'Mezcla de almendra dulce, jojoba y semilla de uva. Para masaje o para sellar la hidratación después de la leche corporal. Sin perfume añadido.',
    price_cents: 2940,
    compare_at_price_cents: 4200,
    stock: 3,
    category: 'nat-cuerpo',
  }),
  c({
    slug: 'nat-exfoliante-sal',
    name: 'Exfoliante de sal',
    subtitle: '200 g',
    description:
      'Sal marina de las salinas de Santa Pola con aceite de oliva virgen. Exfolia y nutre en el mismo paso; una o dos veces por semana es suficiente.',
    price_cents: 2900,
    stock: 0,
    category: 'nat-cuerpo',
  }),

  // ── Cabello (3) ────────────────────────────────────────────────────
  c({
    slug: 'nat-champu-nutritivo',
    name: 'Champú nutritivo',
    subtitle: '250 ml',
    description:
      'Fórmula suave sin sulfatos ni siliconas, apta para cuero cabelludo sensible y para pelo teñido. Hace poca espuma a propósito: limpia igual.',
    price_cents: 2200,
    stock: 28,
    category: 'nat-cabello',
  }),
  c({
    slug: 'nat-acondicionador',
    name: 'Acondicionador ligero',
    subtitle: '250 ml',
    description:
      'Desenreda sin apelmazar, con proteína de arroz y aceite de camelia. Pensado para el día a día en pelo fino y en melenas de media longitud.',
    price_cents: 2200,
    stock: 19,
    category: 'nat-cabello',
  }),
  c({
    slug: 'nat-aceite-capilar',
    name: 'Aceite capilar',
    subtitle: '50 ml',
    description:
      'Tratamiento de puntas con argán y romero. Dos gotas en el pelo húmedo o como mascarilla en seco media hora antes de lavar.',
    price_cents: 3100,
    compare_at_price_cents: 3900,
    stock: 11,
    category: 'nat-cabello',
  }),

  // ── Kits (3) ───────────────────────────────────────────────────────
  c({
    slug: 'nat-kit-rostro',
    name: 'Kit rostro esencial',
    subtitle: 'Limpiador · sérum · crema',
    description:
      'La rutina de rostro completa en tres pasos y un solo pedido: limpiador, sérum de niacinamida y crema, en sus formatos habituales.',
    price_cents: 6900,
    compare_at_price_cents: 9900,
    stock: 9,
    category: 'nat-kits',
  }),
  c({
    slug: 'nat-kit-cuerpo',
    name: 'Kit cuerpo',
    subtitle: 'Leche · aceite',
    description:
      'Leche corporal y aceite juntos, que es como se usan: la leche hidrata y el aceite sella. En caja de cartón reciclado, listo para regalar.',
    price_cents: 5400,
    stock: 12,
    category: 'nat-kits',
  }),
  c({
    slug: 'nat-neceser-regalo',
    name: 'Neceser de regalo',
    subtitle: 'Cinco formatos de viaje',
    description:
      'Cinco formatos de viaje —limpiador, crema, leche, champú y acondicionador— en un neceser de lona lavable. El regalo que no obliga a acertar.',
    price_cents: 7900,
    stock: 4,
    category: 'nat-kits',
  }),
];

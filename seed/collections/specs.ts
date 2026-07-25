/**
 * Catálogo de `specs` — KALIBRE. 9 productos repartidos en las 4 categorías de
 * `src/collections/specs.ts`. Slugs `spe-`.
 *
 * NUEVE no es un número redondo por casualidad: la rejilla irregular del tema
 * es 2 + 4 + 3 = 9, o sea el bloque completo de la referencia ACF-01 sin hueco
 * final. La cabecera de grupo canta «9 items» y lo cuenta de D1, no lo escribe.
 *
 * LOS NUEVE LLEVAN `specs`: es la capacidad que este tema demuestra y la razón
 * de que la tienda venda componentes y no camisetas. Tres filas siempre —
 * Peso / Material / Acabado— porque la referencia pinta una tabla de tres filas
 * en TODAS las celdas y una tabla que a veces tiene dos filas rompe la retícula.
 * Son datos de D1 (`specs_json`, migración 0002), no una etiqueta decorativa:
 * si el seed cambia, la ficha técnica cambia.
 *
 * El valor va en versalitas mono en la maqueta, pero se guarda tal cual se
 * escribe aquí: la caja es cosa del CSS, no del dato.
 *
 * Un producto va a `stock: 0` y dos a stock bajo: «Agotado» y el aviso de
 * últimas unidades salen de D1, no de una etiqueta pintada a mano.
 *
 * Gotcha: imports relativos con extensión .ts (corre bajo node type-stripping).
 */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'specs',
});

export const specsSeedProducts: readonly SeedProduct[] = [
  // ── Platinas y puentes (2) ─────────────────────────────────────────
  c({
    slug: 'spe-platina-base',
    name: 'Platina base ACF-01',
    description:
      'Platina principal del calibre ACF-01, mecanizada en maillechort y decorada con perlado completo. Alojamientos de rubí escariados y roscas M1.4 para los puentes del rodaje.',
    price_cents: 18900,
    stock: 3,
    category: 'spe-platina',
    specs: [
      { label: 'Peso', value: '1,301 g' },
      { label: 'Material', value: 'Maillechort' },
      { label: 'Acabado', value: 'Perlado' },
    ],
  }),
  c({
    slug: 'spe-puente-rodaje',
    name: 'Puente de tren de rodaje',
    description:
      'Puente que cubre la rueda de centro, la de tercera y la de segundos pequeños. Cantos anglados a mano y dos rubíes engastados a presión.',
    price_cents: 9600,
    stock: 14,
    category: 'spe-platina',
    specs: [
      { label: 'Peso', value: '0,806 g' },
      { label: 'Material', value: 'Maillechort' },
      { label: 'Acabado', value: 'Anglado' },
    ],
  }),

  // ── Escape y rodaje (3) ────────────────────────────────────────────
  c({
    slug: 'spe-barrilete',
    name: 'Barrilete completo con muelle real',
    description:
      'Tambor, tapa, eje y muelle real montados y engrasados. Reserva de marcha nominal de 42 horas con el tren de rodaje del ACF-01.',
    price_cents: 7450,
    stock: 26,
    category: 'spe-escape',
    specs: [
      { label: 'Peso', value: '1,860 g' },
      { label: 'Material', value: 'Latón niquelado' },
      { label: 'Acabado', value: 'Arenado' },
    ],
  }),
  c({
    slug: 'spe-volante-espiral',
    name: 'Volante con espiral Breguet',
    description:
      'Volante de tres brazos con espiral de curva terminal Breguet, ajustado a 21.600 alternancias/hora. Se sirve equilibrado y con su virola de recambio.',
    price_cents: 24500,
    stock: 0,
    category: 'spe-escape',
    specs: [
      { label: 'Peso', value: '0,412 g' },
      { label: 'Material', value: 'Glucydur' },
      { label: 'Acabado', value: 'Pulido' },
    ],
  }),
  c({
    slug: 'spe-ancora-escape',
    name: 'Áncora de escape con paletas',
    description:
      'Áncora de escape suizo con las dos paletas de rubí ya asentadas y ajustadas al ángulo de reposo. Pieza de servicio para revisión completa.',
    price_cents: 6800,
    stock: 31,
    category: 'spe-escape',
    specs: [
      { label: 'Peso', value: '0,038 g' },
      { label: 'Material', value: 'Acero templado' },
      { label: 'Acabado', value: 'Anglado' },
    ],
  }),

  // ── Caja y bisel (2) ───────────────────────────────────────────────
  c({
    slug: 'spe-caja-titanio',
    name: 'Caja monobloque 38 mm',
    description:
      'Carrura monobloque fresada de una pieza, sin fondo atornillado, con asas integradas de 20 mm. Estanca a 5 ATM con la junta y el bisel de la casa.',
    price_cents: 32900,
    stock: 4,
    category: 'spe-caja',
    specs: [
      { label: 'Peso', value: '24,80 g' },
      { label: 'Material', value: 'Titanio grado 5' },
      { label: 'Acabado', value: 'Satinado circular' },
    ],
  }),
  c({
    slug: 'spe-bisel-estriado',
    name: 'Bisel estriado 38 mm',
    description:
      'Aro de bisel con estriado radial fino, a presión sobre la carrura de 38 mm. Recambio directo para el bisel liso de serie.',
    price_cents: 11500,
    stock: 18,
    category: 'spe-caja',
    specs: [
      { label: 'Peso', value: '4,12 g' },
      { label: 'Material', value: 'Acero 316L' },
      { label: 'Acabado', value: 'Pulido espejo' },
    ],
  }),

  // ── Esfera y agujas (2) ────────────────────────────────────────────
  c({
    slug: 'spe-esfera-guilloche',
    name: 'Esfera guilloché sin índices',
    description:
      'Esfera virgen con guilloché de olas concéntricas hecho a máquina de tornear. Sin índices ni impresión: base para personalizar el acabado.',
    price_cents: 14900,
    stock: 12,
    category: 'spe-esfera',
    specs: [
      { label: 'Peso', value: '1,204 g' },
      { label: 'Material', value: 'Latón plateado' },
      { label: 'Acabado', value: 'Guilloché' },
    ],
  }),
  c({
    slug: 'spe-agujas-dauphine',
    name: 'Juego de agujas dauphine',
    description:
      'Par de agujas dauphine facetadas de horas y minutos, con el cañón calibrado para el ACF-01. Se sirven en blíster antiestático.',
    price_cents: 4200,
    stock: 40,
    category: 'spe-esfera',
    specs: [
      { label: 'Peso', value: '0,021 g' },
      { label: 'Material', value: 'Acero facetado' },
      { label: 'Acabado', value: 'Pulido diamante' },
    ],
  }),
];

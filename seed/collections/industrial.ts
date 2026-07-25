/**
 * Catálogo de `industrial` — METRIA. 10 productos (reparto de 9B.0), repartidos
 * en las 4 categorías de `src/collections/industrial.ts`. Slugs `ind-`.
 *
 * TODOS llevan `subtitle`: el subtítulo técnico en gris bajo el nombre es el
 * rasgo de tarjeta de la referencia TAGARNO («330x magnification»). Sale de la
 * columna `subtitle` de D1 (migración 0002), no de recortar la descripción.
 *
 * Dos productos van a `stock: 0` a propósito y otros dos a stock bajo: el tema
 * pinta «Agotado» y «Últimas N» en la rejilla, y esos dos estados salen de D1,
 * no de una etiqueta decorativa.
 *
 * Gotcha: imports relativos con extensión .ts (corre bajo node type-stripping).
 */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'industrial',
});

export const industrialSeedProducts: readonly SeedProduct[] = [
  // ── Visión e inspección (3) ────────────────────────────────────────
  c({
    slug: 'ind-mv-320',
    name: 'MV-320',
    subtitle: '320 aumentos · 1080p60',
    description:
      'Microscopio digital de inspección para puesto de trabajo. Sensor 1080p a 60 fotogramas, enfoque manual con anillo micrométrico y salida HDMI directa a monitor: no necesita PC.',
    price_cents: 282000,
    stock: 6,
    category: 'ind-vision',
    specs: [
      { label: 'Aumentos', value: '20× – 320×' },
      { label: 'Sensor', value: '1080p a 60 fps' },
      { label: 'Salida', value: 'HDMI · USB-C' },
      { label: 'Garantía', value: '3 años' },
    ],
  }),
  c({
    slug: 'ind-mv-160-flex',
    name: 'MV-160 Flex',
    subtitle: '160 aumentos · brazo articulado',
    description:
      'La versión de brazo articulado del MV-320, para inspeccionar piezas grandes sin moverlas. Dos codos con freno y cabezal que gira 90° sobre su eje.',
    price_cents: 180000,
    stock: 4,
    category: 'ind-vision',
    specs: [
      { label: 'Aumentos', value: '10× – 160×' },
      { label: 'Alcance del brazo', value: '540 mm' },
      { label: 'Salida', value: 'HDMI' },
      { label: 'Garantía', value: '3 años' },
    ],
  }),
  c({
    slug: 'ind-mv-560-lab',
    name: 'MV-560 Lab',
    subtitle: '560 aumentos · sensor 4K',
    description:
      'Cabezal óptico de laboratorio sobre columna lastrada. Sensor 4K, enfoque por cremallera y montura estándar para las ópticas de la serie.',
    price_cents: 320000,
    stock: 2,
    category: 'ind-vision',
    specs: [
      { label: 'Aumentos', value: '35× – 560×' },
      { label: 'Sensor', value: '4K a 30 fps' },
      { label: 'Montura', value: 'M49 · adaptador C incluido' },
      { label: 'Garantía', value: '3 años' },
    ],
  }),

  // ── Soportes y mesas (3) ──────────────────────────────────────────
  c({
    slug: 'ind-brazo-flex-a2',
    name: 'Brazo flexible A2',
    subtitle: 'Alcance 620 mm · base lastrada',
    description:
      'Brazo flexible de cuello de cisne con base lastrada de 4,2 kg. Mantiene la posición sin apretar nada y acepta cabezal o iluminación.',
    price_cents: 34000,
    stock: 11,
    category: 'ind-soportes',
  }),
  c({
    slug: 'ind-mesa-z-90',
    name: 'Mesa de altura Z-90',
    subtitle: 'Recorrido Z de 90 mm · manivela',
    description:
      'Mesa de tijera con manivela lateral para ajustar la altura de la pieza sin tocar el enfoque. Plataforma de acero inoxidable rectificado.',
    price_cents: 28000,
    stock: 8,
    category: 'ind-soportes',
  }),
  c({
    slug: 'ind-mesa-xy-160',
    name: 'Mesa XY 160',
    subtitle: 'Desplazamiento 160 × 140 mm',
    description:
      'Mesa de desplazamiento en dos ejes con mandos micrométricos independientes. Para barrer una pieza entera sin perder el punto de enfoque.',
    price_cents: 21000,
    stock: 0,
    category: 'ind-soportes',
  }),

  // ── Iluminación (2) ───────────────────────────────────────────────
  c({
    slug: 'ind-anillo-led-72',
    name: 'Anillo LED 72',
    subtitle: '72 diodos · 4.500 K regulable',
    description:
      'Anillo de iluminación difusa de 72 diodos con regulación continua. Se rosca al cabezal y elimina la sombra propia del objetivo.',
    price_cents: 18000,
    stock: 17,
    category: 'ind-iluminacion',
  }),
  c({
    slug: 'ind-luz-coaxial-k1',
    name: 'Luz coaxial K1',
    subtitle: 'Iluminación coaxial · difusor mate',
    description:
      'Módulo de luz coaxial para superficies especulares: el haz entra por el mismo eje que la óptica, así que el reflejo no tapa el defecto.',
    price_cents: 24000,
    stock: 5,
    category: 'ind-iluminacion',
  }),

  // ── Ópticas y accesorios (2) ──────────────────────────────────────
  c({
    slug: 'ind-monitor-mv-24',
    name: 'Monitor MV 24"',
    subtitle: '24" · 1080p · entrada HDMI',
    description:
      'Monitor de 24 pulgadas para los cabezales de la serie MV. Panel mate sin brillo, sin altavoces y sin electrónica de más: se enciende y muestra la imagen.',
    price_cents: 25000,
    stock: 0,
    category: 'ind-accesorios',
  }),
  c({
    slug: 'ind-lente-x3',
    name: 'Lente +3',
    subtitle: 'Hasta 48 aumentos · rosca M49',
    description:
      'Lente de aproximación que se rosca sobre el objetivo y sube el aumento sin cambiar de cabezal. Vidrio tratado con antirreflejo multicapa.',
    price_cents: 16000,
    stock: 23,
    category: 'ind-accesorios',
  }),
];

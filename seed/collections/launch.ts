/**
 * Catálogo de `launch` — Vector. 5 productos (reparto de 9B.0): el producto
 * estrella y 4 accesorios. Slugs namespaceados con `lau-`. La oferta del pack
 * usa `compare_at_price_cents` (SOLO presentación, guardarraíl 9B.1).
 */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'launch',
});

export const launchSeedProducts: readonly SeedProduct[] = [
  c({
    slug: 'lau-vector-one',
    name: 'Vector One',
    description: 'Patinete eléctrico urbano: 25 km/h, 45 km de autonomía y 16,8 kg. Plegado en 3 segundos, frenada regenerativa y luz integrada.',
    subtitle: '45 km · 25 km/h · 16,8 kg',
    price_cents: 84900,
    stock: 9,
    category: 'lau-vehiculo',
    specs: [
      { label: 'Autonomía', value: '45 km (WLTP urbano)' },
      { label: 'Velocidad', value: '25 km/h (limitada UE)' },
      { label: 'Peso', value: '16,8 kg' },
      { label: 'Carga', value: '3,5 h · cargador incluido' },
      { label: 'Frenos', value: 'Disco + regenerativa' },
    ],
  }),
  c({ slug: 'lau-casco-urban', name: 'Casco Urban', description: 'Casco urbano con luz trasera recargable integrada y ajuste de rueda. Talla M-L.', price_cents: 5900, stock: 22, category: 'lau-accesorios' }),
  c({ slug: 'lau-candado-u', name: 'Candado en U', description: 'Arco de acero endurecido de 14 mm con soporte al manillar. Nivel 9/10.', price_cents: 4500, stock: 18, category: 'lau-accesorios' }),
  c({ slug: 'lau-bolsa-manillar', name: 'Bolsa de manillar', description: 'Bolsa impermeable de 3 L con anclaje rápido y bolsillo para el cargador.', price_cents: 2900, stock: 25, category: 'lau-accesorios' }),
  c({ slug: 'lau-cargador-extra', name: 'Cargador extra', description: 'Segundo cargador para casa o trabajo. Carga completa en 3,5 horas.', compare_at_price_cents: 4900, price_cents: 3900, stock: 15, category: 'lau-accesorios' }),
];

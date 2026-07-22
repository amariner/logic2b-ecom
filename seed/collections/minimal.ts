/**
 * Catálogo de `minimal` — Forma Interior. 8 productos (reparto de 9B.0).
 * Slugs namespaceados con `min-` (slug es UNIQUE GLOBAL en D1).
 * Imágenes: /images/collections/minimal/<slug>.webp (las resuelve el seed).
 */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'minimal',
});

export const minimalSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'min-butaca-node', name: 'Butaca Node', description: 'Butaca de módulo único tapizada en lana. Estructura de haya maciza y espuma de densidad doble.', price_cents: 64900, stock: 6, category: 'min-sofas' }),
  c({ slug: 'min-sofa-node', name: 'Sofá Node', description: 'Sofá de dos plazas de líneas rectas. Tapizado en lana gris piedra, desenfundable.', price_cents: 129000, stock: 4, category: 'min-sofas' }),
  c({ slug: 'min-sofa-qb', name: 'Sofá QB', description: 'Tres plazas de asiento profundo con brazos rectos. Tejido técnico antracita.', price_cents: 168000, stock: 3, category: 'min-sofas' }),
  c({ slug: 'min-butaca-arc', name: 'Butaca ARC', description: 'Butaca de brazos redondeados tapizada en terciopelo arena. Una pieza de acento.', price_cents: 74500, stock: 5, category: 'min-sofas' }),
  c({ slug: 'min-mesa-centro-o1', name: 'Mesa de centro O1', description: 'Mesa de centro circular en roble claro con canto suave. Ø 80 cm.', price_cents: 38900, stock: 8, category: 'min-mesas' }),
  c({ slug: 'min-mesa-auxiliar-t2', name: 'Mesa auxiliar T2', description: 'Auxiliar cuadrada apilable en acero lacado gris. 45 × 45 cm.', price_cents: 18900, stock: 12, category: 'min-mesas' }),
  c({ slug: 'min-lampara-pie-l1', name: 'Lámpara de pie L1', description: 'Lámpara de pie de pantalla textil y fuste fino en acero. Luz cálida regulable.', price_cents: 24900, stock: 10, category: 'min-accesorios' }),
  c({ slug: 'min-manta-lana', name: 'Manta de lana merina', description: 'Manta de lana merina tejida en telar plano. 130 × 190 cm, gris jaspeado.', price_cents: 9800, stock: 20, category: 'min-accesorios' }),
];

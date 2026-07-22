/**
 * Catálogo de `iris` — Iris. 6 productos (los del tema importado de
 * logic2b-norte). Slugs namespaceados con `iri-`. La insignia de la tarjeta
 * (Polarizada, Filtro UV…) usa la capacidad `subtitle` de la migración 0002.
 */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'iris',
});

export const irisSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'iri-classic', name: 'Iris® Classic', subtitle: 'Polarizada', description: 'Lentes polarizadas de precisión con montura de titanio ligero para todo el día.', price_cents: 24900, stock: 14, category: 'iri-sol' }),
  c({ slug: 'iri-sport-pro', name: 'Iris® Sport Pro', subtitle: 'Filtro UV', description: 'Óptica de alto impacto para actividad intensa. Tratamiento antivaho incluido.', price_cents: 34900, stock: 10, category: 'iri-deporte' }),
  c({ slug: 'iri-aero-lite', name: 'Iris® Aero Lite', subtitle: 'Polarizada', description: 'Montura ultraligera con visión periférica nítida y plaquetas ajustables.', price_cents: 19900, stock: 16, category: 'iri-deporte' }),
  c({ slug: 'iri-shield-x', name: 'Iris® Shield X', subtitle: 'Nuevo', description: 'Diseño envolvente de cobertura total con tratamiento hidrófobo para deportes de agua.', price_cents: 44900, stock: 7, category: 'iri-deporte' }),
  c({ slug: 'iri-horizon', name: 'Iris® Horizon', subtitle: 'Polarizada', description: 'Diseñada para la claridad en carretera con tinte degradado y varillas con memoria de forma.', price_cents: 27900, stock: 12, category: 'iri-sol' }),
  c({ slug: 'iri-stealth-r', name: 'Iris® Stealth R', subtitle: 'Edición limitada', description: 'Varillas de fibra de carbono con lentes antirreflejantes de zafiro para poca luz.', price_cents: 39900, stock: 5, category: 'iri-sol' }),
];

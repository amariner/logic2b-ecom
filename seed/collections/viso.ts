/** Catálogo ficticio de VISO. Slugs namespaceados y assets propios. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'viso',
});

export const visoSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'vis-spectra-01', name: 'Spectra 01', description: 'Pantalla continua humo con patilla fina de aluminio negro.', price_cents: 23500, stock: 7, category: 'vis-shield' }),
  c({ slug: 'vis-arc-smoke', name: 'Arc Smoke', description: 'Montura envolvente grafito y lente gris de contraste medio.', price_cents: 21000, stock: 9, category: 'vis-sport' }),
  c({ slug: 'vis-orbit-silver', name: 'Orbit Silver', description: 'Óvalo estrecho de titanio satinado con lente mineral fría.', price_cents: 19500, stock: 5, category: 'vis-optical' }),
  c({ slug: 'vis-axis-black', name: 'Axis Black', description: 'Rectángulo técnico negro con bisagra oculta y puente bajo.', price_cents: 18000, stock: 11, category: 'vis-optical' }),
  c({ slug: 'vis-veil-amber', name: 'Veil Amber', description: 'Visor translúcido con filtro ámbar y ventilación lateral.', price_cents: 24500, stock: 6, category: 'vis-shield' }),
  c({ slug: 'vis-frame-x', name: 'Frame X', description: 'Máscara deportiva ligera con lente plata y apoyo flexible.', price_cents: 22500, stock: 8, category: 'vis-sport' }),
];

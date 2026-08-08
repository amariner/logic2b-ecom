/** Catálogo ficticio de LÍTICA. Todos los slugs están namespaceados. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'litica',
});

export const liticaSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'lit-mineral-wash', name: 'Lavado Mineral', description: 'Gel de limpieza suave con arcilla blanca y avena coloidal para retirar impurezas sin alterar la barrera.', price_cents: 3400, stock: 16, category: 'lit-face' }),
  c({ slug: 'lit-ferment-serum', name: 'Sérum Fermento 03', description: 'Concentrado ligero de fermentos, beta-glucano y minerales para reforzar la hidratación diaria.', price_cents: 4600, stock: 12, category: 'lit-face' }),
  c({ slug: 'lit-barrier-cream', name: 'Crema Barrera', description: 'Emulsión protectora de ceramidas, escualano y zinc para piel expuesta a clima seco y cambios de temperatura.', price_cents: 3800, stock: 14, category: 'lit-face' }),
  c({ slug: 'lit-night-mask', name: 'Mascarilla Noche', description: 'Tratamiento nocturno de textura bálsamo con caolín fino y aceites no perfumados.', price_cents: 4400, stock: 10, category: 'lit-face' }),
  c({ slug: 'lit-body-oil', name: 'Aceite Corporal Seco', description: 'Mezcla de jojoba, sésamo y vitamina E que se absorbe con rapidez y deja un acabado satinado.', price_cents: 4100, stock: 11, category: 'lit-body' }),
  c({ slug: 'lit-limestone-tool', name: 'Piedra Pulida', description: 'Herramienta facial tallada y pulida a mano en piedra caliza de grano fino, presentada en funda de lino.', price_cents: 2800, stock: 18, category: 'lit-objects' }),
];

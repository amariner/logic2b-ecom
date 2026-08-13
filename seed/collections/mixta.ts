/** Catálogo MIXTA — seis fórmulas faciales y corporales propias. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'mixta',
});

export const mixtaSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'mix-polvo-nube', name: 'Polvo Nube', description: 'Limpiador en polvo de avena y arcilla suave que se activa con agua.', price_cents: 2200, stock: 14, category: 'mix-rostro' }),
  c({ slug: 'mix-suero-brote', name: 'Suero Brote', description: 'Sérum ligero de té verde y niacinamida para una piel equilibrada.', price_cents: 3400, stock: 11, category: 'mix-rostro' }),
  c({ slug: 'mix-crema-vela', name: 'Crema Vela', description: 'Crema diaria de textura fundente con ceramidas y escualano vegetal.', price_cents: 3200, stock: 9, category: 'mix-rostro' }),
  c({ slug: 'mix-balsamo-calma', name: 'Bálsamo Calma', description: 'Bálsamo corporal rico que devuelve confort sin dejar residuo graso.', price_cents: 2800, stock: 12, category: 'mix-cuerpo' }),
  c({ slug: 'mix-exfoliante-te', name: 'Exfoliante Té', description: 'Exfoliante cremoso de té verde y azúcar fino para un masaje suave.', price_cents: 2600, stock: 7, category: 'mix-cuerpo' }),
  c({ slug: 'mix-aceite-lento', name: 'Aceite Lento', description: 'Aceite seco de camelia y semilla de uva para sellar la hidratación.', price_cents: 3000, stock: 10, category: 'mix-cuerpo' }),
];

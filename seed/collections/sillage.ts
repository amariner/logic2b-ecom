/** Catálogo ficticio de SILLAGE. Todos los slugs están namespaceados. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'sillage',
});

export const sillageSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'sil-humo-blanco', name: 'Humo Blanco', description: 'Almizcle limpio, madera clara y una salida fría de enebro. Eau de parfum, 50 ml.', price_cents: 11800, stock: 9, category: 'sil-perfume' }),
  c({ slug: 'sil-cedro-solar', name: 'Cedro Solar', description: 'Cítricos amargos, cedro tostado y resina dorada. Eau de parfum, 50 ml.', price_cents: 12600, stock: 12, category: 'sil-perfume' }),
  c({ slug: 'sil-noche-mineral', name: 'Noche Mineral', description: 'Piedra mojada, incienso negro y vetiver. Extracto de perfume, 30 ml.', price_cents: 14200, stock: 6, category: 'sil-perfume' }),
  c({ slug: 'sil-iris-frio', name: 'Iris Frío', description: 'Iris empolvado, hoja de violeta y cuero pálido. Eau de parfum, 50 ml.', price_cents: 13200, stock: 8, category: 'sil-perfume' }),
  c({ slug: 'sil-azahar-08', name: 'Azahar 08', description: 'Aceite aromático concentrado de azahar, petitgrain y neroli. Roll-on, 15 ml.', price_cents: 4200, stock: 18, category: 'sil-oil' }),
  c({ slug: 'sil-vetiver-11', name: 'Vetiver 11', description: 'Aceite seco de vetiver, bergamota y madera de gaiac. Gotero, 30 ml.', price_cents: 5400, stock: 14, category: 'sil-oil' }),
  c({ slug: 'sil-leche-higo', name: 'Leche de Higo', description: 'Loción corporal ligera con hoja de higuera, sándalo y sal marina. 250 ml.', price_cents: 3800, stock: 16, category: 'sil-body-care' }),
  c({ slug: 'sil-balsamo-sal', name: 'Bálsamo de Sal', description: 'Bálsamo nutritivo de algas, salvia y ámbar gris vegetal. 180 ml.', price_cents: 4600, stock: 11, category: 'sil-body-care' }),
];

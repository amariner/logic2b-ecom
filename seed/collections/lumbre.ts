/** Catálogo LUMBRE — seis luminarias propias para una galería cálida. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'lumbre',
});

export const lumbreSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'lum-soma-terracota', name: 'Soma Terracota', description: 'Cúpula de cerámica mate y columna torneada en óxido profundo.', price_cents: 42000, stock: 8, category: 'lum-sobremesa' }),
  c({ slug: 'lum-arco-caliza', name: 'Arco Caliza', description: 'Pantalla y pie mineral de proporción continua, acabados a mano.', price_cents: 48000, stock: 6, category: 'lum-sobremesa' }),
  c({ slug: 'lum-estria-negra', name: 'Estría Negra', description: 'Base acanalada de gres y cúpula negra que concentra una luz baja.', price_cents: 46000, stock: 5, category: 'lum-sobremesa' }),
  c({ slug: 'lum-caliz-arena', name: 'Cáliz Arena', description: 'Cerámica arenada, cuello estrecho y pantalla abierta de luz suave.', price_cents: 39000, stock: 9, category: 'lum-sobremesa' }),
  c({ slug: 'lum-alba-cruda', name: 'Alba Cruda', description: 'Volumen blanco roto con una unión casi invisible entre pie y cúpula.', price_cents: 44000, stock: 7, category: 'lum-ambiente' }),
  c({ slug: 'lum-brasa-cobre', name: 'Brasa Cobre', description: 'Metal patinado y cerámica rojiza para rincones de lectura recogidos.', price_cents: 52000, stock: 4, category: 'lum-ambiente' }),
];

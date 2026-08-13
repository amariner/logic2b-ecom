/** Catálogo COTA — seis residencias ficticias de edición limitada. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'cota',
});

export const cotaSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'cot-cero-lago', name: 'Cero Lago', description: 'Pabellón horizontal de vidrio y piedra sobre la lámina tranquila de un lago alpino.', price_cents: 245000, stock: 3, category: 'cot-agua' }),
  c({ slug: 'cot-umbral-canon', name: 'Umbral Cañón', description: 'Una cubierta de hormigón recorta sombra y horizonte en el borde de la roca.', price_cents: 198000, stock: 3, category: 'cot-tierra' }),
  c({ slug: 'cot-patio-sal', name: 'Patio Sal', description: 'Travertino, agua quieta y un olivo articulan una casa abierta al clima seco.', price_cents: 172000, stock: 3, category: 'cot-tierra' }),
  c({ slug: 'cot-niebla-bosque', name: 'Niebla Bosque', description: 'Pabellón de madera oscura suspendido entre pinos, musgo y niebla.', price_cents: 139000, stock: 3, category: 'cot-tierra' }),
  c({ slug: 'cot-atrio-mar', name: 'Atrio Mar', description: 'Terrazas minerales escalonadas sobre un cabo abierto al Mediterráneo.', price_cents: 286000, stock: 3, category: 'cot-agua' }),
  c({ slug: 'cot-luz-altura', name: 'Luz Altura', description: 'Ático panorámico de aluminio, vidrio y piedra sobre la ciudad en hora azul.', price_cents: 320000, stock: 3, category: 'cot-ciudad' }),
];

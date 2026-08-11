/** Catálogo BRUMA — ocho cafés con slugs globalmente namespaced. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'bruma',
});

export const brumaSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'bru-niebla-alta', name: 'Niebla Alta', description: 'Jazmín, bergamota y melocotón · Etiopía', price_cents: 2200, stock: 18, category: 'bru-origen' }),
  c({ slug: 'bru-loma-clara', name: 'Loma Clara', description: 'Panela, ciruela y cacao · Colombia', price_cents: 2100, stock: 14, category: 'bru-origen' }),
  c({ slug: 'bru-piedra-azul', name: 'Piedra Azul', description: 'Caramelo, naranja y avellana · Guatemala', price_cents: 2000, stock: 11, category: 'bru-origen' }),
  c({ slug: 'bru-bosque-bajo', name: 'Bosque Bajo', description: 'Chocolate negro, nuez y dátil · Brasil', price_cents: 1900, stock: 20, category: 'bru-origen' }),
  c({ slug: 'bru-sol-de-tarde', name: 'Sol de Tarde', description: 'Albaricoque, miel y té negro · Lote estacional', price_cents: 2300, stock: 8, category: 'bru-temporada' }),
  c({ slug: 'bru-bruma-fria', name: 'Bruma Fría', description: 'Cacao, cereza y melaza · Perfil para cold brew', price_cents: 2400, stock: 9, category: 'bru-temporada' }),
  c({ slug: 'bru-umbral', name: 'Umbral', description: 'Cacao, almendra y mandarina · Descafeinado al agua', price_cents: 2100, stock: 15, category: 'bru-descafeinado' }),
  c({ slug: 'bru-duo-origen', name: 'Dúo Origen', description: 'Niebla Alta + Loma Clara · Dos bolsas de 250 g', price_cents: 3900, stock: 7, category: 'bru-packs' }),
];

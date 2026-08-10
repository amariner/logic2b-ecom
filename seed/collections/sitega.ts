import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'sitega',
});

export const sitegaSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'sit-basin-soft', name: 'Soft 01', description: 'Lavabo cerámico de sobremesa con geometría redondeada y desagüe integrado.', subtitle: 'Cerámica · blanco mate', price_cents: 28900, stock: 8, category: 'sit-umyvalniki', image: '/images/collections/sitega/basin-soft.jpg' }),
  c({ slug: 'sit-basin-black', name: 'Black 02', description: 'Lavabo profundo en cerámica negra mate para composiciones monocromas.', subtitle: 'Cerámica · negro mate', price_cents: 32900, stock: 6, category: 'sit-umyvalniki', image: '/images/collections/sitega/basin-black.jpg' }),
  c({ slug: 'sit-basin-oval', name: 'Oval 03', description: 'Lavabo ovalado de canto orgánico y tacto sedoso.', subtitle: 'Cerámica · blanco seda', price_cents: 30900, stock: 9, category: 'sit-umyvalniki', image: '/images/collections/sitega/basin-oval.jpg' }),
  c({ slug: 'sit-faucet-arc', name: 'Arc 04', description: 'Grifería de lavabo con arco alto y mando lateral de precisión.', subtitle: 'Acero · negro mate', price_cents: 21900, stock: 12, category: 'sit-smesiteli', image: '/images/collections/sitega/faucet-arc.jpg' }),
  c({ slug: 'sit-basin-table', name: 'Table 05', description: 'Lavabo arquitectónico rectangular con borde fino y presencia escultórica.', subtitle: 'Cerámica · blanco mate', price_cents: 35900, stock: 5, category: 'sit-kollekcii', image: '/images/collections/sitega/basin-table.jpg' }),
  c({ slug: 'sit-basin-stone', name: 'Stone 06', description: 'Pieza redonda tallada en acabado mineral carbón.', subtitle: 'Piedra · carbón', price_cents: 38900, stock: 4, category: 'sit-kollekcii', image: '/images/collections/sitega/basin-stone.jpg' }),
  c({ slug: 'sit-faucet-wall', name: 'Wall 07', description: 'Caño mural cilíndrico con acabado grafito cepillado.', subtitle: 'Acero · grafito', price_cents: 18900, stock: 11, category: 'sit-smesiteli', image: '/images/collections/sitega/faucet-wall.jpg' }),
  c({ slug: 'sit-basin-pedestal', name: 'Pedestal 08', description: 'Lavabo compacto sobre pedestal para espacios de proporción serena.', subtitle: 'Cerámica · taupe', price_cents: 41900, stock: 3, category: 'sit-kollekcii', image: '/images/collections/sitega/basin-pedestal.jpg' }),
];

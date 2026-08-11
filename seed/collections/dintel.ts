/** Catálogo DINTEL — ocho piezas propias para la retícula escultórica. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'dintel',
});

export const dintelSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'din-silla-arco', name: 'Silla Arco', description: 'Roble ahumado y una silueta continua tallada a mano.', price_cents: 68000, stock: 8, category: 'din-asientos' }),
  c({ slug: 'din-mesa-traves', name: 'Mesa Través', description: 'Travertino apomazado sobre dos apoyos desplazados.', price_cents: 198000, stock: 3, category: 'din-mesas' }),
  c({ slug: 'din-banco-basalto', name: 'Banco Basalto', description: 'Piedra volcánica de grano fino, excavada como una sola pieza.', price_cents: 124000, stock: 4, category: 'din-asientos' }),
  c({ slug: 'din-sillon-plinto', name: 'Sillón Plinto', description: 'Nogal oscuro y lana umber en una estructura de planos precisos.', price_cents: 156000, stock: 3, category: 'din-asientos' }),
  c({ slug: 'din-lampara-brasa', name: 'Lámpara Brasa', description: 'Lino crudo, bronce oxidado y una base irregular de travertino.', price_cents: 58000, stock: 7, category: 'din-luz-objeto' }),
  c({ slug: 'din-mesa-lateral-canto', name: 'Mesa Canto', description: 'Mármol verde profundo con hueco integrado para la lectura lenta.', price_cents: 76000, stock: 6, category: 'din-mesas' }),
  c({ slug: 'din-espejo-umbral', name: 'Espejo Umbral', description: 'Vidrio bronce y un marco de nogal que suaviza la escala vertical.', price_cents: 89000, stock: 5, category: 'din-luz-objeto' }),
  c({ slug: 'din-aparador-linde', name: 'Aparador Linde', description: 'Fresno claro, cuatro planos enrasados y un tirador de bronce discreto.', price_cents: 212000, stock: 2, category: 'din-almacenaje' }),
];

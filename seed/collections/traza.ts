/** Catálogo de TRAZA · ocho objetos originales para una retícula editorial. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'traza',
});

export const trazaSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'tra-mesa-rasante', name: 'Mesa Rasante', description: 'Mesa auxiliar baja de piedra caliza apomazada.', price_cents: 76000, stock: 5, category: 'tra-superficie' }),
  c({ slug: 'tra-lampara-arco', name: 'Lámpara Arco', description: 'Travertino, bronce patinado y lino crudo. Luz baja de sobremesa.', price_cents: 42000, stock: 6, category: 'tra-luz' }),
  c({ slug: 'tra-sillon-cota', name: 'Sillón Cota', description: 'Piel curtida vegetal sobre una estructura de roble macizo.', price_cents: 138000, stock: 3, category: 'tra-asiento' }),
  c({ slug: 'tra-espejo-bisel', name: 'Espejo Bisel', description: 'Vidrio ahumado y pie de acero pavonado, apoyado sin fijaciones.', price_cents: 59000, stock: 7, category: 'tra-objeto' }),
  c({ slug: 'tra-bandeja-veta', name: 'Bandeja Veta', description: 'Pieza oval de mármol marrón, tallada y pulida a mano.', price_cents: 18000, stock: 12, category: 'tra-objeto' }),
  c({ slug: 'tra-banco-plinto', name: 'Banco Plinto', description: 'Roble termotratado y asiento continuo de lana tejida.', price_cents: 98000, stock: 4, category: 'tra-asiento' }),
  c({ slug: 'tra-jarron-caliza', name: 'Jarrón Caliza', description: 'Volumen estriado de gres mate en tono arena.', price_cents: 24000, stock: 9, category: 'tra-objeto' }),
  c({ slug: 'tra-cuenco-sombra', name: 'Cuenco Sombra', description: 'Cerámica negra bruñida con interior de ceniza.', price_cents: 12000, stock: 15, category: 'tra-objeto' }),
];

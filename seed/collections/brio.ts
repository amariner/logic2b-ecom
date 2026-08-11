/** Catálogo BRÍO — seis parches con slugs globalmente namespaced. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'brio',
});

export const brioSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'bri-espalda-libre', name: 'Espalda Libre', description: 'Parches botánicos de uso localizado para acompañar la zona lumbar después de un día largo.', price_cents: 2400, stock: 14, category: 'bri-movimiento' }),
  c({ slug: 'bri-nuca-clara', name: 'Nuca Clara', description: 'Formato flexible pensado para sumar confort a la rutina de cuello y hombros.', price_cents: 2200, stock: 11, category: 'bri-movimiento' }),
  c({ slug: 'bri-pausa-nocturna', name: 'Pausa Nocturna', description: 'Un gesto aromático y discreto para bajar el ritmo antes de dormir.', price_cents: 2100, stock: 16, category: 'bri-descanso' }),
  c({ slug: 'bri-musculo-suelto', name: 'Músculo Suelto', description: 'Parches de sensación cálida para la pausa posterior al entrenamiento.', price_cents: 2400, stock: 8, category: 'bri-movimiento' }),
  c({ slug: 'bri-ciclo-calma', name: 'Ciclo Calma', description: 'Calor suave y botánica aromática para acompañar los días de ciclo.', price_cents: 2300, stock: 13, category: 'bri-dia-a-dia' }),
  c({ slug: 'bri-viaje-ligero', name: 'Viaje Ligero', description: 'Formato compacto para recuperar comodidad después de horas en movimiento.', price_cents: 1900, stock: 18, category: 'bri-dia-a-dia' }),
];

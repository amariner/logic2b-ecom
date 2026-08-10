/** Catálogo ORBE — seis tratamientos con slugs globalmente namespaced. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'orbe',
});

export const orbeSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'orb-renew-serum', name: 'Sérum Renovación', description: 'Concentrado ligero que acompaña la renovación nocturna sin alterar la barrera.', price_cents: 6200, stock: 12, category: 'orb-serums' }),
  c({ slug: 'orb-calm-essence', name: 'Esencia Calma', description: 'Esencia acuosa con acabado sereno para pieles que piden menos ruido y más equilibrio.', price_cents: 4800, stock: 15, category: 'orb-care' }),
  c({ slug: 'orb-barrier-oil', name: 'Aceite Barrera', description: 'Mezcla seca de aceites faciales para sellar hidratación con tacto limpio.', price_cents: 5700, stock: 9, category: 'orb-oils' }),
  c({ slug: 'orb-night-balm', name: 'Bálsamo Noche', description: 'Bálsamo rico de recuperación que se funde sin dejar una película pesada.', price_cents: 6900, stock: 8, category: 'orb-care' }),
  c({ slug: 'orb-eye-concentrate', name: 'Concentrado Mirada', description: 'Tratamiento preciso y fresco para el contorno de ojos, mañana y noche.', price_cents: 4400, stock: 11, category: 'orb-serums' }),
  c({ slug: 'orb-radiance-treatment', name: 'Tratamiento Luz', description: 'Emulsión diaria que hidrata y devuelve una luminosidad de aspecto natural.', price_cents: 5400, stock: 14, category: 'orb-care' }),
];

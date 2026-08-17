/** Catálogo MONTE — tres acabados de la silueta Boston. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'monte',
});

export const monteSeedProducts: readonly SeedProduct[] = [
  c({
    slug: 'mon-pepper', name: 'Pepper 001', subtitle: 'Boston shoulder · piel negra',
    description: 'Bolso Boston de volumen generoso en piel vacuna negra, base envolvente y doble cremallera. Asa larga de mano y bolsillo interior con cierre.',
    price_cents: 32900, stock: 7, category: 'mon-boston',
    specs: [{ label: 'Ancho', value: '34 cm' }, { label: 'Fondo', value: '17,5 cm' },
      { label: 'Alto', value: '16 cm' }, { label: 'Exterior', value: '100 % piel vacuna' }],
  }),
  c({
    slug: 'mon-chalk', name: 'Chalk 002', subtitle: 'Boston shoulder · piel marfil',
    description: 'La silueta Boston en piel marfil mate, con herrajes mínimos, tirador grabado y forro de ante tonal.',
    price_cents: 32900, stock: 5, category: 'mon-boston',
    specs: [{ label: 'Ancho', value: '34 cm' }, { label: 'Fondo', value: '17,5 cm' },
      { label: 'Alto', value: '16 cm' }, { label: 'Forro', value: 'Ante tonal' }],
  }),
  c({
    slug: 'mon-sienna', name: 'Sienna 003', subtitle: 'Edición corta · piel coñac',
    description: 'Edición corta de la Boston en piel color sienna, acabada a mano para conservar el grano y adquirir pátina con el uso.',
    price_cents: 34900, stock: 4, category: 'mon-ediciones',
    specs: [{ label: 'Ancho', value: '34 cm' }, { label: 'Fondo', value: '17,5 cm' },
      { label: 'Alto', value: '16 cm' }, { label: 'Edición', value: '24 unidades' }],
  }),
];

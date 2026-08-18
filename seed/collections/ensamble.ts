/** Catálogo ENSAMBLE — tres piezas de madera y metal en serie corta. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'ensamble',
});

export const ensambleSeedProducts: readonly SeedProduct[] = [
  c({
    slug: 'ens-mesa-umbral', name: 'Mesa Umbral 01', subtitle: 'Cerezo macizo · edición 24',
    description: 'Mesa baja de cerezo con sobre continuo, apoyo desplazado y unión de caja vista. La veta recorre la pieza sin interrupciones.',
    price_cents: 148000, stock: 4, category: 'ens-mesas',
    specs: [{ label: 'Ancho', value: '107 cm' }, { label: 'Fondo', value: '75 cm' },
      { label: 'Alto', value: '25 cm' }, { label: 'Material', value: 'Cerezo macizo' }],
  }),
  c({
    slug: 'ens-silla-pliegue', name: 'Silla Pliegue 02', subtitle: 'Acero plegado · asiento de fresno',
    description: 'Silla de tres planos de acero plegado unidos por travesaños negros y un asiento de fresno aceitado.',
    price_cents: 79000, stock: 6, category: 'ens-asientos',
    specs: [{ label: 'Ancho', value: '49 cm' }, { label: 'Fondo', value: '51 cm' },
      { label: 'Alto', value: '78 cm' }, { label: 'Peso', value: '8,4 kg' }],
  }),
  c({
    slug: 'ens-silla-vertical', name: 'Silla Vertical 03', subtitle: 'Nogal y fresno ennegrecido',
    description: 'Respaldo de listones verticales, asiento inclinado y estructura ligera ensamblada sin herrajes visibles.',
    price_cents: 94000, stock: 5, category: 'ens-asientos',
    specs: [{ label: 'Ancho', value: '46 cm' }, { label: 'Fondo', value: '53 cm' },
      { label: 'Alto', value: '91 cm' }, { label: 'Acabado', value: 'Aceite mate' }],
  }),
];

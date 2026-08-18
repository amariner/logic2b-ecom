/** Catálogo EJE — tres piezas para reunión, espera y trabajo informal. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'eje',
});

export const ejeSeedProducts: readonly SeedProduct[] = [
  c({
    slug: 'eje-silla-torno', name: 'Silla Torno', subtitle: 'Aluminio mate · asiento de haya',
    description: 'Silla compacta de tres apoyos visuales, respaldo transversal y asiento de haya moldeada. Gira alrededor de una huella mínima sin perder estabilidad.',
    price_cents: 64000, stock: 8, category: 'eje-asientos',
    specs: [{ label: 'Ancho', value: '46 cm' }, { label: 'Fondo', value: '48 cm' }, { label: 'Alto', value: '76 cm' }, { label: 'Peso', value: '6,8 kg' }],
  }),
  c({
    slug: 'eje-mesa-proto', name: 'Mesa Proto 02', subtitle: 'Roble blanqueado · base central',
    description: 'Mesa auxiliar de sobre circular y fuste continuo, pensada para acercarse a un sofá, una butaca o un banco sin imponer una orientación.',
    price_cents: 78000, stock: 6, category: 'eje-mesas',
    specs: [{ label: 'Diámetro', value: '52 cm' }, { label: 'Alto', value: '45 cm' }, { label: 'Material', value: 'Roble macizo' }, { label: 'Acabado', value: 'Aceite blanco' }],
  }),
  c({
    slug: 'eje-banco-bulevar', name: 'Banco Bulevar', subtitle: 'Tapizado gris piedra · acero',
    description: 'Banco curvo de respaldo continuo y patas desplazadas. Funciona como límite suave entre circulaciones y como punto de conversación abierto.',
    price_cents: 129000, stock: 4, category: 'eje-asientos',
    specs: [{ label: 'Ancho', value: '168 cm' }, { label: 'Fondo', value: '54 cm' }, { label: 'Alto', value: '72 cm' }, { label: 'Tapizado', value: 'Lana reciclada' }],
  }),
];

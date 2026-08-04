import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'forma',
});

export const formaSeedProducts: readonly SeedProduct[] = [
  c({
    slug: 'for-clear-01', name: 'Clear 01', description: 'Montura óptica translúcida de acetato suave y líneas redondeadas.', price_cents: 16500, stock: 12, category: 'for-opticas', image: '/images/collections/forma/frame-clear.jpg',
    specs: [{ label: 'Material', value: 'Acetato italiano' }, { label: 'Acabado', value: 'Translúcido cálido' }, { label: 'Lentes', value: 'Ópticas graduables' }],
  }),
  c({
    slug: 'for-black-02', name: 'Black 02', description: 'Montura negra de presencia limpia y proporción atemporal.', price_cents: 18500, stock: 9, category: 'for-opticas', image: '/images/collections/forma/frame-black.jpg',
    specs: [{ label: 'Material', value: 'Acetato negro' }, { label: 'Acabado', value: 'Pulido profundo' }, { label: 'Lentes', value: 'Ópticas graduables' }],
  }),
  c({
    slug: 'for-wire-03', name: 'Wire 03', description: 'Estructura metálica ligera, pensada para desaparecer sobre el rostro.', price_cents: 19500, stock: 7, category: 'for-opticas', image: '/images/collections/forma/frame-wire.jpg',
    specs: [{ label: 'Material', value: 'Acero inoxidable' }, { label: 'Acabado', value: 'Plata satinada' }, { label: 'Peso', value: '18 g' }],
  }),
  c({
    slug: 'for-tortoise-04', name: 'Tortoise 04', description: 'Acetato jaspeado con una silueta cálida y precisa.', price_cents: 20500, stock: 8, category: 'for-opticas', image: '/images/collections/forma/frame-tortoise.jpg',
    specs: [{ label: 'Material', value: 'Acetato italiano' }, { label: 'Acabado', value: 'Carey natural' }, { label: 'Lentes', value: 'Ópticas graduables' }],
  }),
  c({
    slug: 'for-olive-05', name: 'Olive 05', description: 'Gafa solar en acetato oliva con lentes de protección total.', price_cents: 22500, stock: 6, category: 'for-solares', image: '/images/collections/forma/sunglasses-olive.jpg',
    specs: [{ label: 'Material', value: 'Acetato' }, { label: 'Protección', value: 'UV400' }, { label: 'Acabado', value: 'Oliva mate' }],
  }),
  c({
    slug: 'for-charcoal-06', name: 'Charcoal 06', description: 'Gafa solar redonda en carbón mate para todos los días.', price_cents: 22500, stock: 6, category: 'for-solares', image: '/images/collections/forma/sunglasses-charcoal.jpg',
    specs: [{ label: 'Material', value: 'Acetato' }, { label: 'Protección', value: 'UV400' }, { label: 'Acabado', value: 'Carbón mate' }],
  }),
];

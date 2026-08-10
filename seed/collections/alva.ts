/** Catálogo ALVA — ocho piezas con slugs globalmente namespaced. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'alva',
});

export const alvaSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'alv-lina-shoulder-black', name: 'Bolso Lina Negro', description: 'Bolso de hombro compacto en piel granulada, con cremallera superior y correa ajustable.', price_cents: 28500, stock: 8, category: 'alv-bags' }),
  c({ slug: 'alv-lina-shoulder-sand', name: 'Bolso Lina Arena', description: 'La silueta Lina en piel color arena, ligera y proporcionada para acompañar cada día.', price_cents: 28500, stock: 6, category: 'alv-bags' }),
  c({ slug: 'alv-clay-clutch-black', name: 'Clutch Clay Negro', description: 'Clutch blando de piel negra con pliegue central y cierre magnético oculto.', price_cents: 24500, stock: 9, category: 'alv-bags' }),
  c({ slug: 'alv-clay-clutch-chocolate', name: 'Clutch Clay Chocolate', description: 'Piel de ante chocolate y volumen flexible en una pieza pensada para llevar bajo el brazo.', price_cents: 25500, stock: 7, category: 'alv-bags' }),
  c({ slug: 'alv-milda-sandal-black', name: 'Sandalia Milda Negra', description: 'Sandalia destalonada de punta cuadrada con pala asimétrica y tacón bajo escultórico.', price_cents: 18500, stock: 10, category: 'alv-shoes' }),
  c({ slug: 'alv-milda-sandal-brown', name: 'Sandalia Milda Cacao', description: 'La sandalia Milda en piel cacao bruñida, con plantilla suave y perfil mínimo.', price_cents: 18500, stock: 8, category: 'alv-shoes' }),
  c({ slug: 'alv-liv-leather-clog', name: 'Zueco Liv Cuero', description: 'Zueco de piel tostada con nudo ancho, suela ligera y una altura cómoda para todo el día.', price_cents: 19500, stock: 7, category: 'alv-shoes' }),
  c({ slug: 'alv-simone-leather-sandal', name: 'Sandalia Simone Natural', description: 'Sandalia plana de tiras finas en piel natural, acabada a mano y sin herrajes visibles.', price_cents: 16500, stock: 11, category: 'alv-shoes' }),
];

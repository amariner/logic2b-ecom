/** Catálogo ARISTA — cuatro sistemas lineales con ficha técnica estructurada. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({ ...prod, collection: 'arista' });

export const aristaSeedProducts: readonly SeedProduct[] = [
  c({
    slug: 'ari-carril-vector', name: 'Carril Vector', subtitle: 'Perfil magnético de superficie',
    description: 'Carril de aluminio negro con óptica continua y módulos orientables. Una línea técnica precisa para vivienda, galería y retail.',
    price_cents: 24800, stock: 12, category: 'ari-perfiles',
    specs: [{ label: 'Potencia', value: '24 W / m' }, { label: 'Control', value: 'DALI · Push' }, { label: 'Temperatura', value: '2700–4000 K' }, { label: 'Acabado', value: 'Negro grafito' }],
  }),
  c({
    slug: 'ari-duo-muro', name: 'Duo Muro', subtitle: 'Aplique bidireccional',
    description: 'Aplique vertical de sección mínima con doble baño de luz regulable. La óptica queda oculta tras un cuerpo de aluminio extruido.',
    price_cents: 31500, stock: 7, category: 'ari-apliques',
    specs: [{ label: 'Potencia', value: '18 W' }, { label: 'Haz', value: '18° / 42°' }, { label: 'Temperatura', value: '3000 K' }, { label: 'Protección', value: 'IP44' }],
  }),
  c({
    slug: 'ari-linea-rasante', name: 'Línea Rasante', subtitle: 'Perfil empotrado trimless',
    description: 'Perfil continuo sin marco para integrar una línea homogénea en techo o pared. Difusor microprismático y unión sin sombras.',
    price_cents: 18900, stock: 16, category: 'ari-perfiles',
    specs: [{ label: 'Potencia', value: '20 W / m' }, { label: 'Control', value: '1–10 V · DALI' }, { label: 'CRI', value: '> 95' }, { label: 'Corte', value: 'Cada 50 mm' }],
  }),
  c({
    slug: 'ari-pendulo-umbral', name: 'Péndulo Umbral', subtitle: 'Suspensión lineal',
    description: 'Luminaria suspendida de perfil ultrafino, luz directa e indirecta y alimentación integrada en los tensores.',
    price_cents: 42800, stock: 5, category: 'ari-suspendidas',
    specs: [{ label: 'Longitud', value: '1200 / 1800 mm' }, { label: 'Potencia', value: '42 W' }, { label: 'Control', value: 'Casambi · DALI' }, { label: 'Acabado', value: 'Negro o blanco' }],
  }),
];

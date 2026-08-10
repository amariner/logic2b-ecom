/** Catálogo ficticio de NERA. Slugs namespaceados y assets locales propios. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'nera',
});

export const neraSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'ner-blazer-negra', name: 'Blazer Noche', description: 'Blazer de lana negra con hombro relajado, solapa limpia y caída larga.', price_cents: 13900, stock: 8, category: 'ner-tailoring' }),
  c({ slug: 'ner-pantalon-palazzo', name: 'Pantalón Palazzo', description: 'Pantalón negro de tiro alto, pinza frontal y pierna extra ancha.', price_cents: 8900, stock: 12, category: 'ner-pants' }),
  c({ slug: 'ner-blazer-azul', name: 'Blazer Bruma', description: 'Sastrería amplia en lana azul acero con estructura ligera y dos bolsillos.', price_cents: 13900, stock: 7, category: 'ner-tailoring' }),
  c({ slug: 'ner-chaleco-estructura', name: 'Chaleco Línea', description: 'Chaleco entallado de cuatro botones y largo extendido en lana carbón.', price_cents: 7900, stock: 10, category: 'ner-tailoring' }),
  c({ slug: 'ner-vestido-columna', name: 'Vestido Columna', description: 'Vestido negro largo de cuello alto, manga ajustada y silueta depurada.', price_cents: 11900, stock: 6, category: 'ner-tops' }),
  c({ slug: 'ner-pantalon-arcilla', name: 'Pantalón Arcilla', description: 'Pantalón de lana camel con doble pinza y caída recta hasta el suelo.', price_cents: 9400, stock: 9, category: 'ner-pants' }),
  c({ slug: 'ner-top-bandeau', name: 'Top Trazo', description: 'Top bandeau negro de tejido compacto con escote recto y forma precisa.', price_cents: 4900, stock: 14, category: 'ner-tops' }),
  c({ slug: 'ner-jersey-gris', name: 'Jersey Nube', description: 'Jersey de cuello vuelto en lana gris, hombro caído y volumen generoso.', price_cents: 9800, stock: 11, category: 'ner-knit' }),
];

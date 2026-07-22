/**
 * Catálogo de `editorial` — Módulo Audio. 10 productos (reparto de 9B.0).
 * Slugs namespaceados con `edi-`. El tema luce anotaciones técnicas: aquí los
 * subtítulos (capacidad 0002) llevan la línea de especificación.
 */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'editorial',
});

export const editorialSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'edi-sinte-p12', name: 'Sinte de bolsillo P-12', description: 'Sintetizador de bolsillo de 12 voces con secuenciador de 16 pasos y altavoz integrado.', subtitle: '12 voces · 16 pasos · 3,5 mm', price_cents: 8900, stock: 24, category: 'edi-sintes' }),
  c({ slug: 'edi-sinte-b04', name: 'Caja de ritmos B-04', description: 'Caja de ritmos compacta con 8 pads sensibles, 64 sonidos y salida estéreo.', subtitle: '8 pads · 64 samples', price_cents: 10900, stock: 18, category: 'edi-sintes' }),
  c({ slug: 'edi-sampler-s1', name: 'Sampler S-1', description: 'Sampler de mano con micrófono integrado, 8 bancos y resampleo ilimitado.', subtitle: 'Micro int. · 8 bancos', price_cents: 12900, stock: 15, category: 'edi-sintes' }),
  c({ slug: 'edi-teclado-k37', name: 'Teclado K-37', description: 'Teclado controlador de 37 miniteclas con arpegiador y USB-C. Cabe en una mochila.', subtitle: '37 teclas · USB-C', price_cents: 14900, stock: 12, category: 'edi-sintes' }),
  c({ slug: 'edi-altavoz-m0', name: 'Altavoz M-0', description: 'Altavoz de escritorio de aluminio mecanizado con radiador pasivo. Pequeño y serio.', subtitle: '15 W · BT 5.3', price_cents: 16900, stock: 14, category: 'edi-altavoces' }),
  c({ slug: 'edi-altavoz-m1', name: 'Altavoz M-1', description: 'Monitor compacto de estantería con woofer de 3,5" y ecualización de sala.', subtitle: '40 W · DSP de sala', price_cents: 29900, stock: 9, category: 'edi-altavoces' }),
  c({ slug: 'edi-radio-r2', name: 'Radio R-2', description: 'Radio FM/DAB+ de sobremesa con carcasa de ABS naranja señal y asa de silicona.', subtitle: 'FM/DAB+ · 20 h batería', price_cents: 11900, stock: 16, category: 'edi-altavoces' }),
  c({ slug: 'edi-funda-neopreno', name: 'Funda de neopreno', description: 'Funda de neopreno de 3 mm con cierre magnético para sintes de bolsillo.', price_cents: 2400, stock: 40, category: 'edi-accesorios' }),
  c({ slug: 'edi-cable-sync-3', name: 'Cable sync 3,5 mm (×3)', description: 'Pack de tres cables de sincronía de 3,5 mm en amarillo, naranja y negro.', price_cents: 1500, stock: 60, category: 'edi-accesorios' }),
  c({ slug: 'edi-soporte-mesa', name: 'Soporte de mesa A-1', description: 'Atril de aluminio plegado a 15° para trabajar de pie sobre la mesa.', price_cents: 3900, stock: 30, category: 'edi-accesorios' }),
];

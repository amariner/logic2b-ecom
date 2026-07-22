/**
 * Catálogo de `guide` — Cafetal. 8 productos (reparto de 9B.0): los 8 objetos
 * simples de la decisión de 9B.0 (la ilustración de línea ENTRA con 8 piezas).
 * Slugs namespaceados con `cof-`.
 */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'guide',
});

export const guideSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'cof-cafe-huila-250', name: 'Café Huila 250 g', description: 'Colombia, finca de altura. Lavado, tueste claro: fruta roja, panela y final limpio. En grano.', price_cents: 1250, stock: 40, category: 'cof-cafe' }),
  c({ slug: 'cof-dripper-v60', name: 'Dripper cónico 02', description: 'Cono de cerámica esmaltada para filtro de papel 02. El punto de partida del café de filtro.', price_cents: 2400, stock: 25, category: 'cof-preparacion' }),
  c({ slug: 'cof-molinillo-manual', name: 'Molinillo manual', description: 'Muelas cónicas de acero, 40 clics de ajuste y cuerpo de aluminio. Muele para dos tazas.', price_cents: 6900, stock: 15, category: 'cof-preparacion' }),
  c({ slug: 'cof-bascula', name: 'Báscula con temporizador', description: 'Precisión de 0,1 g con cronómetro integrado. La receta, repetible.', price_cents: 4500, stock: 18, category: 'cof-preparacion' }),
  c({ slug: 'cof-hervidor-cuello', name: 'Hervidor de cuello de cisne', description: 'Caudal fino y controlado para el vertido. Acero, 900 ml, apto para inducción.', price_cents: 5900, stock: 12, category: 'cof-preparacion' }),
  c({ slug: 'cof-prensa-francesa', name: 'Prensa francesa', description: 'Vidrio borosilicato y filtro de malla fina. 600 ml: café con cuerpo, cero papel.', price_cents: 3400, stock: 14, category: 'cof-preparacion' }),
  c({ slug: 'cof-servidor-600', name: 'Servidor de vidrio 600 ml', description: 'Jarra de vidrio con marca de dosis para servir el filtro en la mesa.', price_cents: 2900, stock: 16, category: 'cof-servicio' }),
  c({ slug: 'cof-taza-ceramica', name: 'Taza de cerámica 250 ml', description: 'Taza de gres esmaltado en crudo, boca ancha para el aroma. Hecha a mano.', price_cents: 1800, stock: 30, category: 'cof-servicio' }),
];

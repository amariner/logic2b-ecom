/**
 * Catálogo de la colección `stretch` — STUB de 3 productos.
 *
 * TODO(tema stretch): sustituir por el catálogo real (ver reparto de productos en
 * docs/ROADMAP.md § 9B.0). Reglas:
 *  · slugs NAMESPACEADOS con «str-» (slug es UNIQUE GLOBAL en D1);
 *  · `category` debe existir en src/collections/stretch.ts;
 *  · imagen: /images/collections/stretch/<slug>.webp (la resuelve el seed);
 *  · `compare_at_price_cents` es SOLO presentación y debe ser > price_cents.
 *
 * Gotcha: imports relativos con extensión .ts (corre bajo node type-stripping).
 */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'stretch',
});

export const stretchSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'str-illuminating-cleansing-gel', name: 'Gel limpiador iluminador', description: 'Limpieza suave que elimina impurezas sin alterar la barrera cutánea.', price_cents: 3600, stock: 18, category: 'str-face' }),
  c({ slug: 'str-unifying-serum-spray', name: 'Sérum unificador en spray', description: 'Bruma concentrada para afinar poros y equilibrar el tono.', price_cents: 3400, stock: 15, category: 'str-face' }),
  c({ slug: 'str-super-glow-set', name: 'Set Super Glow', description: 'Rutina completa para recuperar luminosidad y elasticidad.', price_cents: 9200, compare_at_price_cents: 9900, stock: 9, category: 'str-face' }),
  c({ slug: 'str-radiance-day-oil', name: 'Aceite de día Radiance', description: 'Aceite protector de rápida absorción con acabado radiante.', price_cents: 5900, stock: 12, category: 'str-face' }),
  c({ slug: 'str-deep-moisture-cream', name: 'Crema hidratante intensa', description: 'Hidratación nutritiva y duradera para pieles exigentes.', price_cents: 4800, stock: 14, category: 'str-face' }),
  c({ slug: 'str-night-repair-elixir', name: 'Elixir reparador nocturno', description: 'Tratamiento nocturno concentrado para renovar y calmar.', price_cents: 7200, compare_at_price_cents: 7900, stock: 8, category: 'str-face' }),
  c({ slug: 'str-gentle-exfoliating-toner', name: 'Tónico exfoliante suave', description: 'Exfoliación progresiva que alisa y refina la textura.', price_cents: 4200, stock: 13, category: 'str-face' }),
];

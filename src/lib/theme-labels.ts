/**
 * Etiquetas legibles del descriptor de un tema (`demo-themes.ts`).
 *
 * `/temas` y la ficha de cada tema (`/temas/<id>`) traducen los valores de
 * `layout` y de los tokens a lenguaje de comercio. Antes el mapa vivía como
 * literal dentro de `temas.astro` y se quedó corto al añadir `gridCols: 5`: la
 * fila se pintó vacía sin aviso. Tipado por dimensión, un valor nuevo en
 * `ThemeLayout` rompe `astro check` antes de llegar a producción.
 */
import type { DemoTheme, ThemeLayout } from './demo-themes';

type LayoutLabels = {
  readonly [K in keyof Pick<
    ThemeLayout,
    'gridCols' | 'gridStyle' | 'nav' | 'hero' | 'card' | 'filters' | 'density'
  >]: Readonly<Record<ThemeLayout[K], string>>;
};

export const THEME_LAYOUT_LABELS: LayoutLabels = {
  gridCols: { 2: '2 columnas', 3: '3 columnas', 4: '4 columnas', 5: '5 columnas' },
  gridStyle: { uniform: 'uniforme', irregular: 'irregular' },
  nav: { top: 'Nav superior', sidebar: 'Nav lateral', immersive: 'Inmersivo (header propio)' },
  hero: {
    none: 'Directa al catálogo',
    split: 'Partida: texto e imagen',
    card: 'Tarjeta de bienvenida',
    fullbleed: 'Imagen a sangre',
  },
  card: {
    hairline: 'Tarjeta con filete',
    plain: 'Tarjeta sin borde',
    elevated: 'Tarjeta elevada',
    divided: 'Tarjeta dividida',
  },
  filters: { chips: 'Filtros en chips', sidebar: 'Filtros laterales', dropdown: 'Filtros en desplegable' },
  density: { compact: 'Densidad compacta', regular: 'Densidad normal', airy: 'Densidad aireada' },
};

/** «4 columnas · irregular»: la rejilla completa en una línea. */
export function gridLabel(layout: Pick<ThemeLayout, 'gridCols' | 'gridStyle'>): string {
  return `${THEME_LAYOUT_LABELS.gridCols[layout.gridCols]} · ${THEME_LAYOUT_LABELS.gridStyle[layout.gridStyle]}`;
}

/**
 * Nombres propios de las familias que usan los temas. Solo se nombra una
 * fuente cuando la tienda la pinta de verdad: `Inter Tight` no se descarga y
 * cae a la sans del sistema, así que se describe como tal.
 */
const FONT_NAMES: Readonly<Record<string, string>> = {
  fraunces: 'Fraunces · con serifa',
  georgia: 'Georgia · con serifa',
  'arial narrow': 'Arial Narrow · condensada',
  'arial black': 'Arial Black · extranegrita',
  arial: 'Arial · sin serifa',
};

const SYSTEM_FAMILIES = new Set(['ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif', 'inter tight']);

/** Tipografía de titulares en lenguaje humano, derivada de `--font-display`. */
export function displayFontLabel(theme: Pick<DemoTheme, 'vars'>): string {
  const first = theme.vars['--font-display'].split(',')[0]?.trim().replace(/^['"]|['"]$/g, '').toLowerCase() ?? '';
  if (FONT_NAMES[first]) return FONT_NAMES[first];
  if (SYSTEM_FAMILIES.has(first)) return 'Sans del sistema';
  if (first === 'serif' || first === 'ui-serif') return 'Serifa del sistema';
  return first ? first.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()) : 'Sans del sistema';
}

/** Forma de los botones a partir de `--radius-btn`. */
export function buttonShapeLabel(theme: Pick<DemoTheme, 'vars'>): string {
  const raw = theme.vars['--radius-btn'].trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value === 0) return 'Rectos';
  const px = raw.endsWith('rem') ? value * 16 : value;
  return px >= 999 ? 'Redondeados' : 'Esquina suave';
}

/**
 * CATÁLOGO DE ESTILOS LogicEcom
 * ============================================================================
 *
 * Cada tema es una DIRECCIÓN VISUAL COMPLETA derivada de una referencia real de
 * ecommerce (ver `docs/TEMAS.md` y `public/images/referencias/`). No son
 * variaciones de color: cambian rejilla, densidad, tratamiento de tarjeta,
 * navegación y escala tipográfica.
 *
 * CONTRATO ARQUITECTÓNICO (decisión 2026-07-20)
 * ----------------------------------------------------------------------------
 * Un tema = `vars` (tokens CSS) + `layout` (estructura) + componentes propios.
 *
 *   · `vars`    → se inyectan en :root. Lista CERRADA (THEME_VARS): nada más es
 *                 tocable por un tema. Esto es lo que impide que un tema se
 *                 convierta en un fork del CSS.
 *   · `layout`  → descriptor declarativo que consumen los componentes de tienda
 *                 para elegir variante estructural (rejilla, nav, tarjeta...).
 *   · componentes → `src/components/themes/<id>/` (se crean al desarrollar cada
 *                 tema; ver docs/TEMAS.md § "Cómo se desarrolla un tema").
 *
 * LO QUE NUNCA CAMBIA ENTRE TEMAS
 * ----------------------------------------------------------------------------
 * El backend es UNO solo para todos: D1, `lib/pricing.ts`, `lib/shipping.ts`,
 * `lib/quote.ts`, checkout, webhook de Stripe y `emails_outbox`. Un tema es
 * exclusivamente capa de presentación. Si desarrollando un tema aparece la
 * necesidad de tocar lógica de negocio, es señal de que algo se ha modelado
 * mal — parar y replantear, no bifurcar el backend.
 *
 * En un proyecto de cliente real NO existe el selector: el cliente tiene UN
 * tema, el suyo. El selector es la pieza de venta que demuestra el catálogo.
 */

import { shopConfig } from '../../shop.config';

export const DEMO_THEME_KEY = 'ecom-demo-theme';

/**
 * Variables que un tema puede sobreescribir. Lista cerrada y verificada por
 * test: si añades una aquí, todos los temas deben declararla.
 */
export const THEME_VARS = [
  // — Acento —
  '--color-brand',        // color de acción (botones, enlaces, foco)
  '--color-brand-dark',   // estado hover/active del acento
  '--color-brand-fg',     // texto SOBRE el acento (no siempre es blanco)

  // — Tipografía —
  '--font-display',       // titulares
  '--font-accent',        // etiquetas técnicas, numeración, refs (suele ser mono)
  '--tracking-display',   // interletraje de titulares (-0.04em … 0.02em)
  '--weight-display',     // grosor de titulares (400 … 700)

  // — Forma —
  '--radius-btn',         // radio de botón
  '--radius-card',        // radio de tarjeta / caja de imagen
  '--border-width',       // grosor de filete (0px = sin borde, 1px hairline)

  // — Superficie —
  '--surface-product',    // fondo de la caja de imagen de producto
  '--surface-sunken',     // fondo de secciones hundidas / footer claro

  // — Ritmo —
  '--space-density',      // multiplicador de padding (0.75 compacto … 1.5 aireado)
  '--grid-gap',           // separación de la rejilla de catálogo
] as const;

export type ThemeVar = (typeof THEME_VARS)[number];
export type DemoThemeVars = Record<ThemeVar, string>;

/**
 * Descriptor ESTRUCTURAL. Lo consumen los componentes de tienda para elegir
 * variante. Es declarativo a propósito: mantiene la decisión de diseño en un
 * único sitio auditable en vez de repartida en condicionales por las páginas.
 */
export type ThemeLayout = {
  /** Columnas del catálogo en desktop. */
  gridCols: 2 | 3 | 4 | 5;
  /**
   * Cómo se comporta la rejilla.
   *  · `uniform`   — todas las celdas iguales (lo normal).
   *  · `irregular` — celdas de distinto tamaño/span. Editorial, Industrial y
   *    Specs lo usan: en sus referencias hay productos que ocupan 2 columnas o
   *    filas de altura distinta. Es composición explícita por breakpoint, NO
   *    `grid-auto-flow: dense` (que reordena y rompe el orden de catálogo).
   */
  gridStyle: 'uniform' | 'irregular';
  /** Dónde vive la navegación de catálogo. */
  nav: 'top' | 'sidebar';
  /**
   * Cabecera del catálogo.
   *  · `none`      — directo a la rejilla.
   *  · `split`     — texto a un lado, imagen a sangre al otro (Natural).
   *  · `card`      — tarjeta grande redondeada con título y nav (Guide).
   *  · `fullbleed` — imagen a sangre con título superpuesto, header DEBAJO (Street).
   */
  hero: 'none' | 'split' | 'card' | 'fullbleed';
  /** Tratamiento de la tarjeta de producto. */
  card: 'hairline' | 'plain' | 'elevated' | 'divided';
  /** Cómo se filtra el catálogo. */
  filters: 'chips' | 'sidebar' | 'dropdown';
  /** Densidad general. */
  density: 'compact' | 'regular' | 'airy';
  /** Etiquetas monoespaciadas (numeración de sección, referencias técnicas). */
  annotations: boolean;
  /** Footer oscuro a sangre (vs. footer claro con filete). */
  darkFooter: boolean;
};

/** Estado de desarrollo — lo pinta el catálogo público en /estilos. */
export type ThemeStatus = 'ready' | 'planned';

export type DemoTheme = {
  id: string;
  label: string;
  /** Una línea que vende el preset («así se vería tu tienda…»). */
  hint: string;
  /**
   * Referencia visual de origen. Fichero en public/images/referencias/.
   * Es material INTERNO de trabajo (captura de una tienda ajena): documenta de
   * dónde sale la dirección, pero no se publica en la página indexable.
   */
  reference: { name: string; file: string } | null;
  /**
   * Imaginería PROPIA en la estética del tema (generada con Higgsfield).
   * Esto sí es lo que se enseña en /estilos: comunica el aire del estilo sin
   * republicar el trabajo de nadie. Fichero en public/images/temas/.
   */
  sample: string | null;
  /** Sector/es donde este estilo encaja mejor. Argumento de venta. */
  bestFor: readonly string[];
  status: ThemeStatus;
  vars: DemoThemeVars;
  layout: ThemeLayout;
};

const SYSTEM_SANS =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

export const demoThemes: DemoTheme[] = [
  // ---------------------------------------------------------------------------
  // 00 · BASE — el arranque neutro Logic2B UI. Es la marca real de shop.config.
  // ---------------------------------------------------------------------------
  {
    id: 'base',
    label: 'Base',
    hint: 'Logic2B UI puro: Inter, neutros, botón pill. El punto de partida.',
    reference: null,
    sample: null,
    bestFor: ['Punto de partida', 'Cliente sin identidad definida'],
    status: 'ready',
    vars: {
      '--color-brand': shopConfig.brand.color,
      '--color-brand-dark': shopConfig.brand.colorDark,
      '--color-brand-fg': '#ffffff',
      '--font-display': SYSTEM_SANS,
      '--font-accent': MONO,
      '--tracking-display': '-0.02em',
      '--weight-display': '600',
      '--radius-btn': '9999px',
      '--radius-card': '0.75rem',
      '--border-width': '1px',
      '--surface-product': '#f6f6f4',
      '--surface-sunken': '#fafafa',
      '--space-density': '1',
      '--grid-gap': '1.5rem',
    },
    layout: {
      gridCols: 4, gridStyle: 'uniform', nav: 'top', hero: 'none',
      card: 'plain', filters: 'chips', density: 'regular',
      annotations: false, darkFooter: false,
    },
  },

  // ---------------------------------------------------------------------------
  // 01 · EDITORIAL — ref. Teenage Engineering
  // ---------------------------------------------------------------------------
  {
    id: 'editorial',
    label: 'Editorial',
    hint: 'Rejilla suiza densa, numeración de sección, naranja señal.',
    reference: { name: 'Teenage Engineering', file: '01-editorial.webp' },
    sample: '/images/temas/editorial.webp',
    bestFor: ['Diseño y objeto', 'Audio y tecnología', 'Marcas con voz propia'],
    status: 'ready',
    vars: {
      '--color-brand': '#d42f08',
      '--color-brand-dark': '#a82406',
      '--color-brand-fg': '#ffffff',
      '--font-display': SYSTEM_SANS,
      '--font-accent': MONO,
      '--tracking-display': '-0.03em',
      '--weight-display': '500',
      '--radius-btn': '0.25rem',
      '--radius-card': '0rem',
      '--border-width': '1px',
      '--surface-product': '#f2f2f0',
      '--surface-sunken': '#ebebeb',
      '--space-density': '0.75',
      '--grid-gap': '0.5rem',
    },
    layout: {
      gridCols: 4, gridStyle: 'irregular', nav: 'top', hero: 'none',
      card: 'hairline', filters: 'chips', density: 'compact',
      annotations: true, darkFooter: false,
    },
  },

  // ---------------------------------------------------------------------------
  // 02 · INDUSTRIAL — ref. TAGARNO
  // ---------------------------------------------------------------------------
  {
    id: 'industrial',
    label: 'Industrial',
    hint: 'Catálogo técnico B2B, filetes a sangre, azul eléctrico, footer negro.',
    reference: { name: 'TAGARNO', file: '02-industrial.webp' },
    sample: '/images/temas/industrial.webp',
    bestFor: ['B2B y maquinaria', 'Suministro industrial', 'Catálogos con ficha técnica'],
    status: 'planned',
    vars: {
      '--color-brand': '#1b4dff',
      '--color-brand-dark': '#1339cc',
      '--color-brand-fg': '#ffffff',
      '--font-display': SYSTEM_SANS,
      '--font-accent': MONO,
      '--tracking-display': '0em',
      '--weight-display': '600',
      '--radius-btn': '0rem',
      '--radius-card': '0rem',
      '--border-width': '1px',
      '--surface-product': '#ffffff',
      '--surface-sunken': '#f4f4f4',
      '--space-density': '0.85',
      '--grid-gap': '0rem',
    },
    layout: {
      gridCols: 4, gridStyle: 'irregular', nav: 'top', hero: 'none',
      card: 'divided', filters: 'dropdown', density: 'compact',
      annotations: false, darkFooter: true,
    },
  },

  // ---------------------------------------------------------------------------
  // 03 · NATURAL — ref. All Natural (AFF)
  // ---------------------------------------------------------------------------
  {
    id: 'natural',
    label: 'Natural',
    hint: 'DTC clásico: filtros laterales, badges de oferta, carrito deslizante.',
    reference: { name: 'All Natural / AFF', file: '03-natural.webp' },
    sample: '/images/temas/natural.webp',
    bestFor: ['Cosmética y cuidado personal', 'Alimentación', 'Marcas DTC'],
    status: 'planned',
    vars: {
      '--color-brand': '#14594a',
      '--color-brand-dark': '#0e4035',
      '--color-brand-fg': '#ffffff',
      '--font-display': SYSTEM_SANS,
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.01em',
      '--weight-display': '500',
      '--radius-btn': '0.375rem',
      '--radius-card': '0.25rem',
      '--border-width': '1px',
      '--surface-product': '#f0f0ee',
      '--surface-sunken': '#f7f7f5',
      '--space-density': '1',
      '--grid-gap': '1rem',
    },
    layout: {
      gridCols: 4, gridStyle: 'uniform', nav: 'top', hero: 'split',
      card: 'plain', filters: 'sidebar', density: 'regular',
      annotations: false, darkFooter: false,
    },
  },

  // ---------------------------------------------------------------------------
  // 04 · GUIDE — ref. Pour over
  // ---------------------------------------------------------------------------
  {
    id: 'guide',
    label: 'Guide',
    hint: 'Editorial amable: tarjetas redondeadas, numeración, ilustración de línea.',
    reference: { name: 'Pour over', file: '04-guide.webp' },
    sample: '/images/temas/guide.webp',
    bestFor: ['Café y especialidad', 'Producto que necesita explicación', 'Contenido + venta'],
    status: 'ready',
    vars: {
      '--color-brand': '#f5c518',
      '--color-brand-dark': '#d9a800',
      // Acento CLARO: el texto encima va en tinta, no en blanco.
      '--color-brand-fg': '#1a1a1a',
      '--font-display': SYSTEM_SANS,
      '--font-accent': MONO,
      '--tracking-display': '-0.02em',
      '--weight-display': '500',
      '--radius-btn': '9999px',
      '--radius-card': '1rem',
      '--border-width': '1px',
      '--surface-product': '#fbfdfd',
      '--surface-sunken': '#eef1f1',
      '--space-density': '1.25',
      '--grid-gap': '1rem',
    },
    layout: {
      gridCols: 4, gridStyle: 'uniform', nav: 'top', hero: 'card',
      card: 'elevated', filters: 'chips', density: 'airy',
      annotations: true, darkFooter: false,
    },
  },

  // ---------------------------------------------------------------------------
  // 05 · SPECS — ref. ACF-01
  // ---------------------------------------------------------------------------
  {
    id: 'specs',
    label: 'Specs',
    hint: 'Ficha técnica: tablas de especificación, grises, acordeones, acento mínimo.',
    reference: { name: 'ACF-01', file: '05-specs.webp' },
    sample: '/images/temas/specs.webp',
    bestFor: ['Relojería y precisión', 'Componentes', 'Producto con muchos datos'],
    status: 'planned',
    vars: {
      '--color-brand': '#c2410c',
      '--color-brand-dark': '#9a3412',
      '--color-brand-fg': '#ffffff',
      '--font-display': SYSTEM_SANS,
      '--font-accent': MONO,
      '--tracking-display': '-0.04em',
      '--weight-display': '500',
      '--radius-btn': '0.25rem',
      '--radius-card': '0rem',
      '--border-width': '1px',
      '--surface-product': '#e8e8e8',
      '--surface-sunken': '#efefef',
      '--space-density': '0.85',
      '--grid-gap': '0.75rem',
    },
    layout: {
      gridCols: 3, gridStyle: 'irregular', nav: 'top', hero: 'none',
      card: 'divided', filters: 'dropdown', density: 'compact',
      annotations: true, darkFooter: false,
    },
  },

  // ---------------------------------------------------------------------------
  // 06 · MINIMAL — ref. propro
  // ---------------------------------------------------------------------------
  {
    id: 'minimal',
    label: 'Minimal',
    hint: 'Aire, nav lateral, dos columnas de imagen grande, footer oscuro.',
    reference: { name: 'propro', file: '06-minimal.webp' },
    sample: '/images/temas/minimal.webp',
    bestFor: ['Mobiliario e interiorismo', 'Moda', 'Producto que se vende por la foto'],
    status: 'ready',
    vars: {
      '--color-brand': '#1a1a1a',
      '--color-brand-dark': '#000000',
      '--color-brand-fg': '#ffffff',
      '--font-display': SYSTEM_SANS,
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.01em',
      '--weight-display': '400',
      '--radius-btn': '0rem',
      '--radius-card': '0rem',
      '--border-width': '0px',
      '--surface-product': '#ebebeb',
      '--surface-sunken': '#f2f2f2',
      '--space-density': '1.5',
      '--grid-gap': '2rem',
    },
    layout: {
      gridCols: 2, gridStyle: 'uniform', nav: 'sidebar', hero: 'none',
      card: 'plain', filters: 'dropdown', density: 'airy',
      annotations: false, darkFooter: true,
    },
  },

  // ---------------------------------------------------------------------------
  // 07 · LAUNCH — ref. P1
  // ---------------------------------------------------------------------------
  {
    id: 'launch',
    label: 'Launch',
    hint: 'Lanzamiento de producto: titulares enormes, features numeradas, barra sticky.',
    reference: { name: 'P1', file: '07-launch.webp' },
    sample: '/images/temas/launch.webp',
    bestFor: ['Catálogo corto de alto valor', 'Producto estrella', 'Preventa y reservas'],
    status: 'ready',
    vars: {
      '--color-brand': '#15803d',
      '--color-brand-dark': '#166534',
      '--color-brand-fg': '#ffffff',
      '--font-display': SYSTEM_SANS,
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.03em',
      '--weight-display': '400',
      '--radius-btn': '0.25rem',
      '--radius-card': '0.5rem',
      '--border-width': '1px',
      '--surface-product': '#f7f7f7',
      '--surface-sunken': '#fafafa',
      '--space-density': '1.25',
      '--grid-gap': '1.5rem',
    },
    layout: {
      gridCols: 3, gridStyle: 'uniform', nav: 'top', hero: 'none',
      card: 'hairline', filters: 'chips', density: 'airy',
      annotations: false, darkFooter: false,
    },
  },

  // ---------------------------------------------------------------------------
  // 08 · STREET — ref. Up There Athletics
  // ---------------------------------------------------------------------------
  {
    id: 'street',
    label: 'Street',
    hint: 'Revista de moda: ticker, hero a sangre, rejilla densa de 5, footer negro.',
    reference: { name: 'Up There Athletics', file: '08-street.webp' },
    sample: '/images/temas/street.webp',
    bestFor: ['Moda y streetwear', 'Calzado deportivo', 'Marcas con drops y campañas'],
    status: 'planned',
    vars: {
      // Verde neón del ticker. Acento CLARO → texto en tinta encima.
      '--color-brand': '#c3f53c',
      '--color-brand-dark': '#a8d92b',
      '--color-brand-fg': '#111111',
      '--font-display': SYSTEM_SANS,
      '--font-accent': MONO,
      '--tracking-display': '-0.01em',
      '--weight-display': '600',
      '--radius-btn': '9999px',
      '--radius-card': '0rem',
      '--border-width': '0px',
      '--surface-product': '#f4f4f4',
      '--surface-sunken': '#efefef',
      '--space-density': '0.85',
      '--grid-gap': '0.75rem',
    },
    layout: {
      gridCols: 5, gridStyle: 'uniform', nav: 'top', hero: 'fullbleed',
      card: 'plain', filters: 'chips', density: 'compact',
      annotations: true, darkFooter: true,
    },
  },
  // new-theme:themes — no borrar: `pnpm new:theme <id>` añade aquí el tema si falta.
];

export const defaultTheme = demoThemes[0]!;

/** Temas ya desarrollados (los que el selector puede aplicar de verdad). */
export const readyThemes = demoThemes.filter((t) => t.status === 'ready');

export function getTheme(id: string): DemoTheme | undefined {
  return demoThemes.find((t) => t.id === id);
}

/** Aplica (o limpia, con el tema por defecto) las variables del preset en :root. */
export function applyTheme(theme: DemoTheme, root: HTMLElement = document.documentElement): void {
  for (const key of THEME_VARS) {
    if (theme.id === defaultTheme.id) {
      root.style.removeProperty(key);
    } else {
      root.style.setProperty(key, theme.vars[key]);
    }
  }
}

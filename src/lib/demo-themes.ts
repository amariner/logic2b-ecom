/**
 * CATÁLOGO DE ESTILOS Logic2B Ecommerce
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
  /**
   * Dónde vive la navegación de catálogo.
   *  · `immersive` — el tema pinta su PROPIO header sobre el hero (Iris) y el
   *    layout no monta ni SiteHeader ni footer estándar.
   */
  nav: 'top' | 'sidebar' | 'immersive';
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

/** Estado de desarrollo — lo pinta el catálogo público en /temas. */
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
   * Esto sí es lo que se enseña en /temas: comunica el aire del estilo sin
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
    status: 'ready',
    vars: {
      // Azul eléctrico de la referencia. #ffffff encima da 5,91:1 (AA).
      '--color-brand': '#1b4dff',
      '--color-brand-dark': '#1339cc',
      '--color-brand-fg': '#ffffff',
      '--font-display': SYSTEM_SANS,
      // Sans, no mono: `layout.annotations` es false y en la referencia no hay
      // ni una etiqueta monoespaciada. Un token que apunta a algo que el tema no
      // usa es configuración muerta.
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '0em',
      '--weight-display': '600',
      // Radio 0 en todo SALVO pastillas de badge y botón (nota de la referencia).
      '--radius-btn': '0.25rem',
      '--radius-card': '0rem',
      '--border-width': '1px',
      // Blanco puro: la rejilla no tiene gap, así que la caja de imagen y la
      // celda tienen que ser el MISMO blanco para que el filete sea lo único
      // que separa. Por eso la imaginería se generó sobre blanco puro.
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
    status: 'ready',
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
    status: 'ready',
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
  // 14 · ARCE — mobiliario cálido, portada editorial y catálogo de piezas
  // ---------------------------------------------------------------------------
  {
    id: 'arce',
    label: 'Arce',
    hint: 'Interiorismo cálido: hero partido, campañas editoriales y catálogo en capas.',
    reference: { name: 'Mobiliario editorial', file: '14-arce.webp' },
    sample: null,
    bestFor: ['Mobiliario contemporáneo', 'Interiorismo', 'Marcas de hogar'],
    status: 'ready',
    vars: {
      '--color-brand': '#1e1e1e',
      '--color-brand-dark': '#000000',
      '--color-brand-fg': '#ffffff',
      '--font-display': "Fraunces, Georgia, 'Times New Roman', serif",
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.045em',
      '--weight-display': '400',
      '--radius-btn': '0rem',
      '--radius-card': '0rem',
      '--border-width': '1px',
      '--surface-product': '#f2f1ed',
      '--surface-sunken': '#f8f8f6',
      '--space-density': '1.15',
      '--grid-gap': '0.75rem',
    },
    layout: {
      gridCols: 3, gridStyle: 'uniform', nav: 'immersive', hero: 'fullbleed',
      card: 'plain', filters: 'chips', density: 'airy',
      annotations: false, darkFooter: false,
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
    status: 'ready',
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
      // `immersive`, no `top`: en la referencia el header va DEBAJO del hero a
      // sangre, y `Shop.astro` monta el SiteHeader ANTES del slot. El tema pinta
      // su propio chrome (ticker, hero, header y pie negro) — misma capacidad
      // que usa Iris, sin tocar el motor. Decidido con Andreu el 2026-07-25.
      gridCols: 5, gridStyle: 'uniform', nav: 'immersive', hero: 'fullbleed',
      card: 'plain', filters: 'chips', density: 'compact',
      annotations: true, darkFooter: true,
    },
  },
  {
    id: 'iris',
    label: 'Iris',
    hint: 'Cinemática: vídeo escrutado con el scroll, negro absoluto y magenta.',
    reference: { name: 'Orven (spec propio, logic2b-norte)', file: '09-iris.webp' },
    sample: null,
    bestFor: ['Eyewear y óptica', 'Producto premium', 'Lanzamientos de alto impacto'],
    status: 'ready',
    vars: {
      '--color-brand': '#E6074E',
      '--color-brand-dark': '#c1063f',
      '--color-brand-fg': '#ffffff',
      '--font-display': "'Inter Tight', ui-sans-serif, system-ui, sans-serif",
      '--font-accent': MONO,
      '--tracking-display': '-0.04em',
      '--weight-display': '500',
      '--radius-btn': '9999px',
      '--radius-card': '1.125rem',
      '--border-width': '0px',
      '--surface-product': '#F7F5F5',
      '--surface-sunken': '#fafafa',
      '--space-density': '1',
      '--grid-gap': '0.625rem',
    },
    layout: {
      gridCols: 3, gridStyle: 'uniform', nav: 'immersive', hero: 'fullbleed',
      card: 'plain', filters: 'dropdown', density: 'regular',
      annotations: false, darkFooter: false,
    },
  },
  {
    id: 'noddo',
    label: 'Tema Noddo',
    hint: 'Editorial monocromo, producto escultórico y tecnología que no hace ruido.',
    reference: { name: 'O&D Product Line', file: '10-noddo.webp' },
    sample: null,
    bestFor: ['Tecnología doméstica', 'Diseño industrial', 'Objetos conectados'],
    status: 'ready',
    vars: {
      // TODO(tema noddo): tokens copiados de Base — sustituir por los del tema.
      '--color-brand': '#111111',
      '--color-brand-dark': '#000000',
      '--color-brand-fg': '#ffffff',
      '--font-display': SYSTEM_SANS,
      '--font-accent': MONO,
      '--tracking-display': '-0.065em',
      '--weight-display': '500',
      '--radius-btn': '9999px',
      '--radius-card': '0.25rem',
      '--border-width': '0px',
      '--surface-product': '#ececea',
      '--surface-sunken': '#f3f3f1',
      '--space-density': '0.85',
      '--grid-gap': '0.25rem',
    },
    layout: {
      gridCols: 3, gridStyle: 'irregular', nav: 'immersive', hero: 'fullbleed',
      card: 'plain', filters: 'chips', density: 'compact',
      annotations: true, darkFooter: false,
    },
  },
  {
    id: 'sitega',
    label: 'Sitēga',
    hint: 'Sanitarios y grifería editorial: blanco, piedra y negro en una composición de galería.',
    reference: { name: 'Sitēga', file: '11-sitega.webp' },
    sample: null,
    bestFor: ['Baño e interiorismo', 'Cerámica y piedra', 'Marcas arquitectónicas'],
    status: 'ready',
    vars: {
      '--color-brand': '#111111',
      '--color-brand-dark': '#000000',
      '--color-brand-fg': '#ffffff',
      '--font-display': SYSTEM_SANS,
      '--font-accent': MONO,
      '--tracking-display': '-0.065em',
      '--weight-display': '400',
      '--radius-btn': '9999px',
      '--radius-card': '0rem',
      '--border-width': '1px',
      '--surface-product': '#ededeb',
      '--surface-sunken': '#e7e7e5',
      '--space-density': '1.15',
      '--grid-gap': '0.25rem',
    },
    layout: {
      gridCols: 4, gridStyle: 'irregular', nav: 'immersive', hero: 'fullbleed',
      card: 'plain', filters: 'chips', density: 'airy',
      annotations: true, darkFooter: false,
    },
  },
  {
    id: 'forma',
    label: 'Forma',
    hint: 'Gafas editoriales: retratos, monturas y oficio reunidos en una galería serena.',
    reference: { name: 'Forma eyewear', file: '12-forma.webp' },
    sample: null,
    bestFor: ['Ópticas independientes', 'Marcas de accesorios', 'Diseño y moda'],
    status: 'ready',
    vars: {
      // TODO(tema forma): tokens copiados de Base — sustituir por los del tema.
      '--color-brand': '#171717',
      '--color-brand-dark': '#000000',
      '--color-brand-fg': '#ffffff',
      '--font-display': SYSTEM_SANS,
      '--font-accent': MONO,
      '--tracking-display': '-0.07em',
      '--weight-display': '400',
      '--radius-btn': '9999px',
      '--radius-card': '0rem',
      '--border-width': '0px',
      '--surface-product': '#e9e9e5',
      '--surface-sunken': '#f3f3ef',
      '--space-density': '1.1',
      '--grid-gap': '0.25rem',
    },
    layout: {
      gridCols: 4, gridStyle: 'irregular', nav: 'immersive', hero: 'fullbleed',
      card: 'plain', filters: 'chips', density: 'airy',
      annotations: true, darkFooter: true,
    },
  },
  {
    id: 'stretch',
    label: 'STRETCH',
    hint: 'Belleza consciente en gran formato: vídeo, producto y narrativa editorial en movimiento.',
    reference: { name: 'STRETCH skincare briefing', file: '13-stretch.webp' },
    sample: null,
    bestFor: ['Cosmética y skincare', 'Bienestar', 'Marcas sostenibles'],
    status: 'ready',
    vars: {
      '--color-brand': '#171717',
      '--color-brand-dark': '#000000',
      '--color-brand-fg': '#f9f4f0',
      '--font-display': SYSTEM_SANS,
      '--font-accent': MONO,
      '--tracking-display': '-0.055em',
      '--weight-display': '400',
      '--radius-btn': '9999px',
      '--radius-card': '0.5rem',
      '--border-width': '1px',
      '--surface-product': '#eee8e2',
      '--surface-sunken': '#f9f4f0',
      '--space-density': '1.1',
      '--grid-gap': '0rem',
    },
    layout: {
      gridCols: 4, gridStyle: 'uniform', nav: 'immersive', hero: 'fullbleed',
      card: 'divided', filters: 'chips', density: 'airy',
      annotations: true, darkFooter: true,
    },
  },
  {
    id: 'argent',
    label: 'ARGENT.',
    hint: 'Moda cinematográfica: campaña a sangre, carrusel blanco y mosaico editorial.',
    reference: { name: 'ARILGENT homepage study', file: '14-argent.webp' },
    sample: null,
    bestFor: ['Moda de autor', 'Streetwear premium', 'Marcas con campañas visuales'],
    status: 'ready',
    vars: {
      '--color-brand': '#1b1b19',
      '--color-brand-dark': '#000000',
      '--color-brand-fg': '#ffffff',
      '--font-display': SYSTEM_SANS,
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.045em',
      '--weight-display': '700',
      '--radius-btn': '0rem',
      '--radius-card': '0rem',
      '--border-width': '0px',
      '--surface-product': '#f7f7f6',
      '--surface-sunken': '#efefed',
      '--space-density': '0.8',
      '--grid-gap': '1rem',
    },
    layout: {
      gridCols: 5, gridStyle: 'uniform', nav: 'immersive', hero: 'fullbleed',
      card: 'plain', filters: 'chips', density: 'compact',
      annotations: true, darkFooter: true,
    },
  },
  {
    id: 'sillage',
    label: 'Sillage',
    hint: 'Galería olfativa: mucho aire, producto preciso y campaña sensorial.',
    reference: { name: 'Curated perfumery showroom', file: '15-sillage.webp' },
    sample: null,
    bestFor: ['Perfumería y cosmética', 'Retail selecto', 'Marcas de autor'],
    status: 'ready',
    vars: {
      '--color-brand': '#2f302c',
      '--color-brand-dark': '#141512',
      '--color-brand-fg': '#ffffff',
      '--font-display': SYSTEM_SANS,
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.055em',
      '--weight-display': '500',
      '--radius-btn': '0.25rem',
      '--radius-card': '1.1rem',
      '--border-width': '0px',
      '--surface-product': '#f0f1ec',
      '--surface-sunken': '#f5f6f1',
      '--space-density': '1.25',
      '--grid-gap': '0.65rem',
    },
    layout: {
      gridCols: 4, gridStyle: 'uniform', nav: 'top', hero: 'card',
      card: 'plain', filters: 'dropdown', density: 'airy',
      annotations: false, darkFooter: false,
    },
  },
  {
    id: 'summit',
    label: 'SUMMIT',
    hint: 'Lujo alpino: campaña inmersiva, precisión técnica y mosaico editorial.',
    reference: { name: 'Luxury alpine expedition study', file: '16-summit.webp' },
    sample: null,
    bestFor: ['Moda técnica', 'Deporte y montaña', 'Marcas premium de equipamiento'],
    status: 'ready',
    vars: {
      '--color-brand': '#8b4e2e',
      '--color-brand-dark': '#63341f',
      '--color-brand-fg': '#ffffff',
      '--font-display': "Georgia, 'Times New Roman', serif",
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.055em',
      '--weight-display': '400',
      '--radius-btn': '0rem',
      '--radius-card': '0rem',
      '--border-width': '1px',
      '--surface-product': '#f5f5f3',
      '--surface-sunken': '#ececea',
      '--space-density': '0.75',
      '--grid-gap': '1px',
    },
    layout: {
      gridCols: 3, gridStyle: 'irregular', nav: 'immersive', hero: 'fullbleed',
      card: 'divided', filters: 'dropdown', density: 'compact',
      annotations: false, darkFooter: true,
    },
  },
  {
    id: 'litica',
    label: 'LÍTICA',
    hint: 'Cosmética mineral: retícula editorial, materia táctil y precisión apotecaria.',
    reference: { name: 'Mineral skincare editorial study', file: '17-litica.webp' },
    sample: null,
    bestFor: ['Cosmética y skincare', 'Bienestar', 'Marcas naturales de autor'],
    status: 'ready',
    vars: {
      '--color-brand': '#9a3f1f',
      '--color-brand-dark': '#6d2a16',
      '--color-brand-fg': '#ffffff',
      '--font-display': SYSTEM_SANS,
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.06em',
      '--weight-display': '500',
      '--radius-btn': '0rem',
      '--radius-card': '0rem',
      '--border-width': '1px',
      '--surface-product': '#efede5',
      '--surface-sunken': '#e9e7df',
      '--space-density': '0.75',
      '--grid-gap': '1px',
    },
    layout: {
      gridCols: 3, gridStyle: 'irregular', nav: 'top', hero: 'split',
      card: 'divided', filters: 'dropdown', density: 'compact',
      annotations: false, darkFooter: false,
    },
  },
  {
    id: 'nera',
    label: 'NERA',
    hint: 'Sastrería editorial, blanco absoluto y mosaico de campaña.',
    reference: { name: 'Tailored womenswear editorial study', file: '18-nera.webp' },
    sample: null,
    bestFor: ['Moda de autor', 'Sastrería femenina', 'Marcas de colección corta'],
    status: 'ready',
    vars: {
      '--color-brand': '#55788a',
      '--color-brand-dark': '#385765',
      '--color-brand-fg': '#ffffff',
      '--font-display': "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif",
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.045em',
      '--weight-display': '500',
      '--radius-btn': '0rem',
      '--radius-card': '0rem',
      '--border-width': '1px',
      '--surface-product': '#f7f7f5',
      '--surface-sunken': '#efefec',
      '--space-density': '0.75',
      '--grid-gap': '1px',
    },
    layout: {
      gridCols: 4, gridStyle: 'uniform', nav: 'top', hero: 'fullbleed',
      card: 'divided', filters: 'dropdown', density: 'compact',
      annotations: false, darkFooter: false,
    },
  },
  {
    id: 'viso',
    label: 'VISO',
    hint: 'Óptica futurista: campaña cinética, blanco técnico y retícula asimétrica.',
    reference: { name: 'Futurist optical editorial study', file: '19-viso.webp' },
    sample: null,
    bestFor: ['Óptica y eyewear', 'Moda tecnológica', 'Accesorios premium'],
    status: 'ready',
    vars: {
      '--color-brand': '#9b4520',
      '--color-brand-dark': '#733016',
      '--color-brand-fg': '#ffffff',
      '--font-display': SYSTEM_SANS,
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.07em',
      '--weight-display': '700',
      '--radius-btn': '0rem',
      '--radius-card': '0rem',
      '--border-width': '1px',
      '--surface-product': '#e9eceb',
      '--surface-sunken': '#f1f0eb',
      '--space-density': '0.75',
      '--grid-gap': '0.35rem',
    },
    layout: {
      gridCols: 4, gridStyle: 'irregular', nav: 'top', hero: 'split',
      card: 'plain', filters: 'dropdown', density: 'compact',
      annotations: false, darkFooter: false,
    },
  },
  {
    id: 'orbe',
    label: 'ORBE',
    hint: 'Skincare inclusivo: marfil clínico, vidrio ámbar y campaña de piel real.',
    reference: { name: 'Inclusive skincare editorial study', file: '20-orbe.webp' },
    sample: null,
    bestFor: ['Cosmética y skincare', 'Bienestar premium', 'Marcas inclusivas'],
    status: 'ready',
    vars: {
      '--color-brand': '#465344',
      '--color-brand-dark': '#303c30',
      '--color-brand-fg': '#ffffff',
      '--font-display': "Georgia, 'Times New Roman', serif",
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.055em',
      '--weight-display': '700',
      '--radius-btn': '0rem',
      '--radius-card': '0rem',
      '--border-width': '1px',
      '--surface-product': '#eee8de',
      '--surface-sunken': '#dce1d7',
      '--space-density': '0.8',
      '--grid-gap': '1px',
    },
    layout: {
      gridCols: 4, gridStyle: 'uniform', nav: 'top', hero: 'split',
      card: 'divided', filters: 'dropdown', density: 'compact',
      annotations: false, darkFooter: false,
    },
  },
  {
    id: 'alva',
    label: 'ALVA',
    hint: 'Marroquinería escandinava: marfil sereno, piel táctil y retícula de atelier.',
    reference: { name: 'Scandinavian leather goods editorial study', file: '21-alva.webp' },
    sample: null,
    bestFor: ['Marroquinería', 'Calzado de autor', 'Accesorios premium'],
    status: 'ready',
    vars: {
      '--color-brand': '#282522',
      '--color-brand-dark': '#11100f',
      '--color-brand-fg': '#ffffff',
      '--font-display': "Georgia, 'Times New Roman', serif",
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.065em',
      '--weight-display': '500',
      '--radius-btn': '0rem',
      '--radius-card': '0rem',
      '--border-width': '1px',
      '--surface-product': '#f5f4f1',
      '--surface-sunken': '#e9e3dc',
      '--space-density': '0.75',
      '--grid-gap': '1px',
    },
    layout: {
      gridCols: 4, gridStyle: 'uniform', nav: 'top', hero: 'split',
      card: 'divided', filters: 'dropdown', density: 'compact',
      annotations: false, darkFooter: false,
    },
  },
  {
    id: 'brio',
    label: 'BRÍO',
    hint: 'Bienestar urbano: hoja marfil, envases eléctricos y retícula editorial con humor.',
    reference: { name: 'Urban botanical patches editorial study', file: '22-brio.webp' },
    sample: null,
    bestFor: ['Bienestar y autocuidado', 'Cosmética funcional', 'Marcas DTC'],
    status: 'ready',
    vars: {
      '--color-brand': '#c9e66d',
      '--color-brand-dark': '#a9c84e',
      '--color-brand-fg': '#11140d',
      '--font-display': "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.055em',
      '--weight-display': '700',
      '--radius-btn': '9999px',
      '--radius-card': '1rem',
      '--border-width': '1px',
      '--surface-product': '#f2f3eb',
      '--surface-sunken': '#d6d7d1',
      '--space-density': '0.9',
      '--grid-gap': '0.8rem',
    },
    layout: {
      gridCols: 3, gridStyle: 'irregular', nav: 'top', hero: 'split',
      card: 'hairline', filters: 'dropdown', density: 'regular',
      annotations: false, darkFooter: false,
    },
  },
  {
    id: 'bruma',
    label: 'BRUMA',
    hint: 'Catálogo de lujo silencioso: tipografía, aire y producto sin ruido.',
    reference: { name: 'Referencia de catálogo editorial de café', file: '23-bruma.webp' },
    sample: null,
    bestFor: ['Café de especialidad', 'Alimentación premium', 'Marcas de autor'],
    status: 'ready',
    vars: {
      '--color-brand': '#272725',
      '--color-brand-dark': '#111110',
      '--color-brand-fg': '#ffffff',
      '--font-display': "Georgia, 'Times New Roman', serif",
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.045em',
      '--weight-display': '400',
      '--radius-btn': '0',
      '--radius-card': '0',
      '--border-width': '1px',
      '--surface-product': '#f2f1ed',
      '--surface-sunken': '#e8e7e2',
      '--space-density': '1',
      '--grid-gap': '0.55rem',
    },
    layout: {
      gridCols: 4, gridStyle: 'uniform', nav: 'top', hero: 'none',
      card: 'plain', filters: 'dropdown', density: 'airy',
      annotations: false, darkFooter: false,
    },
  },
  {
    id: 'traza',
    label: 'TRAZA',
    hint: 'Portfolio habitable: una retícula arquitectónica que convierte cada objeto en proyecto.',
    reference: { name: 'Referencia de portfolio de arquitectura', file: '24-traza.webp' },
    sample: null,
    bestFor: ['Interiorismo', 'Mobiliario de autor', 'Objetos para el hogar'],
    status: 'ready',
    vars: {
      '--color-brand': '#242321',
      '--color-brand-dark': '#10100f',
      '--color-brand-fg': '#ffffff',
      '--font-display': "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif",
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.055em',
      '--weight-display': '400',
      '--radius-btn': '0',
      '--radius-card': '0',
      '--border-width': '1px',
      '--surface-product': '#e4e2de',
      '--surface-sunken': '#d8d6d2',
      '--space-density': '1',
      '--grid-gap': '0.75rem',
    },
    layout: {
      gridCols: 3, gridStyle: 'irregular', nav: 'immersive', hero: 'fullbleed',
      card: 'plain', filters: 'dropdown', density: 'airy',
      annotations: true, darkFooter: false,
    },
  },
  {
    id: 'dintel',
    label: 'DINTEL',
    hint: 'Tipografía monumental y retícula escultórica para objeto, interiorismo y mobiliario de autor.',
    reference: { name: 'Referencia de mobiliario monolítico', file: '25-dintel.webp' },
    sample: null,
    bestFor: ['Interiorismo', 'Mobiliario de autor', 'Objeto escultórico'],
    status: 'ready',
    vars: {
      '--color-brand': '#171715',
      '--color-brand-dark': '#0e0e0d',
      '--color-brand-fg': '#f2f1ea',
      '--font-display': "Arial Black, Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.085em',
      '--weight-display': '900',
      '--radius-btn': '0.15rem',
      '--radius-card': '0',
      '--border-width': '1px',
      '--surface-product': '#e5e3dd',
      '--surface-sunken': '#0e0e0d',
      '--space-density': '0.85',
      '--grid-gap': 'clamp(1rem, 2.4vw, 2.5rem)',
    },
    layout: {
      gridCols: 3, gridStyle: 'irregular', nav: 'immersive', hero: 'fullbleed',
      card: 'plain', filters: 'dropdown', density: 'airy',
      annotations: true, darkFooter: true,
    },
  },
  {
    id: 'lumbre',
    label: 'LUMBRE',
    hint: 'Editorial cálido y silencioso para iluminación, cerámica y objeto de autor.',
    reference: { name: 'Referencia editorial de iluminación cerámica', file: '26-lumbre.webp' },
    sample: null,
    bestFor: ['Iluminación', 'Cerámica', 'Objeto de autor'],
    status: 'ready',
    vars: {
      '--color-brand': '#4b251b',
      '--color-brand-dark': '#321711',
      '--color-brand-fg': '#fffaf4',
      '--font-display': "Georgia, 'Times New Roman', serif",
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.035em',
      '--weight-display': '400',
      '--radius-btn': '0',
      '--radius-card': '0',
      '--border-width': '1px',
      '--surface-product': '#e7e2dc',
      '--surface-sunken': '#eee9e3',
      '--space-density': '0.9',
      '--grid-gap': 'clamp(0.65rem, 1.1vw, 1rem)',
    },
    layout: {
      gridCols: 4, gridStyle: 'uniform', nav: 'immersive', hero: 'fullbleed',
      card: 'hairline', filters: 'dropdown', density: 'airy',
      annotations: true, darkFooter: false,
    },
  },
  {
    id: 'mixta',
    label: 'MIXTA',
    hint: 'Editorial vivo para skincare, bienestar y catálogos que invitan a combinar.',
    reference: { name: 'Referencia editorial de skincare multimarcas', file: '27-mixta.webp' },
    sample: null,
    bestFor: ['Skincare y cosmética', 'Bienestar', 'Retail selecto'],
    status: 'ready',
    vars: {
      '--color-brand': '#c8ff65',
      '--color-brand-dark': '#b5eb4f',
      '--color-brand-fg': '#17200f',
      '--font-display': "Georgia, 'Times New Roman', serif",
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.045em',
      '--weight-display': '400',
      '--radius-btn': '9999px',
      '--radius-card': '0',
      '--border-width': '1px',
      '--surface-product': '#f1eee6',
      '--surface-sunken': '#f5f0e6',
      '--space-density': '0.9',
      '--grid-gap': '0px',
    },
    layout: {
      gridCols: 4, gridStyle: 'uniform', nav: 'immersive', hero: 'fullbleed',
      card: 'divided', filters: 'dropdown', density: 'regular',
      annotations: false, darkFooter: false,
    },
  },
  {
    id: 'monte',
    label: 'MONTE',
    hint: 'Ficha editorial precisa para marroquinería, accesorios y producto de autor.',
    reference: { name: 'Referencia editorial de marroquinería MONTE', file: '29-monte.webp' },
    sample: null,
    bestFor: ['Marroquinería', 'Accesorios', 'Producto de autor'],
    status: 'ready',
    vars: {
      '--color-brand': '#181714',
      '--color-brand-dark': '#050505',
      '--color-brand-fg': '#f6f0e6',
      '--font-display': SYSTEM_SANS,
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.055em',
      '--weight-display': '400',
      '--radius-btn': '0',
      '--radius-card': '0',
      '--border-width': '1px',
      '--surface-product': '#e4e1dc',
      '--surface-sunken': '#f4eee4',
      '--space-density': '0.85',
      '--grid-gap': '1px',
    },
    layout: {
      gridCols: 3, gridStyle: 'irregular', nav: 'top', hero: 'fullbleed',
      card: 'hairline', filters: 'dropdown', density: 'airy',
      annotations: true, darkFooter: false,
    },
  },
  {
    id: 'sarga',
    label: 'SARGA',
    hint: 'Sastrería editorial: campaña en blanco, producto aislado y mosaico preciso.',
    reference: { name: 'Contemporary tailoring editorial study', file: '18-sarga.webp' },
    sample: null,
    bestFor: ['Moda contemporánea', 'Sastrería de autor', 'Marcas de colección corta'],
    status: 'ready',
    vars: {
      '--color-brand': '#20201f',
      '--color-brand-dark': '#050505',
      '--color-brand-fg': '#ffffff',
      '--font-display': SYSTEM_SANS,
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.055em',
      '--weight-display': '500',
      '--radius-btn': '0rem',
      '--radius-card': '0rem',
      '--border-width': '1px',
      '--surface-product': '#f7f6f2',
      '--surface-sunken': '#efefeb',
      '--space-density': '0.75',
      '--grid-gap': '1px',
    },
    layout: {
      gridCols: 4, gridStyle: 'irregular', nav: 'immersive', hero: 'fullbleed',
      card: 'divided', filters: 'dropdown', density: 'compact',
      annotations: false, darkFooter: false,
    },
  },
  {
    id: 'ensamble',
    label: 'ENSAMBLE',
    hint: 'Archivo editorial de mobiliario para estudios, diseñadores y objetos en serie corta.',
    reference: { name: 'Referencia editorial de estudio de mobiliario', file: '30-ensamble.webp' },
    sample: null,
    bestFor: ['Mobiliario de autor', 'Estudios de diseño', 'Interiorismo'],
    status: 'ready',
    vars: {
      '--color-brand': '#2d211c',
      '--color-brand-dark': '#17110e',
      '--color-brand-fg': '#f8f4ed',
      '--font-display': "Georgia, 'Times New Roman', serif",
      '--font-accent': MONO,
      '--tracking-display': '-0.045em',
      '--weight-display': '400',
      '--radius-btn': '0',
      '--radius-card': '0',
      '--border-width': '1px',
      '--surface-product': '#e8e2d7',
      '--surface-sunken': '#f5f2ec',
      '--space-density': '0.85',
      '--grid-gap': 'clamp(0.75rem, 1.35vw, 1.4rem)',
    },
    layout: {
      gridCols: 3, gridStyle: 'irregular', nav: 'top', hero: 'none',
      card: 'hairline', filters: 'dropdown', density: 'airy',
      annotations: true, darkFooter: false,
    },
  },
  {
    id: 'eje',
    label: 'EJE',
    hint: 'Estudio contemporáneo para mobiliario, espacios colectivos y producto de diseño.',
    reference: { name: 'Referencia de estudio de mobiliario colaborativo', file: '31-eje.webp' },
    sample: null,
    bestFor: ['Mobiliario contract', 'Estudios de producto', 'Espacios colectivos'],
    status: 'ready',
    vars: {
      '--color-brand': '#252423',
      '--color-brand-dark': '#0e0e0d',
      '--color-brand-fg': '#f8f7f5',
      '--font-display': SYSTEM_SANS,
      '--font-accent': SYSTEM_SANS,
      '--tracking-display': '-0.055em',
      '--weight-display': '400',
      '--radius-btn': '0',
      '--radius-card': '0',
      '--border-width': '1px',
      '--surface-product': '#f0eef2',
      '--surface-sunken': '#f5f4f2',
      '--space-density': '0.85',
      '--grid-gap': 'clamp(0.5rem, 1vw, 1rem)',
    },
    layout: {
      gridCols: 3, gridStyle: 'uniform', nav: 'top', hero: 'fullbleed',
      card: 'hairline', filters: 'dropdown', density: 'airy',
      annotations: true, darkFooter: false,
    },
  },
  // new-theme:themes — no borrar: `pnpm new:theme <id>` añade aquí el tema si falta.
];

export const defaultTheme = demoThemes[0]!;

/** Temas ya desarrollados (los que /temas enseña como listos). */
export const readyThemes = demoThemes.filter((t) => t.status === 'ready');

export function getTheme(id: string): DemoTheme | undefined {
  return demoThemes.find((t) => t.id === id);
}

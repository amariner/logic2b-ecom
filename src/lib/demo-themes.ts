/**
 * Temas de la demo — presets cerrados de marca (color + tipografía de titulares
 * + radio de botones) que el visitante puede alternar desde el widget de la tienda.
 *
 * Es una pieza de venta, no una feature de tienda: demuestra en vivo que toda la
 * identidad visual del kit sale de un puñado de tokens (`shop.config.ts` +
 * `global.css`). En un proyecto real no existe el selector: el cliente tiene UN
 * tema, el suyo.
 *
 * Los presets se aplican sobreescribiendo variables CSS en `:root`; la lista de
 * variables permitidas está cerrada (THEME_VARS) para que nada más sea tocable.
 */

export const DEMO_THEME_KEY = 'ecom-demo-theme';

export const THEME_VARS = [
  '--color-brand',
  '--color-brand-dark',
  '--font-display',
  '--radius-btn',
] as const;

export type ThemeVar = (typeof THEME_VARS)[number];
export type DemoThemeVars = Record<ThemeVar, string>;

export type DemoTheme = {
  id: string;
  label: string;
  /** Una línea que vende el preset («así se vería tu tienda…») */
  hint: string;
  vars: DemoThemeVars;
};

const SYSTEM_SANS =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const demoThemes: DemoTheme[] = [
  {
    id: 'botiga',
    label: 'La Botiga',
    hint: 'Verde profundo, sans del sistema, botones pill',
    vars: {
      '--color-brand': '#008060',
      '--color-brand-dark': '#004c3f',
      '--font-display': SYSTEM_SANS,
      '--radius-btn': '9999px',
    },
  },
  {
    id: 'celler',
    label: 'El Celler',
    hint: 'Burdeos, serif editorial, esquinas suaves',
    vars: {
      '--color-brand': '#7c2340',
      '--color-brand-dark': '#571830',
      '--font-display': "'Fraunces', Georgia, 'Times New Roman', serif",
      '--radius-btn': '0.75rem',
    },
  },
  {
    id: 'atlantic',
    label: 'Atlàntic',
    hint: 'Azul intenso, grotesca geométrica, esquinas rectas',
    vars: {
      '--color-brand': '#1d4ed8',
      '--color-brand-dark': '#1e3a8a',
      '--font-display': "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
      '--radius-btn': '0.375rem',
    },
  },
  {
    id: 'terra',
    label: 'Terra',
    hint: 'Terracota cálido, serif editorial, botones pill',
    vars: {
      '--color-brand': '#9a3412',
      '--color-brand-dark': '#7c2d12',
      '--font-display': "'Fraunces', Georgia, 'Times New Roman', serif",
      '--radius-btn': '9999px',
    },
  },
];

export const defaultTheme = demoThemes[0]!;

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

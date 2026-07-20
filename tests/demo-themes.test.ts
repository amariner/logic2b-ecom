import { describe, expect, it } from 'vitest';
import { THEME_VARS, defaultTheme, demoThemes, getTheme, readyThemes } from '../src/lib/demo-themes';
import { shopConfig } from '../shop.config';

/** Luminancia relativa WCAG de un color #rrggbb. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Ratio de contraste WCAG entre dos colores #rrggbb. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('catálogo de estilos', () => {
  it('los ids son únicos y el tema por defecto es el primero', () => {
    const ids = demoThemes.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(defaultTheme.id).toBe(ids[0]);
  });

  it('cada tema define todas las variables permitidas y ninguna más', () => {
    for (const theme of demoThemes) {
      expect(Object.keys(theme.vars).sort(), theme.id).toEqual([...THEME_VARS].sort());
    }
  });

  it('el tema por defecto es la marca de shop.config.ts', () => {
    expect(defaultTheme.vars['--color-brand']).toBe(shopConfig.brand.color);
    expect(defaultTheme.vars['--color-brand-dark']).toBe(shopConfig.brand.colorDark);
  });

  it('el texto sobre el acento cumple contraste AA (≥ 4.5) en todos los temas', () => {
    // Ya no se asume blanco: cada tema declara su propio --color-brand-fg.
    // El tema Guide (amarillo) lo pone en tinta precisamente por esto.
    for (const theme of demoThemes) {
      const fg = theme.vars['--color-brand-fg'];
      expect(contrast(theme.vars['--color-brand'], fg), `${theme.id} / brand`).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(theme.vars['--color-brand-dark'], fg),
        `${theme.id} / brand-dark`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('cada tema no-base declara la referencia visual de la que sale', () => {
    for (const theme of demoThemes.filter((t) => t.id !== defaultTheme.id)) {
      expect(theme.reference, theme.id).not.toBeNull();
      // El fichero de referencia se resuelve en public/images/referencias/.
      expect(theme.reference?.file, theme.id).toMatch(/^\d{2}-[a-z]+\.webp$/);
    }
  });

  it('cada tema declara para quién es (argumento de venta del catálogo)', () => {
    for (const theme of demoThemes) {
      expect(theme.bestFor.length, theme.id).toBeGreaterThan(0);
    }
  });

  it('readyThemes solo contiene temas desarrollados y el base está listo', () => {
    expect(readyThemes.every((t) => t.status === 'ready')).toBe(true);
    expect(readyThemes.map((t) => t.id)).toContain(defaultTheme.id);
  });

  it('getTheme resuelve por id y devuelve undefined si no existe', () => {
    expect(getTheme('minimal')?.label).toBe('Minimal');
    expect(getTheme('no-existe')).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { THEME_VARS, defaultTheme, demoThemes } from '../src/lib/demo-themes';
import { shopConfig } from '../shop.config';

/** Luminancia relativa WCAG de un color #rrggbb. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

describe('temas de la demo', () => {
  it('los ids son únicos y el tema por defecto es el primero', () => {
    const ids = demoThemes.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(defaultTheme.id).toBe(ids[0]);
  });

  it('cada tema define todas las variables permitidas y ninguna más', () => {
    for (const theme of demoThemes) {
      expect(Object.keys(theme.vars).sort()).toEqual([...THEME_VARS].sort());
    }
  });

  it('el tema por defecto es la marca de shop.config.ts', () => {
    // El preset "limpia" los overrides y debe ser indistinguible de la marca real,
    // que ahora sale de una única fuente (shop.config.ts, inyectada por Base.astro).
    expect(defaultTheme.vars['--color-brand']).toBe(shopConfig.brand.color);
    expect(defaultTheme.vars['--color-brand-dark']).toBe(shopConfig.brand.colorDark);
    expect(defaultTheme.vars['--radius-btn']).toBe('9999px');
  });

  it('el blanco sobre el color de marca cumple contraste AA (≥ 4.5)', () => {
    for (const theme of demoThemes) {
      expect(contrastWithWhite(theme.vars['--color-brand']), theme.id).toBeGreaterThanOrEqual(4.5);
      expect(contrastWithWhite(theme.vars['--color-brand-dark']), theme.id).toBeGreaterThanOrEqual(4.5);
    }
  });
});

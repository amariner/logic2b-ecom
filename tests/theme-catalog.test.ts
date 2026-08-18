import { describe, expect, it } from 'vitest';
import { defaultTheme, demoThemes } from '../src/lib/demo-themes';
import {
  THEME_FILTERS,
  newestThemesFirst,
  normalizeThemeSearch,
  themeCategoryIds,
  themeSearchText,
} from '../src/lib/theme-catalog';

const themes = demoThemes.filter((theme) => theme.id !== defaultTheme.id);

describe('catálogo navegable de temas', () => {
  it('enseña las altas más recientes primero sin mutar el registro', () => {
    const registrationOrder = ['editorial', 'argent', 'sillage', 'summit', 'litica'] as const;

    expect(newestThemesFirst(registrationOrder)).toEqual(['litica', 'summit', 'sillage', 'argent', 'editorial']);
    expect(registrationOrder).toEqual(['editorial', 'argent', 'sillage', 'summit', 'litica']);
    expect(newestThemesFirst(themes).map((theme) => theme.id).slice(0, 3)).toEqual([
      'ensamble',
      'sarga',
      'monte',
    ]);
  });

  it('asigna al menos un filtro visible a cada tema público', () => {
    for (const theme of themes) expect(themeCategoryIds(theme), theme.id).not.toHaveLength(0);
  });

  it('solo usa categorías declaradas en el filtro horizontal', () => {
    const known = new Set(THEME_FILTERS.map((filter) => filter.id));
    for (const theme of themes) {
      for (const category of themeCategoryIds(theme)) expect(known.has(category), `${theme.id}: ${category}`).toBe(true);
    }
  });

  it('normaliza acentos y permite buscar por sector o referencia', () => {
    expect(normalizeThemeSearch('  Óptica y CERÁMICA  ')).toBe('optica y ceramica');
    const forma = themes.find((theme) => theme.id === 'forma')!;
    expect(themeSearchText(forma)).toContain('opticas independientes');
    expect(themeSearchText(forma)).toContain(normalizeThemeSearch(forma.reference!.name));
  });
});

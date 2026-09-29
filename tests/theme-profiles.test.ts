import { describe, expect, it } from 'vitest';
import { defaultTheme, demoThemes } from '../src/lib/demo-themes';
import { themeCategoryIds } from '../src/lib/theme-catalog';
import {
  CATALOG_THEMES,
  THEME_PROFILES,
  adjacentThemes,
  relatedThemes,
  themeDisplayName,
  themePagePath,
  themePageTitle,
  themeProfile,
} from '../src/lib/theme-profiles';
import { buttonShapeLabel, displayFontLabel } from '../src/lib/theme-labels';

const publicIds = demoThemes.filter((theme) => theme.id !== defaultTheme.id).map((theme) => theme.id);

/**
 * Cada tema público tiene su ficha indexable en `/temas/<id>`. Un tema sin
 * perfil rompería `getStaticPaths` con una página a medias; un perfil sin tema
 * sería copy muerto que nadie revisa.
 */
describe('fichas comerciales de temas', () => {
  it('cada tema público tiene perfil y no hay perfiles huérfanos', () => {
    expect(publicIds.filter((id) => !themeProfile(id))).toEqual([]);
    expect(Object.keys(THEME_PROFILES).filter((id) => !publicIds.includes(id))).toEqual([]);
    expect(themeProfile(defaultTheme.id)).toBeNull();
  });

  it('los resúmenes son únicos, no vacíos y caben en una meta description', () => {
    const summaries = Object.values(THEME_PROFILES).map((profile) => profile.summary.trim());
    expect(summaries.every((summary) => summary.length > 0)).toBe(true);
    expect(new Set(summaries).size).toBe(summaries.length);
    const tooLong = Object.entries(THEME_PROFILES)
      .filter(([, profile]) => profile.summary.length > 160)
      .map(([id, profile]) => `${id} (${profile.summary.length})`);
    expect(tooLong, 'resúmenes > 160 caracteres').toEqual([]);
  });

  it('cada perfil trae entre 3 y 4 puntos concretos y sin repetir', () => {
    for (const [id, profile] of Object.entries(THEME_PROFILES)) {
      expect(profile.highlights.length, id).toBeGreaterThanOrEqual(3);
      expect(profile.highlights.length, id).toBeLessThanOrEqual(4);
      expect(new Set(profile.highlights).size, id).toBe(profile.highlights.length);
      for (const highlight of profile.highlights) expect(highlight.trim(), id).not.toBe('');
    }
  });

  it('el copy no presenta el servicio como plantilla ni usa jerga técnica', () => {
    const copy = Object.values(THEME_PROFILES)
      .flatMap((profile) => [profile.summary, ...profile.highlights])
      .join(' ')
      .toLowerCase();
    for (const word of ['plantilla', 'webhook', 'ssr', 'api', 'd1', 'saas']) {
      expect(copy, word).not.toMatch(new RegExp(`\\b${word}\\b`));
    }
  });
});

describe('navegación entre fichas', () => {
  it('sigue el orden de /temas y excluye el tema Base', () => {
    expect(CATALOG_THEMES.map((theme) => theme.id)).toEqual([...publicIds].reverse());
    expect(CATALOG_THEMES.some((theme) => theme.id === defaultTheme.id)).toBe(false);
  });

  it('anterior y siguiente son circulares', () => {
    const first = CATALOG_THEMES[0]!;
    const last = CATALOG_THEMES.at(-1)!;
    expect(adjacentThemes(first.id)?.previous.id).toBe(last.id);
    expect(adjacentThemes(last.id)?.next.id).toBe(first.id);
    expect(adjacentThemes('no-existe')).toBeNull();
  });

  it('relacionados: tres distintos, sin el propio tema y primero los del mismo sector', () => {
    for (const theme of CATALOG_THEMES) {
      const related = relatedThemes(theme.id);
      expect(related, theme.id).toHaveLength(3);
      expect(new Set(related.map((item) => item.id)).size).toBe(3);
      expect(related.some((item) => item.id === theme.id)).toBe(false);
      const { previous, next } = adjacentThemes(theme.id)!;
      expect(related.some((item) => item.id === previous.id || item.id === next.id), theme.id).toBe(false);
      const sectors = themeCategoryIds(theme);
      const shares = related.map((item) => themeCategoryIds(item).some((sector) => sectors.includes(sector)));
      // Nunca un tema de otro sector delante de uno del mismo sector.
      expect(shares.indexOf(false) === -1 || !shares.slice(shares.indexOf(false)).includes(true), theme.id).toBe(true);
    }
  });
});

describe('metadatos de la ficha', () => {
  it('títulos únicos de 60 caracteres como máximo y rutas estables', () => {
    const titles = CATALOG_THEMES.map((theme) => themePageTitle(theme));
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.filter((title) => title.length > 60)).toEqual([]);
    expect(themePagePath('arce')).toBe('/temas/arce');
  });

  it('no repite «Tema» en el nombre visible', () => {
    expect(themeDisplayName({ label: 'Tema Noddo' })).toBe('Noddo');
    expect(themeDisplayName({ label: 'ARGENT.' })).toBe('ARGENT.');
  });

  it('traduce tipografía y forma de botón a lenguaje de comercio', () => {
    const byId = (id: string) => demoThemes.find((theme) => theme.id === id)!;
    expect(displayFontLabel(byId('arce'))).toBe('Fraunces · con serifa');
    expect(displayFontLabel(byId('editorial'))).toBe('Sans del sistema');
    expect(displayFontLabel(byId('iris'))).toBe('Sans del sistema');
    expect(displayFontLabel(byId('dintel'))).toBe('Arial Black · extranegrita');
    expect(buttonShapeLabel(byId('arce'))).toBe('Rectos');
    expect(buttonShapeLabel(byId('guide'))).toBe('Redondeados');
    expect(buttonShapeLabel(byId('editorial'))).toBe('Esquina suave');
    for (const theme of CATALOG_THEMES) expect(displayFontLabel(theme), theme.id).not.toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { buildThemeBaseline, renderThemeBaselineMarkdown } from '../scripts/theme-baseline.mjs';

describe('línea base reproducible de temas', () => {
  const report = buildThemeBaseline();

  it('cubre exactamente los temas no-base del registro', () => {
    expect(report.scope.themes).toBe(33);
    expect(report.scope.ids).not.toContain('base');
    expect(report.themes.map((theme) => theme.id)).toEqual(report.scope.ids);
  });

  it('compara todas las fuentes explícitas de deriva', () => {
    expect(Object.keys(report.registries)).toEqual([
      'themes',
      'collections',
      'seeds',
      'catalogViews',
      'a11y',
      'captureCatalog',
      'captureProduct',
      'homeGallery',
      'docs',
      'components',
    ]);
    expect(report.registries.collections.missing).toEqual([]);
    expect(report.registries.seeds.missing).toEqual([]);
  });

  it('hace visibles las tres excepciones comerciales heredadas', () => {
    const privateThemes = report.themes
      .filter((theme) => !theme.routes.sharedContract || theme.storage.privateKeys.length > 0)
      .map((theme) => theme.id)
      .toSorted();
    expect(privateThemes).toEqual(['noddo', 'sitega', 'stretch']);
    expect(report.findings.find((finding) => finding.id === 'TH0.2-P1-02')?.themes).toEqual(privateThemes);
  });

  it('produce un informe determinista con severidades y leyendas', () => {
    const second = buildThemeBaseline();
    expect(second).toEqual(report);
    const markdown = renderThemeBaselineMarkdown(report);
    expect(markdown).toContain('# Línea base automática de los 33 temas');
    expect(markdown).toContain('## Hallazgos P0–P3');
    expect(markdown).toContain('## Divergencias entre registros');
  });
});

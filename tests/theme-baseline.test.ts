import { describe, expect, it } from 'vitest';
import {
  buildThemeBaseline,
  renderThemeBaselineMarkdown,
  themeIntegrityErrors,
} from '../scripts/theme-baseline.mjs';

describe('línea base reproducible de temas', () => {
  const report = buildThemeBaseline();

  it('cubre exactamente los temas no-base del registro', () => {
    expect(report.scope.themes).toBe(report.scope.ids.length);
    expect(report.scope.themes).toBeGreaterThanOrEqual(33);
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

  it('bloquea toda deriva de registros, evidencias y assets con mensajes útiles', () => {
    expect(themeIntegrityErrors(report)).toEqual([]);

    const drifted = structuredClone(report);
    drifted.registries.homeGallery.missing = ['sillage'];
    drifted.themes.find((theme) => theme.id === 'argent')!.evidence.captures.product = false;
    drifted.themes.find((theme) => theme.id === 'arce')!.catalog.missingAssets = ['/images/collections/arce/fantasma.webp'];

    const errors = themeIntegrityErrors(drifted);
    expect(errors).toHaveLength(3);
    expect(errors).toEqual(expect.arrayContaining([
      'registro homeGallery — faltan: sillage',
      'assets arce — faltan: /images/collections/arce/fantasma.webp',
      'capturas argent — faltan: product',
    ]));
  });

  it('mantiene los 33 temas sobre el mismo contrato comercial', () => {
    const privateThemes = report.themes
      .filter((theme) => !theme.routes.sharedContract || theme.storage.privateKeys.length > 0)
      .map((theme) => theme.id)
      .toSorted();
    expect(privateThemes).toEqual([]);
    expect(report.findings.find((finding) => finding.id === 'TH0.2-P1-02')).toBeUndefined();
    expect(report.findings.find((finding) => finding.id === 'TH0.2-P1-03')).toBeUndefined();
  });

  it('propaga canonical común y el recuento editorial del registro', () => {
    expect(report.themes.every((theme) => theme.metadata.canonical)).toBe(true);
    expect(report.findings.find((finding) => finding.id === 'TH0.2-P2-01')).toBeUndefined();
    expect(report.findings.find((finding) => finding.id === 'TH0.2-P3-02')).toBeUndefined();
  });

  it('produce un informe determinista con severidades y leyendas', () => {
    const second = buildThemeBaseline();
    expect(second).toEqual(report);
    const markdown = renderThemeBaselineMarkdown(report);
    expect(markdown).toContain(`# Línea base automática de los ${report.scope.themes} temas`);
    expect(markdown).toContain('## Hallazgos P0–P3');
    expect(markdown).toContain('## Divergencias entre registros');
  });
});

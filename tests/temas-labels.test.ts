import { describe, expect, it } from 'vitest';
import temasSource from '../src/pages/temas.astro?raw';
import { demoThemes } from '../src/lib/demo-themes';
import { THEME_LAYOUT_LABELS } from '../src/lib/theme-labels';

const previewIds = new Set(
  Object.keys(import.meta.glob('../public/images/screens/theme-*-preview.mp4')).map((path) =>
    path.match(/theme-(.+)-preview\.mp4$/)?.[1],
  ),
);

/**
 * `/temas` y las fichas `/temas/<id>` traducen los valores de `layout` a
 * etiquetas legibles. Cuando se añadió `gridCols: 5` (tema Street) el mapa
 * literal de `temas.astro` se quedó corto y la fila «Rejilla» se renderizó
 * VACÍA — sin error, sin aviso.
 *
 * El mapa vive ahora en `src/lib/theme-labels.ts`, tipado por dimensión; este
 * test comprueba además en tiempo de ejecución que todo valor que algún tema
 * usa tiene traducción real, y que la página no vuelve a llevar su propio mapa.
 */
describe('etiquetas de /temas', () => {
  it('temas.astro usa el mapa compartido en vez de uno propio', () => {
    expect(temasSource).toContain("from '../lib/theme-labels'");
    expect(temasSource).not.toMatch(/const layoutLabels/);
  });

  it('cada valor de layout usado por un tema tiene etiqueta traducida', () => {
    const missing: string[] = [];
    const dimensions = ['gridCols', 'gridStyle', 'nav', 'hero', 'card', 'filters', 'density'] as const;
    for (const theme of demoThemes) {
      for (const dimension of dimensions) {
        const labels = THEME_LAYOUT_LABELS[dimension] as Readonly<Record<string, string>>;
        const value = String(theme.layout[dimension]);
        if (!labels[value]?.trim()) missing.push(`${theme.id} → ${dimension}: "${value}"`);
      }
    }
    expect(missing, `valores sin etiqueta: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('vídeos destacados de /temas', () => {
  it('cada tema visible tiene su recorrido en vídeo', () => {
    const missing = demoThemes
      .filter((theme) => theme.id !== 'base' && !previewIds.has(theme.id))
      .map((theme) => theme.id);
    expect(missing, `temas sin theme-<id>-preview.mp4: ${missing.join(', ')}`).toEqual([]);
  });
});

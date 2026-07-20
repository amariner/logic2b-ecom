import { describe, expect, it } from 'vitest';
import estilosSource from '../src/pages/estilos.astro?raw';
import { demoThemes } from '../src/lib/demo-themes';

/**
 * `/estilos` traduce los valores de `layout` a etiquetas legibles con un mapa
 * literal. Cuando se añadió `gridCols: 5` (tema Street) el mapa se quedó corto y
 * la fila «Rejilla» se renderizó VACÍA — sin error, sin aviso.
 *
 * El componente ahora cae al valor crudo, así que nunca queda en blanco; este
 * test va un paso más allá y exige que exista traducción de verdad para todo
 * valor que algún tema use.
 */
describe('etiquetas de /estilos', () => {
  // Solo el bloque `layoutLabels` — el fichero tiene más objetos literales.
  const block = estilosSource.match(/const layoutLabels[^=]*=\s*\{([\s\S]*?)\n\};/);
  const keys = new Set(
    [...(block?.[1] ?? '').matchAll(/'?([a-z0-9]+)'?:\s*'/gi)].map((m) => m[1]!),
  );

  it('el bloque layoutLabels se localiza en el fuente', () => {
    expect(block, 'no se encontró `const layoutLabels = {...}` en estilos.astro').not.toBeNull();
    expect(keys.size).toBeGreaterThan(5);
  });

  it('cada valor de layout usado por un tema tiene etiqueta traducida', () => {
    const missing: string[] = [];
    for (const theme of demoThemes) {
      for (const value of [
        String(theme.layout.gridCols),
        theme.layout.nav,
        theme.layout.density,
      ]) {
        if (!keys.has(value)) missing.push(`${theme.id} → "${value}"`);
      }
    }
    expect(missing, `valores sin etiqueta en estilos.astro: ${missing.join(', ')}`).toEqual([]);
  });
});

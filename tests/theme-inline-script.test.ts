import { describe, expect, it } from 'vitest';
// `?raw` de Vite: trae el fichero como texto sin necesitar `node:fs`
// (y por tanto sin @types/node, que no está en el proyecto).
import shopSource from '../src/layouts/Shop.astro?raw';
import { THEME_VARS } from '../src/lib/demo-themes';

/**
 * El script anti-flash de Shop.astro es `is:inline`: no puede importar de
 * demo-themes.ts, así que repite la lista de variables permitidas a mano.
 *
 * Esa duplicación es inevitable (hace falta que corra ANTES del primer pintado),
 * pero un desajuste silencioso sí es evitable: si alguien añade una variable a
 * THEME_VARS y olvida el script, los temas guardados se aplicarían a medias en
 * la primera carga. Este test lo convierte en un fallo ruidoso.
 */
describe('script anti-flash de temas', () => {
  it('la lista literal del inline script coincide exactamente con THEME_VARS', () => {
    const block = shopSource.match(/var allowed = \[([\s\S]*?)\];/);
    expect(block, 'no se encontró el array `allowed` en Shop.astro').not.toBeNull();

    const declared = [...block![1]!.matchAll(/'(--[a-z-]+)'/g)].map((m) => m[1]!);

    expect(declared.sort()).toEqual([...THEME_VARS].sort());
  });
});

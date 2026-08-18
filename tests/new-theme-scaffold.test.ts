/**
 * Guardia del scaffold de temas (`pnpm new:theme`, fase 9B.3).
 *
 * El script parchea los registros insertando sobre marcadores `new-theme:*`.
 * Si alguien los borra al refactorizar, el scaffold pasa de «idempotente» a
 * «roto con error confuso». Este test los fija, y fija también el cableado del
 * agregador de seeds por colección.
 */
import { describe, expect, it } from 'vitest';
import collectionsSrc from '../src/collections/index.ts?raw';
import themesSrc from '../src/lib/demo-themes.ts?raw';
import seedIndexSrc from '../seed/collections/index.ts?raw';
import seedSrc from '../seed/seed.ts?raw';
import scaffoldSrc from '../scripts/new-theme.mjs?raw';
import catalogSrc from '../src/components/store/CatalogPage.astro?raw';
import a11ySrc from '../scripts/a11y-audit.mjs?raw';
import captureSrc from '../scripts/capture-screens.mjs?raw';
import landingSrc from '../src/pages/index.astro?raw';

describe('marcadores del scaffold new:theme', () => {
  it('src/collections/index.ts conserva los marcadores de import y de entrada', () => {
    expect(collectionsSrc).toContain('// new-theme:imports');
    expect(collectionsSrc).toContain('// new-theme:entries');
  });

  it('seed/collections/index.ts conserva los marcadores del seed', () => {
    expect(seedIndexSrc).toContain('// new-theme:seed-imports');
    expect(seedIndexSrc).toContain('// new-theme:seed-entries');
  });

  it('src/lib/demo-themes.ts conserva el marcador de tema', () => {
    expect(themesSrc).toContain('// new-theme:themes');
  });

  it('conserva los marcadores de catálogo, QA, capturas y galería', () => {
    const contracts = [
      [catalogSrc, '// new-theme:catalog-imports'],
      [catalogSrc, '// new-theme:catalog-entries'],
      [a11ySrc, '// new-theme:a11y'],
      [captureSrc, '// new-theme:capture-catalog'],
      [captureSrc, '// new-theme:capture-product'],
      [landingSrc, '// new-theme:gallery'],
    ] as const;
    for (const [source, marker] of contracts) {
      expect(source, marker).toContain(marker);
      expect(scaffoldSrc, marker).toContain(marker);
    }
  });

  it('genera símbolos válidos también para ids kebab-case', () => {
    expect(scaffoldSrc).toContain("const symbol = id.replace(/-([a-z0-9])/g");
    expect(scaffoldSrc).toContain("'${id}': ${componentName}Catalog,");
  });

  it('seed/seed.ts consume el agregador de colecciones', () => {
    expect(seedSrc).toContain("from './collections/index.ts'");
    expect(seedSrc).toContain('collectionSeedProducts');
  });

  it('el guardarraíl del scaffold sigue vetando motor, API y migraciones', () => {
    // La lista ALLOWED es la frontera que el propio script se impone: si
    // desaparece, el scaffold podría escribir en la ruta de cobro.
    expect(scaffoldSrc).toContain('function assertAllowed');
    expect(scaffoldSrc).toContain('GUARDARRAÍL');
    for (const banned of ['src/pages/api/', 'migrations/']) {
      expect(scaffoldSrc.includes(`'${banned}`)).toBe(false);
    }
  });
});

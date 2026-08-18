// @ts-nocheck -- integración de un CLI Node en un proyecto tipado para Workers.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('scaffold new:theme aislado', () => {
  it('alinea todos los registros en una pasada y la segunda es idempotente', () => {
    const root = mkdtempSync(join(tmpdir(), 'logic2b-theme-scaffold-'));
    const script = fileURLToPath(new URL('../scripts/new-theme.mjs', import.meta.url));
    const files = {
      'src/collections/index.ts': '// new-theme:imports\nexport const collections = [\n  // new-theme:entries\n];\n',
      'seed/collections/index.ts': '// new-theme:seed-imports\nexport const collectionSeedProducts = [\n  // new-theme:seed-entries\n];\n',
      'src/lib/demo-themes.ts': 'export const demoThemes = [\n  // new-theme:themes\n];\n',
      'src/components/store/CatalogPage.astro': '// new-theme:catalog-imports\nconst catalogViews = {\n  // new-theme:catalog-entries\n};\n',
      'scripts/a11y-audit.mjs': 'const STORES = [\n  // new-theme:a11y\n];\n',
      'scripts/capture-screens.mjs': 'const STORES = [\n  // new-theme:capture-catalog\n];\nconst FICHAS = [\n  // new-theme:capture-product\n];\n',
      'src/pages/index.astro': 'const galleryOrder = [\n  // new-theme:gallery\n];\n',
    };

    try {
      for (const [path, content] of Object.entries(files)) {
        const absolute = join(root, path);
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, content);
      }
      const run = () => execFileSync(process.execPath, [script, 'atelier-home'], {
        env: { ...process.env, NEW_THEME_ROOT: root },
        encoding: 'utf8',
      });

      run();
      const tracked = [...Object.keys(files), 'src/collections/atelier-home.ts', 'seed/collections/atelier-home.ts'];
      const first = Object.fromEntries(tracked.map((path) => [path, readFileSync(join(root, path), 'utf8')]));
      const secondOutput = run();
      const second = Object.fromEntries(tracked.map((path) => [path, readFileSync(join(root, path), 'utf8')]));

      expect(second).toEqual(first);
      expect(secondOutput).not.toContain('  parcheado:');
      expect(first['src/collections/atelier-home.ts']).toContain('export const atelierHomeCollection');
      expect(first['src/components/store/CatalogPage.astro']).toContain("import AtelierHomeCatalog from '../themes/atelier-home/Catalog.astro';");
      expect(first['src/components/store/CatalogPage.astro']).toContain("'atelier-home': AtelierHomeCatalog,");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

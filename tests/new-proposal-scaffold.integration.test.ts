// @ts-nocheck -- integración de CLI Node en proyecto Workers.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('scaffold new:proposal', () => {
  it('crea el contrato completo y una segunda ejecución no sobrescribe', () => {
    const root = mkdtempSync(join(tmpdir(), 'logic2b-proposal-scaffold-'));
    const script = fileURLToPath(new URL('../scripts/new-proposal.mjs', import.meta.url));
    const registry = 'import type { ProposalConfig } from \'./types\';\n// new-proposal:imports\nexport const proposals: readonly ProposalConfig[] = [\n  // new-proposal:entries\n];\n';
    const views = '// new-proposal:view-imports\nconst proposalLandingViews = {\n  // new-proposal:view-entries\n};\n';
    try {
      mkdirSync(join(root, 'src/proposals'), { recursive: true });
      writeFileSync(join(root, 'src/proposals/index.ts'), registry);
      writeFileSync(join(root, 'src/proposals/views.ts'), views);
      const run = () => execFileSync(process.execPath, [script, 'empresa-demo'], {
        env: { ...process.env, NEW_PROPOSAL_ROOT: root },
        encoding: 'utf8',
      });
      run();
      const paths = [
        'src/proposals/empresa-demo/config.ts', 'src/proposals/empresa-demo/catalog.json',
        'src/proposals/empresa-demo/fixtures.ts', 'src/proposals/empresa-demo/ProposalLanding.astro',
        'public/images/proposals/empresa-demo/.gitkeep', 'docs/propuestas/empresa-demo.md',
        'src/proposals/index.ts',
        'src/proposals/views.ts',
      ];
      const first = Object.fromEntries(paths.map((path) => [path, readFileSync(join(root, path), 'utf8')]));
      const secondOutput = run();
      const second = Object.fromEntries(paths.map((path) => [path, readFileSync(join(root, path), 'utf8')]));
      expect(second).toEqual(first);
      expect(first['src/proposals/empresa-demo/config.ts']).toMatch(/empresa-demo-[0-9a-f]{32}/);
      expect(first['src/proposals/empresa-demo/config.ts']).toContain("status: 'draft'");
      expect(first['src/proposals/index.ts'].match(/empresaDemoProposal/g)).toHaveLength(2);
      expect(first['src/proposals/views.ts']).toContain("'empresa-demo': empresaDemoLanding");
      expect(secondOutput).toContain('omitidos: 10');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

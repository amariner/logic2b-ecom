#!/usr/bin/env node
/** Scaffold acotado para propuestas comerciales privadas. */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.NEW_PROPOSAL_ROOT
  ? resolve(process.env.NEW_PROPOSAL_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2];
if (!id || !/^[a-z][a-z0-9-]{1,30}$/.test(id)) {
  console.error('Uso: pnpm new:proposal <id> (kebab-case)');
  process.exit(1);
}

const base = `src/proposals/${id}`;
const allowed = [base, `public/images/proposals/${id}`, `docs/propuestas/${id}.md`, 'src/proposals/index.ts', 'src/proposals/views.ts'];
const created = [];
const skipped = [];
const patched = [];
const publicId = `${id}-${randomBytes(16).toString('hex')}`;
const symbol = id.replace(/-([a-z0-9])/g, (_m, c) => c.toUpperCase());

function guard(path) {
  if (!allowed.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    throw new Error(`GUARDARRAÍL: ruta fuera de propuesta: ${path}`);
  }
}
function writeNew(path, contents) {
  guard(path);
  const absolute = join(root, path);
  if (existsSync(absolute)) { skipped.push(path); return; }
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
  created.push(path);
}
function patchAtMarker(marker, line, registered, path = 'src/proposals/index.ts') {
  guard(path);
  const absolute = join(root, path);
  const source = readFileSync(absolute, 'utf8');
  if (source.includes(registered)) { skipped.push(`${path} (ya registrado)`); return; }
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`Falta marcador ${marker} en ${path}`);
  const lineStart = source.lastIndexOf('\n', index) + 1;
  const indent = source.slice(lineStart, index);
  writeFileSync(absolute, source.slice(0, lineStart) + indent + line + '\n' + source.slice(lineStart));
  patched.push(path);
}

writeNew(`${base}/config.ts`, `import type { ProposalConfig } from '../types';
import { proposalPaths } from '../paths';

export const ${symbol}PublicId = '${publicId}';
const paths = proposalPaths(${symbol}PublicId);

export const ${symbol}Proposal: ProposalConfig = {
  id: '${id}', publicId: ${symbol}PublicId, status: 'draft', expiresAt: null,
  company: { name: '${id}', sector: 'TODO', sourceStoreUrl: 'https://example.com' },
  collection: {
    id: 'proposal-${id}', themeId: 'base', name: '${id.toUpperCase()}',
    tagline: 'TODO', description: 'TODO',
    categories: [{ id: '${id.slice(0, 3)}-general', label: 'General' }],
  },
  paths,
  visual: { label: 'TODO', themeVars: {
    '--color-brand':'#155EEF','--color-brand-dark':'#0B3FB3','--color-brand-fg':'#fff',
    '--font-display':'Inter, sans-serif','--font-accent':'Inter, sans-serif',
    '--tracking-display':'-.03em','--weight-display':'600','--radius-btn':'.65rem',
    '--radius-card':'1rem','--border-width':'1px','--surface-product':'#f2f5f9',
    '--surface-sunken':'#e9eef5','--space-density':'1','--grid-gap':'1.25rem',
  } },
  demoShipping: { zones: [], rates: [] },
  contactSource: 'proposal:${id}',
};
`);
writeNew(`${base}/catalog.json`, '[]\n');
writeNew(`${base}/fixtures.ts`, 'export const orders = [] as const;\nexport const emails = [] as const;\n');
writeNew(`${base}/ProposalLanding.astro`, '---\n// TODO: propuesta comercial privada.\n---\n<main><h1>Propuesta en preparación</h1></main>\n');
writeNew(`public/images/proposals/${id}/.gitkeep`, '');
writeNew(`docs/propuestas/${id}.md`, `# Propuesta ${id}\n\nEstado: borrador.\n\nURL privada: /propuestas/${publicId}\n`);
patchAtMarker('// new-proposal:imports', `import { ${symbol}Proposal } from './${id}/config';`, `./${id}/config`);
patchAtMarker('// new-proposal:entries', `${symbol}Proposal,`, `${symbol}Proposal,`);
patchAtMarker('// new-proposal:view-imports', `import ${symbol}Landing from './${id}/ProposalLanding.astro';`, `./${id}/ProposalLanding.astro`, 'src/proposals/views.ts');
patchAtMarker('// new-proposal:view-entries', `${id.includes('-') ? `'${id}'` : id}: ${symbol}Landing,`, `${symbol}Landing,`, 'src/proposals/views.ts');

console.log(`Propuesta ${id}`);
console.log(`Creados: ${created.length} · parcheados: ${patched.length} · omitidos: ${skipped.length}`);
for (const path of created) console.log(`  + ${path}`);
for (const path of skipped) console.log(`  = ${path}`);

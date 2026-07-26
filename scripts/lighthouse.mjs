/**
 * Lighthouse citable de las páginas indexables — SIN dependencias en el repo.
 * ============================================================================
 *
 * La landing vende «100/100 Lighthouse». Esto es lo que lo comprueba, y lo que
 * hay que volver a pasar tras cada deploy que toque `/`, `/arquitectura`,
 * `/estilos` o `/dossier` (checklist del rol SEO).
 *
 * Por qué `npx lighthouse@12` y no una devDependency: Lighthouse arrastra ~200
 * paquetes para algo que se ejecuta a mano tres veces al mes. Se descarga en el
 * momento y no entra en `package.json` (veto del arquitecto sobre dependencias).
 * A diferencia de `a11y-audit.mjs` aquí no vale motor propio: la nota de
 * Lighthouse solo es citable si la calcula Lighthouse.
 *
 * MEDIANA DE VARIAS PASADAS, no una suelta. Speed Index es la métrica ruidosa
 * del lote: contra producción se han visto 98 y 100 en la misma URL sin tocar
 * nada. Una pasada única sirve para mirar, no para citar.
 *
 * USO:
 *   node scripts/lighthouse.mjs                    # 3 pasadas contra producción
 *   node scripts/lighthouse.mjs --runs=1           # vistazo rápido
 *   BASE_URL=http://localhost:8799 node scripts/lighthouse.mjs --runs=1
 *   node scripts/lighthouse.mjs --only=dossier
 *
 * Los informes HTML/JSON quedan en `.lighthouse/` (ignorado por git; el HTML
 * de cada pasada pesa ~800 KB). El resumen citable va a `docs/LIGHTHOUSE.md`
 * con `--write`.
 *
 * Exit code 1 si la mediana de alguna categoría baja de 100.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BASE_URL ?? 'https://ecom.logic2b.com').replace(/\/$/, '');
const OUT = join(ROOT, '.lighthouse');

const args = process.argv.slice(2);
const RUNS = Number(args.find((a) => a.startsWith('--runs='))?.slice('--runs='.length) ?? 3);
const ONLY = args.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const WRITE = args.includes('--write');

/** Las 4 indexables. Sin barra final: es la forma canónica del sitio. */
const PAGES = [
  { id: 'home', path: '/', label: 'Landing' },
  { id: 'arquitectura', path: '/arquitectura', label: 'Arquitectura' },
  { id: 'estilos', path: '/estilos', label: 'Estilos' },
  { id: 'dossier', path: '/dossier', label: 'Dossier' },
];
const FORMS = ['mobile', 'desktop'];
const CATS = [
  ['performance', 'Rend.'],
  ['accessibility', 'A11y'],
  ['best-practices', 'BP'],
  ['seo', 'SEO'],
];

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * Una pasada de Lighthouse. Devuelve las 4 notas + las métricas de CWV.
 *
 * Reintenta hasta 2 veces por dos motivos, los dos del entorno y no del sitio:
 * fallos de arranque de Chrome (`NO_FCP`, interstitial), y pasadas en las que
 * la RED del que mide se cae. Esto último es lo peligroso: si el propio HTML
 * tarda 8 s en llegar, Lighthouse lo achaca a la página y devuelve un 90 que
 * no dice nada. Se descarta y se repite; nunca se descarta por nota baja.
 */
const BAD_NETWORK_MS = 3000;

function runOnce(page, form, i, attempts = 3) {
  const base = join(OUT, `${page.id}-${form}-${i}`);
  try {
    const res = lighthouse(page, form, base);
    if (res.docMs > BAD_NETWORK_MS && attempts > 1) {
      console.log(`   ↻ el documento tardó ${(res.docMs / 1000).toFixed(1)} s en llegar: red del medidor, se repite`);
      return runOnce(page, form, i, attempts - 1);
    }
    return res;
  } catch (err) {
    if (attempts <= 1) throw err;
    console.log(`   ↻ pasada fallida (${String(err.message).split('\n')[0].slice(0, 60)}), reintento`);
    return runOnce(page, form, i, attempts - 1);
  }
}

function lighthouse(page, form, base) {
  execFileSync(
    'npx',
    [
      '--yes',
      'lighthouse@12',
      BASE + page.path,
      ...(form === 'desktop' ? ['--preset=desktop'] : []),
      '--only-categories=performance,accessibility,best-practices,seo',
      '--output=json',
      '--output=html',
      `--output-path=${base}`,
      '--chrome-flags=--headless=new --no-sandbox',
      '--quiet',
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  // Con varios `--output`, Lighthouse añade su propia extensión al path dado.
  const r = JSON.parse(readFileSync(`${base}.report.json`, 'utf8'));
  const doc = r.audits['network-requests'].details.items.find((x) => x.resourceType === 'Document');
  return {
    docMs: doc ? doc.networkEndTime : 0,
    scores: Object.fromEntries(CATS.map(([k]) => [k, Math.round(r.categories[k].score * 100)])),
    lcp: r.audits['largest-contentful-paint'].numericValue,
    cls: r.audits['cumulative-layout-shift'].numericValue,
    tbt: r.audits['total-blocking-time'].numericValue,
    version: r.lighthouseVersion,
  };
}

mkdirSync(OUT, { recursive: true });
console.log(`Lighthouse contra ${BASE} — ${RUNS} pasada(s), mediana\n`);

const rows = [];
let version = '';
let failed = false;

for (const page of PAGES) {
  if (ONLY && !page.id.includes(ONLY)) continue;
  for (const form of FORMS) {
    const passes = [];
    for (let i = 0; i < RUNS; i++) passes.push(runOnce(page, form, i));
    version = passes[0].version;
    const scores = Object.fromEntries(
      CATS.map(([k]) => [k, median(passes.map((p) => p.scores[k]))]),
    );
    const row = {
      page,
      form,
      scores,
      spread: Object.fromEntries(
        CATS.map(([k]) => [k, [Math.min(...passes.map((p) => p.scores[k])), Math.max(...passes.map((p) => p.scores[k]))]]),
      ),
      lcp: median(passes.map((p) => p.lcp)),
      cls: median(passes.map((p) => p.cls)),
      tbt: median(passes.map((p) => p.tbt)),
    };
    rows.push(row);
    const notes = CATS.map(([k]) => scores[k]).join('/');
    const bad = CATS.filter(([k]) => scores[k] < 100);
    if (bad.length) failed = true;
    console.log(
      `${(page.id + '/' + form).padEnd(22)} ${notes.padEnd(16)} ` +
        `LCP ${(row.lcp / 1000).toFixed(1)}s  CLS ${row.cls.toFixed(2)}  TBT ${Math.round(row.tbt)}ms` +
        (bad.length ? `   ✗ ${bad.map(([k]) => k).join(', ')}` : '   ✓'),
    );
    for (const [k, label] of CATS) {
      const [lo, hi] = row.spread[k];
      if (lo !== hi) console.log(`   ↳ ${label} osciló ${lo}–${hi} en las ${RUNS} pasadas`);
    }
  }
}

if (WRITE) {
  const stamp = new Date().toISOString().slice(0, 10);
  const md = [
    '# Lighthouse — páginas indexables',
    '',
    `> Generado por \`node scripts/lighthouse.mjs --write\` el ${stamp}.`,
    `> Lighthouse ${version}, mediana de ${RUNS} pasadas contra ${BASE}.`,
    '> Las cifras de esta tabla son las que la landing y el dossier pueden citar.',
    '',
    '| Página | Dispositivo | Rendimiento | Accesibilidad | Buenas prácticas | SEO | LCP | CLS | TBT |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.page.label} | ${r.form === 'mobile' ? 'Móvil' : 'Escritorio'} | ` +
        CATS.map(([k]) => r.scores[k]).join(' | ') +
        ` | ${(r.lcp / 1000).toFixed(1)} s | ${r.cls.toFixed(2)} | ${Math.round(r.tbt)} ms |`,
    ),
    '',
    'Móvil es el perfil por defecto de Lighthouse (Moto G Power emulado, 4G',
    'lenta con CPU 4× más lenta); escritorio usa el preset `desktop`. La',
    'emulación móvil es deliberadamente pesimista: es el suelo, no la media.',
    '',
  ].join('\n');
  writeFileSync(join(ROOT, 'docs/LIGHTHOUSE.md'), md);
  console.log('\n→ docs/LIGHTHOUSE.md actualizado');
}

console.log(failed ? '\n✗ Alguna categoría baja de 100.' : '\n✓ 100/100/100/100 en todas las superficies.');
process.exit(failed ? 1 : 0);

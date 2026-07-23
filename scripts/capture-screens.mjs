/**
 * Motor de capturas de la landing (F11.1) — Chrome headless vía CDP, SIN
 * dependencias nuevas.
 * ============================================================================
 *
 * Conduce el Chrome del sistema por el DevTools Protocol usando el `WebSocket`
 * global de Node (>=21). Convierte cada PNG a WebP con `cwebp` (binario de
 * sistema). No añade ninguna dependencia npm: es la «receta de re-captura»
 * reproducible que pide el plan (D2), en un solo comando.
 *
 * USO:
 *   1. pnpm db:reset && pnpm build            (fixtures prístinas + dist)
 *   2. npx wrangler dev --port 8799 --local   (en otra terminal)
 *   3. node scripts/capture-screens.mjs        [--only=<substr>] [--no-webp]
 *
 * Salida: public/images/screens/<nombre>.webp  (+ .png intermedio si --keep-png)
 *
 * Cada entrada de SHOTS declara su superficie; el banner de demo y el
 * conmutador flotante de tiendas se ocultan siempre (no deben salir en la
 * landing). Las de admin usan cookie de sesión; las de carrito siembran
 * localStorage antes de cargar.
 */
import { spawn, execFile } from 'node:child_process';
import { mkdir, writeFile, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public/images/screens');

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8799';
const CHROME =
  process.env.CHROME_BIN ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = process.argv.slice(2);
const ONLY = args.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const NO_WEBP = args.includes('--no-webp');
const KEEP_PNG = args.includes('--keep-png');

// ── Viewports ────────────────────────────────────────────────────────────
const DESKTOP = { w: 1440, h: 900, dsf: 2, mobile: false };
const MOBILE = { w: 390, h: 844, dsf: 2, mobile: true };

// Anchura de salida del WebP y calidad por familia (peso objetivo: escritorio
// <=150 KB, móvil <=60 KB — se afinan tras medir).
const WEBP = {
  desktop: { width: 1440, q: 72 },
  mobile: { width: 780, q: 68 },
};

/**
 * Oculta el chrome de demo (banner superior + conmutador flotante) que no debe
 * aparecer en ninguna captura de la landing. Se inyecta antes de capturar.
 */
const HIDE_DEMO_CHROME = `(() => {
  document.querySelectorAll('[data-store-switcher]').forEach((el) => { el.style.display = 'none'; });
  const needles = ['pago está simulado', 'tienda ficticia', 'Modo demo', 'Panel de demostración', 'Cloudflare Access'];
  const nodes = Array.from(document.querySelectorAll('body *'));
  for (const el of nodes) {
    const t = el.textContent || '';
    if (needles.some((n) => t.includes(n)) && el.querySelectorAll('*').length < 8) {
      el.style.display = 'none';
    }
  }
})()`;

// ── Lista de capturas ──────────────────────────────────────────────────────
// Tiendas del escaparate. `scrollY` posiciona la vista en la composición firma
// de cada tienda (el grid de producto, no solo el hero de texto).
// `full`: escaparate completo (por defecto). `maxH`: capa la altura del clip.
// Iris es tienda de vídeo-scrub: la estática solo sirve de PÓSTER del hero
// (viewport), no de página completa — el escaparate se enseña con el clip.
const STORES = [
  { id: 'launch', label: 'Vector', catalog: '/demo/tiendas/launch', full: true },
  { id: 'minimal', label: 'Forma Interior', catalog: '/demo/tiendas/minimal', full: true },
  { id: 'editorial', label: 'Módulo Audio', catalog: '/demo/tiendas/editorial', full: true },
  { id: 'guide', label: 'Cafetal', catalog: '/demo/tiendas/guide', full: true },
  { id: 'iris', label: 'Iris', catalog: '/demo/tiendas/iris', full: false },
  { id: 'demo', label: 'La Botiga', catalog: '/demo/tienda', full: true, maxH: 1700 },
];

/** @typedef {{name:string,url:string,vp?:object,media?:'light'|'dark',auth?:boolean,scrollY?:number,full?:boolean,settle?:number,eval?:string,storage?:{key:string,value:string},group:'desktop'|'mobile'}} Shot */

/** @type {Shot[]} */
const SHOTS = [];

for (const s of STORES) {
  // Escaparate (versátil: la landing recorta/enmarca por CSS). Iris = viewport.
  SHOTS.push({ name: `store-${s.id}-catalog`, url: s.catalog, vp: DESKTOP, full: s.full, maxH: s.maxH, group: 'desktop' });
  // Móvil: framing de pantalla (viewport), no página completa.
  SHOTS.push({ name: `store-${s.id}-catalog-m`, url: s.catalog, vp: MOBILE, group: 'mobile' });
}

// Ficha de producto: el producto firma de cada tienda. `product(slug)` respeta
// las rutas históricas de la genérica (/demo/tienda/<slug>).
const FICHAS = [
  { id: 'launch', slug: 'lau-vector-one', prefix: '/demo/tiendas/launch' },
  { id: 'minimal', slug: 'min-butaca-arc', prefix: '/demo/tiendas/minimal' },
  { id: 'editorial', slug: 'edi-radio-r2', prefix: '/demo/tiendas/editorial' },
  { id: 'guide', slug: 'cof-molinillo-manual', prefix: '/demo/tiendas/guide' },
  { id: 'iris', slug: 'iri-sport-pro', prefix: '/demo/tiendas/iris' },
  { id: 'demo', slug: 'aove-coupage-750', prefix: '/demo/tienda' },
];
for (const f of FICHAS) {
  SHOTS.push({ name: `store-${f.id}-product`, url: `${f.prefix}/${f.slug}`, vp: DESKTOP, full: true, maxH: 1700, group: 'desktop' });
}

// Carrito con líneas: UNA implementación, servida bajo la ruta de cada tienda
// para heredar sus tokens. Se siembra localStorage antes de cargar.
const CARTS = [
  {
    id: 'launch',
    url: '/demo/tiendas/launch/carrito',
    key: 'ecom-cart:launch',
    lines: [{ slug: 'lau-vector-one', qty: 1 }, { slug: 'lau-casco-urban', qty: 1 }, { slug: 'lau-candado-u', qty: 1 }],
  },
  {
    id: 'demo',
    url: '/demo/carrito',
    key: 'ecom-demo-cart',
    lines: [{ slug: 'aove-coupage-750', qty: 2 }, { slug: 'aceite-trufa-250', qty: 1 }, { slug: 'alcachofa-corazones-390', qty: 1 }],
  },
];
for (const c of CARTS) {
  SHOTS.push({
    name: `store-${c.id}-cart`,
    url: c.url,
    vp: DESKTOP,
    full: true,
    maxH: 1700,
    group: 'desktop',
    storage: { key: c.key, value: JSON.stringify(c.lines) },
  });
}

// Abre SOLO el email de confirmación (oculta el resto) → shot enfocado.
const OPEN_CONFIRMATION = `(async () => {
  const ds = Array.from(document.querySelectorAll('details'));
  const conf = ds.find((d) => /confirmado/i.test(d.querySelector('summary')?.textContent || ''));
  ds.forEach((d) => { if (d !== conf) d.style.display = 'none'; });
  if (conf) { conf.open = true; }
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 600));
})()`;

// Rellena el checkout y dispara el cálculo de portes (mismo /api/cart/quote).
const FILL_CHECKOUT = `(async () => {
  const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } };
  set('name', 'Marta Ferrer Gil');
  set('email', 'marta.ferrer@example.com');
  set('street', 'Carrer Major 14, 2º');
  set('postal_code', '12001');
  set('city', 'Castelló de la Plana');
  await new Promise((r) => setTimeout(r, 1100));
})()`;

const DEMO_CART = JSON.stringify([
  { slug: 'aove-coupage-750', qty: 2 },
  { slug: 'aceite-trufa-250', qty: 1 },
  { slug: 'alcachofa-corazones-390', qty: 1 },
]);

// Superficies de panel (admin, con cookie). Recortadas al área útil (sin banner).
const PANEL_SHOTS = [
  { name: 'panel-orders', url: '/demo/admin', vp: DESKTOP, auth: true, full: true, maxH: 1500, group: 'desktop' },
  { name: 'panel-order-detail', url: '/demo/admin/pedidos/3', vp: DESKTOP, auth: true, full: true, maxH: 2000, group: 'desktop' },
  { name: 'panel-products', url: '/demo/admin/productos', vp: DESKTOP, auth: true, full: true, maxH: 1500, group: 'desktop' },
  { name: 'panel-shipping', url: '/demo/admin/envios', vp: DESKTOP, auth: true, full: true, maxH: 1400, group: 'desktop' },
  { name: 'panel-emails', url: '/demo/admin/emails', vp: DESKTOP, auth: true, full: true, maxH: 1600, group: 'desktop' },
  { name: 'panel-email-open', url: '/demo/admin/emails', vp: DESKTOP, auth: true, full: true, maxH: 1500, eval: OPEN_CONFIRMATION, group: 'desktop' },
  { name: 'panel-emails-m', url: '/demo/admin/emails', vp: MOBILE, auth: true, q: 60, group: 'mobile' },
];
SHOTS.push(...PANEL_SHOTS);

// Flujo de compra: checkout con portes calculados + página de gracias.
const FLOW_SHOTS = [
  {
    name: 'flow-checkout',
    url: '/demo/checkout',
    vp: DESKTOP,
    full: true,
    maxH: 1900,
    group: 'desktop',
    storage: { key: 'ecom-demo-cart', value: DEMO_CART },
    eval: FILL_CHECKOUT,
  },
  { name: 'flow-gracias', url: '/demo/gracias?session_id=sim_sess_BM-DEMO-1001', vp: DESKTOP, full: true, maxH: 1600, group: 'desktop' },
  {
    name: 'flow-checkout-m',
    url: '/demo/checkout',
    vp: MOBILE,
    full: true,
    maxH: 1700,
    group: 'mobile',
    storage: { key: 'ecom-demo-cart', value: DEMO_CART },
    eval: FILL_CHECKOUT,
  },
];
SHOTS.push(...FLOW_SHOTS);

// ─────────────────────────────────────────────────────────────────────────
// CDP mínimo sobre el WebSocket global de Node.
// ─────────────────────────────────────────────────────────────────────────
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.params ?? {})})`));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', (e) => reject(new Error('WebSocket error: ' + (e.message || 'unknown'))));
  });
}

async function launchChrome() {
  const userDataDir = join(ROOT, '.wrangler', 'chrome-capture');
  await rm(userDataDir, { recursive: true, force: true });
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--force-color-profile=srgb',
      '--remote-allow-origins=*',
      `--user-data-dir=${userDataDir}`,
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const to = globalThis.setTimeout(() => reject(new Error('Chrome no expuso DevTools en 15 s')), 15000);
    child.stderr.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        globalThis.clearTimeout(to);
        resolve(m[1]);
      }
    });
    child.on('exit', (code) => reject(new Error('Chrome salió con código ' + code)));
  });
  return { child, wsUrl };
}

async function adminCookie() {
  const res = await fetch(`${BASE}/demo/admin/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE },
    body: 'password=demo',
  });
  const raw = res.headers.get('set-cookie') ?? '';
  const pair = raw.split(';')[0];
  const eq = pair.indexOf('=');
  if (eq < 0) throw new Error('Login admin no devolvió cookie: ' + res.status);
  return { name: pair.slice(0, eq), value: pair.slice(eq + 1) };
}

// Dispara la carga perezosa recorriendo la página y espera fuentes + imágenes.
const SETTLE_JS = `(async () => {
  const h = document.body.scrollHeight;
  for (let y = 0; y <= h; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); }
  window.scrollTo(0, 0);
  try { await document.fonts.ready; } catch {}
  const imgs = Array.from(document.images);
  await Promise.all(imgs.map((img) => img.complete ? 1 : new Promise((r) => { img.onload = img.onerror = r; setTimeout(r, 2500); })));
  await new Promise((r) => setTimeout(r, 250));
})()`;

async function main() {
  if (!existsSync(CHROME)) {
    console.error('No encuentro Chrome en:', CHROME, '\nDefine CHROME_BIN si está en otra ruta.');
    process.exit(1);
  }
  // Server up?
  try {
    const ping = await fetch(`${BASE}/demo/tienda`, { redirect: 'manual' });
    if (!ping.ok && ping.status !== 302) throw new Error('status ' + ping.status);
  } catch (e) {
    console.error(`El servidor no responde en ${BASE}. Arranca: npx wrangler dev --port 8799 --local`);
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const cookie = SHOTS.some((s) => s.auth) ? await adminCookie() : null;

  const { child, wsUrl } = await launchChrome();
  const browserWs = await connect(wsUrl);
  const cdp = new CDP(browserWs);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => cdp.send(m, p, sessionId);

  await S('Page.enable');
  await S('Runtime.enable');
  await S('Network.enable');
  await S('DOM.enable');

  const shots = SHOTS.filter((s) => !ONLY || s.name.includes(ONLY));
  const results = [];

  for (const shot of shots) {
    const vp = shot.vp ?? DESKTOP;
    await S('Emulation.setDeviceMetricsOverride', {
      width: vp.w,
      height: vp.h,
      deviceScaleFactor: vp.dsf,
      mobile: !!vp.mobile,
    });
    await S('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: shot.media ?? 'light' }],
    });
    if (shot.auth && cookie) {
      await S('Network.setCookie', { name: cookie.name, value: cookie.value, url: BASE });
    }

    // Carrito: sembrar localStorage antes de la carga real.
    if (shot.storage) {
      await S('Page.navigate', { url: shot.url.startsWith('http') ? shot.url : BASE + shot.url });
      await sleep(200);
      await S('Runtime.evaluate', {
        expression: `localStorage.setItem(${JSON.stringify(shot.storage.key)}, ${JSON.stringify(shot.storage.value)})`,
      });
    }

    await S('Page.navigate', { url: shot.url.startsWith('http') ? shot.url : BASE + shot.url });
    await sleep(400);
    await S('Runtime.evaluate', { expression: SETTLE_JS, awaitPromise: true, returnByValue: true }).catch(() => {});
    if (shot.eval) await S('Runtime.evaluate', { expression: shot.eval, awaitPromise: true }).catch(() => {});
    await S('Runtime.evaluate', { expression: HIDE_DEMO_CHROME });
    if (typeof shot.scrollY === 'number') {
      await S('Runtime.evaluate', { expression: `window.scrollTo(0, ${shot.scrollY})` });
      await sleep(200);
    }

    // Métricas de página para clip de página completa.
    let clip;
    if (shot.full) {
      const { result } = await S('Runtime.evaluate', {
        expression: `JSON.stringify({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })`,
        returnByValue: true,
      });
      const dims = JSON.parse(result.value);
      clip = { x: 0, y: 0, width: vp.w, height: Math.min(dims.h, shot.maxH ?? 4200), scale: 1 };
    }

    const shotParams = { format: 'png', captureBeyondViewport: !!shot.full };
    if (clip) shotParams.clip = clip;
    const { data } = await S('Page.captureScreenshot', shotParams);
    const png = join(OUT_DIR, `${shot.name}.png`);
    await writeFile(png, Buffer.from(data, 'base64'));

    let finalPath = png;
    if (!NO_WEBP) {
      const cfg = WEBP[shot.group] ?? WEBP.desktop;
      const q = shot.q ?? cfg.q;
      const webp = join(OUT_DIR, `${shot.name}.webp`);
      await execFileP('cwebp', ['-quiet', '-q', String(q), '-resize', String(cfg.width), '0', png, '-o', webp]);
      if (!KEEP_PNG) await rm(png, { force: true });
      finalPath = webp;
    }
    const sz = (await stat(finalPath)).size;
    results.push({ name: shot.name, group: shot.group, kb: Math.round(sz / 1024) });
    console.log(`✓ ${shot.name.padEnd(26)} ${Math.round(sz / 1024)} KB`);
  }

  await cdp.send('Target.closeTarget', { targetId });
  browserWs.close();
  child.kill();

  // Resumen de pesos.
  const over = results.filter((r) => (r.group === 'mobile' ? r.kb > 60 : r.kb > 150));
  console.log(`\n${results.length} capturas. Pesos fuera de objetivo: ${over.length}`);
  for (const r of over) console.log(`  ⚠ ${r.name}: ${r.kb} KB`);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});

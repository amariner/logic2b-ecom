/**
 * Generador de la tarjeta Open Graph — Chrome headless vía CDP, SIN
 * dependencias nuevas.
 * ============================================================================
 *
 * `public/images/og.jpg` es lo que ve quien recibe el enlace por WhatsApp, que
 * es el canal de venta real (rol SEO). Se genera desde este script y no a mano
 * para que se pueda REHACER cuando cambie el posicionamiento: la anterior se
 * quedó diciendo «Logic2B. Commerce Kit» sobre una foto de embutidos cuando la
 * landing ya vendía Logic2B Ecommerce y diez tiendas.
 *
 * El plano se escribe aquí en HTML y se fotografía a 1200×630 (el tamaño que
 * anuncian `og:image:width/height`). Usa la Inter del propio sitio y el verde
 * de marca, así que la tarjeta no se despega del diseño.
 *
 * USO:
 *   node scripts/make-og.mjs            # → public/images/og.jpg
 *   node scripts/make-og.mjs --agencias # → public/images/og-agencias.jpg
 *   node scripts/make-og.mjs --keep-png # deja el PNG intermedio para mirarlo
 *
 * AL REGENERARLA hay que subir el `?v=N` de `ogImage` en `src/layouts/Base.astro`:
 * WhatsApp cachea la preview por URL de imagen y, sin cambiarla, seguiría
 * enseñando la tarjeta vieja durante semanas.
 *
 * No necesita ni servidor ni build: carga por `file://` desde `public/`.
 * Requiere Chrome y `sips` (macOS), igual que `capture-screens.mjs` requiere
 * `cwebp`.
 */
import { spawn, execFile } from 'node:child_process';
import { writeFile, rm } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

const execFileP = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const CHROME =
  process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const KEEP_PNG = process.argv.includes('--keep-png');
const AGENCIES = process.argv.includes('--agencias');

const W = 1200;
const H = 630;
const f = (rel) => `file://${join(PUBLIC, rel)}`;

/**
 * Tres catálogos reales en abanico = «un motor, muchas tiendas» sin decirlo.
 * Se eligen los tres más distintos entre sí a tamaño de miniatura de chat.
 */
const SHOWCASE = ['store-street-catalog.webp', 'store-natural-catalog.webp', 'store-specs-catalog.webp'];

const HTML = `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: "Inter Variable";
    font-style: normal; font-weight: 100 900; font-display: block;
    src: url("${f('fonts/inter-latin-wght-normal.woff2')}") format("woff2-variations");
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; }
  body {
    font-family: "Inter Variable", system-ui, sans-serif;
    background: #ffffff; color: #0a0a0a;
    display: grid; grid-template-columns: 640px 1fr; overflow: hidden;
  }
  .left { padding: 56px 40px 48px 56px; display: flex; flex-direction: column; }
  .brand { font-size: 26px; font-weight: 700; letter-spacing: -.02em; }
  .brand i { color: #008060; font-style: normal; }
  h1 { margin-top: auto; font-size: 50px; line-height: 1.04; font-weight: 700; letter-spacing: -.035em; max-width: 500px; }
  h1 b { display: block; color: #008060; font-weight: 700; text-wrap: balance; }
  .sub { margin-top: 20px; font-size: 20px; line-height: 1.35; color: #52525b; font-weight: 450; }
  .pill {
    margin-top: auto; align-self: flex-start; margin-bottom: 0;
    border: 1px solid #e4e4e7; border-radius: 999px;
    padding: 11px 20px; font-size: 17px; color: #3f3f46; font-weight: 500;
  }
  /* Tres catálogos apilados en escalera: a tamaño de miniatura de chat se
     distinguen tres tiendas distintas, que es todo el mensaje de la imagen. */
  .right { position: relative; background: #0a0a0a; overflow: hidden; }
  .right img {
    position: absolute; left: 56px; width: 470px; height: 232px;
    object-fit: cover; object-position: top left;
    border-radius: 12px; border: 1px solid rgba(255,255,255,.16);
    box-shadow: 0 18px 44px rgba(0,0,0,.5);
  }
  .s0 { top: -14px; }
  .s1 { top: 199px; z-index: 2; }
  .s2 { top: 412px; }
</style>
<div class="left">
  <p class="brand">Logic2B <i>Ecommerce</i></p>
  <h1>Tiendas radicalmente distintas.<b>Un motor probado. 0 €/mes.</b></h1>
  <p class="sub">Tu tienda online a medida, sin cuotas de plataforma.<br>Pagos con Stripe · Hecho en Castellón.</p>
  <p class="pill">ecom.logic2b.com — demo real navegable</p>
</div>
<div class="right">
${SHOWCASE.map((s, i) => `  <img class="s${i}" src="${f('images/screens/' + s)}" alt="">`).join('\n')}
</div>
`;

/** Variante propia de /agencias: misma marca, mensaje y URL específicos. */
const PAGE_HTML = AGENCIES
  ? HTML
      .replaceAll('#008060', '#254fad')
      .replace(
        'Tiendas radicalmente distintas.<b>Un motor probado. 0 €/mes.</b>',
        'Tu agencia gana el proyecto.<b>Nosotros construimos el ecommerce.</b>',
      )
      .replace(
        'Tu tienda online a medida, sin cuotas de plataforma.<br>Pagos con Stripe · Hecho en Castellón.',
        'Desarrollo y mantenimiento en marca blanca.<br>Un equipo técnico detrás de tu agencia.',
      )
      .replace(
        'ecom.logic2b.com — demo real navegable',
        'ecom.logic2b.com/agencias — colaboración para partners',
      )
  : HTML;

// ── CDP mínimo (mismo patrón que capture-screens.mjs) ──────────────────────
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function launchChrome() {
  const userDataDir = join(ROOT, '.wrangler', 'chrome-og');
  await rm(userDataDir, { recursive: true, force: true });
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
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

const htmlPath = join(ROOT, '.wrangler', 'og-source.html');
await writeFile(htmlPath, PAGE_HTML);

const { child, wsUrl } = await launchChrome();
try {
  const targetsRes = await fetch(wsUrl.replace(/^ws:\/\/([^/]+).*/, 'http://$1/json/list'));
  const target = (await targetsRes.json()).find((t) => t.type === 'page');
  const ws = await new Promise((resolve, reject) => {
    const s = new WebSocket(target.webSocketDebuggerUrl);
    s.addEventListener('open', () => resolve(s));
    s.addEventListener('error', () => reject(new Error('No se pudo abrir el WebSocket de CDP')));
  });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: W,
    height: H,
    deviceScaleFactor: 2, // 2× y luego se baja a 1200: el texto sale nítido
    mobile: false,
  });
  await cdp.send('Page.navigate', { url: `file://${htmlPath}` });
  await sleep(1200); // fuente + 3 WebP locales

  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const basename = AGENCIES ? 'og-agencias' : 'og';
  const png = join(PUBLIC, `images/${basename}.png`);
  const jpg = join(PUBLIC, `images/${basename}.jpg`);
  await writeFile(png, Buffer.from(data, 'base64'));
  // 1200×630 exactos y JPEG: WhatsApp descarta previews pesadas, y `sips`
  // (sistema) evita meter un procesador de imagen como dependencia.
  await execFileP('sips', ['-z', String(H), String(W), png, '--out', png]);
  await execFileP('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '72', png, '--out', jpg]);
  if (!KEEP_PNG) await rm(png, { force: true });
  const { size } = await stat(jpg);
  console.log(`✓ public/images/${basename}.jpg — ${W}×${H}, ${(size / 1024).toFixed(0)} KB`);
  if (size > 300 * 1024) console.log('⚠ por encima de 300 KB: WhatsApp puede no previsualizarla');
} finally {
  child.kill();
}

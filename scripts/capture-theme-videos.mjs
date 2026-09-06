/**
 * Graba un recorrido vertical de cada tienda para las tarjetas de `/temas`.
 *
 * No añade dependencias: conduce Chrome por CDP y entrega los fotogramas a
 * ffmpeg por stdin. Los temas se descubren a partir de sus pósteres
 * `store-<id>-catalog-900.webp`; `demo` queda fuera porque es la tienda Base,
 * no uno de los temas que muestra la página.
 *
 * Uso:
 *   1. pnpm dev
 *   2. node scripts/capture-theme-videos.mjs [--only=<id>]
 *
 * Variables opcionales:
 *   BASE_URL=http://127.0.0.1:4321
 *   CHROME_BIN=/ruta/a/Chrome
 */
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { readdir, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

const execFileP = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public/images/screens');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ONLY = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);

const VIEWPORT = { width: 900, height: 562 };
const VIDEO = { width: 720, height: 450 };
const FPS = 24;
const EASINGS = [
  (t) => t,
  (t) => 1 - (1 - t) ** 3,
  (t) => t < 0.5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2,
  (t) => t * t * (3 - 2 * t),
];

function hashId(id) {
  let hash = 2166136261;
  for (const char of id) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFor(id) {
  let state = hashId(id) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Cada id produce una partitura única y estable: duración, tres tramos,
 * aceleración y pausas propias. Regenerar un tema conserva exactamente su
 * ritmo, pero dos temas no avanzan sincronizados al entrar juntos en pantalla.
 */
function makeProfile(id) {
  const random = randomFor(id);
  const duration = 6.8 + random() * 3.8;
  const first = 0.2 + random() * 0.17;
  const second = first + 0.24 + random() * 0.17;
  const positions = [0, first, Math.min(second, 0.78), 1];
  const parts = [];

  parts.push({ kind: 'hold', weight: 0.3 + random() * 0.45, from: 0, to: 0, easing: 0 });
  for (let index = 0; index < positions.length - 1; index += 1) {
    parts.push({
      kind: 'move',
      weight: 0.75 + random() * 0.85,
      from: positions[index],
      to: positions[index + 1],
      easing: Math.floor(random() * EASINGS.length),
    });
    if (index < positions.length - 2) {
      parts.push({
        kind: 'hold',
        weight: 0.12 + random() * 0.5,
        from: positions[index + 1],
        to: positions[index + 1],
        easing: 0,
      });
    }
  }
  parts.push({ kind: 'hold', weight: 0.28 + random() * 0.55, from: 1, to: 1, easing: 0 });

  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  let cursor = 0;
  const timeline = parts.map((part) => {
    const start = cursor / totalWeight;
    cursor += part.weight;
    return { ...part, start, end: cursor / totalWeight };
  });
  return { duration, timeline };
}

function progressAt(profile, time) {
  const part = profile.timeline.find((candidate) => time <= candidate.end) ?? profile.timeline.at(-1);
  if (!part || part.kind === 'hold') return part?.to ?? 0;
  const local = Math.max(0, Math.min(1, (time - part.start) / (part.end - part.start)));
  return part.from + (part.to - part.from) * EASINGS[part.easing](local);
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method) {
        for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
      }
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
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

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', () => reject(new Error('No se pudo abrir el WebSocket de Chrome')), { once: true });
  });
}

async function launchChrome() {
  const userDataDir = join(ROOT, '.wrangler', 'chrome-theme-video');
  await rm(userDataDir, { recursive: true, force: true });
  const child = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--force-color-profile=srgb', '--remote-allow-origins=*',
    `--user-data-dir=${userDataDir}`, '--remote-debugging-port=0', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Chrome no expuso DevTools en 15 s')), 15000);
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[1]);
    });
    child.on('exit', (code) => reject(new Error(`Chrome terminó antes de grabar (${code})`)));
  });
  return { child, wsUrl };
}

const PREPARE_PAGE = `(async () => {
  document.documentElement.style.scrollBehavior = 'auto';
  document.querySelectorAll('[data-store-switcher], [data-demo-journey], [data-whatsapp-contact], astro-dev-toolbar').forEach((element) => { element.style.display = 'none'; });
  document.querySelectorAll('video').forEach((video) => {
    video.pause();
    video.removeAttribute('autoplay');
  });
  await document.fonts.ready;
  const height = document.documentElement.scrollHeight;
  for (let y = 0; y <= height; y += 480) {
    window.scrollTo(0, y);
    await new Promise((resolve) => setTimeout(resolve, 35));
  }
  await Promise.all(Array.from(document.images).map(async (image) => {
    if (!image.complete) await new Promise((resolve) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
      setTimeout(resolve, 5000);
    });
    if (image.naturalWidth > 0) { try { await image.decode(); } catch {} }
  }));
  window.scrollTo(0, 0);
  await new Promise((resolve) => setTimeout(resolve, 350));
  return JSON.stringify({ height: document.documentElement.scrollHeight, images: document.images.length });
})()`;

async function writeFrame(process, frame) {
  if (process.stdin.write(frame)) return;
  await once(process.stdin, 'drain');
}

async function encodeTheme(S, id, maxScroll, profile) {
  const output = join(OUT_DIR, `theme-${id}-preview.mp4`);
  const temporaryOutput = join(tmpdir(), `logic-ecom-theme-${id}-${process.pid}.mp4`);
  await rm(temporaryOutput, { force: true });
  const ffmpeg = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'image2pipe', '-framerate', String(FPS), '-vcodec', 'mjpeg', '-i', 'pipe:0',
    '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '30', '-profile:v', 'main',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', temporaryOutput,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let ffmpegError = '';
  ffmpeg.stderr.on('data', (chunk) => { ffmpegError += chunk.toString(); });

  let frameCount = 0;
  const maxFrames = Math.ceil(profile.duration * FPS * 1.15);
  let writes = Promise.resolve();
  const stopListening = S.cdp.on('Page.screencastFrame', (params) => {
    void S('Page.screencastFrameAck', { sessionId: params.sessionId });
    if (frameCount >= maxFrames) return;
    frameCount += 1;
    const frame = Buffer.from(params.data, 'base64');
    writes = writes.then(() => writeFrame(ffmpeg, frame));
  });

  await S('Page.startScreencast', {
    format: 'jpeg', quality: 78, maxWidth: VIDEO.width, maxHeight: VIDEO.height,
    everyNthFrame: 2,
  });
  const timeline = JSON.stringify(profile.timeline);
  await S('Runtime.evaluate', {
    expression: `(async () => {
      const timeline = ${timeline};
      const duration = ${Math.round(profile.duration * 1000)};
      const maxScroll = ${maxScroll};
      const pulse = document.createElement('span');
      pulse.setAttribute('aria-hidden', 'true');
      pulse.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;background:#000;opacity:.001;pointer-events:none;z-index:-1';
      document.body.append(pulse);
      const ease = [
        (t) => t,
        (t) => 1 - (1 - t) ** 3,
        (t) => t < .5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2,
        (t) => t * t * (3 - 2 * t),
      ];
      const started = performance.now();
      await new Promise((resolve) => {
        const tick = (now) => {
          const time = Math.min(1, (now - started) / duration);
          const part = timeline.find((candidate) => time <= candidate.end) || timeline[timeline.length - 1];
          let progress = part.to;
          if (part.kind === 'move') {
            const local = Math.max(0, Math.min(1, (time - part.start) / (part.end - part.start)));
            progress = part.from + (part.to - part.from) * ease[part.easing](local);
          }
          window.scrollTo(0, Math.round(progress * maxScroll));
          pulse.style.opacity = String(.001 + ((Math.round(now) % 2) * .0001));
          if (time < 1) requestAnimationFrame(tick); else resolve();
        };
        requestAnimationFrame(tick);
      });
      pulse.remove();
      await new Promise((resolve) => setTimeout(resolve, 120));
    })()`,
    awaitPromise: true,
  });
  await S('Page.stopScreencast');
  stopListening();
  await writes;
  ffmpeg.stdin.end();
  const [code] = await once(ffmpeg, 'close');
  if (code !== 0) throw new Error(`ffmpeg falló para ${id}: ${ffmpegError.trim()}`);
  return { output, temporaryOutput, frameCount };
}

/**
 * Stretch contiene seis vídeos remotos autoplay. El screencast de Chrome
 * recibiría a la vez esos frames y los del scroll. Su captura completa ya es
 * la evidencia estable del escaparate, así que recorremos esa panorámica con
 * dos movimientos y una pausa editorial propia.
 */
async function encodeStretchPanorama(profile) {
  const id = 'stretch';
  const output = join(OUT_DIR, `theme-${id}-preview.mp4`);
  const temporaryOutput = join(tmpdir(), `logic-ecom-theme-${id}-${process.pid}.mp4`);
  const source = join(OUT_DIR, 'store-stretch-catalog.webp');
  const duration = profile.duration;
  const lead = duration * 0.08;
  const firstEnd = duration * 0.4;
  const holdEnd = duration * 0.47;
  const firstSpan = firstEnd - lead;
  const secondSpan = duration - holdEnd;
  const smooth = (value) => `(3*pow(${value},2)-2*pow(${value},3))`;
  const firstTime = `(t-${lead.toFixed(3)})/${firstSpan.toFixed(3)}`;
  const secondTime = `(t-${holdEnd.toFixed(3)})/${secondSpan.toFixed(3)}`;
  const progress = `if(lt(t,${lead.toFixed(3)}),0,if(lt(t,${firstEnd.toFixed(3)}),0.35*${smooth(firstTime)},if(lt(t,${holdEnd.toFixed(3)}),0.35,0.35+0.65*${smooth(secondTime)})))`;

  await rm(temporaryOutput, { force: true });
  await execFileP('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-framerate', String(FPS),
    '-i', source, '-t', duration.toFixed(3),
    '-vf', `scale=${VIDEO.width}:-1:flags=lanczos,crop=${VIDEO.width}:${VIDEO.height}:0:'(ih-oh)*${progress}',fps=${FPS}`,
    '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '30', '-profile:v', 'main',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', temporaryOutput,
  ]);
  return { output, temporaryOutput, frameCount: Math.round(duration * FPS) };
}

async function main() {
  if (!existsSync(CHROME)) throw new Error(`No encuentro Chrome en ${CHROME}`);
  await execFileP('ffmpeg', ['-version']);
  const response = await fetch(`${BASE}/temas`, { redirect: 'manual' });
  if (!response.ok) throw new Error(`El servidor no responde en ${BASE}. Arranca \`pnpm dev\`.`);

  const files = await readdir(OUT_DIR);
  const themeIds = files
    .map((name) => name.match(/^store-(.+)-catalog-900\.webp$/)?.[1])
    .filter((id) => id && id !== 'demo' && (!ONLY || id.includes(ONLY)))
    .sort();
  if (themeIds.length === 0) throw new Error(`No hay temas que coincidan con ${ONLY ?? 'los pósteres existentes'}`);

  const { child, wsUrl } = await launchChrome();
  const browserWs = await connect(wsUrl);
  const cdp = new CDP(browserWs);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (method, params) => cdp.send(method, params, sessionId);
  S.cdp = cdp;
  const completed = [];

  try {
    await S('Page.enable');
    await S('Runtime.enable');
    await S('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false,
    });
    await S('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: 'light' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });

    for (const [index, id] of themeIds.entries()) {
      const profile = makeProfile(id);
      if (id === 'stretch') {
        const { output, temporaryOutput, frameCount } = await encodeStretchPanorama(profile);
        completed.push({ output, temporaryOutput });
        const sizeKb = Math.round((await stat(temporaryOutput)).size / 1024);
        console.log(`✓ ${String(index + 1).padStart(2, '0')}/${themeIds.length} ${id.padEnd(12)} ${profile.duration.toFixed(1)} s · ${frameCount} frames · ${sizeKb} KB`);
        continue;
      }
      const url = `${BASE}/demo/tiendas/${id}`;
      await S('Page.navigate', { url });
      await sleep(500);
      const prepared = await S('Runtime.evaluate', {
        expression: PREPARE_PAGE, awaitPromise: true, returnByValue: true,
      });
      if (prepared.exceptionDetails) throw new Error(`No se pudo preparar ${id}`);
      const metrics = JSON.parse(prepared.result.value);
      const maxScroll = Math.max(0, metrics.height - VIEWPORT.height);
      const { output, temporaryOutput, frameCount } = await encodeTheme(S, id, maxScroll, profile);
      completed.push({ output, temporaryOutput });
      const sizeKb = Math.round((await stat(temporaryOutput)).size / 1024);
      console.log(`✓ ${String(index + 1).padStart(2, '0')}/${themeIds.length} ${id.padEnd(12)} ${profile.duration.toFixed(1)} s · ${frameCount} frames · ${sizeKb} KB`);
    }
  } finally {
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    browserWs.close();
    child.kill();
    await Promise.race([once(child, 'exit'), sleep(3000)]);
  }

  // Publicamos al final: escribir un MP4 dentro de `public/` mientras Astro
  // observa el árbol provocaría una invalidación por cada fragmento de ffmpeg.
  for (const { output, temporaryOutput } of completed) {
    await rm(output, { force: true });
    await rename(temporaryOutput, output);
  }
  console.log(`\n${completed.length} vídeos publicados en public/images/screens/.`);
}

main().catch((error) => {
  console.error('ERROR:', error.stack ?? error.message);
  if (error.cause) console.error('CAUSE:', error.cause);
  process.exit(1);
});

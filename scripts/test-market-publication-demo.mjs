/**
 * R5.9b: publicación de variantes por mercado simulada en Chrome/CDP.
 * Solo un servidor localhost de fixtures ya abierto. No inicia servidores ni
 * toca D1; bloquea antes del envío APIs, mutaciones y peticiones externas.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:8793').replace(/\/$/u, '');
const baseUrl = new URL(BASE);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname) &&
  ['http:', 'https:'].includes(baseUrl.protocol) && baseUrl.origin === BASE,
'Esta prueba solo admite un origen local de fixtures.');
const PATH = '/demo/admin/publicacion';
const ROOT = '[data-market-publication-demo]';
const MARKETS = ['ES', 'FR'];
const CHANNELS = ['storefront', 'professional'];
const PRODUCTS = ['1', '2', '3'];
const GUIDE_STORAGE_KEY = 'logic2b:ecom-guide:v1';
// El shell existente posiciona WhatsApp con rAF al observar layout/scroll.
// Solo se permite su caller exacto, derivado del HTML y de esta fuente local.
const sharedContactSource = await readFile(new URL('../src/components/WhatsAppContact.astro', import.meta.url), 'utf8');
const sharedContactScript = sharedContactSource.match(/<script is:inline>([\s\S]*?)<\/script>/u)?.[1]?.trim();
assert.ok(sharedContactScript, 'Falta el script compartido de layout conocido.');
const sharedFrameExpression = 'requestAnimationFrame(update)';
const sharedTimer = (timer, location) => timer.name === 'requestAnimationFrame' && timer.caller.endsWith(`(${location})`);
const action = (name) => `[data-publication-action="${name}"]`;
const chrome = [process.env.CHROME_BIN, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome']
  .find((path) => path && existsSync(path));
if (!chrome) throw new Error('Indica CHROME_BIN con la ruta de Chrome.');
const output = resolve(process.env.OUTPUT_DIR ?? 'tmp/market-publication-demo');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'ecom-market-publication-'));
const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking',
  '--disable-component-update', '--disable-sync', '--no-first-run', '--no-default-browser-check', '--no-proxy-server',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
let id = 0;
const pending = new Map();
const requests = [];
const blockedRequests = [];
const errors = [];
const checks = [];
const screenshots = [];
const storageEvidence = [];
const storageEvents = [];
const moduleSessions = new Set();
const documentResponses = new Map();
const startedAt = new Date().toISOString();
let failure = null;

const requestReason = ({ url, method }) => {
  const parsed = new URL(url);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) return 'mutation';
  if (/cloudflareinsights|\/cdn-cgi\/rum/u.test(url)) return 'analytics';
  if (parsed.origin !== baseUrl.origin) return 'external';
  if (parsed.pathname === '/api' || parsed.pathname.startsWith('/api/')) return 'api';
  return null;
};
const diagnosticRequest = ({ url, method, reason }) => {
  const parsed = new URL(url);
  return { origin: parsed.origin, pathname: parsed.pathname, method, ...(reason ? { reason } : {}) };
};
const forbiddenRequests = () => requests.filter((request) => requestReason(request));

// La guía compartida conserva su propio sessionStorage. El contador del módulo
// se pone a cero DESPUÉS del acceso guiado/cierre, sin alterar los datos guardados.
const INSTRUMENT = `(() => {
  const audit = { documentEpoch: crypto.randomUUID(), storageWrites: [], timers: [], sharedFrameLocation: null, moduleActive: false, beacons: 0, windows: 0 };
  Object.defineProperty(window, '__marketPublicationAudit', { value: audit });
  for (const name of ['setItem', 'removeItem', 'clear']) {
    const original = Storage.prototype[name];
    Storage.prototype[name] = function(...args) {
      audit.storageWrites.push({ method: name, key: name === 'clear' ? null : String(args[0]) });
      if (!audit.moduleActive) return original.apply(this, args);
    };
  }
  for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame', 'requestIdleCallback']) {
    if (typeof window[name] !== 'function') continue;
    const original = window[name];
    window[name] = function(...args) {
      const caller = (new Error().stack ?? '').split('\\n')[2]?.trim() ?? '';
      audit.timers.push({ name, caller });
      const shared = name === 'requestAnimationFrame' && audit.sharedFrameLocation !== null &&
        caller.endsWith('(' + audit.sharedFrameLocation + ')');
      return audit.moduleActive && !shared ? -1 : original.apply(this, args);
    };
  }
  navigator.sendBeacon = () => { audit.beacons++; return false; };
  window.open = () => { audit.windows++; return null; };
})()`;

try {
  const endpoint = await new Promise((resolveEndpoint, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error('Chrome no arrancó en 15 segundos.')), 15000);
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/u);
      if (match) { clearTimeout(timer); resolveEndpoint(match[1]); }
    });
    child.on('error', reject);
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome terminó con ${code}.`)); });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolveOpen, reject) => { socket.addEventListener('open', resolveOpen); socket.addEventListener('error', reject); });
  const send = (method, params = {}, sessionId) => new Promise((resolveCall, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP no respondió: ${method}`)); }, 15000);
    pending.set(requestId, { resolve: resolveCall, reject, timer });
    socket.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Network.requestWillBeSent') {
      const { url, method } = message.params.request;
      if (/^https?:/u.test(url)) requests.push({ url, method, sessionId: message.sessionId });
    }
    if (message.method === 'Network.responseReceived' && message.params.type === 'Document' &&
      new URL(message.params.response.url).pathname === PATH) {
      documentResponses.set(message.sessionId, message.params.requestId);
    }
    if (message.method === 'Fetch.requestPaused') {
      const { request, requestId } = message.params;
      const reason = requestReason(request) ?? (moduleSessions.has(message.sessionId) ? 'module_io' : null);
      if (reason) blockedRequests.push({ url: request.url, method: request.method, reason });
      void send(reason ? 'Fetch.failRequest' : 'Fetch.continueRequest',
        reason ? { requestId, errorReason: 'BlockedByClient' } : { requestId }, message.sessionId)
        .catch((error) => errors.push(error.message));
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push('console.error');
    if (/^DOMStorage\.domStorage(?:ItemAdded|ItemUpdated|ItemRemoved|ItemsCleared)$/u.test(message.method ?? '')) {
      storageEvents.push({ sessionId: message.sessionId, event: message.method });
    }
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    clearTimeout(task.timer);
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  });
  const check = (label, condition) => { assert.ok(condition, label); checks.push(label); };

  for (const width of [1440, 375]) {
    const { browserContextId } = await send('Target.createBrowserContext');
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params = {}) => send(method, params, sessionId);
    const evaluate = async (expression) => {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async (expression, label) => {
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline) {
        if (await evaluate(expression)) return;
        await delay(75);
      }
      throw new Error(`${width}: ${label}`);
    };
    const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const select = (selector, value) => evaluate(`(() => {
      const field = document.querySelector(${JSON.stringify(selector)});
      if (!Array.from(field.options).some(option => option.value === ${JSON.stringify(value)})) throw new Error('Opción no disponible: ' + ${JSON.stringify(value)});
      field.value = ${JSON.stringify(value)};
      field.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    const key = async (name, code, keyCode) => {
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode: keyCode,
        ...(name === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: keyCode });
    };
    const storage = () => evaluate(`JSON.stringify([localStorage, sessionStorage].map(storage => Object.keys(storage).sort().map(key => [key, storage.getItem(key)])))`);
    const sharedFrameLocation = async () => {
      const requestId = documentResponses.get(sessionId);
      assert.ok(requestId, 'No se identificó el HTML recibido.');
      const response = await call('Network.getResponseBody', { requestId });
      const html = response.base64Encoded ? Buffer.from(response.body, 'base64').toString('utf8') : response.body;
      const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gu)]
        .filter(match => match[1].trim() === sharedContactScript);
      assert.equal(scripts.length, 1, 'El HTML debe contener exactamente el script compartido revisado.');
      const script = scripts[0];
      const localOffset = script[0].indexOf(sharedFrameExpression);
      assert.ok(localOffset >= 0 && script[0].lastIndexOf(sharedFrameExpression) === localOffset,
        'Debe existir un único caller rAF de layout compartido.');
      const offset = script.index + localOffset;
      const line = html.slice(0, offset).split('\n').length;
      const column = offset - html.lastIndexOf('\n', offset - 1);
      return `${BASE}${PATH}:${line}:${column}`;
    };
    const catalog = () => evaluate(`Array.from(document.querySelectorAll('[data-publication-catalog-product]')).map(product => ({
      productId: product.dataset.productId,
      variantIds: Array.from(product.querySelectorAll('[data-publication-catalog-variant]')).map(variant => variant.dataset.variantId).sort()
    })).sort((left, right) => Number(left.productId) - Number(right.productId))`);
    const rows = () => evaluate(`Array.from(document.querySelectorAll('[data-publication-variant-row]')).map(row => ({
      productId: row.dataset.productId, variantId: row.dataset.variantId, status: row.dataset.status,
      visible: row.dataset.visible, selected: row.dataset.appliedSelected,
      reasons: Array.from(row.querySelectorAll('[data-publication-reason]')).map(reason => reason.dataset.reason)
    }))`);
    const detail = () => evaluate(`(() => {
      const detail = document.querySelector('[data-publication-detail]');
      return { productId: detail.dataset.productId ?? null, variantId: detail.dataset.variantId ?? null,
        visible: detail.dataset.visible ?? null };
    })()`);
    const state = () => evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(ROOT)});
      return {
        publication: root.querySelector('[data-publication-mode]:checked').value,
        variantIds: Array.from(root.querySelectorAll('[data-publication-variant]:checked')).map(input => input.value).sort(),
        dirty: root.querySelector('[data-publication-editor]').dataset.dirty,
        applied: root.querySelector('[data-publication-policy-state]').dataset.state,
        applyDisabled: root.querySelector(${JSON.stringify(action('apply'))}).disabled
      };
    })()`);
    const checked = (variantId, value) => evaluate(`(() => {
      const checkbox = document.querySelector('[data-publication-variant][value="' + ${JSON.stringify(String(variantId))} + '"]');
      if (checkbox.checked !== ${value}) checkbox.click();
    })()`);
    const mode = (value) => click(`[data-publication-mode][value="${value}"]`);
    const context = async (marketId, channel, productId) => {
      await select('[data-publication-market]', marketId);
      await select('[data-publication-channel]', channel);
      await select('[data-publication-product]', productId);
    };
    const safety = async (stage) => {
      check(`${width} ${stage}: sin solicitudes operativas ni navegación externa`, forbiddenRequests().length === 0 && blockedRequests.length === 0);
      check(`${width} ${stage}: ejemplo sin forms, envíos ni enlaces de compra`, await evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(ROOT)});
        return !root.querySelector('form') && !root.querySelector('[data-publication-catalog] a[href]') &&
          Array.from(root.querySelectorAll('button')).every(button => button.type === 'button') &&
          Array.from(root.querySelectorAll('a[href]')).every(link => !new URL(link.href).hostname.endsWith('.test'));
      })()`));
      check(`${width} ${stage}: sin overflow horizontal`, await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
    };
    const snapshot = async (name) => {
      await evaluate('window.scrollTo(0, 0)');
      const { cssContentSize } = await call('Page.getLayoutMetrics');
      const file = `${name}-${width}.png`;
      const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height: Math.min(cssContentSize.height, 10000), scale: 1 } });
      await writeFile(join(output, file), Buffer.from(data, 'base64'));
      screenshots.push(file);
    };

    await call('Network.enable');
    await call('Page.enable');
    await call('Runtime.enable');
    await call('DOMStorage.enable');
    await call('Fetch.enable', { patterns: [{ urlPattern: 'http://*', requestStage: 'Request' }, { urlPattern: 'https://*', requestStage: 'Request' }] });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });
    await call('Emulation.setDeviceMetricsOverride', { width, height: width === 375 ? 812 : 900, deviceScaleFactor: 1, mobile: width === 375 });
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await call('Page.navigate', { url: `${BASE}/demo/admin/login?tour=1&next=${encodeURIComponent(PATH)}` });
    const ready = `location.pathname === ${JSON.stringify(PATH)} && document.readyState === 'complete' && document.querySelector(${JSON.stringify(ROOT)})?.dataset.ready === 'true'`;
    await wait(ready, 'muestra inicializada');
    await evaluate(`document.querySelector('[data-guide-close]')?.click()`);
    const initialStorage = await storage();
    const setupWriteLog = await evaluate('window.__marketPublicationAudit.storageWrites');
    const setupStorageWrites = setupWriteLog.length;
    check(`${width}: escrituras iniciales pertenecen solo a la guía`, setupWriteLog.every(write => write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    await evaluate('window.__marketPublicationAudit.storageWrites.length = 0');
    const setupStorageEvents = storageEvents.filter((event) => event.sessionId === sessionId).length;
    const setupAudit = await evaluate('window.__marketPublicationAudit');
    const sharedLocation = await sharedFrameLocation();
    await evaluate(`window.__marketPublicationAudit.sharedFrameLocation = ${JSON.stringify(sharedLocation)}`);
    check(`${width}: arranque solo con rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, setupAudit.timers.every(timer => sharedTimer(timer, sharedLocation)) && setupAudit.beacons === 0 && setupAudit.windows === 0);
    const initial = await state();
    const initialDetail = await detail();
    const baseline = await catalog();
    check(`${width}: dos mercados, dos canales y tres productos independientes`, await evaluate(`
      document.querySelector('[data-publication-market]').options.length === 2 &&
      document.querySelector('[data-publication-channel]').options.length === 2 &&
      document.querySelector('[data-publication-product]').options.length === 3`));
    check(`${width}: catálogo inicial muestra Azul y Natural, nunca default Arena`, JSON.stringify(baseline) === JSON.stringify([
      { productId: '1', variantIds: ['12'] }, { productId: '2', variantIds: ['21'] }]));
    check(`${width}: detalle inicial corresponde a Azul visible`, initialDetail.productId === '1' && initialDetail.variantId === '12' && initialDetail.visible === 'true');
    check(`${width}: identidad visible del detalle contiene la referencia de Azul`, await evaluate(`document.querySelector('[data-publication-detail-name]').textContent.includes('Azul') && document.querySelector('[data-publication-detail-sku]').textContent.includes('DEMO-CUENCO-AZUL')`));
    check(`${width}: selección aplicada conserva borrador y archivada sin hacerlas visibles`, initial.publication === 'published' && initial.dirty === 'false' && JSON.stringify(initial.variantIds) === JSON.stringify(['12', '13', '14']) &&
      (await rows()).some(row => row.variantId === '13' && row.status === 'draft' && row.selected === 'true' && row.visible === 'false' && row.reasons.includes('variant_draft')) &&
      (await rows()).some(row => row.variantId === '14' && row.status === 'archived' && row.selected === 'true' && row.visible === 'false' && row.reasons.includes('variant_archived')));
    await safety('inicio');
    await snapshot('inicio');
    const setupRequests = requests.filter((request) => request.sessionId === sessionId).length;
    moduleSessions.add(sessionId);
    await evaluate('window.__marketPublicationAudit.moduleActive = true');

    await select('[data-publication-market]', 'FR');
    check(`${width}: Francia sin publicación visible conserva catálogo vacío`, (await catalog()).length === 0 && (await state()).applied === 'unpublished');
    check(`${width}: otro mercado no reutiliza la visibilidad del detalle`, (await detail()).variantId === '12' && (await detail()).visible === 'false');
    await safety('fr-vacío');
    await snapshot('fr-vacio');

    await click(action('reset'));
    const arenaSelector = '[data-publication-variant][value="11"]';
    await evaluate(`document.querySelector(${JSON.stringify(arenaSelector)}).focus()`);
    await key(' ', 'Space', 32);
    check(`${width}: Espacio cambia la selección local conservando foco`, (await state()).variantIds.includes('11') && (await state()).dirty === 'true' && await evaluate(`document.activeElement.matches(${JSON.stringify(arenaSelector)})`));
    check(`${width}: editar mantiene el catálogo y la selección aplicada anteriores`, JSON.stringify(await catalog()) === JSON.stringify(baseline) && (await rows()).find(row => row.variantId === '11').selected === 'false');
    await key('Tab', 'Tab', 9);
    check(`${width}: Tab avanza a la siguiente variante sin perder el control`, await evaluate(`document.activeElement.matches('[data-publication-variant][value="12"]')`));
    await evaluate(`document.querySelector(${JSON.stringify(action('apply'))}).focus()`);
    await key('Enter', 'Enter', 13);
    const applied = await catalog();
    check(`${width}: Enter aplica únicamente el ejemplo y muestra Arena más Azul`, JSON.stringify(applied) === JSON.stringify([
      { productId: '1', variantIds: ['11', '12'] }, { productId: '2', variantIds: ['21'] }]) && (await state()).dirty === 'false');
    check(`${width}: aplicada la selección, draft y archived siguen excluidas`, (await rows()).filter(row => ['13', '14'].includes(row.variantId)).every(row => row.visible === 'false'));
    await safety('aplicado');
    await snapshot('aplicado');

    await click(action('reset'));
    await select('[data-publication-detail-variant]', '11');
    check(`${width}: detalle de Arena queda excluido sin sustituirlo por Azul`, (await detail()).productId === '1' && (await detail()).variantId === '11' && (await detail()).visible === 'false' && JSON.stringify(await catalog()) === JSON.stringify(baseline));
    check(`${width}: detalle excluido conserva nombre y referencia de Arena`, await evaluate(`document.querySelector('[data-publication-detail-name]').textContent.includes('Arena') && document.querySelector('[data-publication-detail-sku]').textContent.includes('DEMO-CUENCO-ARENA')`));
    await safety('variante-excluida');
    await snapshot('variante-excluida');
    for (const variantId of ['13', '14']) {
      await select('[data-publication-detail-variant]', variantId);
      check(`${width}: detalle conserva la identidad excluida ${variantId}`, (await detail()).variantId === variantId && (await detail()).visible === 'false');
    }
    await select('[data-publication-product]', '3');
    check(`${width}: cambiar producto limpia el detalle explícito`, (await detail()).variantId === null && (await detail()).productId === null && await evaluate(`document.querySelector('[data-publication-detail-variant]').value === ''`));
    check(`${width}: producto distinto elimina también nombre y referencia anteriores`, await evaluate(`document.querySelector('[data-publication-detail-name]').textContent === '' && document.querySelector('[data-publication-detail-sku]').textContent === ''`));
    check(`${width}: producto inactivo bloquea también su variante activa seleccionada`, (await rows()).some(row => row.variantId === '31' && row.status === 'active' && row.selected === 'true' && row.visible === 'false' && row.reasons.includes('product_inactive')));
    await select('[data-publication-detail-variant]', '31');
    check(`${width}: detalle de producto inactivo sigue excluido`, (await detail()).productId === '3' && (await detail()).variantId === '31' && (await detail()).visible === 'false');
    await select('[data-publication-product]', '2');
    check(`${width}: el segundo cambio de producto tampoco infiere variante default`, (await detail()).variantId === null && (await detail()).productId === null);
    await select('[data-publication-detail-variant]', '22');
    check(`${width}: detalle de Negra no seleccionada no cae en Natural`, (await detail()).variantId === '22' && (await detail()).visible === 'false');

    await click(action('reset'));
    for (const variantId of ['12', '13', '14']) await checked(variantId, false);
    check(`${width}: published sin variantes bloquea aplicación`, (await state()).publication === 'published' && (await state()).variantIds.length === 0 && (await state()).applyDisabled);
    check(`${width}: selección vacía muestra un aviso visible`, await evaluate(`(() => {
      const message = document.querySelector('[data-publication-validation]');
      return !message.hidden && message.textContent.trim().length > 0 && message.getBoundingClientRect().height > 0;
    })()`));
    check(`${width}: configuración incompleta conserva catálogo y detalle aplicados`, JSON.stringify(await catalog()) === JSON.stringify(baseline) && (await detail()).variantId === '12' && (await detail()).visible === 'true');
    await mode('unpublished');
    await click(action('apply'));
    check(`${width}: despublicar explícitamente solo retira el producto elegido`, (await state()).applied === 'unpublished' && JSON.stringify(await catalog()) === JSON.stringify([{ productId: '2', variantIds: ['21'] }]));
    await mode('unconfigured');
    await click(action('apply'));
    check(`${width}: sin configurar se diferencia de despublicado y no concede visibilidad`, (await state()).applied === 'unconfigured' && (await state()).dirty === 'false' && JSON.stringify(await catalog()) === JSON.stringify([{ productId: '2', variantIds: ['21'] }]));

    await click(action('reset'));
    const buffers = [];
    for (const [marketIndex, marketId] of MARKETS.entries()) {
      for (const [channelIndex, channel] of CHANNELS.entries()) {
        for (const productId of PRODUCTS) {
          await context(marketId, channel, productId);
          const initialBuffer = await state();
          const initialCatalog = await catalog();
          const position = marketIndex * 2 + channelIndex;
          await mode('published');
          for (const variantId of (await state()).variantIds) await checked(variantId, false);
          if (position === 1) await checked(String(Number(productId) * 10 + 1), true);
          if (position === 2) await mode('unpublished');
          if (position === 3) await mode('unconfigured');
          buffers.push({ marketId, channel, productId, initialBuffer, initialCatalog, buffer: await state() });
          check(`${width}: editar ${marketId}/${channel}/${productId} conserva resultados aplicados`, JSON.stringify(await catalog()) === JSON.stringify(initialCatalog));
        }
      }
    }
    check(`${width}: doce buffers de configuración recorridos`, buffers.length === 12);
    for (const saved of buffers) {
      await context(saved.marketId, saved.channel, saved.productId);
      check(`${width}: buffer independiente ${saved.marketId}/${saved.channel}/${saved.productId}`, JSON.stringify(await state()) === JSON.stringify(saved.buffer) && JSON.stringify(await catalog()) === JSON.stringify(saved.initialCatalog));
    }
    await context('ES', 'storefront', '1');
    await checked('11', true);
    await click(action('apply'));
    check(`${width}: aplicar una tupla no publica variantes no seleccionadas`, JSON.stringify(await catalog()) === JSON.stringify([
      { productId: '1', variantIds: ['11'] }, { productId: '2', variantIds: ['21'] }]));
    await context('FR', 'storefront', '1');
    const independent = buffers.find(saved => saved.marketId === 'FR' && saved.channel === 'storefront' && saved.productId === '1');
    check(`${width}: aplicar ES no modifica el buffer ni la publicación de FR`, JSON.stringify(await state()) === JSON.stringify(independent.buffer) && JSON.stringify(await catalog()) === JSON.stringify(independent.initialCatalog));
    await click(action('reset'));
    for (const saved of buffers) {
      await context(saved.marketId, saved.channel, saved.productId);
      check(`${width}: reset restaura buffer ${saved.marketId}/${saved.channel}/${saved.productId}`, JSON.stringify(await state()) === JSON.stringify(saved.initialBuffer) && JSON.stringify(await catalog()) === JSON.stringify(saved.initialCatalog));
    }
    await click(action('reset'));
    check(`${width}: reset restaura también selección y detalle iniciales`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await detail()) === JSON.stringify(initialDetail) && JSON.stringify(await catalog()) === JSON.stringify(baseline));
    await checked('11', true);
    await click(action('apply'));
    const finalAudit = await evaluate('window.__marketPublicationAudit');
    const moduleStorageEvents = storageEvents.filter(event => event.sessionId === sessionId).length - setupStorageEvents;
    const moduleRequests = requests.filter(request => request.sessionId === sessionId).length - setupRequests;
    const moduleTimers = finalAudit.timers.filter(timer => !sharedTimer(timer, sharedLocation));
    check(`${width}: ningún intento de escritura ni mutación de almacenamiento`, finalAudit.storageWrites.length === 0 && moduleStorageEvents === 0 && await storage() === initialStorage);
    check(`${width}: sin temporizadores del módulo, beacon ni ventanas durante todo el recorrido`, moduleTimers.length === 0 && finalAudit.beacons === 0 && finalAudit.windows === 0);
    check(`${width}: cero solicitudes HTTP durante las interacciones`, moduleRequests === 0 && blockedRequests.length === 0);
    storageEvidence.push({ width, setupGuideWrites: setupStorageWrites, moduleWrites: finalAudit.storageWrites.length,
      moduleMutationEvents: moduleStorageEvents, moduleRequests, timers: moduleTimers.length, beacons: finalAudit.beacons,
      windows: finalAudit.windows, unchanged: true,
      sharedLayout: { source: 'src/components/WhatsAppContact.astro', api: 'requestAnimationFrame',
        verifiedCallsite: sharedLocation, setupCalls: setupAudit.timers.length, totalCalls: finalAudit.timers.length } });
    moduleSessions.delete(sessionId);
    const previousDocumentEpoch = finalAudit.documentEpoch;
    await call('Page.reload', { ignoreCache: true });
    await wait(`(${ready}) && window.__marketPublicationAudit?.documentEpoch !== ${JSON.stringify(previousDocumentEpoch)}`, 'recarga limpia en otro documento');
    const reloadedAudit = await evaluate('window.__marketPublicationAudit');
    const reloadedSharedLocation = await sharedFrameLocation();
    check(`${width}: recarga solo permite rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, reloadedAudit.timers.every(timer => sharedTimer(timer, reloadedSharedLocation)) && reloadedAudit.beacons === 0 && reloadedAudit.windows === 0);
    check(`${width}: nuevas escrituras de arranque pertenecen solo a la guía`, reloadedAudit.storageWrites.every(write => write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    check(`${width}: recarga descarta simulación y restaura detalle`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await detail()) === JSON.stringify(initialDetail) && JSON.stringify(await catalog()) === JSON.stringify(baseline));
    check(`${width}: recarga conserva el almacenamiento anterior`, await storage() === initialStorage);
    storageEvidence.at(-1).reloadGuideWrites = reloadedAudit.storageWrites.length;
    storageEvidence.at(-1).sharedLayout.reloadCalls = reloadedAudit.timers.length;

    await call('Emulation.setScriptExecutionDisabled', { value: true });
    await call('Page.reload', { ignoreCache: true });
    await wait(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(ROOT)}) && document.querySelector(${JSON.stringify(ROOT)}).dataset.ready !== 'true' && window.__marketPublicationAudit?.documentEpoch !== ${JSON.stringify(reloadedAudit.documentEpoch)}`, 'vista sin JavaScript en otro documento');
    check(`${width}: sin JavaScript conserva catálogo y aviso`, JSON.stringify(await catalog()) === JSON.stringify(baseline) && await evaluate(`Array.from(document.querySelectorAll('noscript')).some(node => /JavaScript/u.test(node.textContent))`));
    check(`${width}: sin JavaScript los controles permanecen inertes`, await evaluate(`Array.from(document.querySelector(${JSON.stringify(ROOT)}).querySelectorAll('button,input,select,textarea')).every(control => control.disabled && (control.tagName !== 'BUTTON' || control.type === 'button'))`));
    await safety('sin-js');
    await send('Target.disposeBrowserContext', { browserContextId });
  }
  check('ocho capturas comparables de cuatro estados', screenshots.length === 8);
  check('sin excepciones ni console.error', errors.length === 0);
} catch (error) {
  failure = error instanceof Error ? error.message : 'Fallo de auditoría';
  process.exitCode = 1;
} finally {
  await writeFile(join(output, 'report.json'), JSON.stringify({
    schemaVersion: 1, startedAt, completedAt: new Date().toISOString(),
    scope: 'local-fixture-only', path: PATH, viewports: [1440, 375],
    runner: 'node scripts/test-market-publication-demo.mjs', nodeVersion: process.version,
    result: failure === null ? 'passed' : 'failed', checksPassed: checks.length,
    checks, failure, screenshots, requestCount: requests.length,
    blockedRequests: blockedRequests.map(diagnosticRequest),
    forbiddenRequests: forbiddenRequests().map(diagnosticRequest), storageEvidence, errors,
  }, null, 2) + '\n');
  for (const task of pending.values()) clearTimeout(task.timer);
  socket?.close();
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise((resolveExit) => { child.once('exit', resolveExit); child.kill(); });
  }
  await rm(profile, { recursive: true, force: true });
  process.stdout.write(`${checks.length} comprobaciones correctas${failure ? `; fallo: ${failure}` : ''}; informe en ${output}/report.json\n`);
}

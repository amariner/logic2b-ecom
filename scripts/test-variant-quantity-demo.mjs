/**
 * R6.3b: mínimos, múltiplos y cajas de fixtures en Chrome/CDP.
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
const PATH = '/demo/admin/cantidades';
const ROOT = '[data-quantity-demo]';
const MARKET = '[data-quantity-market]';
const VARIANT = '[data-quantity-variant]';
const COUNT = '[data-quantity-count]';
const MARKETS = ['ES', 'FR'];
const VARIANTS = [11, 12, 21];
const COUNTS = { 11: [0, 2, 4, 5, 8, 12, 16, 17, 19, 20], 12: [0, 1, 2, 3, 4], 21: [0, 1, 2] };
const INITIAL_COUNTS = { 11: 8, 12: 2, 21: 1 };
const INITIAL = { marketId: 'ES', variantId: 11, requestedCount: 8 };
const IDENTITIES = { 11: { label: 'Natural', sku: 'DEMO-CER-N' }, 12: { label: 'Azul', sku: 'DEMO-CER-A' },
  21: { label: 'Único', sku: 'DEMO-SOP-U' } };
const PRIVATE_TOKENS = ['demo.variant-quantity', 'company.workshop'];
// Oráculo independiente: literales de fixtures, sin importar el modelo ni el motor.
function expectedQuantity({ marketId, variantId, requestedCount }) {
  const known = variantId !== 21;
  const rule = !known ? null : variantId === 11
    ? { orderUnit: 'unit', unitsPerBox: 1, min: 5, max: 17, multiple: 4 }
    : { orderUnit: 'box', unitsPerBox: 6, min: 6, max: 18, multiple: 4 };
  const quantityUnits = rule ? requestedCount * rule.unitsPerBox : null;
  const quantityReasons = [];
  if (!rule) quantityReasons.push('unconfigured');
  else {
    if (quantityUnits < rule.min) quantityReasons.push('below_minimum');
    if (quantityUnits > rule.max) quantityReasons.push('above_maximum');
    if (quantityUnits % rule.multiple !== 0) quantityReasons.push('not_multiple');
  }
  const visible = marketId === 'ES' || variantId !== 11;
  return { productId: variantId === 21 ? 2 : 1, variantId, requestedCount, quantityUnits, rule, visible,
    quantityOutcome: quantityReasons.length === 0 ? 'satisfied' : 'blocked', quantityReasons,
    outcome: quantityReasons.length === 0 && visible ? 'satisfied' : 'blocked',
    reasons: [...quantityReasons, ...(visible ? [] : ['variant_not_visible'])] };
}
const GUIDE_STORAGE_KEY = 'logic2b:ecom-guide:v1';
// El shell existente posiciona WhatsApp con rAF al observar layout/scroll.
// Solo se permite su caller exacto, derivado del HTML y de esta fuente local.
const sharedContactSource = await readFile(new URL('../src/components/WhatsAppContact.astro', import.meta.url), 'utf8');
const sharedContactScript = sharedContactSource.match(/<script is:inline>([\s\S]*?)<\/script>/u)?.[1]?.trim();
assert.ok(sharedContactScript, 'Falta el script compartido de layout conocido.');
const sharedFrameExpression = 'requestAnimationFrame(update)';
const sharedTimer = (timer, location) => timer.name === 'requestAnimationFrame' && timer.caller.endsWith(`(${location})`);
const action = (name) => `[data-quantity-action="${name}"]`;
const chrome = [process.env.CHROME_BIN, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome']
  .find((path) => path && existsSync(path));
if (!chrome) throw new Error('Indica CHROME_BIN con la ruta de Chrome.');
const output = resolve(process.env.OUTPUT_DIR ?? 'tmp/variant-quantity-demo');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'ecom-variant-quantity-'));
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
const matrixEvidence = [];
const storageEvidence = [];
const storageEvents = [];
const moduleSessions = new Set();
const guideSessions = new Set();
const documentResponses = new Map();
const documentHeaders = new Map();
const privacyEvidence = [];
const hitTestFailures = [];
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
const privateHeaders = (entries) => {
  const headers = new Headers(entries);
  return { cacheControl: headers.get('cache-control'), vary: headers.get('vary'),
    robots: headers.get('x-robots-tag') };
};
const privateNoindex = (headers) => {
  const cache = (headers.cacheControl ?? '').toLowerCase().split(',').map(value => value.trim());
  const vary = (headers.vary ?? '').toLowerCase().split(',').map(value => value.trim());
  return cache.includes('private') && cache.includes('no-store') && (vary.includes('cookie') || vary.includes('*'))
    && /(?:^|[,\s])noindex(?:$|[,\s])/u.test(headers.robots ?? '');
};

// La guía compartida conserva su propio sessionStorage. El contador del módulo
// se pone a cero DESPUÉS del acceso guiado/cierre, sin alterar los datos guardados.
const INSTRUMENT = `(() => {
  const audit = { documentEpoch: crypto.randomUUID(), storageWrites: [], timers: [], sharedFrameLocation: null, moduleActive: false, guideInteraction: false, beacons: 0, windows: 0 };
  Object.defineProperty(window, '__variantQuantityAudit', { value: audit });
  for (const name of ['setItem', 'removeItem', 'clear']) {
    const original = Storage.prototype[name];
    Storage.prototype[name] = function(...args) {
      const key = name === 'clear' ? null : String(args[0]);
      const storage = this === sessionStorage ? 'session' : 'local';
      audit.storageWrites.push({ method: name, key, storage,
        phase: audit.guideInteraction ? 'guide' : audit.moduleActive ? 'module' : 'setup' });
      const allowedGuide = audit.guideInteraction && storage === 'session' && name === 'setItem' &&
        key === ${JSON.stringify(GUIDE_STORAGE_KEY)};
      if (!audit.moduleActive || allowedGuide) return original.apply(this, args);
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
      documentHeaders.set(message.sessionId, { status: message.params.response.status,
        ...privateHeaders(message.params.response.headers) });
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
      storageEvents.push({ sessionId: message.sessionId, event: message.method,
        phase: guideSessions.has(message.sessionId) ? 'guide' : 'module',
        key: message.params.key ?? null, local: message.params.storageId.isLocalStorage });
    }
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    clearTimeout(task.timer);
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  });
  const check = (label, condition) => { assert.ok(condition, label); checks.push(label); };

  for (const method of ['GET', 'HEAD']) {
    const response = await fetch(`${BASE}${PATH}`, { method, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const location = new URL(response.headers.get('location') ?? '', BASE);
    const headers = privateHeaders(response.headers);
    check(`anónimo ${method}: redirección local a login`, response.status === 302
      && location.origin === BASE && location.pathname === '/demo/admin/login');
    check(`anónimo ${method}: privado, no-store, Vary Cookie y noindex`, privateNoindex(headers));
    if (method === 'HEAD') check('anónimo HEAD: cuerpo vacío', (await response.text()) === '');
    else await response.body?.cancel();
    privacyEvidence.push({ context: 'anonymous', method, status: response.status, location: location.pathname, ...headers });
  }

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
    const select = (selector, value) => evaluate(`(() => {
      const field = document.querySelector(${JSON.stringify(selector)});
      if (field.disabled) throw new Error('No se puede interactuar con un selector desactivado.');
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
    const view = () => evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(ROOT)});
      const text = node => node.textContent.replace(/\\s+/gu, ' ').trim();
      const result = root.querySelector('[data-quantity-result]');
      const quantity = root.querySelector('[data-quantity-check]');
      const visibility = root.querySelector('[data-quantity-visibility]');
      const units = root.querySelector('[data-quantity-units]');
      const requested = root.querySelector('[data-quantity-requested-count]');
      const rule = root.querySelector('[data-quantity-rule]');
      const reasons = selector => Array.from(root.querySelectorAll(selector)).map(item => ({ code: item.dataset.reason, text: text(item) }));
      return { productId: Number(result.dataset.productId), variantId: Number(result.dataset.variantId),
        selectedLabel: text(root.querySelector('[data-quantity-selected-label]')),
        selectedSku: text(root.querySelector('[data-quantity-selected-sku]')),
        outcome: result.dataset.outcome, quantityOutcome: quantity.dataset.outcome, visible: visibility.dataset.visible,
        count: requested.getAttribute('data-count'), countText: text(requested),
        units: units.getAttribute('data-units'), unitsText: text(units),
        rule: Object.fromEntries(['order-unit', 'units-per-box', 'min', 'max', 'multiple'].map(name => [name, rule.getAttribute('data-' + name)])),
        ruleValues: ['order-unit', 'factor', 'range', 'multiple'].map(name => text(root.querySelector('[data-quantity-' + name + ']'))),
        conversion: text(root.querySelector('[data-quantity-conversion]')),
        ruleText: text(rule), requestedLabel: text(root.querySelector('[data-quantity-count-label]')),
        quantityReasons: reasons('[data-quantity-reason]'), visibilityReasons: reasons('[data-quantity-visibility-reason]'),
        reasons: reasons('[data-quantity-final-reason]') };
    })()`);
    const state = () => evaluate(`({
      marketId: document.querySelector(${JSON.stringify(MARKET)}).value,
      variantId: Number(document.querySelector(${JSON.stringify(VARIANT)}).value),
      requestedCount: Number(document.querySelector(${JSON.stringify(COUNT)}).value)
    })`);
    const visibleSelectArrows = async (label) => {
      const hits = await evaluate(`(() => {
        const header = document.querySelector('[data-admin-shell] > header');
        const headerBottom = header && getComputedStyle(header).display !== 'none' ? header.getBoundingClientRect().bottom : 0;
        return Array.from(document.querySelector(${JSON.stringify(ROOT)}).querySelectorAll('select')).flatMap(field => {
          const rect = field.getBoundingClientRect();
          if (field.disabled || rect.width === 0 || rect.top < Math.max(0, headerBottom) || rect.bottom > innerHeight) return [];
          const hit = document.elementFromPoint(rect.right - 16, rect.top + rect.height / 2);
          const bounds = element => element ? { tag: element.tagName, id: element.id,
            class: element.className, rect: element.getBoundingClientRect().toJSON() } : null;
          return [{ id: field.id, reachable: hit === field || field.contains(hit),
            point: { x: rect.right - 16, y: rect.top + rect.height / 2 }, rect: rect.toJSON(),
            scrollY, viewport: { width: innerWidth, height: innerHeight }, header: bounds(header),
            hit: bounds(hit), headerLauncher: bounds(document.querySelector('[data-admin-guide-launch]')),
            floatingLauncher: bounds(document.querySelector('[data-guide-launch]')) }];
        });
      })()`);
      if (hits.some(hit => !hit.reachable)) hitTestFailures.push({ width, label, hits });
      check(`${width} ${label}: flechas de selectores visibles sin superposición`, hits.every(hit => hit.reachable));
      return hits;
    };
    const safety = async (stage) => {
      check(`${width} ${stage}: sin solicitudes operativas ni navegación externa`, forbiddenRequests().length === 0 && blockedRequests.length === 0);
      check(`${width} ${stage}: controles de fixture sin formularios, inputs libres ni importes`, await evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(ROOT)});
        return !root.querySelector('form,input,textarea,[data-total],[data-cents],[data-price],[data-stock]') &&
          Array.from(root.querySelectorAll('button')).every(button => button.type === 'button') &&
          Array.from(root.querySelectorAll('a[href]')).every(link => !new URL(link.href).hostname.endsWith('.test'));
      })()`));
      check(`${width} ${stage}: no expone claves, referencias internas, precios ni metadata de default`, await evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(ROOT)});
        return !/[a-f0-9]{64}|companyKeyHash|data-is-default|data-default-variant|priceCents|[€$]/u.test(root.outerHTML) &&
          ${JSON.stringify(PRIVATE_TOKENS)}.every(value => !root.outerHTML.includes(value));
      })()`));
      check(`${width} ${stage}: sin overflow horizontal`, await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
      await visibleSelectArrows(stage);
    };
    const verify = async (selection) => {
      const label = `${width} ${selection.marketId}/${selection.variantId}/${selection.requestedCount}`;
      const expected = expectedQuantity(selection);
      const actual = await view();
      check(`${label}: conserva variante y count sin ajuste implícito`, JSON.stringify(await state()) === JSON.stringify(selection));
      check(`${label}: identidad explícita y resultado final correcto`, actual.productId === expected.productId && actual.variantId === selection.variantId && actual.outcome === expected.outcome);
      check(`${label}: etiqueta y SKU cambian con la variante explícita`, actual.selectedLabel === IDENTITIES[selection.variantId].label && actual.selectedSku === IDENTITIES[selection.variantId].sku);
      check(`${label}: diagnóstico de cantidad y visibilidad separados`, actual.quantityOutcome === expected.quantityOutcome && actual.visible === String(expected.visible));
      check(`${label}: motivos de cantidad completos y legibles`, JSON.stringify(actual.quantityReasons.map(reason => reason.code)) === JSON.stringify(expected.quantityReasons) && actual.quantityReasons.every(reason => reason.text.length > 0));
      check(`${label}: motivos finales completos sin ocultar cantidad`, JSON.stringify(actual.reasons.map(reason => reason.code)) === JSON.stringify(expected.reasons) && actual.reasons.every(reason => reason.text.length > 0));
      check(`${label}: motivos de visibilidad presentes solo cuando está oculta`, expected.visible ? actual.visibilityReasons.length === 0
        : actual.visibilityReasons.length > 0 && actual.visibilityReasons.every(reason => reason.text.length > 0));
      check(`${label}: count original visible incluido cero`, actual.count === String(selection.requestedCount) && actual.countText === String(selection.requestedCount));
      check(`${label}: conversión canónica exacta o ausencia explícita`, actual.units === (expected.quantityUnits === null ? null : String(expected.quantityUnits)));
      check(`${label}: opciones cerradas de count propias de variante`, await evaluate(`JSON.stringify(Array.from(document.querySelector(${JSON.stringify(COUNT)}).options).map(option => Number(option.value)))`) === JSON.stringify(COUNTS[selection.variantId]));
      if (expected.rule) {
        check(`${label}: regla completa conserva unidad, factor y límites canónicos`, JSON.stringify(actual.rule) === JSON.stringify({
          'order-unit': expected.rule.orderUnit, 'units-per-box': String(expected.rule.unitsPerBox), min: String(expected.rule.min), max: String(expected.rule.max), multiple: String(expected.rule.multiple) }));
        check(`${label}: conversión conocida muestra el número exacto incluido cero`, actual.unitsText === String(expected.quantityUnits));
        const box = expected.rule.orderUnit === 'box';
        check(`${label}: regla visible describe el mismo formato, rango y múltiplo`, JSON.stringify(actual.ruleValues) === JSON.stringify([
          box ? 'Cajas' : 'Unidades sueltas', box ? '6 unidades por caja.' : 'Cada valor equivale a 1 unidad.',
          `${expected.rule.min}–${expected.rule.max} unidades, ambos límites incluidos`, 'De 4 en 4, desde cero',
        ]));
        check(`${label}: explicación de conversión no conserva otro count o formato`, actual.conversion === (box
          ? `${selection.requestedCount} ${selection.requestedCount === 1 ? 'caja' : 'cajas'} de 6 unidades → ${expected.quantityUnits} unidades.`
          : `${selection.requestedCount} unidades solicitadas → ${expected.quantityUnits} unidades.`));
        check(`${label}: label corresponde a unidad de pedido`, actual.requestedLabel === (selection.variantId === 11 ? 'Unidades solicitadas' : 'Cajas solicitadas'));
      } else {
        check(`${label}: regla ausente elimina todos los atributos anteriores`, Object.values(actual.rule).every(value => value === null));
        check(`${label}: ausencia no inventa factor, unidades ni cero`, actual.unitsText === 'Sin conversión' && actual.requestedLabel === 'Valor solicitado' && !/\d/u.test(actual.ruleText));
        check(`${label}: elimina textos anteriores de regla y conversión`, actual.ruleValues.every(value => value === 'Sin definir')
          && actual.conversion === 'Sin un formato definido no se puede convertir el valor a unidades.');
      }
      return actual;
    };
    const snapshot = async (name) => {
      await evaluate("window.scrollTo({ top: 0, left: 0, behavior: 'instant' })");
      // El shell procesa scroll en su rAF verificado; medir tras ese frame,
      // sin introducir temporizadores en el módulo ni ocultar controles.
      await delay(75);
      check(`${width} captura ${name}: encuadre inicial restaurado`, await evaluate('scrollX === 0 && scrollY === 0'));
      await visibleSelectArrows(`captura ${name}`);
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
    const authenticatedHeaders = documentHeaders.get(sessionId);
    check(`${width}: acceso guiado 200 privado, no-store, Vary Cookie y noindex`,
      authenticatedHeaders?.status === 200 && privateNoindex(authenticatedHeaders));
    check(`${width}: HTML de admin sin canonical ni hreflang, con noindex`, await evaluate(`
      /(?:^|[,\\s])noindex(?:$|[,\\s])/u.test(document.querySelector('meta[name="robots"]')?.content ?? '') &&
      !document.querySelector('link[rel="canonical"],link[hreflang]')`));
    privacyEvidence.push({ context: 'guided', method: 'GET', width, ...authenticatedHeaders });
    await evaluate(`document.querySelector('[data-guide-close]')?.click()`);
    const initialStorage = await storage();
    const setupWriteLog = await evaluate('window.__variantQuantityAudit.storageWrites');
    const setupStorageWrites = setupWriteLog.length;
    check(`${width}: escrituras iniciales pertenecen solo a la guía`, setupWriteLog.every(write => write.storage === 'session' && write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    await evaluate('window.__variantQuantityAudit.storageWrites.length = 0');
    const setupStorageEvents = storageEvents.filter((event) => event.sessionId === sessionId).length;
    const setupAudit = await evaluate('window.__variantQuantityAudit');
    const sharedLocation = await sharedFrameLocation();
    await evaluate(`window.__variantQuantityAudit.sharedFrameLocation = ${JSON.stringify(sharedLocation)}`);
    check(`${width}: arranque solo con rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, setupAudit.timers.every(timer => sharedTimer(timer, sharedLocation)) && setupAudit.beacons === 0 && setupAudit.windows === 0);
    const initial = await state();
    const initialView = await view();
    check(`${width}: tres selectores cerrados sin entrada libre`, await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(ROOT)});
      return root.querySelectorAll('select').length === 3 &&
        JSON.stringify(Array.from(root.querySelector(${JSON.stringify(MARKET)}).options).map(option => option.value)) === ${JSON.stringify(JSON.stringify(MARKETS))} &&
        JSON.stringify(Array.from(root.querySelector(${JSON.stringify(VARIANT)}).options).map(option => Number(option.value))) === ${JSON.stringify(JSON.stringify(VARIANTS))};
    })()`));
    check(`${width}: inicio literal ES/variante11/count8`, JSON.stringify(initial) === JSON.stringify(INITIAL));
    await verify(INITIAL);
    await safety('unit-valid');
    await evaluate(`document.querySelector(${JSON.stringify(MARKET)}).focus()`);
    await snapshot('unit-valid');
    const setupRequests = requests.filter(request => request.sessionId === sessionId).length;
    moduleSessions.add(sessionId);
    await evaluate('window.__variantQuantityAudit.moduleActive = true');

    let guideInteractionEvidence = null;
    if (width === 375) {
      guideSessions.add(sessionId);
      await evaluate('window.__variantQuantityAudit.guideInteraction = true');
      const beforeGuide = JSON.stringify(await view());
      const visibleLauncher = `(() => {
        const selector = innerWidth < 1024 ? '[data-admin-guide-launch]' : '[data-guide-launch]';
        const button = document.querySelector(selector);
        const rect = button?.getBoundingClientRect();
        return !!button && !button.disabled && !button.hidden && rect.width >= 44 && rect.height >= 44 &&
          getComputedStyle(button).visibility === 'visible' && rect.top >= 0 && rect.bottom <= innerHeight &&
          document.activeElement === button;
      })()`;
      const focusVisibleLauncher = () => evaluate(`(() => {
        const button = document.querySelector(innerWidth < 1024 ? '[data-admin-guide-launch]' : '[data-guide-launch]');
        button.focus({ preventScroll: true });
      })()`);
      const resize = async (targetWidth) => {
        await call('Emulation.setDeviceMetricsOverride', { width: targetWidth, height: 812, deviceScaleFactor: 1, mobile: targetWidth < 1024 });
        await wait(`innerWidth === ${targetWidth} && (${visibleLauncher})`, 'launcher visible y foco al cruzar breakpoint');
        check(`${width} guía: foco visible al cambiar a ${targetWidth}px`, await evaluate(visibleLauncher));
      };
      const closeGuide = async (name) => {
        await focusVisibleLauncher();
        check(`${width} guía ${name}: disparador visible con foco y área táctil44px`, await evaluate(visibleLauncher));
        await key('Enter', 'Enter', 13);
        check(`${width} guía ${name}: Enter abre tarjeta y enfoca minimizar`, await evaluate(`
          !document.querySelector('[data-guide-card]').hidden && document.activeElement.matches('[data-guide-minimize]') &&
          document.querySelector('[data-admin-guide-launch]').getAttribute('aria-expanded') === 'true'`));
        if (name === 'Escape') await key('Escape', 'Escape', 27);
        else {
          await evaluate(`document.querySelector(${JSON.stringify(name === 'minimize' ? '[data-guide-minimize]' : '[data-guide-close]')}).focus()`);
          await key('Enter', 'Enter', 13);
        }
        check(`${width} guía ${name}: cierre devuelve foco al launcher visible`, await evaluate(`
          document.querySelector('[data-guide-card]').hidden && (${visibleLauncher}) &&
          document.querySelector('[data-admin-guide-launch]').getAttribute('aria-expanded') === 'false'`));
      };
      await closeGuide('minimize');
      await resize(1024);
      await resize(375);
      await closeGuide('close');
      await resize(1024);
      await resize(320);
      check(`${width} guía: cabecera a320px sin overflow`, await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
      await evaluate(`document.querySelector(${JSON.stringify(MARKET)}).scrollIntoView({ block: 'center', behavior: 'instant' })`);
      const probe320 = await visibleSelectArrows('guía cerrada a320');
      check(`${width} guía: hit-test a320 incluye el selector de mercado`, probe320.some(hit => hit.id === 'quantity-market'));
      await resize(375);
      await closeGuide('Escape');
      await focusVisibleLauncher();
      await key('Enter', 'Enter', 13);
      await evaluate(`document.querySelector('[data-admin-guide-launch]').focus({ preventScroll: true })`);
      check(`${width} guía abierta: foco explícito en el disparador móvil`, await evaluate(`
        !document.querySelector('[data-guide-card]').hidden && document.activeElement.matches('[data-admin-guide-launch]')`));
      await call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 812, deviceScaleFactor: 1, mobile: false });
      const visibleCardFocus = `(() => {
        const card = document.querySelector('[data-guide-card]');
        const focused = document.activeElement;
        const rect = focused.getBoundingClientRect();
        return !card.hidden && card.contains(focused) && !focused.disabled && rect.width > 0 && rect.height > 0 &&
          getComputedStyle(focused).visibility === 'visible' && rect.top >= 0 && rect.bottom <= innerHeight;
      })()`;
      await wait(`innerWidth === 1024 && (${visibleCardFocus})`, 'foco de guía abierta trasladado a tarjeta visible');
      check(`${width} guía abierta: al pasar a escritorio el foco queda en la tarjeta visible`, await evaluate(visibleCardFocus));
      await evaluate(`document.querySelector(${JSON.stringify(MARKET)}).focus({ preventScroll: true })`);
      await call('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
      // Espera del arnés Node: observa el foco después del listener matchMedia.
      await delay(75);
      await wait(`innerWidth === 375 && document.activeElement.matches(${JSON.stringify(MARKET)})`, 'guía abierta no roba el nuevo foco del selector');
      check(`${width} guía abierta: el siguiente resize conserva el nuevo foco en Mercado`, await evaluate(`
        !document.querySelector('[data-guide-card]').hidden && document.activeElement.matches(${JSON.stringify(MARKET)})`));
      await evaluate(`document.querySelector('[data-guide-close]').focus()`);
      await key('Enter', 'Enter', 13);
      check(`${width} guía abierta: cerrar tras resize recupera el disparador móvil`, await evaluate(visibleLauncher));
      await evaluate(`document.querySelector(${JSON.stringify(MARKET)}).focus({ preventScroll: true })`);
      for (const targetWidth of [1024, 375]) {
        await call('Emulation.setDeviceMetricsOverride', { width: targetWidth, height: 812, deviceScaleFactor: 1, mobile: targetWidth < 1024 });
        await delay(75);
        await wait(`innerWidth === ${targetWidth} && document.activeElement.matches(${JSON.stringify(MARKET)})`, 'resize conserva foco del selector');
        check(`${width} selector: el cambio a ${targetWidth}px no roba el foco`, await evaluate(`document.activeElement.matches(${JSON.stringify(MARKET)})`));
      }
      await evaluate(`document.querySelector(${JSON.stringify(MARKET)}).scrollIntoView({ block: 'center', behavior: 'instant' })`);
      const probe375 = await visibleSelectArrows('guía cerrada a375');
      check(`${width} guía: hit-test a375 incluye el selector de mercado`, probe375.some(hit => hit.id === 'quantity-market'));
      check(`${width} guía: abrir/cerrar/resize no altera cantidades ni diagnósticos`, JSON.stringify(await view()) === beforeGuide);
      await evaluate('window.__variantQuantityAudit.guideInteraction = false');
      await delay(75);
      guideSessions.delete(sessionId);
      const guideWrites = await evaluate(`window.__variantQuantityAudit.storageWrites.filter(write => write.phase === 'guide')`);
      const guideEvents = storageEvents.filter(event => event.sessionId === sessionId && event.phase === 'guide');
      check(`${width} guía: solo escritura explícita de su clave de sesión`, guideWrites.length > 0 && guideWrites.every(write =>
        write.storage === 'session' && write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
      check(`${width} guía: eventos de almacenamiento separados con clave exacta`, guideEvents.every(event =>
        event.key === GUIDE_STORAGE_KEY && event.local === false));
      check(`${width} guía: al cerrar restaura el almacenamiento inicial`, await storage() === initialStorage);
      guideInteractionEvidence = { actions: ['open/minimize', 'open/close', 'open/Escape', 'open/resize/close', 'resize-with-selector-focus'],
        widths: [375, 1024, 375, 1024, 320, 375, 1024, 375, 1024, 375], writes: guideWrites.length, mutationEvents: guideEvents.length,
        storage: 'session', key: GUIDE_STORAGE_KEY, unchangedAtEnd: true };
      await evaluate(`document.querySelector(${JSON.stringify(MARKET)}).focus()`);
    }

    await key('Tab', 'Tab', 9);
    check(`${width}: Tab desde mercado alcanza variante`, await evaluate(`document.activeElement.matches(${JSON.stringify(VARIANT)})`));
    await key('Tab', 'Tab', 9);
    check(`${width}: siguiente Tab alcanza count`, await evaluate(`document.activeElement.matches(${JSON.stringify(COUNT)})`));
    await key('ArrowDown', 'ArrowDown', 40);
    check(`${width}: teclado cambia count y mantiene foco`, await evaluate(`document.activeElement.matches(${JSON.stringify(COUNT)})`));
    await verify({ ...INITIAL, requestedCount: 12 });
    await key('ArrowUp', 'ArrowUp', 38);
    await verify(INITIAL);
    await select(VARIANT, '12');
    await verify({ ...INITIAL, variantId: 12, requestedCount: 2 });
    await select(COUNT, '1');
    await verify({ ...INITIAL, variantId: 12, requestedCount: 1 });
    await safety('box-invalid');
    await evaluate(`document.querySelector(${JSON.stringify(COUNT)}).focus()`);
    await snapshot('box-invalid');
    await select(VARIANT, '21');
    await verify({ ...INITIAL, variantId: 21, requestedCount: 1 });
    await safety('unconfigured');
    await evaluate(`document.querySelector(${JSON.stringify(VARIANT)}).focus()`);
    await snapshot('unconfigured');
    await select(VARIANT, '11');
    await select(MARKET, 'FR');
    await verify({ ...INITIAL, marketId: 'FR' });
    await safety('hidden');
    await evaluate(`document.querySelector(${JSON.stringify(MARKET)}).focus()`);
    await snapshot('hidden');

    // Memoria por variante, independiente del mercado; ninguna conversión de count.
    const remembered = { 11: 19, 12: 3, 21: 0 };
    for (const variantId of VARIANTS) {
      await select(VARIANT, String(variantId));
      await select(COUNT, String(remembered[variantId]));
    }
    for (const marketId of MARKETS) {
      await select(MARKET, marketId);
      for (const variantId of [...VARIANTS].reverse()) {
        await select(VARIANT, String(variantId));
        await verify({ marketId, variantId, requestedCount: remembered[variantId] });
      }
    }
    let states = 0;
    let quantitySatisfied = 0;
    let satisfied = 0;
    let blocked = 0;
    let unknown = 0;
    for (const marketId of MARKETS) {
      const before = await state();
      await select(MARKET, marketId);
      check(`${width} ${marketId}: cambiar mercado conserva variante y count`, (await state()).variantId === before.variantId && (await state()).requestedCount === before.requestedCount);
      for (const variantId of VARIANTS) {
        await select(VARIANT, String(variantId));
        check(`${width} ${marketId}/${variantId}: recupera memoria propia del selector`, (await state()).requestedCount === remembered[variantId]);
        for (const requestedCount of COUNTS[variantId]) {
          await select(COUNT, String(requestedCount));
          remembered[variantId] = requestedCount;
          const observed = await verify({ marketId, variantId, requestedCount });
          if (observed.quantityOutcome === 'satisfied') quantitySatisfied++;
          if (observed.outcome === 'satisfied') satisfied++; else blocked++;
          if (observed.units === null) unknown++;
          await safety(`${marketId}/${variantId}/${requestedCount}`);
          states++;
        }
      }
    }
    check(`${width}: las 36 combinaciones finitas se recorren completas`, states === 36);
    check(`${width}: ocho cantidades satisfechas, cinco finales satisfechos, 31 bloqueos y seis conversiones ausentes`, quantitySatisfied === 8 && satisfied === 5 && blocked === 31 && unknown === 6);
    matrixEvidence.push({ width, markets: 2, variantCountOptions: { 11: 10, 12: 5, 21: 3 }, states, quantitySatisfied, satisfied, blocked, unknown });
    await evaluate(`document.querySelector(${JSON.stringify(action('reset'))}).focus()`);
    await key('Enter', 'Enter', 13);
    check(`${width}: Enter restablece contexto, variante y diagnósticos`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await view()) === JSON.stringify(initialView));
    check(`${width}: reset conserva el foco del botón`, await evaluate(`document.activeElement.matches(${JSON.stringify(action('reset'))})`));
    for (const variantId of [12, 21, 11]) {
      await select(VARIANT, String(variantId));
      await verify({ ...INITIAL, variantId, requestedCount: INITIAL_COUNTS[variantId] });
    }
    await safety('reset');
    await select(MARKET, 'FR');
    await select(VARIANT, '12');
    await select(COUNT, '3');
    await verify({ marketId: 'FR', variantId: 12, requestedCount: 3 });
    const finalAudit = await evaluate('window.__variantQuantityAudit');
    const moduleStorageEvents = storageEvents.filter(event => event.sessionId === sessionId && event.phase !== 'guide').length - setupStorageEvents;
    const moduleWrites = finalAudit.storageWrites.filter(write => write.phase !== 'guide');
    const moduleRequests = requests.filter(request => request.sessionId === sessionId).length - setupRequests;
    const moduleTimers = finalAudit.timers.filter(timer => !sharedTimer(timer, sharedLocation));
    check(`${width}: ningún intento de escritura ni mutación de almacenamiento del módulo`, moduleWrites.length === 0 && moduleStorageEvents === 0 && await storage() === initialStorage);
    check(`${width}: sin temporizadores del módulo, beacon ni ventanas durante todo el recorrido`, moduleTimers.length === 0 && finalAudit.beacons === 0 && finalAudit.windows === 0);
    check(`${width}: cero solicitudes HTTP durante las interacciones`, moduleRequests === 0 && blockedRequests.length === 0);
    storageEvidence.push({ width, setupGuideWrites: setupStorageWrites, guideInteraction: guideInteractionEvidence, moduleWrites: moduleWrites.length,
      moduleMutationEvents: moduleStorageEvents, moduleRequests, timers: moduleTimers.length, beacons: finalAudit.beacons,
      windows: finalAudit.windows, unchanged: true,
      sharedLayout: { source: 'src/components/WhatsAppContact.astro', api: 'requestAnimationFrame',
        verifiedCallsite: sharedLocation, setupCalls: setupAudit.timers.length, totalCalls: finalAudit.timers.length } });
    moduleSessions.delete(sessionId);
    const previousDocumentEpoch = finalAudit.documentEpoch;
    await call('Page.reload', { ignoreCache: true });
    await wait(`(${ready}) && window.__variantQuantityAudit?.documentEpoch !== ${JSON.stringify(previousDocumentEpoch)}`, 'recarga limpia en otro documento');
    const reloadedAudit = await evaluate('window.__variantQuantityAudit');
    const reloadedSharedLocation = await sharedFrameLocation();
    check(`${width}: recarga solo permite rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, reloadedAudit.timers.every(timer => sharedTimer(timer, reloadedSharedLocation)) && reloadedAudit.beacons === 0 && reloadedAudit.windows === 0);
    check(`${width}: nuevas escrituras de arranque pertenecen solo a la guía`, reloadedAudit.storageWrites.every(write => write.storage === 'session' && write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    check(`${width}: recarga restaura contexto, variante y cantidades iniciales`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await view()) === JSON.stringify(initialView));
    check(`${width}: recarga conserva el almacenamiento anterior`, await storage() === initialStorage);
    storageEvidence.at(-1).reloadGuideWrites = reloadedAudit.storageWrites.length;
    storageEvidence.at(-1).sharedLayout.reloadCalls = reloadedAudit.timers.length;

    await call('Emulation.setScriptExecutionDisabled', { value: true });
    await call('Page.reload', { ignoreCache: true });
    await wait(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(ROOT)}) && document.querySelector(${JSON.stringify(ROOT)}).dataset.ready !== 'true' && window.__variantQuantityAudit?.documentEpoch !== ${JSON.stringify(reloadedAudit.documentEpoch)}`, 'vista sin JavaScript en otro documento');
    check(`${width}: sin JavaScript conserva cantidades iniciales más aviso`, JSON.stringify(await view()) === JSON.stringify(initialView) && await evaluate(`Array.from(document.querySelectorAll('noscript')).some(node => /JavaScript/u.test(node.textContent))`));
    check(`${width}: sin JavaScript los controles permanecen inertes`, await evaluate(`Array.from(document.querySelector(${JSON.stringify(ROOT)}).querySelectorAll('button,input,select,textarea')).every(control => control.disabled && (control.tagName !== 'BUTTON' || control.type === 'button'))`));
    check(`${width}: sin JavaScript el disparador de guía del header está oculto e inerte`, await evaluate(`
      document.querySelector('[data-admin-guide-launch]').hidden && document.querySelector('[data-admin-guide-launch]').disabled`));
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
    runner: 'node scripts/test-variant-quantity-demo.mjs', nodeVersion: process.version,
    result: failure === null ? 'passed' : 'failed', checksPassed: checks.length,
    checks, failure, screenshots, requestCount: requests.length,
    blockedRequests: blockedRequests.map(diagnosticRequest),
    forbiddenRequests: forbiddenRequests().map(diagnosticRequest), privacyEvidence, storageEvidence, matrixEvidence, hitTestFailures, errors,
  }, null, 2) + '\n');
  for (const task of pending.values()) clearTimeout(task.timer);
  socket?.close();
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise((resolveExit) => { child.once('exit', resolveExit); child.kill(); });
  }
  await rm(profile, { recursive: true, force: true });
  process.stdout.write(`${checks.length} comprobaciones correctas${failure ? `; fallo: ${failure}` : ''}; informe en ${output}/report.json\n`);
}

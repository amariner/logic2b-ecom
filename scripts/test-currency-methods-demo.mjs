/**
 * R5.11c: monedas y métodos locales de fixtures en Chrome/CDP.
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
const PATH = '/demo/admin/divisas';
const ROOT = '[data-currency-methods-demo]';
const FX_STATES = ['current', 'expired', 'unavailable'];
const TARGETS = ['EUR', 'JPY', 'KWD'];
const EUR_AMOUNTS = ['eur-2975', 'eur-0', 'eur-499', 'eur-500', 'eur-5000', 'eur-5001'];
// Resultados fijos de los seis pares; no se ejecuta el motor para fabricar esperados.
const AMOUNTS = {
  'eur-2975': { currency: 'EUR', exponent: 2, amountMinor: 2975, presented: { EUR: 2975, JPY: 4760, KWD: 9818 } },
  'eur-0': { currency: 'EUR', exponent: 2, amountMinor: 0, presented: { EUR: 0, JPY: 0, KWD: 0 } },
  'eur-499': { currency: 'EUR', exponent: 2, amountMinor: 499, presented: { EUR: 499, JPY: 798, KWD: 1647 } },
  'eur-500': { currency: 'EUR', exponent: 2, amountMinor: 500, presented: { EUR: 500, JPY: 800, KWD: 1650 } },
  'eur-5000': { currency: 'EUR', exponent: 2, amountMinor: 5000, presented: { EUR: 5000, JPY: 8000, KWD: 16500 } },
  'eur-5001': { currency: 'EUR', exponent: 2, amountMinor: 5001, presented: { EUR: 5001, JPY: 8002, KWD: 16503 } },
  'jpy-3000': { currency: 'JPY', exponent: 0, amountMinor: 3000, presented: { EUR: 1875, JPY: 3000, KWD: 6000 } },
  'kwd-9875': { currency: 'KWD', exponent: 3, amountMinor: 9875, presented: { EUR: 2963, JPY: 4938, KWD: 9875 } },
};
const EXPONENTS = { EUR: 2, JPY: 0, KWD: 3 };
const RATE_LABELS = { 'EUR/JPY': '1 EUR = 160 JPY', 'EUR/KWD': '100 EUR = 33 KWD',
  'JPY/EUR': '160 JPY = 1 EUR', 'JPY/KWD': '500 JPY = 1 KWD',
  'KWD/EUR': '1 KWD = 3 EUR', 'KWD/JPY': '1 KWD = 500 JPY' };
const TRANSFER_REASONS = { 'eur-2975': null, 'eur-0': 'below_minimum', 'eur-499': 'below_minimum',
  'eur-500': null, 'eur-5000': null, 'eur-5001': null };
const LOCAL_REASONS = { 'eur-2975': null, 'eur-0': 'below_minimum', 'eur-499': null,
  'eur-500': null, 'eur-5000': null, 'eur-5001': 'above_maximum' };
const formatted = (currency, exponent, amountMinor) => {
  const value = BigInt(amountMinor);
  const scale = 10n ** BigInt(exponent);
  const whole = String(value / scale).replace(/\B(?=(\d{3})+(?!\d))/gu, '.');
  const fraction = exponent === 0 ? '' : ',' + String(value % scale).padStart(exponent, '0');
  return `${whole}${fraction} ${currency}`;
};
const expectedMoney = (currency, exponent, amountMinor) => ({ currency, exponent: String(exponent),
  amountMinor: String(amountMinor), text: formatted(currency, exponent, amountMinor) });
const expectedMethods = (marketId, amountId) => {
  const range = (currency, exponent, min, max) => ({ currency, exponent: String(exponent), min: String(min), max: String(max) });
  const method = (methodId, reason, bounds = null) => ({ methodId,
    outcome: reason === null ? 'available_in_fixture' : 'unavailable_in_fixture', reason, range: bounds });
  if (marketId === 'KW') return [method('method.alternative', null, range('KWD', 3, 1000, 50000)),
    method('method.local', 'not_configured'), method('method.transfer', 'not_configured')];
  if (marketId === 'JP') return [method('method.alternative', 'not_configured'),
    method('method.local', null, range('JPY', 0, 1000, 20000)), method('method.transfer', 'not_configured')];
  return [method('method.alternative', 'not_configured'),
    method('method.local', LOCAL_REASONS[amountId], range('EUR', 2, 100, 5000)),
    method('method.transfer', marketId === 'FR' ? 'disabled' : TRANSFER_REASONS[amountId], range('EUR', 2, 500, 100000))];
};
const GUIDE_STORAGE_KEY = 'logic2b:ecom-guide:v1';
// El shell existente posiciona WhatsApp con rAF al observar layout/scroll.
// Solo se permite su caller exacto, derivado del HTML y de esta fuente local.
const sharedContactSource = await readFile(new URL('../src/components/WhatsAppContact.astro', import.meta.url), 'utf8');
const sharedContactScript = sharedContactSource.match(/<script is:inline>([\s\S]*?)<\/script>/u)?.[1]?.trim();
assert.ok(sharedContactScript, 'Falta el script compartido de layout conocido.');
const sharedFrameExpression = 'requestAnimationFrame(update)';
const sharedTimer = (timer, location) => timer.name === 'requestAnimationFrame' && timer.caller.endsWith(`(${location})`);
const action = (name) => `[data-currency-action="${name}"]`;
const chrome = [process.env.CHROME_BIN, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome']
  .find((path) => path && existsSync(path));
if (!chrome) throw new Error('Indica CHROME_BIN con la ruta de Chrome.');
const output = resolve(process.env.OUTPUT_DIR ?? 'tmp/currency-methods-demo');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'ecom-currency-methods-'));
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
  Object.defineProperty(window, '__currencyMethodsAudit', { value: audit });
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
    const presentation = () => evaluate(`(() => {
      const money = selector => {
        const node = document.querySelector(selector);
        const currency = node.getAttribute('data-currency');
        const exponent = node.getAttribute('data-exponent');
        const amountMinor = node.getAttribute('data-amount-minor');
        if (amountMinor !== null && (!/^(0|[1-9][0-9]*)$/.test(amountMinor) || BigInt(amountMinor) > BigInt(Number.MAX_SAFE_INTEGER))) throw new Error('Importe DOM no canónico');
        return { currency, exponent, amountMinor, text: node.textContent.trim() };
      };
      const result = document.querySelector('[data-currency-result]');
      return { outcome: result.dataset.outcome, reason: result.dataset.reason ?? null,
        original: money('[data-currency-original]'), presented: money('[data-currency-presented]'),
        evidence: document.querySelector('[data-currency-evidence]').dataset.state,
        evidenceContentHidden: document.querySelector('[data-currency-evidence-content]').hidden,
        datesHidden: document.querySelector('[data-currency-evidence-dates]').hidden,
        rate: document.querySelector('[data-currency-rate]').textContent.trim(),
        dates: ['at', 'quotedAt', 'expiresAt'].map(name => document.querySelector('[data-currency-date="' + name + '"]').textContent.trim()) };
    })()`);
    const methods = () => evaluate(`(() => {
      const original = document.querySelector('[data-local-methods-original]');
      return { original: { currency: original.getAttribute('data-currency'), exponent: original.getAttribute('data-exponent'),
        amountMinor: original.getAttribute('data-amount-minor'), text: original.textContent.trim() },
        rows: Array.from(document.querySelectorAll('[data-local-method-row]')).map(row => {
          const bounds = ['currency', 'exponent', 'min', 'max'].map(key => row.getAttribute('data-' + key));
          const range = bounds.every(value => value === null) ? null : { currency: bounds[0], exponent: bounds[1], min: bounds[2], max: bounds[3] };
          return { methodId: row.dataset.methodId, outcome: row.dataset.outcome, reason: row.dataset.reason ?? null, range,
            text: row.textContent.replace(/\\s+/gu, ' ').trim() };
        }).sort((a, b) => a.methodId < b.methodId ? -1 : a.methodId > b.methodId ? 1 : 0) };
    })()`);
    const state = () => evaluate(`({
      marketId: document.querySelector('[data-currency-market]').value,
      amountId: document.querySelector('[data-currency-amount]').value,
      targetCurrency: document.querySelector('[data-currency-target]').value,
      fxScenario: document.querySelector('[data-currency-fx]').value
    })`);
    const safety = async (stage) => {
      check(`${width} ${stage}: sin solicitudes operativas ni navegación externa`, forbiddenRequests().length === 0 && blockedRequests.length === 0);
      check(`${width} ${stage}: controles de ejemplo sin forms ni importes libres`, await evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(ROOT)});
        return !root.querySelector('form,input,textarea') &&
          Array.from(root.querySelectorAll('button')).every(button => button.type === 'button') &&
          Array.from(root.querySelectorAll('a[href]')).every(link => !new URL(link.href).hostname.endsWith('.test'));
      })()`));
      check(`${width} ${stage}: sin overflow horizontal`, await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
    };
    const verify = async (selection) => {
      const { marketId, amountId, targetCurrency, fxScenario } = selection;
      const label = `${width} ${marketId}/${amountId}/${targetCurrency}/${fxScenario}`;
      const amount = AMOUNTS[amountId];
      const original = expectedMoney(amount.currency, amount.exponent, amount.amountMinor);
      const result = await presentation();
      const local = await methods();
      const identity = amount.currency === targetCurrency;
      const unresolved = !identity && fxScenario !== 'current';
      check(`${label}: identidad original y formato exacto conservados`, JSON.stringify(result.original) === JSON.stringify(original)
        && JSON.stringify(local.original) === JSON.stringify(original));
      check(`${label}: métodos y rangos deciden solo por importe original`, local.rows.every(row => row.text.length > 0) &&
        JSON.stringify(local.rows.map(({ text: _text, ...row }) => row)) === JSON.stringify(expectedMethods(marketId, amountId)));
      check(`${label}: estado separa identidad, conversión y falta de evidencia`, result.outcome === (identity ? 'identity' : unresolved ? 'unresolved' : 'converted')
        && result.reason === (unresolved ? fxScenario === 'expired' ? 'expired' : 'not_configured' : null));
      check(`${label}: identidad nunca conserva una cotización FX`, result.evidence === (identity || fxScenario === 'unavailable' ? 'none' : 'quote'));
      if (identity || fxScenario === 'unavailable') {
        check(`${label}: ausencia de evidencia limpia tasa y fechas previas`, result.evidenceContentHidden
          && result.datesHidden && result.rate === '' && result.dates.every(date => date === ''));
      } else {
        check(`${label}: tasa racional y fechas distinguen evidencia vigente e histórica`, !result.evidenceContentHidden
          && !result.datesHidden && result.rate === RATE_LABELS[`${amount.currency}/${targetCurrency}`]
          && result.dates.every(date => date.length > 0) && /11:00/u.test(result.dates[1])
          && (fxScenario === 'expired' ? result.dates[0] === result.dates[2] : /13:00/u.test(result.dates[2])));
      }
      if (unresolved) {
        check(`${label}: importe ausente limpia moneda, unidades y dinero anterior`, result.presented.currency === null
          && result.presented.exponent === null && result.presented.amountMinor === null && result.presented.text.length > 0
          && !/[0-9€¥]|EUR|JPY|KWD/u.test(result.presented.text));
      } else {
        check(`${label}: equivalencia exacta con exponentes 0, 2 o 3`, JSON.stringify(result.presented) ===
          JSON.stringify(expectedMoney(targetCurrency, EXPONENTS[targetCurrency], amount.presented[targetCurrency])));
      }
      return local;
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
    const setupWriteLog = await evaluate('window.__currencyMethodsAudit.storageWrites');
    const setupStorageWrites = setupWriteLog.length;
    check(`${width}: escrituras iniciales pertenecen solo a la guía`, setupWriteLog.every(write => write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    await evaluate('window.__currencyMethodsAudit.storageWrites.length = 0');
    const setupStorageEvents = storageEvents.filter((event) => event.sessionId === sessionId).length;
    const setupAudit = await evaluate('window.__currencyMethodsAudit');
    const sharedLocation = await sharedFrameLocation();
    await evaluate(`window.__currencyMethodsAudit.sharedFrameLocation = ${JSON.stringify(sharedLocation)}`);
    check(`${width}: arranque solo con rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, setupAudit.timers.every(timer => sharedTimer(timer, sharedLocation)) && setupAudit.beacons === 0 && setupAudit.windows === 0);
    const initial = await state();
    const initialPresentation = await presentation();
    const initialMethods = await methods();
    check(`${width}: opciones cerradas de mercados, importes y FX`, await evaluate(`
      document.querySelector('[data-currency-market]').options.length === 4 &&
      document.querySelector('[data-currency-amount]').options.length === 6 &&
      document.querySelector('[data-currency-target]').options.length === 3 &&
      document.querySelector('[data-currency-fx]').options.length === 3`));
    check(`${width}: inicio ES EUR2975 hacia JPY con evidencia vigente`, JSON.stringify(initial) ===
      JSON.stringify({ marketId: 'ES', amountId: 'eur-2975', targetCurrency: 'JPY', fxScenario: 'current' }));
    await verify(initial);
    await safety('default');
    await snapshot('default');
    const setupRequests = requests.filter(request => request.sessionId === sessionId).length;
    moduleSessions.add(sessionId);
    await evaluate('window.__currencyMethodsAudit.moduleActive = true');

    await evaluate(`document.querySelector('[data-currency-target]').focus()`);
    await key('ArrowUp', 'ArrowUp', 38);
    check(`${width}: flecha nativa selecciona EUR y conserva foco`, (await state()).targetCurrency === 'EUR'
      && await evaluate(`document.activeElement.matches('[data-currency-target]')`));
    await verify(await state());
    await safety('identity');
    await snapshot('identity');
    await key('Tab', 'Tab', 9);
    check(`${width}: Tab alcanza el selector de evidencia FX`, await evaluate(`document.activeElement.matches('[data-currency-fx]')`));
    await key('ArrowDown', 'ArrowDown', 40);
    check(`${width}: teclado cambia evidencia sin perder foco`, (await state()).fxScenario === 'expired'
      && await evaluate(`document.activeElement.matches('[data-currency-fx]')`));
    await verify(await state());
    check(`${width}: identidad con evidencia caducada mantiene métodos y ausencia de cotización`,
      JSON.stringify(await methods()) === JSON.stringify(initialMethods) && (await presentation()).evidence === 'none');
    await select('[data-currency-target]', 'JPY');
    await verify(await state());
    await safety('expired');
    await snapshot('expired');
    await select('[data-currency-fx]', 'current');
    await select('[data-currency-market]', 'KW');
    check(`${width}: KW selecciona el importe nominal compatible sin convertir el original`, (await state()).amountId === 'kwd-9875');
    await verify(await state());
    await safety('kw');
    await snapshot('kw');

    // 14 contextos originales × 3 destinos × 3 evidencias = 126 estados por tamaño.
    for (const marketId of ['ES', 'FR', 'JP', 'KW']) {
      await select('[data-currency-market]', marketId);
      const amountIds = marketId === 'JP' ? ['jpy-3000'] : marketId === 'KW' ? ['kwd-9875'] : EUR_AMOUNTS;
      check(`${width} ${marketId}: importes seleccionables compatibles`, await evaluate(`
        JSON.stringify(Array.from(document.querySelector('[data-currency-amount]').options).map(option => option.value).sort())
          === ${JSON.stringify(JSON.stringify([...amountIds].sort()))}`));
      for (const amountId of amountIds) {
        await select('[data-currency-amount]', amountId);
        const stableMethods = await methods();
        for (const targetCurrency of TARGETS) {
          await select('[data-currency-target]', targetCurrency);
          for (const fxScenario of FX_STATES) {
            await select('[data-currency-fx]', fxScenario);
            const selection = { marketId, amountId, targetCurrency, fxScenario };
            const currentMethods = await verify(selection);
            check(`${width} ${marketId}/${amountId}/${targetCurrency}/${fxScenario}: FX nunca altera métodos ni rangos`,
              JSON.stringify(currentMethods) === JSON.stringify(stableMethods));
          }
        }
        await safety(`${marketId}/${amountId}`);
      }
    }
    await select('[data-currency-market]', 'ES');
    await select('[data-currency-amount]', 'eur-5001');
    await select('[data-currency-target]', 'KWD');
    await select('[data-currency-fx]', 'expired');
    await evaluate(`document.querySelector('[data-currency-market]').focus()`);
    await key('ArrowDown', 'ArrowDown', 40);
    check(`${width}: teclado cambia mercado y conserva el control enfocado`, await evaluate(`document.activeElement.matches('[data-currency-market]')`));
    check(`${width}: ES a FR conserva importe EUR, destino y evidencia`, JSON.stringify(await state()) ===
      JSON.stringify({ marketId: 'FR', amountId: 'eur-5001', targetCurrency: 'KWD', fxScenario: 'expired' }));
    await verify(await state());
    await select('[data-currency-market]', 'JP');
    check(`${width}: cambio de moneda nominal reinicia importe compatible`, JSON.stringify(await state()) ===
      JSON.stringify({ marketId: 'JP', amountId: 'jpy-3000', targetCurrency: 'KWD', fxScenario: 'expired' }));
    await verify(await state());
    await select('[data-currency-market]', 'ES');
    check(`${width}: volver a EUR usa el importe inicial sin buffer previo`, JSON.stringify(await state()) ===
      JSON.stringify({ marketId: 'ES', amountId: 'eur-2975', targetCurrency: 'KWD', fxScenario: 'expired' }));
    await verify(await state());
    await evaluate(`document.querySelector(${JSON.stringify(action('reset'))}).focus()`);
    await key('Enter', 'Enter', 13);
    check(`${width}: Enter restablece controles, importes y métodos`, JSON.stringify(await state()) === JSON.stringify(initial)
      && JSON.stringify(await presentation()) === JSON.stringify(initialPresentation) && JSON.stringify(await methods()) === JSON.stringify(initialMethods));
    await select('[data-currency-market]', 'FR');
    await select('[data-currency-fx]', 'unavailable');
    const finalAudit = await evaluate('window.__currencyMethodsAudit');
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
    await wait(`(${ready}) && window.__currencyMethodsAudit?.documentEpoch !== ${JSON.stringify(previousDocumentEpoch)}`, 'recarga limpia en otro documento');
    const reloadedAudit = await evaluate('window.__currencyMethodsAudit');
    const reloadedSharedLocation = await sharedFrameLocation();
    check(`${width}: recarga solo permite rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, reloadedAudit.timers.every(timer => sharedTimer(timer, reloadedSharedLocation)) && reloadedAudit.beacons === 0 && reloadedAudit.windows === 0);
    check(`${width}: nuevas escrituras de arranque pertenecen solo a la guía`, reloadedAudit.storageWrites.every(write => write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    check(`${width}: recarga restaura contexto, equivalencia y métodos iniciales`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await presentation()) === JSON.stringify(initialPresentation) && JSON.stringify(await methods()) === JSON.stringify(initialMethods));
    check(`${width}: recarga conserva el almacenamiento anterior`, await storage() === initialStorage);
    storageEvidence.at(-1).reloadGuideWrites = reloadedAudit.storageWrites.length;
    storageEvidence.at(-1).sharedLayout.reloadCalls = reloadedAudit.timers.length;

    await call('Emulation.setScriptExecutionDisabled', { value: true });
    await call('Page.reload', { ignoreCache: true });
    await wait(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(ROOT)}) && document.querySelector(${JSON.stringify(ROOT)}).dataset.ready !== 'true' && window.__currencyMethodsAudit?.documentEpoch !== ${JSON.stringify(reloadedAudit.documentEpoch)}`, 'vista sin JavaScript en otro documento');
    check(`${width}: sin JavaScript conserva equivalencia, métodos iniciales y aviso`, JSON.stringify(await presentation()) === JSON.stringify(initialPresentation) && JSON.stringify(await methods()) === JSON.stringify(initialMethods) && await evaluate(`Array.from(document.querySelectorAll('noscript')).some(node => /JavaScript/u.test(node.textContent))`));
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
    runner: 'node scripts/test-currency-methods-demo.mjs', nodeVersion: process.version,
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

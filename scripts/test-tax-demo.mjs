/**
 * R5.10b: cálculo fiscal y evidencia VAT de fixtures en Chrome/CDP.
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
const PATH = '/demo/admin/impuestos';
const ROOT = '[data-tax-demo]';
const SCENARIOS = ['mixed', 'rounding', 'zero_exempt', 'unresolved_shipping', 'no_assessment'];
const BASES = ['excluded', 'included'];
const VAT_STATES = ['valid', 'invalid', 'expired', 'unavailable'];
// Resultados fijos revisados contra el contrato; no se reproduce aquí el motor.
const EXPECTED = {
  mixed: { excluded: [[1900, 238, 2138], [750, 45, 795], [325, 41, 366]],
    included: [[1689, 211, 1900], [708, 42, 750], [289, 36, 325]] },
  rounding: { excluded: [[5, 1, 6], [5, 1, 6], [50, 5, 55]],
    included: [[5, 0, 5], [5, 0, 5], [45, 5, 50]] },
  zero_exempt: { excluded: [[1900, 0, 1900], [750, 0, 750], [325, 41, 366]],
    included: [[1900, 0, 1900], [750, 0, 750], [289, 36, 325]] },
  unresolved_shipping: { excluded: [[1900, 238, 2138], [750, 45, 795], [null, null, null]],
    included: [[1689, 211, 1900], [708, 42, 750], [null, null, null]] },
  no_assessment: { excluded: [[null, null, null], [null, null, null], [null, null, null]],
    included: [[null, null, null], [null, null, null], [null, null, null]] },
};
const TOTALS = {
  mixed: { excluded: [2975, 324, 3299], included: [2686, 289, 2975] },
  rounding: { excluded: [60, 7, 67], included: [55, 5, 60] },
  zero_exempt: { excluded: [2975, 41, 3016], included: [2939, 36, 2975] },
  unresolved_shipping: { excluded: [null, null, null], included: [null, null, null] },
  no_assessment: { excluded: [null, null, null], included: [null, null, null] },
};
const GUIDE_STORAGE_KEY = 'logic2b:ecom-guide:v1';
// El shell existente posiciona WhatsApp con rAF al observar layout/scroll.
// Solo se permite su caller exacto, derivado del HTML y de esta fuente local.
const sharedContactSource = await readFile(new URL('../src/components/WhatsAppContact.astro', import.meta.url), 'utf8');
const sharedContactScript = sharedContactSource.match(/<script is:inline>([\s\S]*?)<\/script>/u)?.[1]?.trim();
assert.ok(sharedContactScript, 'Falta el script compartido de layout conocido.');
const sharedFrameExpression = 'requestAnimationFrame(update)';
const sharedTimer = (timer, location) => timer.name === 'requestAnimationFrame' && timer.caller.endsWith(`(${location})`);
const action = (name) => `[data-tax-action="${name}"]`;
const chrome = [process.env.CHROME_BIN, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome']
  .find((path) => path && existsSync(path));
if (!chrome) throw new Error('Indica CHROME_BIN con la ruta de Chrome.');
const output = resolve(process.env.OUTPUT_DIR ?? 'tmp/tax-demo');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'ecom-tax-'));
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
  Object.defineProperty(window, '__taxDemoAudit', { value: audit });
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
    const tax = () => evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(ROOT)});
      const amount = (scope, name) => {
        const node = scope.querySelector('[data-tax-amount="' + name + '"]');
        const raw = node.getAttribute('data-cents');
        if (raw !== null && (!/^(0|[1-9][0-9]*)$/.test(raw) || !Number.isSafeInteger(Number(raw)))) throw new Error('Importe DOM no canónico');
        return { cents: raw === null ? null : Number(raw), text: node.textContent.trim() };
      };
      const result = root.querySelector('[data-tax-result]');
      return { outcome: result.dataset.outcome, reason: result.dataset.reason ?? null,
        lines: Array.from(root.querySelectorAll('[data-tax-line]')).map(row => ({
          id: row.dataset.lineId, kind: row.dataset.kind, treatment: row.dataset.treatment ?? null,
          input: amount(row, 'input'), amounts: ['net', 'tax', 'gross'].map(name => amount(row, name)),
          exemptionEvidence: Array.from(row.querySelectorAll('[data-tax-exemption-evidence]')).some(node => !node.hidden && node.textContent.trim().length > 0 && node.getBoundingClientRect().height > 0)
        })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
        totals: ['net', 'tax', 'gross'].map(name => amount(root.querySelector('[data-tax-totals]'), name)) };
    })()`);
    const vat = () => evaluate(`(() => {
      const result = document.querySelector('[data-tax-vat-result]');
      return { status: result.dataset.status, outcome: result.dataset.outcome ?? null,
        reason: result.dataset.reason ?? null, text: result.textContent.trim(),
        dates: document.querySelector('[data-tax-vat-dates]').textContent.trim() };
    })()`);
    const state = () => evaluate(`({
      scenario: document.querySelector('[data-tax-scenario]').value,
      priceBasis: document.querySelector('[data-tax-basis]:checked').value,
      vatScenario: document.querySelector('[data-tax-vat]').value
    })`);
    const basis = value => click(`[data-tax-basis][value="${value}"]`);
    const safety = async (stage) => {
      check(`${width} ${stage}: sin solicitudes operativas ni navegación externa`, forbiddenRequests().length === 0 && blockedRequests.length === 0);
      check(`${width} ${stage}: controles de ejemplo sin forms ni entrada de NIF real`, await evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(ROOT)});
        return !root.querySelector('form,textarea') &&
          Array.from(root.querySelectorAll('button')).every(button => button.type === 'button') &&
          Array.from(root.querySelectorAll('input')).every(input => input.type === 'radio') &&
          Array.from(root.querySelectorAll('a[href]')).every(link => !new URL(link.href).hostname.endsWith('.test'));
      })()`));
      check(`${width} ${stage}: sin overflow horizontal`, await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
    };
    const verifyTax = async (scenario, priceBasis) => {
      const result = await tax();
      const pending = scenario === 'unresolved_shipping' || scenario === 'no_assessment';
      check(`${width} ${scenario}/${priceBasis}: totales previstos sin sustituir null por cero`,
        JSON.stringify(result.totals.map(amount => amount.cents)) === JSON.stringify(TOTALS[scenario][priceBasis]));
      check(`${width} ${scenario}/${priceBasis}: cálculo por línea conserva céntimos exactos`,
        JSON.stringify(result.lines.map(line => line.amounts.map(amount => amount.cents))) === JSON.stringify(EXPECTED[scenario][priceBasis]));
      check(`${width} ${scenario}/${priceBasis}: identidad e importe de entrada se conservan`,
        JSON.stringify(result.lines.map(line => line.id)) === JSON.stringify(['goods.a', 'goods.b', 'shipping']) &&
        JSON.stringify(result.lines.map(line => line.input.cents)) === JSON.stringify(scenario === 'rounding' ? [5, 5, 50] : [1900, 750, 325]) &&
        result.lines[2].kind === 'shipping');
      check(`${width} ${scenario}/${priceBasis}: estado distingue calculado, parcial y sin respuesta`,
        result.outcome === (pending ? 'unresolved' : 'calculated') && result.reason ===
          (scenario === 'no_assessment' ? 'assessment_unavailable' : scenario === 'unresolved_shipping' ? 'line_unresolved' : null));
      if (pending) {
        const unknown = [...result.totals, ...result.lines.flatMap(line => line.amounts)].filter(amount => amount.cents === null);
        check(`${width} ${scenario}/${priceBasis}: importes desconocidos muestran explicación, no dinero`,
          unknown.length >= 6 && unknown.every(amount => amount.text.length > 0 && !/[0-9€]/u.test(amount.text)));
      }
      if (scenario === 'zero_exempt') {
        check(`${width} ${scenario}/${priceBasis}: tipo cero y exención son tratamientos distintos`,
          result.lines[0].treatment === 'zero_rate' && result.lines[1].treatment === 'exempt' &&
          !result.lines[0].exemptionEvidence && result.lines[1].exemptionEvidence);
      }
      if (scenario === 'no_assessment') check(`${width} ${scenario}/${priceBasis}: sin respuesta no se inventan tratamientos`,
        result.lines.every(line => line.treatment === null && !line.exemptionEvidence));
      return result;
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
    const setupWriteLog = await evaluate('window.__taxDemoAudit.storageWrites');
    const setupStorageWrites = setupWriteLog.length;
    check(`${width}: escrituras iniciales pertenecen solo a la guía`, setupWriteLog.every(write => write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    await evaluate('window.__taxDemoAudit.storageWrites.length = 0');
    const setupStorageEvents = storageEvents.filter((event) => event.sessionId === sessionId).length;
    const setupAudit = await evaluate('window.__taxDemoAudit');
    const sharedLocation = await sharedFrameLocation();
    await evaluate(`window.__taxDemoAudit.sharedFrameLocation = ${JSON.stringify(sharedLocation)}`);
    check(`${width}: arranque solo con rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, setupAudit.timers.every(timer => sharedTimer(timer, sharedLocation)) && setupAudit.beacons === 0 && setupAudit.windows === 0);
    const initial = await state();
    const initialTax = await tax();
    const initialVat = await vat();
    check(`${width}: cinco escenarios y cuatro estados VAT cerrados`, await evaluate(`document.querySelector('[data-tax-scenario]').options.length === 5 && document.querySelector('[data-tax-vat]').options.length === 4`));
    check(`${width}: inicio mixto sin impuesto incluido y VAT positivo independiente`, initial.scenario === 'mixed' && initial.priceBasis === 'excluded' && initial.vatScenario === 'valid' && initialVat.status === 'usable' && initialVat.outcome === 'valid');
    await verifyTax('mixed', 'excluded');
    await safety('excluido');
    await snapshot('excluido');
    const setupRequests = requests.filter(request => request.sessionId === sessionId).length;
    moduleSessions.add(sessionId);
    await evaluate('window.__taxDemoAudit.moduleActive = true');

    await evaluate(`document.querySelector('[data-tax-basis][value="excluded"]').focus()`);
    await key('ArrowRight', 'ArrowRight', 39);
    check(`${width}: flecha cambia el modo incluido conservando foco nativo`, (await state()).priceBasis === 'included' && await evaluate(`document.activeElement.matches('[data-tax-basis][value="included"]')`));
    await verifyTax('mixed', 'included');
    await safety('incluido');
    await snapshot('incluido');
    await key('Tab', 'Tab', 9);
    check(`${width}: Tab alcanza el selector VAT independiente`, await evaluate(`document.activeElement.matches('[data-tax-vat]')`));
    const beforeNegative = await tax();
    await key('ArrowDown', 'ArrowDown', 40);
    check(`${width}: teclado cambia VAT a negativo sin perder foco`, (await state()).vatScenario === 'invalid' && (await vat()).status === 'usable' && (await vat()).outcome === 'invalid' && await evaluate(`document.activeElement.matches('[data-tax-vat]')`));
    check(`${width}: resultado negativo VAT no cambia los impuestos`, JSON.stringify(await tax()) === JSON.stringify(beforeNegative));

    await select('[data-tax-vat]', 'valid');
    await basis('excluded');
    await select('[data-tax-scenario]', 'zero_exempt');
    await verifyTax('zero_exempt', 'excluded');
    await safety('cero-exento');
    await snapshot('cero-exento');
    await select('[data-tax-scenario]', 'unresolved_shipping');
    await verifyTax('unresolved_shipping', 'excluded');
    await safety('envio-pendiente');
    await snapshot('envio-pendiente');

    for (const scenario of SCENARIOS) {
      await select('[data-tax-scenario]', scenario);
      for (const priceBasis of BASES) {
        await basis(priceBasis);
        const stableTax = await verifyTax(scenario, priceBasis);
        for (const vatScenario of VAT_STATES) {
          await select('[data-tax-vat]', vatScenario);
          const result = await vat();
          const usable = vatScenario === 'valid' || vatScenario === 'invalid';
          check(`${width} ${scenario}/${priceBasis}/${vatScenario}: evidencia VAT explicada sin modificar cálculo`,
            result.status === (usable ? 'usable' : 'unusable') && result.outcome === (usable ? vatScenario : null) &&
            result.reason === (usable ? null : vatScenario) && JSON.stringify(await tax()) === JSON.stringify(stableTax));
        }
        await safety(`${scenario}/${priceBasis}`);
      }
    }
    await evaluate(`document.querySelector(${JSON.stringify(action('reset'))}).focus()`);
    await key('Enter', 'Enter', 13);
    check(`${width}: Enter restablece los controles y ambas evidencias independientes`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await tax()) === JSON.stringify(initialTax) && JSON.stringify(await vat()) === JSON.stringify(initialVat));
    await select('[data-tax-scenario]', 'no_assessment');
    await select('[data-tax-vat]', 'expired');
    const finalAudit = await evaluate('window.__taxDemoAudit');
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
    await wait(`(${ready}) && window.__taxDemoAudit?.documentEpoch !== ${JSON.stringify(previousDocumentEpoch)}`, 'recarga limpia en otro documento');
    const reloadedAudit = await evaluate('window.__taxDemoAudit');
    const reloadedSharedLocation = await sharedFrameLocation();
    check(`${width}: recarga solo permite rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, reloadedAudit.timers.every(timer => sharedTimer(timer, reloadedSharedLocation)) && reloadedAudit.beacons === 0 && reloadedAudit.windows === 0);
    check(`${width}: nuevas escrituras de arranque pertenecen solo a la guía`, reloadedAudit.storageWrites.every(write => write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    check(`${width}: recarga restaura cálculo y evidencia iniciales`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await tax()) === JSON.stringify(initialTax) && JSON.stringify(await vat()) === JSON.stringify(initialVat));
    check(`${width}: recarga conserva el almacenamiento anterior`, await storage() === initialStorage);
    storageEvidence.at(-1).reloadGuideWrites = reloadedAudit.storageWrites.length;
    storageEvidence.at(-1).sharedLayout.reloadCalls = reloadedAudit.timers.length;

    await call('Emulation.setScriptExecutionDisabled', { value: true });
    await call('Page.reload', { ignoreCache: true });
    await wait(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(ROOT)}) && document.querySelector(${JSON.stringify(ROOT)}).dataset.ready !== 'true' && window.__taxDemoAudit?.documentEpoch !== ${JSON.stringify(reloadedAudit.documentEpoch)}`, 'vista sin JavaScript en otro documento');
    check(`${width}: sin JavaScript conserva cálculo inicial y aviso`, JSON.stringify(await tax()) === JSON.stringify(initialTax) && await evaluate(`Array.from(document.querySelectorAll('noscript')).some(node => /JavaScript/u.test(node.textContent))`));
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
    runner: 'node scripts/test-tax-demo.mjs', nodeVersion: process.version,
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

/**
 * R5.6d: ejercicio de la muestra de segmentos en Chrome/CDP, sin dependencias.
 * Solo localhost y perfiles ficticios. No inicia servidor, jobs ni APIs.
 * BASE_URL, CHROME_BIN y OUTPUT_DIR permiten repetirlo en una QA aislada.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:8787').replace(/\/$/u, '');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname), 'Esta prueba solo admite un servidor local de fixtures.');
const PATH = '/demo/admin/segmentos';
const ROOT = '[data-customer-segments-demo]';
const TEMPLATES = ['orders-and-spend', 'recent-activity', 'new-without-orders'];
const EXPECTED = {
  'orders-and-spend': { matched: 4, unknown: 3 },
  'recent-activity': { matched: 4, unknown: 6 },
  'new-without-orders': { matched: 3, unknown: 2 },
};
const chrome = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((path) => path && existsSync(path));
if (!chrome) throw new Error('Indica CHROME_BIN con la ruta de Chrome.');
const output = resolve(process.env.OUTPUT_DIR ?? 'tmp/customer-segments-demo');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'ecom-segments-'));
const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--no-default-browser-check', '--no-proxy-server', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
let id = 0;
const pending = new Map();
const requests = [];
const errors = [];
const checks = [];
const screenshots = [];
const startedAt = new Date().toISOString();
let failure = null;

const diagnosticRequest = ({ url, method }) => {
  const parsed = new URL(url);
  return { origin: parsed.origin, pathname: parsed.pathname, method };
};
const mutatingRequests = () => requests.filter(({ method }) => !['GET', 'HEAD', 'OPTIONS'].includes(method));
const apiRequests = () => requests.filter(({ url }) => new URL(url).pathname.startsWith('/api/'));
const beaconRequests = () => requests.filter(({ url }) => /cloudflareinsights|\/cdn-cgi\/rum/u.test(url));

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
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Network.requestWillBeSent') {
      const { url, method } = message.params.request;
      requests.push({ url, method });
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push('console.error');
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    clearTimeout(task.timer);
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolveCall, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP no respondió: ${method}`)); }, 15000);
    pending.set(requestId, { resolve: resolveCall, reject, timer });
    socket.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const check = (label, actual) => { assert.ok(actual, label); checks.push(label); };

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
    const key = async (name, code, keyCode) => {
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode: keyCode,
        ...(name === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: keyCode });
    };
    const storage = () => evaluate(`JSON.stringify([localStorage, sessionStorage].map(storage => Object.keys(storage).sort().map(key => [key, storage.getItem(key)])))`);
    const state = () => evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(ROOT)});
      const number = name => Number(root.querySelector('[data-segment-' + name + ']').textContent.trim());
      const rows = Array.from(root.querySelectorAll('[data-segment-row]'));
      return { state: root.dataset.segmentState, total: number('total'), processed: number('processed'), matched: number('matched'), unknown: number('unknown'), pending: rows.filter(row => row.dataset.result === 'pending').length, rows: rows.length, results: rows.map(row => row.dataset.result), details: rows.map(row => row.querySelector('[data-segment-result-detail]')?.textContent.trim()), advanceDisabled: root.querySelector('[data-segment-advance]').disabled, simulateDisabled: root.querySelector('[data-segment-simulate]').disabled };
    })()`);
    const snapshot = async (name) => {
      await evaluate('window.scrollTo(0, 0)');
      const { cssContentSize } = await call('Page.getLayoutMetrics');
      const file = `${name}-${width}.png`;
      const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height: Math.min(cssContentSize.height, 8000), scale: 1 } });
      await writeFile(join(output, file), Buffer.from(data, 'base64'));
      screenshots.push(file);
    };
    const draft = async (label) => {
      const current = await state();
      check(`${width} ${label}: sin resultados anteriores`, current.state === 'draft' && current.processed === 0 && current.matched === 0 && current.unknown === 0 && current.pending === 12 && current.advanceDisabled);
    };
    const changeParameter = async (value) => evaluate(`(() => {
      const field = document.querySelector('[data-segment-parameter]');
      field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);

    await call('Network.enable');
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Emulation.setDeviceMetricsOverride', { width, height: width === 375 ? 812 : 900, deviceScaleFactor: 1, mobile: false });
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await call('Page.navigate', { url: `${BASE}/demo/admin/login?tour=1&next=${encodeURIComponent(PATH)}` });
    await wait(`location.pathname === ${JSON.stringify(PATH)} && document.readyState === 'complete' && document.querySelector(${JSON.stringify(ROOT)})?.dataset.segmentState === 'draft' && !document.querySelector('[data-segment-simulate]').disabled`, 'muestra inicializada');
    await evaluate(`document.querySelector('[data-guide-close]')?.click()`);
    const initialStorage = await storage();
    const defaults = await evaluate(`Array.from(document.querySelectorAll('[data-segment-parameter]')).map(input => [input.dataset.segmentParameter, input.value])`);
    check(`${width}: tres templates y doce perfiles ficticios`, await evaluate(`document.querySelectorAll('[data-segment-template]').length === 3 && document.querySelectorAll('[data-segment-row]').length === 12`));
    check(`${width}: formulario sin envío y ausencia expresada como Sin dato`, await evaluate(`!document.querySelector(${JSON.stringify(ROOT)}).querySelector('form') && document.querySelector(${JSON.stringify(ROOT)}).textContent.includes('Sin dato')`));
    check(`${width}: sin desbordamiento de página`, await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
    await draft('inicio');
    await snapshot('inicio');

    // Tab y Enter operan los botones nativos; comprobar el resultado evita
    // presentar una llamada programática a click como evidencia de teclado.
    await evaluate(`document.querySelector('[data-segment-template="orders-and-spend"]').focus()`);
    await key('Tab', 'Tab', 9);
    check(`${width}: Tab alcanza el siguiente template`, await evaluate(`document.activeElement?.matches('[data-segment-template="recent-activity"]')`));
    await key('Enter', 'Enter', 13);
    check(`${width}: Enter selecciona el template con estado accesible`, await evaluate(`document.querySelector('[data-segment-template="recent-activity"]').getAttribute('aria-pressed') === 'true'`));

    let sawUnknown = false;
    for (const template of TEMPLATES) {
      await click(`[data-segment-template="${template}"]`);
      await draft(template);
      await click('[data-segment-simulate]');
      check(`${width} ${template}: solicitud local sin evaluar perfiles`, (await state()).state === 'requested' && (await state()).processed === 0);
      await evaluate(`document.querySelector('[data-segment-advance]').focus()`);
      await key('Enter', 'Enter', 13);
      check(`${width} ${template}: inicio running con población completa`, (await state()).state === 'running' && (await state()).total === 12 && (await state()).processed === 0);
      for (const processed of [3, 6, 9, 12]) {
        await click('[data-segment-advance]');
        const current = await state();
        check(`${width} ${template}: lote confirma ${processed}/12`, current.state === 'running' && current.processed === processed && current.pending === 12 - processed && current.matched + current.unknown <= processed);
      }
      await click('[data-segment-advance]');
      const completed = await state();
      check(`${width} ${template}: completed requiere su paso separado`, completed.state === 'completed' && completed.pending === 0 && completed.advanceDisabled);
      check(`${width} ${template}: contadores coinciden con filas`, completed.matched === completed.results.filter(result => result === 'match').length && completed.unknown === completed.results.filter(result => result === 'unknown').length);
      check(`${width} ${template}: resultado esperado de los fixtures`, completed.matched === EXPECTED[template].matched && completed.unknown === EXPECTED[template].unknown);
      sawUnknown ||= completed.unknown > 0 && completed.details.some(detail => /Sin dato/iu.test(detail));
      if (template === TEMPLATES[0]) await snapshot('completado');

      const nextValue = await evaluate(`(() => { const field = document.querySelector('[data-segment-parameter]'); const step = Number(field.step) || 1; const value = Number(field.value); const max = field.max ? Number(field.max) : Infinity; return String(value + step <= max ? value + step : value - step); })()`);
      await changeParameter(nextValue);
      await draft(`${template} cambio válido`);
      await click('[data-segment-simulate]');
      await click('[data-segment-advance]');
      await click('[data-segment-advance]');
      await changeParameter('');
      const invalid = await state();
      check(`${width} ${template}: parámetro vacío invalida ejecución parcial`, invalid.state === 'invalid' && invalid.processed === 0 && invalid.matched === 0 && invalid.unknown === 0 && invalid.pending === 12 && invalid.simulateDisabled && invalid.advanceDisabled);
      check(`${width} ${template}: error accesible y visible`, await evaluate(`(() => { const error = document.querySelector('[data-segment-error]'); return error.getAttribute('role') === 'alert' && !error.hidden && error.textContent.trim().length > 0; })()`));
      if (template === TEMPLATES[0]) await snapshot('invalido');
      await changeParameter(nextValue);
      await draft(`${template} reparación`);
    }
    check(`${width}: ausencia conserva resultado Sin dato`, sawUnknown);
    check(`${width}: los resultados no escriben almacenamiento del navegador`, await storage() === initialStorage);
    await click('[data-segment-reset]');
    await draft('reset');
    check(`${width}: reset restaura parámetros originales`, await evaluate(`JSON.stringify(Array.from(document.querySelectorAll('[data-segment-parameter]')).map(input => [input.dataset.segmentParameter, input.value])) === ${JSON.stringify(JSON.stringify(defaults))}`));
    await click('[data-segment-simulate]');
    await click('[data-segment-advance]');
    await click('[data-segment-advance]');
    await call('Page.reload', { ignoreCache: true });
    await wait(`document.readyState === 'complete' && document.querySelector(${JSON.stringify(ROOT)})?.dataset.segmentState === 'draft' && !document.querySelector('[data-segment-simulate]').disabled`, 'recarga limpia');
    await draft('recarga');
    check(`${width}: recarga no recupera resultados guardados`, await storage() === initialStorage);
    check(`${width}: configuración y tabla conservan ancho de página`, await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));

    await call('Emulation.setScriptExecutionDisabled', { value: true });
    await call('Page.reload', { ignoreCache: true });
    await wait(`document.readyState === 'complete' && !!document.querySelector('[data-segment-nojs]')?.firstElementChild`, 'fallback sin JavaScript');
    check(`${width}: sin JavaScript conserva datos e instrucciones`, await evaluate(`document.querySelectorAll('[data-segment-row]').length === 12 && document.querySelector('[data-segment-nojs]').textContent.trim().length > 0 && document.querySelector(${JSON.stringify(ROOT)}).textContent.includes('Sin dato')`));
    check(`${width}: sin JavaScript todos los controles de simulación quedan inertes`, await evaluate(`Array.from(document.querySelector(${JSON.stringify(ROOT)}).querySelectorAll('button')).every(button => button.type === 'button' && button.disabled) && Array.from(document.querySelector(${JSON.stringify(ROOT)}).querySelectorAll('input')).every(input => input.disabled)`));
    check(`${width}: sin JavaScript no hay formulario ni overflow`, await evaluate(`!document.querySelector(${JSON.stringify(ROOT)}).querySelector('form') && document.documentElement.scrollWidth <= innerWidth + 1`));
    await snapshot('sin-js');
    check(`${width}: cero APIs, mutaciones y analytics`, apiRequests().length === 0 && mutatingRequests().length === 0 && beaconRequests().length === 0);
    await send('Target.disposeBrowserContext', { browserContextId });
  }
  check('sin excepciones ni console.error', errors.length === 0);
} catch (error) {
  failure = error instanceof Error ? error.message : 'Fallo de auditoría';
  process.exitCode = 1;
} finally {
  await writeFile(join(output, 'report.json'), JSON.stringify({
    schemaVersion: 1, startedAt, completedAt: new Date().toISOString(),
    scope: 'local-fixture-only', path: PATH, viewports: [1440, 375],
    runner: 'node scripts/test-customer-segments-demo.mjs', nodeVersion: process.version,
    result: failure === null ? 'passed' : 'failed', checksPassed: checks.length,
    checks, failure, screenshots, requestCount: requests.length,
    apiRequests: apiRequests().map(diagnosticRequest),
    mutatingRequests: mutatingRequests().map(diagnosticRequest),
    analyticsRequests: beaconRequests().map(diagnosticRequest), errors,
  }, null, 2) + '\n');
  for (const task of pending.values()) clearTimeout(task.timer);
  socket?.close();
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise((resolveExit) => { child.once('exit', resolveExit); child.kill(); });
  }
  await rm(profile, { recursive: true, force: true });
  process.stdout.write(`${checks.length} comprobaciones correctas${failure ? `; fallo: ${failure}` : ''}; informe en ${output}/report.json\n`);
}

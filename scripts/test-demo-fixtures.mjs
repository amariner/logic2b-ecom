/**
 * Auditoría local de formularios fixture: prueba el HTML servido y las acciones
 * con y sin JavaScript. Solo datos ficticios; nunca envía formularios a APIs.
 * Usa Chrome + CDP nativo, sin dependencias. BASE_URL debe ser localhost.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:8787').replace(/\/$/u, '');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname), 'Esta auditoría solo usa un servidor local de fixtures.');
const chrome = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((path) => path && existsSync(path));
if (!chrome) throw new Error('Indica CHROME_BIN con la ruta de Chrome.');
const output = resolve(process.env.OUTPUT_DIR ?? 'tmp/demo-fixtures-browser');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'ecom-fixtures-'));
const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--no-proxy-server', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
let id = 0;
const pending = new Map();
const requests = [];
const errors = [];
const checks = [];
try {
  const endpoint = await new Promise((resolveEndpoint, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error('Chrome no arrancó en 15 segundos.')), 15000);
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/u);
      if (match) { clearTimeout(timer); resolveEndpoint(match[1]); }
    });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome terminó con ${code}.`)); });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolveOpen, reject) => { socket.addEventListener('open', resolveOpen); socket.addEventListener('error', reject); });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Network.requestWillBeSent') requests.push({ ...message.params.request, resourceType: message.params.type });
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolveCall, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve: resolveCall, reject });
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
        await delay(100);
      }
      throw new Error(`${label}: ${await evaluate('location.href')}`);
    };
    const navigate = async (path) => {
      await call('Page.navigate', { url: BASE + path });
      await wait(`document.readyState === 'complete' && location.pathname === ${JSON.stringify(path.split('?')[0])}`, path);
    };
    const screenshot = async (name) => {
      const { data } = await call('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(output, `${name}-${width}.png`), Buffer.from(data, 'base64'));
    };
    const noMutations = () => requests.every((request) => ['GET', 'HEAD', 'OPTIONS'].includes(request.method));
    const noBeacon = () => requests.every((request) => !/cloudflareinsights|\/cdn-cgi\/rum/u.test(request.url));
    await call('Network.enable');
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Emulation.setDeviceMetricsOverride', { width, height: width === 375 ? 812 : 900, deviceScaleFactor: 1, mobile: false });
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

    await navigate('/');
    check(`contacto ${width}: métodos sin red y sin action`, await evaluate(`Array.from(document.querySelectorAll('[data-project-form]')).length > 0 && Array.from(document.querySelectorAll('[data-project-form]')).every(form => form.method === 'dialog' && !form.hasAttribute('action'))`));
    await evaluate(`document.querySelector('[data-open-project]').click()`);
    await wait(`document.querySelector('[data-project-dialog]').open`, 'Diálogo abierto');
    await evaluate(`(() => { const form = document.querySelector('[data-project-dialog] [data-project-form]'); form.elements.namedItem('name').value = 'Ejemplo Fixture'; form.elements.namedItem('email').value = 'fixture@example.invalid'; form.elements.namedItem('needs').value = 'Solicitud ficticia para comprobar la demostración'; form.requestSubmit(); })()`);
    await wait(`document.querySelector('[data-project-dialog] [data-form-status]').textContent.includes('no se ha enviado')`, 'Confirmación local');
    check(`contacto ${width}: el diálogo sigue abierto tras simular`, await evaluate(`document.querySelector('[data-project-dialog]').open`));
    check(`contacto ${width}: campos personales vaciados`, await evaluate(`document.querySelector('[data-project-dialog] input[name=email]').value === ''`));
    await evaluate(`document.querySelector('[data-project-dialog]').scrollTop = 0`);
    await screenshot('contacto');
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await wait(`!document.querySelector('[data-project-dialog]').open`, 'Escape cierra el diálogo');

    await navigate('/demo/admin/login');
    check(`login ${width}: sin formulario ni contraseña`, await evaluate(`!document.querySelector('form') && !document.querySelector('input[type=password]')`));
    await screenshot('login');
    await evaluate(`document.querySelector('a[href*="/demo/admin/login?tour=1"]').click()`);
    await wait(`location.pathname === '/demo/admin' && document.readyState === 'complete' && !!document.querySelector('#bulk-actions')`, 'Panel de fixtures');
    await evaluate(`document.querySelector('[data-guide-close]')?.click()`);
    await evaluate(`document.querySelector('[data-bulk-select-page]').click(); document.querySelector('#bulk-action-form').requestSubmit()`);
    await wait(`document.querySelector('[data-bulk-status]').textContent.includes('Ejemplo local')`, 'Previsualización local');
    check(`lote ${width}: muestra selección sin ejecución`, await evaluate(`Number(document.querySelector('[data-bulk-ready]').textContent) > 0 && document.querySelector('[data-bulk-confirm]').hidden && document.querySelector('[data-bulk-replay]').hidden`));
    await evaluate(`document.querySelector('[data-bulk-confirm]').click(); document.querySelector('[data-bulk-replay]').click(); document.querySelector('#bulk-preview-result').scrollIntoView({ block: 'start', behavior: 'instant' }); window.scrollBy(0, innerWidth < 640 ? -190 : -24)`);
    await screenshot('lote');
    check(`lote ${width}: sin peticiones mutantes ni beacon`, noMutations() && noBeacon());

    // El método nativo también corta los envíos cuando falla todo el JS de la página.
    await call('Emulation.setScriptExecutionDisabled', { value: true });
    await navigate('/');
    const beforeNative = requests.length;
    await evaluate(`(() => { const form = Array.from(document.querySelectorAll('[data-project-form]')).find(form => !form.closest('dialog')); form.elements.namedItem('name').value = 'Ejemplo sin JavaScript'; form.elements.namedItem('email').value = 'sin-js@example.invalid'; form.elements.namedItem('needs').value = 'Datos ficticios que no deben enviarse'; form.submit(); })()`);
    await delay(200);
    check(`sin JS ${width}: el contacto no navega ni transmite datos`, requests.slice(beforeNative).every((request) => !request.url.includes('sin-js') && !request.url.includes('/api/contact')) && await evaluate(`location.pathname === '/' && location.search === ''`));
    for (const [path, selector] of [
      ['/demo/tiendas/arce', '[data-arce-newsletter]'],
      ['/demo/tiendas/noddo', '[data-noddo-contact]'],
      ['/demo/tiendas/zancada', '[data-newsletter]'],
    ]) {
      await navigate(path);
      check(`sin JS ${width}: ${selector} no tiene envío nativo`, await evaluate(`document.querySelector(${JSON.stringify(selector)})?.method === 'dialog'`));
      const before = requests.length;
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).submit()`);
      await delay(100);
      check(`sin JS ${width}: ${selector} no envía solicitudes`, requests.slice(before).every((request) => request.resourceType !== 'Document' && ['GET', 'HEAD', 'OPTIONS'].includes(request.method)));
    }
    check(`navegación ${width}: no transmite emails ficticios en URLs`, requests.every((request) => !/example\.invalid|sin-js/u.test(request.url)));
    check(`navegación ${width}: cero peticiones mutantes o beacon`, noMutations() && noBeacon());
    await send('Target.disposeBrowserContext', { browserContextId });
  }
  check('sin errores JavaScript', errors.length === 0);
  await writeFile(join(output, 'report.json'), JSON.stringify({ checks, requestCount: requests.length, mutatingRequests: requests.filter((request) => !['GET', 'HEAD', 'OPTIONS'].includes(request.method)).map(({ url, method }) => ({ url, method })), errors }, null, 2) + '\n');
  process.stdout.write(`${checks.length} comprobaciones correctas; informe en ${output}/report.json\n`);
} finally {
  socket?.close();
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise((resolveExit) => { child.once('exit', resolveExit); child.kill(); });
  }
  await rm(profile, { recursive: true, force: true });
}

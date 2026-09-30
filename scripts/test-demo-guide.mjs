/**
 * Regresión del recorrido público: solo pulsar los controles de la guía desde
 * una pestaña vacía, sin introducir datos ni contraseña. Chrome + CDP nativo,
 * sin dependencias. BASE_URL permite comprobar también el despliegue público.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const chrome = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((path) => path && existsSync(path));
if (!chrome) throw new Error('Indica CHROME_BIN con la ruta de Chrome.');
const profile = await mkdtemp(join(tmpdir(), 'ecom-guide-'));
const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--no-proxy-server', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
const pending = new Map();
let id = 0;
const requests = [];
const errors = [];
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Chrome no arrancó en 15 segundos.')), 15000);
    child.stderr.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome terminó con ${code}.`)); });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  for (const width of [1440, 375]) {
    const { browserContextId } = await send('Target.createBrowserContext');
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params = {}) => send(method, params, sessionId);
    const evaluate = async (expression) => {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async (expression, label) => {
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline) {
        if (await evaluate(expression)) return;
        await delay(100);
      }
      throw new Error(`${label}: ${await evaluate('location.href')} · ${await evaluate('document.querySelector("[data-guide-title]")?.textContent')}`);
    };
    const click = async (selector) => {
      const point = await evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) throw new Error('Control ausente');
        element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        const r = element.getBoundingClientRect();
        const x = r.x + r.width / 2, y = r.y + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        if (!hit || !element.contains(hit)) throw new Error('Control oculto o tapado');
        return { x, y };
      })()`);
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    };
    const ready = (path) => `location.pathname === ${JSON.stringify(path)} && document.querySelector('[data-guide-title]')?.textContent.length > 0 && !document.querySelector('[data-guide-card]')?.hidden`;
    await call('Network.enable');
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Emulation.setDeviceMetricsOverride', { width, height: width === 375 ? 812 : 900, deviceScaleFactor: 1, mobile: false });
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await call('Page.navigate', { url: BASE + '/' });
    await wait(`document.readyState === 'complete' && !!document.querySelector('a[href="/demo/tiendas/traza?tour=1"]')`, 'Entrada Traza desde portada');
    assert.equal(await evaluate(`!!document.querySelector('[data-demo-assistant]')`), false);
    await click(width === 375 ? '.hx-actions a[href="/demo/tiendas/traza?tour=1"]' : 'a[href="/demo/tiendas/traza?tour=1"]');
    await wait(ready('/demo/tiendas/traza'), 'Catálogo');
    const product = await evaluate(`JSON.parse(document.querySelector('[data-demo-assistant]').dataset.guideStore).product`);
    await click('[data-guide-next]');
    await wait(ready(product), 'Ficha');
    assert.equal(await evaluate(`localStorage.getItem('ecom-cart:traza')`), null, 'no se modifica la cesta antes del avance explícito');
    await click('[data-guide-next]');
    await wait(ready('/demo/tiendas/traza/carrito'), 'Cesta preparada');
    const cart = await evaluate(`JSON.parse(localStorage.getItem('ecom-cart:traza'))`);
    assert.equal(cart.length, 1); assert.equal(cart[0].qty, 1);
    assert.equal(await evaluate(`localStorage.getItem('ecom-demo-cp')`), '12001');
    assert.equal(await evaluate(`document.querySelector('[data-cart-empty]').classList.contains('hidden')`), true);
    await evaluate('history.back()');
    await wait(ready(product), 'Volver a ficha');
    await click('[data-guide-next]');
    await wait(ready('/demo/tiendas/traza/carrito'), 'Cesta sin duplicados');
    assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('ecom-cart:traza'))`), cart);
    await click('[data-guide-next]');
    await wait(ready('/demo/tiendas/traza/checkout'), 'Checkout');
    assert.equal(await evaluate(`document.querySelector('[name="name"]').value`), '');
    await click('[data-guide-next]');
    await wait(ready('/demo/tiendas/traza/gracias'), 'Confirmación sin rellenar campos');
    await wait(`!document.querySelector('[data-demo-success]').classList.contains('hidden')`, 'Compra local completada');
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('ecom-cart:traza')).length`), 0);
    await click('[data-guide-next]');
    await wait(ready('/demo/admin'), 'Gestor sin contraseña');
    const { cookies } = await call('Network.getCookies', { urls: [BASE + '/demo/admin'] });
    assert(cookies.some((cookie) => cookie.name === 'admin_session' && cookie.httpOnly));
    for (const path of ['detail', '/demo/admin/envios', '/demo/admin/emails', '/demo/admin/productos']) {
      await click('[data-guide-next]');
      await wait(path === 'detail' ? `location.pathname.startsWith('/demo/admin/pedidos/') && document.querySelector('[data-guide-title]')?.textContent.includes('información')` : ready(path), path);
    }
    assert(await evaluate(`!!document.querySelector('input[data-field][disabled]')`));
    assert(await evaluate(`document.documentElement.scrollWidth <= innerWidth`));
    await click('[data-guide-finish]');
    assert.equal(await evaluate(`document.querySelector('[data-guide-card]').hidden`), true);
    console.log(`✓ ${width}px: recorrido completo solo con la guía; cesta sin duplicados, compra local, gestor sin contraseña y campos de solo lectura`);
    await send('Target.disposeBrowserContext', { browserContextId });
  }
  assert.deepEqual(errors, []);
  assert.equal(requests.filter((request) => request.url.startsWith(BASE + '/api/')).length, 0, 'el recorrido no llama a APIs de compra ni mutación');
  console.log('✓ Sin excepciones JavaScript ni llamadas a las APIs operativas');
} finally {
  socket?.close();
  child.kill();
  await delay(200);
  await rm(profile, { recursive: true, force: true });
}

/**
 * R5.8b: mercados y publicación editorial simulados en Chrome/CDP.
 * Solo un servidor localhost de fixtures ya abierto. No inicia servidores ni
 * toca D1; bloquea antes del envío APIs, mutaciones y peticiones externas.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:8793').replace(/\/$/u, '');
const baseUrl = new URL(BASE);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname) &&
  ['http:', 'https:'].includes(baseUrl.protocol) && baseUrl.origin === BASE,
'Esta prueba solo admite un origen local de fixtures.');
const PATH = '/demo/admin/mercados';
const ROOT = '[data-market-content-demo]';
const ENGLISH = 'en-GB';
const CONTENTS = ['demo.guide', 'demo.story'];
const GUIDE_STORAGE_KEY = 'logic2b:ecom-guide:v1';
const action = (name) => `[data-content-action="${name}"]`;
const chrome = [process.env.CHROME_BIN, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome']
  .find((path) => path && existsSync(path));
if (!chrome) throw new Error('Indica CHROME_BIN con la ruta de Chrome.');
const output = resolve(process.env.OUTPUT_DIR ?? 'tmp/market-content-demo');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'ecom-market-content-'));
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
  const audit = { documentEpoch: crypto.randomUUID(), storageWrites: [], beacons: 0, windows: 0 };
  Object.defineProperty(window, '__marketContentAudit', { value: audit });
  for (const name of ['setItem', 'removeItem', 'clear']) {
    const original = Storage.prototype[name];
    Storage.prototype[name] = function(...args) {
      audit.storageWrites.push({ method: name, key: name === 'clear' ? null : String(args[0]) });
      return original.apply(this, args);
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
    if (message.method === 'Fetch.requestPaused') {
      const { request, requestId } = message.params;
      const reason = requestReason(request);
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
    const rows = () => evaluate(`Array.from(document.querySelectorAll('[data-content-url-row]')).map(row => ({
      contentId: row.dataset.contentId, locale: row.dataset.locale, revision: row.dataset.revision,
      lastmod: row.dataset.lastmod, url: row.querySelector('[data-content-url]').textContent.trim()
    })).sort((left, right) => left.url < right.url ? -1 : left.url > right.url ? 1 : 0)`);
    const state = () => evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(ROOT)});
      const draft = root.querySelector('[data-content-draft-state]');
      const published = root.querySelector('[data-content-published-revision]');
      const resolution = root.querySelector('[data-content-resolution]');
      return { contentId: root.querySelector('[data-content-select]').value,
        result: resolution.dataset.result, resolutionText: resolution.textContent.trim(),
        draft: draft.dataset.state, dirty: draft.dataset.dirty, published: published.dataset.revision ?? null,
        reviewDisabled: root.querySelector(${JSON.stringify(action('submit_review'))}).disabled,
        publishDisabled: root.querySelector(${JSON.stringify(action('publish'))}).disabled,
        fields: Array.from(root.querySelectorAll('[data-content-field]')).map(field => [field.dataset.contentField, field.value]) };
    })()`);
    const safety = async (stage) => {
      check(`${width} ${stage}: sin solicitudes operativas ni navegación externa`, forbiddenRequests().length === 0 && blockedRequests.length === 0);
      check(`${width} ${stage}: URLs ficticias como texto, sin forms ni enlaces .test`, await evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(ROOT)});
        return !root.querySelector('form') && Array.from(root.querySelectorAll('a[href]')).every(link => !new URL(link.href).hostname.endsWith('.test'))
          && Array.from(root.querySelectorAll('[data-content-url]')).every(node => !node.closest('a[href]'));
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
    const setupStorageWrites = await evaluate('window.__marketContentAudit.storageWrites.length');
    await evaluate('window.__marketContentAudit.storageWrites.length = 0');
    const setupStorageEvents = storageEvents.filter((event) => event.sessionId === sessionId).length;
    const initial = await state();
    const baseline = await rows();
    check(`${width}: dos contenidos y cuatro URLs publicadas iniciales`, await evaluate(`document.querySelector('[data-content-select]').options.length === 2`) && baseline.length === 4);
    check(`${width}: ES inicial coincide y EN sigue borrador sin publicación`, initial.result === 'matched' && initial.draft === 'draft' && initial.published === null && initial.publishDisabled);
    check(`${width}: no se publican rutas de EN ni FR al preparar el ejemplo`, baseline.every((row) => ['es-ES', 'ca-ES'].includes(row.locale)));
    check(`${width}: los dos contenidos conservan identidad independiente`, CONTENTS.every((contentId) => baseline.filter((row) => row.contentId === contentId).length === 2));
    await safety('inicio');
    await snapshot('inicio-es');
    const setupRequests = requests.filter((request) => request.sessionId === sessionId).length;

    await select('[data-content-stale-policy]', 'exclude');
    const currentOnly = await rows();
    check(`${width}: exclude omite solo CA desactualizado de story`, currentOnly.length === 3 && !currentOnly.some((row) => row.contentId === CONTENTS[1] && row.locale === 'ca-ES'));
    await select('[data-content-stale-policy]', 'include');
    check(`${width}: include restaura publicaciones históricas explícitas`, JSON.stringify(await rows()) === JSON.stringify(baseline));
    await select('[data-market-select]', 'FR');
    await select('[data-content-locale]', 'market-default');
    await select('[data-content-fallback]', 'none');
    check(`${width}: FR sin traducción queda no disponible`, (await state()).result === 'unresolved');
    await select('[data-content-fallback]', 'es-ES');
    check(`${width}: fallback FR→ES se declara sin crear traducción francesa`, (await state()).result === 'fallback' && JSON.stringify(await rows()) === JSON.stringify(baseline));
    await safety('fallback');
    await snapshot('fallback-fr');
    await select('[data-content-locale]', 'ca-ES');
    check(`${width}: preferencia explícita CA resuelve sin cambiar el mercado`, (await state()).result === 'matched' && await evaluate(`document.querySelector('[data-market-select]').value === 'FR'`));

    await select('[data-market-select]', 'ES');
    await select('[data-content-select]', CONTENTS[0]);
    await select('[data-content-locale]', ENGLISH);
    await select('[data-content-fallback]', 'none');
    check(`${width}: EN borrador no se confunde con publicación`, (await state()).result === 'unresolved' && (await state()).published === null);
    await evaluate(`document.querySelector(${JSON.stringify(action('submit_review'))}).focus()`);
    await key('Enter', 'Enter', 13);
    check(`${width}: Enter envía únicamente el borrador a revisión local`, (await state()).draft === 'review' && !(await state()).publishDisabled);
    check(`${width}: revisión conserva intacto el plan de publicaciones`, JSON.stringify(await rows()) === JSON.stringify(baseline));
    await key('Tab', 'Tab', 9);
    check(`${width}: Tab alcanza el botón de publicación`, await evaluate(`document.activeElement.matches(${JSON.stringify(action('publish'))})`));
    await key('Enter', 'Enter', 13);
    const publishedRows = await rows();
    const guidePublished = publishedRows.find((row) => row.contentId === CONTENTS[0] && row.locale === ENGLISH);
    check(`${width}: publicar EN seleccionado añade una única URL`, publishedRows.length === 5 && !!guidePublished && (await state()).result === 'matched');
    check(`${width}: publicación tiene revisión y lastmod explícitos`, Number(guidePublished?.revision) > 0 && Number.isFinite(Date.parse(guidePublished?.lastmod)));
    check(`${width}: publicar guide deja intactas las URLs de story`, JSON.stringify(publishedRows.filter((row) => row.contentId === CONTENTS[1])) === JSON.stringify(baseline.filter((row) => row.contentId === CONTENTS[1])));
    await safety('publicado');
    await snapshot('en-publicado');

    await select('[data-content-select]', CONTENTS[1]);
    check(`${width}: story mantiene su borrador EN independiente`, (await state()).published === null && (await state()).draft === 'draft');
    await select('[data-content-select]', CONTENTS[0]);
    const titleSelector = '[data-content-field="title"]';
    await evaluate(`(() => { const field = document.querySelector(${JSON.stringify(titleSelector)}); field.focus(); field.setSelectionRange(field.value.length, field.value.length); })()`);
    await call('Input.insertText', { text: ' · revisión local' });
    check(`${width}: escribir conserva foco y marca cambios sin guardar`, await evaluate(`document.activeElement.matches(${JSON.stringify(titleSelector)})`) && (await state()).dirty === 'true');
    check(`${width}: cambios pendientes bloquean revisión/publicación`, (await state()).reviewDisabled && (await state()).publishDisabled);
    check(`${width}: editar no cambia ninguna URL, revisión ni lastmod publicado`, JSON.stringify(await rows()) === JSON.stringify(publishedRows));
    const editedFields = (await state()).fields;
    await select('[data-content-select]', CONTENTS[1]);
    await select('[data-content-select]', CONTENTS[0]);
    check(`${width}: cada contenido conserva su propio buffer de edición`, JSON.stringify((await state()).fields) === JSON.stringify(editedFields) && (await state()).dirty === 'true');
    await click(action('save_draft'));
    check(`${width}: guardar nuevo borrador conserva publicación anterior`, (await state()).draft === 'draft' && (await state()).dirty === 'false' && (await state()).published === guidePublished.revision && JSON.stringify(await rows()) === JSON.stringify(publishedRows));
    await safety('reeditado');
    await snapshot('en-reeditado');
    await click(action('submit_review'));
    check(`${width}: nueva revisión sigue sin alterar publicación`, (await state()).draft === 'review' && JSON.stringify(await rows()) === JSON.stringify(publishedRows));
    await click(action('publish'));
    const republished = (await rows()).find((row) => row.contentId === CONTENTS[0] && row.locale === ENGLISH);
    check(`${width}: nueva publicación conserva URL y avanza revisión/lastmod`, republished.url === guidePublished.url && Number(republished.revision) > Number(guidePublished.revision) && Date.parse(republished.lastmod) > Date.parse(guidePublished.lastmod));

    const replaceTitle = async (value) => {
      await evaluate(`(() => { const field = document.querySelector(${JSON.stringify(titleSelector)}); field.focus(); field.select(); })()`);
      if (value) await call('Input.insertText', { text: value });
      else await key('Backspace', 'Backspace', 8);
    };
    const longTitle = 'A'.repeat(200);
    await replaceTitle(longTitle);
    await click(action('save_draft'));
    await click(action('submit_review'));
    await click(action('publish'));
    check(`${width}: publicación admite un título largo sin espacios`, await evaluate(`document.querySelector('[data-preview-title]').textContent === ${JSON.stringify(longTitle)}`));
    await safety('título-largo');
    const beforeIncomplete = await rows();
    const publishedBeforeIncomplete = (await state()).published;
    await replaceTitle('');
    check(`${width}: el borrador incompleto se puede guardar sin publicar`, !(await evaluate(`document.querySelector(${JSON.stringify(action('save_draft'))}).disabled`)) && (await state()).reviewDisabled && (await state()).publishDisabled);
    await click(action('save_draft'));
    check(`${width}: guardar título vacío bloquea revisión y conserva la publicación`, (await state()).draft === 'draft' && (await state()).dirty === 'false' && (await state()).reviewDisabled && (await state()).publishDisabled && (await state()).published === publishedBeforeIncomplete && JSON.stringify(await rows()) === JSON.stringify(beforeIncomplete));
    await replaceTitle('Recovered English example');
    await click(action('save_draft'));
    check(`${width}: restaurar título completo permite revisión sin mover URLs`, !(await state()).reviewDisabled && (await state()).publishDisabled && JSON.stringify(await rows()) === JSON.stringify(beforeIncomplete));
    await click(action('submit_review'));
    check(`${width}: borrador recuperado entra en revisión local`, (await state()).draft === 'review' && !(await state()).publishDisabled);

    const audit = await evaluate('window.__marketContentAudit');
    check(`${width}: interacciones del módulo no escriben almacenamiento`, audit.storageWrites.length === 0 && await storage() === initialStorage);
    check(`${width}: cero intentos de beacon o ventanas externas`, audit.beacons === 0 && audit.windows === 0);
    await click(action('reset'));
    check(`${width}: reset devuelve contenido, controles y publicaciones iniciales`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await rows()) === JSON.stringify(baseline));
    await select('[data-content-locale]', ENGLISH);
    await click(action('submit_review'));
    await click(action('publish'));
    const finalAudit = await evaluate('window.__marketContentAudit');
    const moduleStorageEvents = storageEvents.filter((event) => event.sessionId === sessionId).length - setupStorageEvents;
    const moduleRequests = requests.filter((request) => request.sessionId === sessionId).length - setupRequests;
    check(`${width}: reset y nuevas acciones tampoco escriben almacenamiento`, finalAudit.storageWrites.length === 0 && moduleStorageEvents === 0 && await storage() === initialStorage);
    check(`${width}: reset mantiene cero intentos de beacon o ventanas`, finalAudit.beacons === 0 && finalAudit.windows === 0);
    check(`${width}: todas las interacciones se resuelven sin nuevas solicitudes HTTP`, moduleRequests === 0);
    storageEvidence.push({ width, setupGuideWrites: setupStorageWrites, moduleWrites: finalAudit.storageWrites.length,
      moduleMutationEvents: moduleStorageEvents, moduleRequests, unchanged: true });
    const previousDocumentEpoch = finalAudit.documentEpoch;
    await call('Page.reload', { ignoreCache: true });
    await wait(`(${ready}) && window.__marketContentAudit?.documentEpoch !== ${JSON.stringify(previousDocumentEpoch)}`, 'recarga limpia en otro documento');
    const reloadedAudit = await evaluate('window.__marketContentAudit');
    check(`${width}: nueva carga no intenta beacon ni ventanas`, reloadedAudit.beacons === 0 && reloadedAudit.windows === 0);
    check(`${width}: nuevas escrituras de arranque pertenecen solo a la guía`, reloadedAudit.storageWrites.every((write) => write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    check(`${width}: recarga no recupera la simulación anterior`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await rows()) === JSON.stringify(baseline));
    check(`${width}: recarga conserva el almacenamiento anterior`, await storage() === initialStorage);
    storageEvidence.at(-1).reloadGuideWrites = reloadedAudit.storageWrites.length;

    await call('Emulation.setScriptExecutionDisabled', { value: true });
    await call('Page.reload', { ignoreCache: true });
    await wait(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(ROOT)}) && document.querySelector(${JSON.stringify(ROOT)}).dataset.ready !== 'true' && window.__marketContentAudit?.documentEpoch !== ${JSON.stringify(reloadedAudit.documentEpoch)}`, 'vista sin JavaScript en otro documento');
    check(`${width}: sin JavaScript conserva publicaciones y aviso`, (await rows()).length === 4 && await evaluate(`Array.from(document.querySelectorAll('noscript')).some(node => /JavaScript/u.test(node.textContent))`));
    check(`${width}: sin JavaScript todos los controles permanecen inertes`, await evaluate(`Array.from(document.querySelector(${JSON.stringify(ROOT)}).querySelectorAll('button,input,select,textarea')).every(control => control.disabled && (control.tagName !== 'BUTTON' || control.type === 'button'))`));
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
    runner: 'node scripts/test-market-content-demo.mjs', nodeVersion: process.version,
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

/**
 * R6.6c: comparación de ofertas y presupuesto explícito de fixtures en Chrome/CDP.
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
const PATH = '/demo/admin/presupuestos-empresa';
const ROOT = '[data-company-negotiation-demo]';
const COMPARISON = '[data-negotiation-comparison]';
const OFFER = '[data-negotiation-offer]';
const MOMENT = '[data-negotiation-moment]';
const INITIAL = { comparisonId: 'one-two', offerId: 'one', momentId: 'start' };
const MOMENTS = { start: '2026-10-03T14:00:00.000Z', 'first-expiry': '2026-10-10T12:00:00.000Z',
  'second-expiry': '2026-10-11T12:00:00.000Z', after: '2026-10-12T12:00:00.000Z' };
const MOMENT_LABELS = ['3 oct · 14:00 UTC', '10 oct · 12:00 UTC', '11 oct · 12:00 UTC', '12 oct · 12:00 UTC'];
const INSTANT_TEXT = {
  '2026-10-03T12:00:00.000Z': '3 oct 2026, 12:00 UTC', '2026-10-03T13:00:00.000Z': '3 oct 2026, 13:00 UTC',
  '2026-10-03T14:00:00.000Z': '3 oct 2026, 14:00 UTC', '2026-10-10T12:00:00.000Z': '10 oct 2026, 12:00 UTC',
  '2026-10-11T12:00:00.000Z': '11 oct 2026, 12:00 UTC', '2026-10-12T12:00:00.000Z': '12 oct 2026, 12:00 UTC',
};
// Expectativas literales del plan: no importa modelos, reducers ni formateadores del producto.
const MONEY = { 0: '0,00 €', 200: '2,00 €', 500: '5,00 €', 900: '9,00 €', 1350: '13,50 €', 1400: '14,00 €',
  1750: '17,50 €', 1800: '18,00 €', 2000: '20,00 €', 3600: '36,00 €', 4050: '40,50 €', 4200: '42,00 €',
  5800: '58,00 €', 6000: '60,00 €', 7200: '72,00 €', 7700: '77,00 €' };
const DELTA_TEXT = { '-3000': '-30,00 €', '-500': '-5,00 €', '-3500': '-35,00 €', 1600: '+16,00 €', 200: '+2,00 €',
  1800: '+18,00 €', '-1400': '-14,00 €', '-300': '-3,00 €', '-1700': '-17,00 €' };
const OFFERS = {
  one: { label: 'Oferta 1', side: 'Propuesta del vendedor', created: '2026-10-03T12:00:00.000Z', expires: MOMENTS['first-expiry'],
    amounts: [7200, 500, 7700], lines: [
      { productId: 1, variantId: 11, label: 'Natural', sku: 'DEMO-CER-N', quantity: 4, unit: 900, line: 3600 },
      { productId: 2, variantId: 21, label: 'Único', sku: 'DEMO-SOP-U', quantity: 2, unit: 1800, line: 3600 }] },
  two: { label: 'Oferta 2', side: 'Propuesta del comprador', created: '2026-10-03T13:00:00.000Z', expires: MOMENTS['second-expiry'],
    amounts: [4200, 0, 4200], lines: [{ productId: 1, variantId: 12, label: 'Azul', sku: 'DEMO-CER-A', quantity: 3, unit: 1400, line: 4200 }] },
  three: { label: 'Oferta 3', side: 'Propuesta del vendedor', created: MOMENTS.start, expires: MOMENTS['second-expiry'],
    amounts: [5800, 200, 6000], lines: [
      { productId: 1, variantId: 12, label: 'Azul', sku: 'DEMO-CER-A', quantity: 3, unit: 1350, line: 4050 },
      { productId: 2, variantId: 21, label: 'Único', sku: 'DEMO-SOP-U', quantity: 1, unit: 1750, line: 1750 }] },
};
const PAIRS = {
  'one-two': { before: 'one', after: 'two', label: 'Oferta 1 → oferta 2', title: 'Comparación: oferta 1 → oferta 2', delta: [-3000, -500, -3500],
    changes: [{ productId: 1, kind: 'changed', fields: ['variantId', 'quantityUnits', 'unitPriceCents'] }, { productId: 2, kind: 'removed', fields: [] }] },
  'two-three': { before: 'two', after: 'three', label: 'Oferta 2 → oferta 3', title: 'Comparación: oferta 2 → oferta 3', delta: [1600, 200, 1800],
    changes: [{ productId: 1, kind: 'changed', fields: ['unitPriceCents'] }, { productId: 2, kind: 'added', fields: [] }] },
  'one-three': { before: 'one', after: 'three', label: 'Oferta 1 → oferta 3', title: 'Comparación: oferta 1 → oferta 3', delta: [-1400, -300, -1700],
    changes: [{ productId: 1, kind: 'changed', fields: ['variantId', 'quantityUnits', 'unitPriceCents'] }, { productId: 2, kind: 'changed', fields: ['quantityUnits', 'unitPriceCents'] }] },
};
const ACTIONS = ['issue', 'approve', 'expire', 'cancel'];
const STATUS_LABELS = { draft: 'Borrador de ejemplo', issued: 'Emisión simulada', approved: 'Aprobación simulada', expired: 'Caducidad simulada', cancelled: 'Cancelación simulada' };
const ACTION_LABELS = { issue: 'Emisión simulada', approve: 'Aprobación simulada', expire: 'Caducidad simulada', cancel: 'Cancelación simulada' };
const KIND_LABELS = { added: 'Producto incorporado', removed: 'Producto retirado', changed: 'Producto modificado' };
const FIELD_LABELS = { variantId: 'Cambia la variante', quantityUnits: 'Cambia la cantidad', unitPriceCents: 'Cambia el precio unitario' };
const PRODUCT_LABELS = { 1: 'Muestra de cerámica', 2: 'Soporte de muestra' };
const NOT_CREATED = 'Todavía no hay un presupuesto de ejemplo. La oferta seleccionada se conserva sin acciones.';
const CREATE_BLOCKED = 'El borrador actual se conserva. Selecciona otra oferta o restablece el ejemplo para crear uno nuevo.';
const DRAFT_REQUIRED = 'Crea un borrador para simular acciones.';
const ACTION_UNAVAILABLE = 'No disponible en el estado y momento seleccionados.';
const PRIVATE_TOKENS = ['demo.offer-demo.', 'demo.offer-preliminary.', 'company.offer-demo', 'contact.offer-demo.', 'offer.one', 'offer.two', 'offer.three',
  'quote_demo_', 'company-preliminary-fixture-v1', 'company-offer-eur-cents-v1', 'identityRef', 'companyKeyHash', 'policyRef', 'directoryRef', 'requestId',
  'schemaVersion', 'expectedVersion', 'commandId', 'artifactSequence', 'preliminaryId', 'convertedOrderId', 'paymentStatus', 'paidCents'];
const availability = (offerId, momentId, artifact) => {
  if (!artifact) return { create: true, issue: false, approve: false, expire: false, cancel: false };
  const before = MOMENTS[momentId] < OFFERS[offerId].expires;
  return { create: false, issue: artifact.status === 'draft' && before, approve: artifact.status === 'issued' && before,
    expire: ['draft', 'issued'].includes(artifact.status) && !before, cancel: ['draft', 'issued', 'approved'].includes(artifact.status) };
};
const FEEDBACK = {
  reset: 'Compara las propuestas y crea un borrador cuando quieras simular sus acciones.',
  create: 'Borrador de ejemplo creado a partir de la oferta seleccionada.',
  issue: 'Emisión simulada. No se ha enviado ningún presupuesto.',
  approve: 'Aprobación simulada. No acredita aceptación legal ni autorización de compra.',
  expire: 'Caducidad simulada mediante una acción explícita.',
  cancel: 'Cancelación simulada. El historial del ejemplo se conserva.',
  comparison: 'Comparación cambiada. La selección del presupuesto se conserva.',
  offer: 'Oferta cambiada. Crea un nuevo borrador; las acciones anteriores no se trasladan.',
  moment: 'Momento cambiado. No se ha aplicado ninguna acción.',
};
const GUIDE_STORAGE_KEY = 'logic2b:ecom-guide:v1';
// El shell existente posiciona WhatsApp con rAF al observar layout/scroll.
// Solo se permite su caller exacto, derivado del HTML y de esta fuente local.
const sharedContactSource = await readFile(new URL('../src/components/WhatsAppContact.astro', import.meta.url), 'utf8');
const sharedContactScript = sharedContactSource.match(/<script is:inline>([\s\S]*?)<\/script>/u)?.[1]?.trim();
assert.ok(sharedContactScript, 'Falta el script compartido de layout conocido.');
const sharedFrameExpression = 'requestAnimationFrame(update)';
const sharedTimer = (timer, location) => timer.name === 'requestAnimationFrame' && timer.caller.endsWith(`(${location})`);
const action = (name) => `[data-negotiation-action="${name}"]`;
const chrome = [process.env.CHROME_BIN, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome']
  .find((path) => path && existsSync(path));
if (!chrome) throw new Error('Indica CHROME_BIN con la ruta de Chrome.');
const output = resolve(process.env.OUTPUT_DIR ?? 'tmp/company-negotiation-demo');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'ecom-company-negotiation-'));
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
  if (!['GET', 'HEAD'].includes(method)) return 'mutation';
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
  Object.defineProperty(window, '__companyNegotiationAudit', { value: audit });
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
    const select = async (selector, value) => {
      const previous = await evaluate(`({ value: document.querySelector(${JSON.stringify(selector)}).value, feedback: document.querySelector('[data-negotiation-feedback]').textContent.trim() })`);
      const stable = await evaluate(`(() => {
        const field = document.querySelector(${JSON.stringify(selector)});
        if (field.disabled) throw new Error('No se puede interactuar con un selector desactivado.');
        if (!Array.from(field.options).some(option => option.value === ${JSON.stringify(value)} && !option.disabled)) throw new Error('Opción no disponible.');
        const focused = document.activeElement === field;
        field.value = ${JSON.stringify(value)};
        field.dispatchEvent(new Event('change', { bubbles: true }));
        return document.querySelector(${JSON.stringify(selector)}) === field && (!focused || document.activeElement === field);
      })()`);
      check(`${width} ${selector}: cambiar opción conserva nodo y foco`, stable);
      const message = previous.value === value ? previous.feedback : FEEDBACK[selector === COMPARISON ? 'comparison' : selector === OFFER ? 'offer' : 'moment'];
      check(`${width} ${selector}: mensaje visible describe sólo el cambio aplicado`, await evaluate(`document.querySelector('[data-negotiation-feedback]').textContent.trim()`) === message);
    };
    const key = async (name, code, keyCode) => {
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode: keyCode,
        ...(name === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: keyCode });
    };
    const press = async (name) => {
      const selector = action(name);
      await evaluate(`(() => {
        const button = document.querySelector(${JSON.stringify(selector)});
        if (button.disabled) throw new Error('Acción de ejemplo no disponible.');
        button.focus();
      })()`);
      await key('Enter', 'Enter', 13);
      check(`${width} ${name}: mensaje visible corresponde a la acción simulada`, await evaluate(`document.querySelector('[data-negotiation-feedback]').textContent.trim()`) === FEEDBACK[name]);
      if (name !== 'reset' && await evaluate(`document.querySelector(${JSON.stringify(selector)}).disabled`)) {
        check(`${width} acción ${name}: foco trasladado al resultado visible al deshabilitarse`, await evaluate(`(() => {
          const heading = document.querySelector('#negotiation-result-title');
          const rect = heading.getBoundingClientRect();
          const style = getComputedStyle(heading);
          return document.activeElement === heading && rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight
            && heading.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
        })()`));
      }
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
      const node = (selector, scope = root) => {
        const result = scope.querySelector(selector);
        if (!result) throw new Error('Falta marker: ' + selector);
        return result;
      };
      const text = item => item.textContent.replace(/\\s+/gu, ' ').trim();
      const time = (name, scope = root) => {
        const item = node('[data-negotiation-time="' + name + '"]', scope);
        return { datetime: item.getAttribute('datetime'), text: text(item) };
      };
      const money = (name, scope) => {
        const item = node('[data-negotiation-amount="' + name + '"]', scope);
        return { cents: item.getAttribute('data-cents'), text: text(item) };
      };
      const comparison = node('[data-negotiation-comparison-result]');
      const side = name => {
        const item = node('[data-negotiation-comparison-side="' + name + '"]');
        return { offerId: item.getAttribute('data-offer-id'), label: text(node('[data-negotiation-offer-label]', item)),
          side: text(node('[data-negotiation-side-label]', item)), created: time('created', item), expires: time('expires', item),
          amounts: ['subtotal', 'shipping', 'total'].map(name => money(name, item)) };
      };
      const lineSide = item => ({ present: item.getAttribute('data-present'), variantId: item.getAttribute('data-variant-id'),
        label: text(node('[data-negotiation-variant-label]', item)), sku: text(node('[data-negotiation-sku]', item)),
        units: node('[data-negotiation-quantity]', item).getAttribute('data-units'), quantity: text(node('[data-negotiation-quantity]', item)),
        unit: money('unit', item), line: money('line', item), emptyHidden: node('[data-negotiation-no-counterpart]', item).hidden, emptyText: text(node('[data-negotiation-no-counterpart]', item)), detailsHidden: node('[data-negotiation-line-details]', item).hidden });
      const selected = node('[data-negotiation-selected-offer]');
      const preliminary = node('[data-negotiation-preliminary]');
      const terms = node('[data-negotiation-terms]');
      return {
        company: text(node('[data-negotiation-company]')), buyer: text(node('[data-negotiation-buyer]')),
        comparison: { id: comparison.getAttribute('data-comparison-id'), label: text(node('[data-negotiation-comparison-label]')), before: side('before'), after: side('after'),
          deltas: ['subtotal', 'shipping', 'total'].map(name => money(name, node('[data-negotiation-comparison-side="delta"]'))),
          lines: Array.from(root.querySelectorAll('[data-negotiation-line]')).map(item => ({
            productId: item.getAttribute('data-product-id'), productLabel: text(node('[data-negotiation-product-label]', item)), kind: item.getAttribute('data-kind'), kindLabel: text(node('[data-negotiation-line-kind]', item)),
            changes: Array.from(item.querySelectorAll('[data-negotiation-change]')).map(change => ({ field: change.getAttribute('data-field'), text: text(change) })),
            before: lineSide(node('[data-negotiation-line-side="before"]', item)), after: lineSide(node('[data-negotiation-line-side="after"]', item)) })) },
        selected: { offerId: selected.getAttribute('data-offer-id'), side: text(node('[data-negotiation-side-label]', selected)), label: text(node('[data-negotiation-selected-label]')),
          created: time('selected-created'), expires: time('selected-expires'), total: money('total', selected) },
        moment: time('moment'),
        terms: { deposit: money('deposit', terms), text: text(terms) },
        preliminary: { present: preliminary.getAttribute('data-present'), hidden: preliminary.hidden, offerId: preliminary.getAttribute('data-offer-id'),
          status: preliminary.getAttribute('data-status'), label: text(node('[data-negotiation-preliminary-label]')),
          statusLabel: text(node('[data-negotiation-status-label]')), total: money('total', preliminary),
          times: Object.fromEntries(['created', 'expires', 'issued', 'approved', 'last'].map(name => [name, time(name, preliminary)])),
          issuedHidden: node('[data-negotiation-time-row="issued"]').hidden, approvedHidden: node('[data-negotiation-time-row="approved"]').hidden,
          emptyHidden: node('[data-negotiation-no-preliminary]').hidden, emptyText: text(node('[data-negotiation-no-preliminary]')),
          historyHidden: node('[data-negotiation-history]').hidden, historyEmptyHidden: node('[data-negotiation-history-empty]').hidden,
          history: Array.from(root.querySelectorAll('[data-negotiation-history-row]')).map(item => ({ action: item.getAttribute('data-action'),
            label: text(node('[data-negotiation-history-label]', item)), date: { datetime: node('time', item).getAttribute('datetime'), text: text(node('time', item)) } })) },
      };
    })()`);
    const state = () => evaluate(`({ comparisonId: document.querySelector(${JSON.stringify(COMPARISON)}).value,
      offerId: document.querySelector(${JSON.stringify(OFFER)}).value,
      momentId: document.querySelector(${JSON.stringify(MOMENT)}).value })`);
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
      check(`${width} ${stage}: controles cerrados sin formularios, edición libre ni acciones de pago`, await evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(ROOT)});
        return !root.querySelector('form,input,textarea,[data-total],[data-price],[data-stock],[data-pay],[data-submit]') &&
          Array.from(root.querySelectorAll('button')).every(button => button.type === 'button') &&
          Array.from(root.querySelectorAll('a[href]')).every(link => !new URL(link.href).hostname.endsWith('.test'));
      })()`));
      check(`${width} ${stage}: no expone identificadores, hashes o referencias internos`, await evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(ROOT)});
        return !/[a-f0-9]{64}/u.test(root.outerHTML) &&
          ${JSON.stringify(PRIVATE_TOKENS)}.every(value => !root.outerHTML.includes(value));
      })()`));
      check(`${width} ${stage}: sin overflow horizontal`, await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
      check(`${width} ${stage}: controles con área táctil mínima de 44 píxeles`, await evaluate(`
        Array.from(document.querySelector(${JSON.stringify(ROOT)}).querySelectorAll('select,button')).every(control => {
          const rect = control.getBoundingClientRect();
          return rect.width >= 44 && rect.height >= 44;
        })`));
      await visibleSelectArrows(stage);
    };
    const verify = async (selection = INITIAL, artifact = null) => {
      const { comparisonId, offerId, momentId } = selection;
      const label = `${width} ${comparisonId}/${offerId}/${momentId}/${artifact?.status ?? 'not-created'}`;
      const expected = PAIRS[comparisonId];
      const actual = await view();
      const numeric = (observed, wanted, delta = false) => observed.cents === (wanted === null ? null : String(wanted))
        && observed.text === (wanted === null ? '' : (delta ? DELTA_TEXT : MONEY)[wanted]);
      const instant = (observed, wanted) => observed.datetime === wanted && observed.text === (wanted === null ? '' : INSTANT_TEXT[wanted]);
      check(`${label}: selección explícita independiente`, JSON.stringify(await state()) === JSON.stringify(selection));
      check(`${label}: par explícito de comparación`, actual.comparison.id === comparisonId && actual.comparison.label === expected.label);
      check(`${label}: empresa y comprador son solo etiquetas del ejemplo`, actual.company === 'Empresa de ejemplo' && actual.buyer === 'Comprador de ejemplo');
      for (const which of ['before', 'after']) {
        const offer = OFFERS[expected[which]];
        const side = actual.comparison[which];
        check(`${label} ${which}: oferta, autor y fechas visibles exactos`, side.offerId === expected[which] && side.label === offer.label && side.side === offer.side
          && instant(side.created, offer.created) && instant(side.expires, offer.expires));
        for (const [index, name] of ['subtotal', 'shipping', 'total'].entries()) {
          check(`${label} ${which}/${name}: importe literal, incluido envío cero`, numeric(side.amounts[index], offer.amounts[index]));
        }
      }
      for (const [index, name] of ['subtotal', 'shipping', 'total'].entries()) {
        check(`${label} delta/${name}: diferencia firmada visible exacta`, numeric(actual.comparison.deltas[index], expected.delta[index], true));
      }
      check(`${label}: todas las líneas del par, sin filtrado por selección`, actual.comparison.lines.length === expected.changes.length);
      for (const [index, change] of expected.changes.entries()) {
        const line = actual.comparison.lines[index];
        check(`${label} producto ${change.productId}: incorporación/retirada/modificación y campos exactos`, line.productId === String(change.productId) && line.productLabel === PRODUCT_LABELS[change.productId]
          && line.kind === change.kind && line.kindLabel === KIND_LABELS[change.kind]
          && JSON.stringify(line.changes) === JSON.stringify(change.fields.map(field => ({ field, text: FIELD_LABELS[field] }))));
        for (const which of ['before', 'after']) {
          const wanted = OFFERS[expected[which]].lines.find(item => item.productId === change.productId) ?? null;
          const got = line[which];
          check(`${label} producto ${change.productId}/${which}: contraparte distingue ausencia y cantidad conocida`, got.present === String(wanted !== null)
            && got.emptyHidden === (wanted !== null) && got.detailsHidden === (wanted === null) && got.emptyText === 'No incluido en esta oferta' && got.variantId === (wanted === null ? null : String(wanted.variantId))
            && got.units === (wanted === null ? null : String(wanted.quantity)) && got.quantity === (wanted === null ? '' : String(wanted.quantity))
            && got.label === (wanted?.label ?? '') && got.sku === (wanted?.sku ?? ''));
          check(`${label} producto ${change.productId}/${which}: importes propios o limpieza completa`, numeric(got.unit, wanted?.unit ?? null) && numeric(got.line, wanted?.line ?? null));
        }
      }
      const offer = OFFERS[offerId];
      check(`${label}: oferta seleccionada no es la comparación ni un presupuesto implícito`, actual.selected.offerId === offerId && actual.selected.side === offer.side
        && actual.selected.label === `Oferta para el presupuesto: ${offer.label.toLowerCase()}`
        && instant(actual.selected.created, offer.created) && instant(actual.selected.expires, offer.expires) && numeric(actual.selected.total, offer.amounts[2]));
      check(`${label}: instante de acción explícito y texto UTC coherente`, instant(actual.moment, MOMENTS[momentId]));
      check(`${label}: anticipo ilustrativo exacto sin cobro ni conversión`, numeric(actual.terms.deposit, 2000)
        && actual.terms.text.includes('Condición declarada: conversión por anticipo')
        && actual.terms.text.includes('Anticipo ilustrativo; no se simulan cobros ni conversiones a pedido.'));
      const got = actual.preliminary;
      check(`${label}: presupuesto sólo existe después de creación explícita`, got.present === String(artifact !== null) && got.hidden === (artifact === null) && got.emptyHidden === (artifact !== null)
        && got.offerId === (artifact ? offerId : null) && got.status === (artifact?.status ?? null)
        && got.label === (artifact ? `Presupuesto basado en ${offer.label.toLowerCase()}` : '')
        && got.statusLabel === (artifact ? STATUS_LABELS[artifact.status] : '') && numeric(got.total, artifact ? offer.amounts[2] : null));
      if (!artifact) check(`${label}: placeholder de presupuesto ausente`, got.emptyText === NOT_CREATED);
      const history = artifact?.history ?? [];
      const dates = { created: artifact?.createdAt ?? null, expires: artifact ? offer.expires : null,
        issued: history.find(item => item.action === 'issue')?.at ?? null, approved: history.find(item => item.action === 'approve')?.at ?? null,
        last: artifact ? (history.at(-1)?.at ?? artifact.createdAt) : null };
      check(`${label}: fechas ausentes no dejan filas visibles vacías`, got.issuedHidden === (dates.issued === null) && got.approvedHidden === (dates.approved === null));
      for (const [name, date] of Object.entries(dates)) check(`${label} fecha ${name}: texto y datetime no inventados ni obsoletos`, instant(got.times[name], date));
      check(`${label}: historial aplicado exacto, sin probes guardados`, JSON.stringify(got.history) === JSON.stringify(history.map(item => ({ action: item.action,
        label: ACTION_LABELS[item.action], date: { datetime: item.at, text: INSTANT_TEXT[item.at] } }))));
      check(`${label}: contenedor y placeholder del historial coherentes`, got.historyHidden === (history.length === 0) && got.historyEmptyHidden === (history.length !== 0));
      const expectedAvailability = availability(offerId, momentId, artifact);
      const controls = await evaluate(`Object.fromEntries(${JSON.stringify(['create', ...ACTIONS])}.map(name => [name,
        !document.querySelector('[data-negotiation-action="' + name + '"]').disabled]))`);
      check(`${label}: acciones del estado/momento sin aprobación ni caducidad implícitas`, JSON.stringify(controls) === JSON.stringify(expectedAvailability));
      const options = await evaluate(`Array.from(document.querySelector(${JSON.stringify(MOMENT)}).options).map(option => ({ value: option.value, disabled: option.disabled }))`);
      check(`${label}: solo los instantes previos a una acción aplicada quedan deshabilitados`, JSON.stringify(options) === JSON.stringify(Object.keys(MOMENTS).map(value => ({
        value, disabled: artifact !== null && MOMENTS[value] < dates.last }))));
      const disabledMomentIndex = Object.values(MOMENTS).findIndex(at => artifact !== null && at < dates.last);
      const restriction = await evaluate(`({ hidden: document.querySelector('[data-negotiation-moment-restriction]').hidden,
        text: document.querySelector('[data-negotiation-moment-restriction]').textContent.trim() })`);
      check(`${label}: la restricción identifica la opción deshabilitada y no el instante seleccionado`, restriction.hidden === (disabledMomentIndex < 0)
        && restriction.text === (disabledMomentIndex < 0 ? '' : `Momento desactivado: ${MOMENT_LABELS[disabledMomentIndex]}. Este momento es anterior a la creación o a la última acción aplicada.`));
      const reasons = await evaluate(`({ create: document.querySelector('[data-negotiation-create-reason]').textContent.trim(),
        createHidden: document.querySelector('[data-negotiation-create-reason]').hidden,
        actionsHidden: Object.fromEntries(${JSON.stringify(ACTIONS)}.map(name => [name, document.querySelector('[data-negotiation-action-reason="' + name + '"]').hidden])),
        actions: Object.fromEntries(${JSON.stringify(ACTIONS)}.map(name => [name,
          document.querySelector('[data-negotiation-action-reason="' + name + '"]').textContent.trim()])) })`);
      check(`${label}: explicación de crear sólo cuando no disponible`, reasons.create === (artifact ? CREATE_BLOCKED : '') && reasons.createHidden === (artifact === null));
      for (const name of ACTIONS) check(`${label} ${name}: explicación de acción deshabilitada`, reasons.actions[name] === (expectedAvailability[name] ? '' : artifact ? ACTION_UNAVAILABLE : DRAFT_REQUIRED) && reasons.actionsHidden[name] === expectedAvailability[name]);
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
    const setupWriteLog = await evaluate('window.__companyNegotiationAudit.storageWrites');
    const setupStorageWrites = setupWriteLog.length;
    check(`${width}: escrituras iniciales pertenecen solo a la guía`, setupWriteLog.every(write => write.storage === 'session' && write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    await evaluate('window.__companyNegotiationAudit.storageWrites.length = 0');
    const setupStorageEvents = storageEvents.filter((event) => event.sessionId === sessionId).length;
    const setupAudit = await evaluate('window.__companyNegotiationAudit');
    const sharedLocation = await sharedFrameLocation();
    await evaluate(`window.__companyNegotiationAudit.sharedFrameLocation = ${JSON.stringify(sharedLocation)}`);
    check(`${width}: arranque solo con rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, setupAudit.timers.every(timer => sharedTimer(timer, sharedLocation)) && setupAudit.beacons === 0 && setupAudit.windows === 0);
    const initial = await state();
    const initialView = await view();
    check(`${width}: tres selectores cerrados persistentes`, await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(ROOT)});
      return root.querySelectorAll('select').length === 3 &&
        JSON.stringify(Array.from(root.querySelector(${JSON.stringify(COMPARISON)}).options).map(option => option.value)) === ${JSON.stringify(JSON.stringify(Object.keys(PAIRS)))} &&
        JSON.stringify(Array.from(root.querySelector(${JSON.stringify(COMPARISON)}).options).map(option => option.textContent.trim())) === ${JSON.stringify(JSON.stringify(Object.values(PAIRS).map(pair => pair.label)))} &&
        JSON.stringify(Array.from(root.querySelector(${JSON.stringify(OFFER)}).options).map(option => option.value)) === ${JSON.stringify(JSON.stringify(Object.keys(OFFERS)))} &&
        JSON.stringify(Array.from(root.querySelector(${JSON.stringify(MOMENT)}).options).map(option => option.value)) === ${JSON.stringify(JSON.stringify(Object.keys(MOMENTS)))} &&
        JSON.stringify(Array.from(root.querySelector(${JSON.stringify(MOMENT)}).options).map(option => option.textContent.trim())) === ${JSON.stringify(JSON.stringify(MOMENT_LABELS))};
    })()`));
    check(`${width}: inicio literal sin presupuesto implícito`, JSON.stringify(initial) === JSON.stringify(INITIAL));
    await verify();
    check(`${width}: mensaje inicial no atribuye un presupuesto creado`, await evaluate(`document.querySelector('[data-negotiation-feedback]').textContent.trim()`) === FEEDBACK.reset);
    await safety('initial');
    const setupRequests = requests.filter(request => request.sessionId === sessionId).length;
    moduleSessions.add(sessionId);
    await evaluate('window.__companyNegotiationAudit.moduleActive = true');
    let guideInteractionEvidence = null;
    if (width === 375) {
      guideSessions.add(sessionId);
      await evaluate('window.__companyNegotiationAudit.guideInteraction = true');
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
      const probeSelectors = async (probeWidth) => {
        for (const [selector, controlId] of [[COMPARISON, 'negotiation-comparison'], [OFFER, 'negotiation-offer'], [MOMENT, 'negotiation-moment']]) {
          await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center', behavior: 'instant' })`);
          await delay(75);
          const hits = await visibleSelectArrows(`guía cerrada a ${probeWidth}: ${controlId}`);
          check(`${width} guía: hit-test a ${probeWidth} incluye ${controlId}`, hits.some(hit => hit.id === controlId));
        }
      };
      await probeSelectors(320);
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
      await evaluate(`document.querySelector(${JSON.stringify(COMPARISON)}).focus({ preventScroll: true })`);
      await call('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
      // Espera del arnés Node: observa el foco después del listener matchMedia.
      await delay(75);
      await wait(`innerWidth === 375 && document.activeElement.matches(${JSON.stringify(COMPARISON)})`, 'guía abierta no roba el nuevo foco del selector');
      check(`${width} guía abierta: el siguiente resize conserva el nuevo foco en Caso`, await evaluate(`
        !document.querySelector('[data-guide-card]').hidden && document.activeElement.matches(${JSON.stringify(COMPARISON)})`));
      await evaluate(`document.querySelector('[data-guide-close]').focus()`);
      await key('Enter', 'Enter', 13);
      check(`${width} guía abierta: cerrar tras resize recupera el disparador móvil`, await evaluate(visibleLauncher));
      await evaluate(`document.querySelector(${JSON.stringify(COMPARISON)}).focus({ preventScroll: true })`);
      for (const targetWidth of [1024, 375]) {
        await call('Emulation.setDeviceMetricsOverride', { width: targetWidth, height: 812, deviceScaleFactor: 1, mobile: targetWidth < 1024 });
        await delay(75);
        await wait(`innerWidth === ${targetWidth} && document.activeElement.matches(${JSON.stringify(COMPARISON)})`, 'resize conserva foco del selector');
        check(`${width} selector: el cambio a ${targetWidth}px no roba el foco`, await evaluate(`document.activeElement.matches(${JSON.stringify(COMPARISON)})`));
      }
      await probeSelectors(375);
      check(`${width} guía: abrir/cerrar/resize no altera comparación ni presupuesto`, JSON.stringify(await view()) === beforeGuide);
      await evaluate('window.__companyNegotiationAudit.guideInteraction = false');
      await delay(75);
      guideSessions.delete(sessionId);
      const guideWrites = await evaluate(`window.__companyNegotiationAudit.storageWrites.filter(write => write.phase === 'guide')`);
      const guideEvents = storageEvents.filter(event => event.sessionId === sessionId && event.phase === 'guide');
      check(`${width} guía: solo escritura explícita de su clave de sesión`, guideWrites.length > 0 && guideWrites.every(write =>
        write.storage === 'session' && write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
      check(`${width} guía: eventos de almacenamiento separados con clave exacta`, guideEvents.every(event =>
        event.key === GUIDE_STORAGE_KEY && event.local === false));
      check(`${width} guía: al cerrar restaura el almacenamiento inicial`, await storage() === initialStorage);
      guideInteractionEvidence = { actions: ['open/minimize', 'open/close', 'open/Escape', 'open/resize/close', 'resize-with-selector-focus'],
        widths: [375, 1024, 375, 1024, 320, 375, 1024, 375, 1024, 375], writes: guideWrites.length, mutationEvents: guideEvents.length,
        storage: 'session', key: GUIDE_STORAGE_KEY, unchangedAtEnd: true };
      await evaluate(`document.querySelector(${JSON.stringify(COMPARISON)}).focus()`);
    }

    await snapshot('initial');
    await evaluate(`document.querySelector(${JSON.stringify(COMPARISON)}).focus()`);
    await key('ArrowDown', 'ArrowDown', 40);
    await verify({ ...INITIAL, comparisonId: 'two-three' });
    check(`${width}: teclado conserva nodo y foco de comparación`, await evaluate(`document.activeElement.matches(${JSON.stringify(COMPARISON)})`));
    check(`${width}: foco de teclado visible`, await evaluate(`(() => {
      const field = document.activeElement, style = getComputedStyle(field);
      return field.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
    })()`));
    await key('ArrowUp', 'ArrowUp', 38);
    await key('Tab', 'Tab', 9);
    check(`${width}: Tab de comparación alcanza oferta`, await evaluate(`document.activeElement.matches(${JSON.stringify(OFFER)})`));
    await key('ArrowDown', 'ArrowDown', 40);
    await verify({ ...INITIAL, offerId: 'two' });
    await key('ArrowUp', 'ArrowUp', 38);
    await key('Tab', 'Tab', 9);
    check(`${width}: Tab de oferta alcanza momento`, await evaluate(`document.activeElement.matches(${JSON.stringify(MOMENT)})`));
    await key('ArrowDown', 'ArrowDown', 40);
    await verify({ ...INITIAL, momentId: 'first-expiry' });
    await key('ArrowUp', 'ArrowUp', 38);
    await verify();

    const draft = (momentId = 'start') => ({ status: 'draft', createdAt: MOMENTS[momentId], history: [] });
    const resultOf = (previous, name, status, momentId = 'start') => ({ status, createdAt: previous.createdAt,
      history: [...previous.history, { action: name, at: MOMENTS[momentId] }] });
    await press('create');
    let artifact = draft();
    await verify(INITIAL, artifact);
    await key('Tab', 'Tab', 9);
    check(`${width}: Tab desde resultado tras crear alcanza emisión habilitada`, await evaluate(`document.activeElement.matches(${JSON.stringify(action('issue'))})`));
    await press('issue');
    artifact = resultOf(artifact, 'issue', 'issued');
    await verify(INITIAL, artifact);
    await press('approve');
    artifact = resultOf(artifact, 'approve', 'approved');
    await verify(INITIAL, artifact);
    const approvedBefore = (await view()).preliminary;
    await select(MOMENT, 'after');
    await verify({ ...INITIAL, momentId: 'after' }, artifact);
    check(`${width}: avanzar más allá del vencimiento no caduca la aprobación histórica`, JSON.stringify((await view()).preliminary) === JSON.stringify(approvedBefore));
    await select(COMPARISON, 'two-three');
    const approvedSelection = { comparisonId: 'two-three', offerId: 'one', momentId: 'after' };
    await verify(approvedSelection, artifact);
    check(`${width}: comparar otra pareja no transfiere ni cambia presupuesto`, JSON.stringify((await view()).preliminary) === JSON.stringify(approvedBefore));
    await safety('approved-after');
    await snapshot('approved-after');
    const sameSelection = JSON.stringify(await view());
    await select(OFFER, 'one');
    await select(COMPARISON, 'two-three');
    check(`${width}: misma oferta y mismo par preservan fechas e historial`, JSON.stringify(await view()) === sameSelection);

    await select(OFFER, 'two');
    const newSelection = { comparisonId: 'two-three', offerId: 'two', momentId: 'start' };
    await verify(newSelection);
    check(`${width}: cambiar oferta limpia aprobación y restablece instante sin cambiar comparación`, JSON.stringify(await state()) === JSON.stringify(newSelection));
    await press('create');
    await verify(newSelection, draft());
    await safety('new-draft');
    await snapshot('new-draft');
    await press('reset');
    await press('create');
    await select(MOMENT, 'first-expiry');
    await verify({ ...INITIAL, momentId: 'first-expiry' }, draft());
    await press('expire');
    await verify({ ...INITIAL, momentId: 'first-expiry' }, resultOf(draft(), 'expire', 'expired', 'first-expiry'));
    await key('Tab', 'Tab', 9);
    check(`${width}: Tab tras caducidad alcanza reset sin acciones terminales habilitadas`, await evaluate(`document.activeElement.matches(${JSON.stringify(action('reset'))})`));
    await safety('expired');
    await snapshot('expired');

    const counts = { staticVisits: 0, creationVisits: 0, noPreliminary: 0, drafts: 0, issuableDrafts: 0, expirableDrafts: 0 };
    for (const comparisonId of Object.keys(PAIRS)) for (const offerId of Object.keys(OFFERS)) for (const momentId of Object.keys(MOMENTS)) {
      await press('reset');
      await select(COMPARISON, comparisonId);
      await select(OFFER, offerId);
      await select(MOMENT, momentId);
      await verify({ comparisonId, offerId, momentId });
      await safety(`matriz/${comparisonId}/${offerId}/${momentId}`);
      counts.staticVisits++; counts.noPreliminary++;
    }
    for (const offerId of Object.keys(OFFERS)) for (const momentId of Object.keys(MOMENTS)) {
      await press('reset');
      await select(OFFER, offerId);
      await select(MOMENT, momentId);
      const selection = { ...INITIAL, offerId, momentId };
      await press('create');
      await verify(selection, draft(momentId));
      await safety(`creación/${offerId}/${momentId}`);
      counts.creationVisits++; counts.drafts++;
      counts[MOMENTS[momentId] < OFFERS[offerId].expires ? 'issuableDrafts' : 'expirableDrafts']++;
    }
    check(`${width}: 36 vistas sin artefacto y 12 creaciones distintas`, JSON.stringify(counts) === JSON.stringify({
      staticVisits: 36, creationVisits: 12, noPreliminary: 36, drafts: 12, issuableDrafts: 5, expirableDrafts: 7 }));
    matrixEvidence.push({ width, ...counts });

    // Recorridos legales adicionales; no se cuentan como vistas sin artefacto.
    for (const offerId of Object.keys(OFFERS)) {
      await press('reset'); await select(OFFER, offerId); await press('create');
      const selection = { ...INITIAL, offerId };
      let current = draft();
      await press('issue'); current = resultOf(current, 'issue', 'issued'); await verify(selection, current);
      await press('approve'); current = resultOf(current, 'approve', 'approved'); await verify(selection, current);
      await select(MOMENT, 'after'); await verify({ ...selection, momentId: 'after' }, current);
      check(`${width} ${offerId}: expire sigue disabled tras aprobación sin auto-caducidad`, await evaluate(`document.querySelector(${JSON.stringify(action('expire'))}).disabled`));
      await press('cancel'); current = resultOf(current, 'cancel', 'cancelled', 'after');
      await verify({ ...selection, momentId: 'after' }, current);
      await safety(`recorrido/${offerId}/cancelled`);
    }
    await press('reset'); await select(OFFER, 'two'); await press('create'); await press('issue');
    let second = resultOf(draft(), 'issue', 'issued');
    await select(MOMENT, 'first-expiry');
    await verify({ ...INITIAL, offerId: 'two', momentId: 'first-expiry' }, second);
    await press('approve'); second = resultOf(second, 'approve', 'approved', 'first-expiry');
    await select(MOMENT, 'second-expiry');
    await verify({ ...INITIAL, offerId: 'two', momentId: 'second-expiry' }, second);
    await press('reset'); await select(OFFER, 'three'); await press('create'); await press('issue');
    const third = resultOf(draft(), 'issue', 'issued');
    await select(MOMENT, 'second-expiry');
    await verify({ ...INITIAL, offerId: 'three', momentId: 'second-expiry' }, third);
    await press('expire');
    await verify({ ...INITIAL, offerId: 'three', momentId: 'second-expiry' }, resultOf(third, 'expire', 'expired', 'second-expiry'));
    await safety('issued-expired');
    await select(COMPARISON, 'one-three');
    await verify({ comparisonId: 'one-three', offerId: 'three', momentId: 'second-expiry' }, resultOf(third, 'expire', 'expired', 'second-expiry'));
    await select(OFFER, 'one');
    await verify({ ...INITIAL, comparisonId: 'one-three' });
    await press('reset');
    check(`${width}: Enter restablece los tres controles y elimina presupuesto/historial`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await view()) === JSON.stringify(initialView));
    check(`${width}: reset conserva foco del botón`, await evaluate(`document.activeElement.matches(${JSON.stringify(action('reset'))})`));
    await safety('reset');
    await press('create'); await press('issue'); await press('approve');
    await verify(INITIAL, resultOf(resultOf(draft(), 'issue', 'issued'), 'approve', 'approved'));
    const finalAudit = await evaluate('window.__companyNegotiationAudit');
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
    await wait(`(${ready}) && window.__companyNegotiationAudit?.documentEpoch !== ${JSON.stringify(previousDocumentEpoch)}`, 'recarga limpia en otro documento');
    const reloadedAudit = await evaluate('window.__companyNegotiationAudit');
    const reloadedSharedLocation = await sharedFrameLocation();
    check(`${width}: recarga solo permite rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, reloadedAudit.timers.every(timer => sharedTimer(timer, reloadedSharedLocation)) && reloadedAudit.beacons === 0 && reloadedAudit.windows === 0);
    check(`${width}: nuevas escrituras de arranque pertenecen solo a la guía`, reloadedAudit.storageWrites.every(write => write.storage === 'session' && write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    check(`${width}: recarga restaura comparación, oferta y presupuesto iniciales`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await view()) === JSON.stringify(initialView));
    check(`${width}: recarga conserva el almacenamiento anterior`, await storage() === initialStorage);
    storageEvidence.at(-1).reloadGuideWrites = reloadedAudit.storageWrites.length;
    storageEvidence.at(-1).sharedLayout.reloadCalls = reloadedAudit.timers.length;

    await call('Emulation.setScriptExecutionDisabled', { value: true });
    await call('Page.reload', { ignoreCache: true });
    await wait(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(ROOT)}) && document.querySelector(${JSON.stringify(ROOT)}).dataset.ready !== 'true' && window.__companyNegotiationAudit?.documentEpoch !== ${JSON.stringify(reloadedAudit.documentEpoch)}`, 'vista sin JavaScript en otro documento');
    check(`${width}: sin JavaScript conserva comparación y presupuesto iniciales más aviso`, JSON.stringify(await view()) === JSON.stringify(initialView) && await evaluate(`Array.from(document.querySelectorAll('noscript')).some(node => /JavaScript/u.test(node.textContent))`));
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
    runner: 'node scripts/test-company-negotiation-demo.mjs', nodeVersion: process.version,
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

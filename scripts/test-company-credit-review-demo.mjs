/**
 * R6.5c: límites y revisión de crédito de fixtures en Chrome/CDP.
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
const PATH = '/demo/admin/credito';
const ROOT = '[data-company-credit-review-demo]';
const SCENARIO = '[data-credit-scenario]';
const REVIEWER = '[data-credit-reviewer]';
const INITIAL = { scenarioId: 'within', reviewerKey: 'a' };
const AT = '2026-10-03T12:00:00.000Z';
const OBSERVED_AT = '2026-10-03T11:00:00.000Z';
const FUTURE_AT = '2026-10-03T13:00:00.000Z';
const DECISIONS_AT = ['2026-10-03T12:01:00.000Z', '2026-10-03T12:02:00.000Z'];
const INSTANT_TEXT = { [AT]: '3 oct 2026, 12:00 UTC', [OBSERVED_AT]: '3 oct 2026, 11:00 UTC',
  [FUTURE_AT]: '3 oct 2026, 13:00 UTC', [DECISIONS_AT[0]]: '3 oct 2026, 12:01 UTC', [DECISIONS_AT[1]]: '3 oct 2026, 12:02 UTC' };
// Oráculo literal del plan aceptado, independiente del modelo/contratos de producción.
const CASES = {
  "within": {
    "request": 2000,
    "exposure": 6000,
    "projected": 8000,
    "statuses": [
      "compared",
      "compared",
      "compared"
    ],
    "limits": [
      10000,
      5000,
      3000
    ],
    "compared": [
      8000,
      2000,
      2000
    ],
    "differences": [
      2000,
      3000,
      1000
    ],
    "positions": [
      "below_limit",
      "below_limit",
      "below_limit"
    ],
    "opening": null
  },
  "equal": {
    "request": 3000,
    "exposure": 7000,
    "projected": 10000,
    "statuses": [
      "compared",
      "compared",
      "compared"
    ],
    "limits": [
      10000,
      5000,
      3000
    ],
    "compared": [
      10000,
      3000,
      3000
    ],
    "differences": [
      0,
      2000,
      0
    ],
    "positions": [
      "equal_limit",
      "below_limit",
      "equal_limit"
    ],
    "opening": null
  },
  "above": {
    "request": 6000,
    "exposure": 6000,
    "projected": 12000,
    "statuses": [
      "compared",
      "compared",
      "compared"
    ],
    "limits": [
      10000,
      5000,
      3000
    ],
    "compared": [
      12000,
      6000,
      6000
    ],
    "differences": [
      -2000,
      -1000,
      -3000
    ],
    "positions": [
      "above_limit",
      "above_limit",
      "above_limit"
    ],
    "opening": null
  },
  "missing": {
    "request": 2000,
    "exposure": null,
    "projected": null,
    "statuses": [
      "unknown",
      "compared",
      "compared"
    ],
    "limits": [
      10000,
      5000,
      3000
    ],
    "compared": [
      null,
      2000,
      2000
    ],
    "differences": [
      null,
      3000,
      1000
    ],
    "positions": [
      null,
      "below_limit",
      "below_limit"
    ],
    "opening": null
  },
  "incomplete": {
    "request": 2000,
    "exposure": null,
    "projected": null,
    "statuses": [
      "unknown",
      "compared",
      "compared"
    ],
    "limits": [
      10000,
      5000,
      3000
    ],
    "compared": [
      null,
      2000,
      2000
    ],
    "differences": [
      null,
      3000,
      1000
    ],
    "positions": [
      null,
      "below_limit",
      "below_limit"
    ],
    "opening": null
  },
  "future": {
    "request": 2000,
    "exposure": null,
    "projected": null,
    "statuses": [
      "unknown",
      "compared",
      "compared"
    ],
    "limits": [
      10000,
      5000,
      3000
    ],
    "compared": [
      null,
      2000,
      2000
    ],
    "differences": [
      null,
      3000,
      1000
    ],
    "positions": [
      null,
      "below_limit",
      "below_limit"
    ],
    "opening": null
  },
  "unconfigured": {
    "request": 2000,
    "exposure": 6000,
    "projected": 8000,
    "statuses": [
      "unconfigured",
      "unconfigured",
      "unconfigured"
    ],
    "limits": [
      null,
      null,
      null
    ],
    "compared": [
      8000,
      2000,
      2000
    ],
    "differences": [
      null,
      null,
      null
    ],
    "positions": [
      null,
      null,
      null
    ],
    "opening": null
  },
  "exposure-only": {
    "request": 2000,
    "exposure": 6000,
    "projected": 8000,
    "statuses": [
      "compared",
      "unconfigured",
      "unconfigured"
    ],
    "limits": [
      10000,
      null,
      null
    ],
    "compared": [
      8000,
      2000,
      2000
    ],
    "differences": [
      2000,
      null,
      null
    ],
    "positions": [
      "below_limit",
      null,
      null
    ],
    "opening": null
  },
  "request-only": {
    "request": 2000,
    "exposure": 6000,
    "projected": 8000,
    "statuses": [
      "unconfigured",
      "compared",
      "unconfigured"
    ],
    "limits": [
      null,
      5000,
      null
    ],
    "compared": [
      8000,
      2000,
      2000
    ],
    "differences": [
      null,
      3000,
      null
    ],
    "positions": [
      null,
      "below_limit",
      null
    ],
    "opening": null
  },
  "buyer-only": {
    "request": 2000,
    "exposure": 6000,
    "projected": 8000,
    "statuses": [
      "unconfigured",
      "unconfigured",
      "compared"
    ],
    "limits": [
      null,
      null,
      3000
    ],
    "compared": [
      8000,
      2000,
      2000
    ],
    "differences": [
      null,
      null,
      1000
    ],
    "positions": [
      null,
      null,
      "below_limit"
    ],
    "opening": null
  },
  "zero": {
    "request": 0,
    "exposure": 0,
    "projected": 0,
    "statuses": [
      "compared",
      "compared",
      "compared"
    ],
    "limits": [
      0,
      0,
      0
    ],
    "compared": [
      0,
      0,
      0
    ],
    "differences": [
      0,
      0,
      0
    ],
    "positions": [
      "equal_limit",
      "equal_limit",
      "equal_limit"
    ],
    "opening": null
  },
  "inactive-company": {
    "request": 2000,
    "exposure": 6000,
    "projected": 8000,
    "statuses": [
      "compared",
      "compared",
      "compared"
    ],
    "limits": [
      10000,
      5000,
      3000
    ],
    "compared": [
      8000,
      2000,
      2000
    ],
    "differences": [
      2000,
      3000,
      1000
    ],
    "positions": [
      "below_limit",
      "below_limit",
      "below_limit"
    ],
    "opening": "company_inactive"
  },
  "inactive-buyer": {
    "request": 2000,
    "exposure": 6000,
    "projected": 8000,
    "statuses": [
      "compared",
      "compared",
      "compared"
    ],
    "limits": [
      10000,
      5000,
      3000
    ],
    "compared": [
      8000,
      2000,
      2000
    ],
    "differences": [
      2000,
      3000,
      1000
    ],
    "positions": [
      "below_limit",
      "below_limit",
      "below_limit"
    ],
    "opening": "buyer_inactive"
  },
  "unreachable": {
    "request": 2000,
    "exposure": 6000,
    "projected": 8000,
    "statuses": [
      "compared",
      "compared",
      "compared"
    ],
    "limits": [
      10000,
      5000,
      3000
    ],
    "compared": [
      8000,
      2000,
      2000
    ],
    "differences": [
      2000,
      3000,
      1000
    ],
    "positions": [
      "below_limit",
      "below_limit",
      "below_limit"
    ],
    "opening": "quorum_unreachable"
  },
  "buyer-allowed": {
    "request": 2000,
    "exposure": 6000,
    "projected": 8000,
    "statuses": [
      "compared",
      "compared",
      "compared"
    ],
    "limits": [
      10000,
      5000,
      3000
    ],
    "compared": [
      8000,
      2000,
      2000
    ],
    "differences": [
      2000,
      3000,
      1000
    ],
    "positions": [
      "below_limit",
      "below_limit",
      "below_limit"
    ],
    "opening": null
  }
};
const SCENARIO_LABELS = {"within": "Bajo los límites", "equal": "En dos límites", "above": "Límites superados", "missing": "Sin exposición", "incomplete": "Evidencia incompleta", "future": "Observación posterior", "unconfigured": "Sin límites declarados", "exposure-only": "Solo exposición", "request-only": "Solo solicitud", "buyer-only": "Solo comprador", "zero": "Importes y límites cero", "inactive-company": "Empresa inactiva", "inactive-buyer": "Comprador inactivo", "unreachable": "Faltan revisores", "buyer-allowed": "Comprador incluido"};
const COMPARISON_LABELS = {"companyExposure": "Exposición de empresa con esta solicitud", "requestAmount": "Importe de esta solicitud", "buyerAmount": "Importe de este comprador por solicitud"};
const STATUS_LABELS = {"compared": "Comparación numérica", "unconfigured": "Sin límite declarado", "unknown": "No se puede comparar"};
const POSITION_LABELS = {"below_limit": "Por debajo del límite", "equal_limit": "Igual al límite", "above_limit": "Por encima del límite"};
const REVIEW_LABELS = {"not_open": "Sin revisión abierta", "opening_blocked": "No se ha abierto la revisión", "pending": "Revisión pendiente", "accepted": "Revisión aceptada en el ejemplo", "rejected": "Revisión rechazada en el ejemplo"};
const OPENING_LABELS = {"company_inactive": "La empresa del ejemplo está inactiva.", "buyer_inactive": "El comprador del ejemplo está inactivo.", "quorum_unreachable": "No hay suficientes contactos elegibles para completar esta revisión."};
const CONTACT_LABELS = {"not_open": "Sin revisión abierta", "not_eligible": "No participa en esta revisión", "awaiting": "Sin responder", "responded": "Respuesta registrada"};
const DECISION_LABELS = {"accept": "Aceptación declarada", "reject": "Rechazo declarado"};
const CONTACTS = { buyer: 'Comprador de ejemplo', a: 'Contacto A', b: 'Contacto B', inactive: 'Contacto inactivo', unselected: 'Contacto sin designar' };
const MONEY = { 0: '0,00 €', 1000: '10,00 €', 2000: '20,00 €', 3000: '30,00 €', 5000: '50,00 €',
  6000: '60,00 €', 7000: '70,00 €', 8000: '80,00 €', 10000: '100,00 €', 12000: '120,00 €',
  '-1000': '-10,00 €', '-2000': '-20,00 €', '-3000': '-30,00 €' };
const PRIVATE_TOKENS = ['demo.credit-review.', 'company.credit-demo', 'contact.credit-demo.', 'company-credit-eur-cents-v1',
  'company-credit-review-v1', 'identityRef', 'companyKeyHash', 'policyRef', 'directoryRef', 'requestId', 'schemaVersion', 'expectedVersion', 'commandId'];
const unknownReason = scenario => ({ missing: 'missing_evidence', incomplete: 'incomplete_evidence', future: 'future_observation' })[scenario] ?? null;
const observedTime = scenario => scenario === 'missing' ? null : scenario === 'future' ? FUTURE_AT : OBSERVED_AT;
const eligibleKeys = scenario => scenario === 'buyer-allowed' ? ['a', 'buyer'] : ['a', 'b'];
const contactState = (scenario, key) => key === 'inactive' || (scenario === 'inactive-buyer' && key === 'buyer') ? 'inactive' : 'active';
const expectedReview = (scenario, phase, history) => {
  const opened = ['pending', 'accepted', 'rejected'].includes(phase);
  return { opened, reason: phase === 'opening_blocked' ? CASES[scenario].opening : null,
    count: opened ? history.filter(item => item.decision === 'accept').length : null,
    createdAt: opened ? AT : null, lastOccurredAt: opened ? (history.length ? DECISIONS_AT[history.length - 1] : AT) : null };
};
const EXPOSURE_LABELS = {
  observed: { label: 'Exposición observada', message: 'El corte conserva la exposición declarada y la hipótesis con esta solicitud; no acredita crédito disponible actual.' },
  missing_evidence: { label: 'Sin evidencia de exposición', message: 'No hay un corte de exposición para este ejemplo.' },
  incomplete_evidence: { label: 'Exposición incompleta', message: 'El corte no declara una exposición empresarial completa.' },
  future_observation: { label: 'Observación posterior', message: 'La observación es posterior a la evaluación; sus importes no se anticipan.' },
};
const RESPONSE_LABELS = {
  review_required: 'Abre la revisión de ejemplo antes de responder.', review_terminal: 'La revisión del ejemplo está cerrada y conserva sus respuestas.',
  reviewer_not_selected: 'Este contacto no está designado en la política del ejemplo.', reviewer_inactive: 'Este contacto de ejemplo está inactivo.',
  buyer_separation_required: 'El comprador está excluido de la revisión en este ejemplo.', reviewer_already_decided: 'Este contacto ya ha declarado una respuesta.',
};
const GUIDE_STORAGE_KEY = 'logic2b:ecom-guide:v1';
// El shell existente posiciona WhatsApp con rAF al observar layout/scroll.
// Solo se permite su caller exacto, derivado del HTML y de esta fuente local.
const sharedContactSource = await readFile(new URL('../src/components/WhatsAppContact.astro', import.meta.url), 'utf8');
const sharedContactScript = sharedContactSource.match(/<script is:inline>([\s\S]*?)<\/script>/u)?.[1]?.trim();
assert.ok(sharedContactScript, 'Falta el script compartido de layout conocido.');
const sharedFrameExpression = 'requestAnimationFrame(update)';
const sharedTimer = (timer, location) => timer.name === 'requestAnimationFrame' && timer.caller.endsWith(`(${location})`);
const action = (name) => `[data-credit-action="${name}"]`;
const chrome = [process.env.CHROME_BIN, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome']
  .find((path) => path && existsSync(path));
if (!chrome) throw new Error('Indica CHROME_BIN con la ruta de Chrome.');
const output = resolve(process.env.OUTPUT_DIR ?? 'tmp/company-credit-review-demo');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'ecom-company-credit-review-'));
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
  Object.defineProperty(window, '__companyCreditReviewAudit', { value: audit });
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
      const stable = await evaluate(`(() => {
        const field = document.querySelector(${JSON.stringify(selector)});
        if (field.disabled) throw new Error('No se puede interactuar con un selector desactivado.');
        if (!Array.from(field.options).some(option => option.value === ${JSON.stringify(value)})) throw new Error('Opción no disponible.');
        const focused = document.activeElement === field;
        field.value = ${JSON.stringify(value)};
        field.dispatchEvent(new Event('change', { bubbles: true }));
        return document.querySelector(${JSON.stringify(selector)}) === field && (!focused || document.activeElement === field);
      })()`);
      check(`${width} ${selector}: cambiar opción conserva nodo y foco`, stable);
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
      if (name !== 'reset' && await evaluate(`document.querySelector(${JSON.stringify(selector)}).disabled`)) {
        check(`${width} acción ${name}: foco trasladado al resultado visible al deshabilitarse`, await evaluate(`(() => {
          const heading = document.querySelector('#credit-review-title');
          const rect = heading.getBoundingClientRect();
          const style = getComputedStyle(heading);
          return document.activeElement === heading && rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight
            && heading.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
        })()`));
      }
    };
    const disabledNoop = async (name) => {
      const before = JSON.stringify(await view());
      check(`${width} ${name}: acción no disponible deshabilitada`, await evaluate(`document.querySelector(${JSON.stringify(action(name))}).disabled`));
      await evaluate(`document.querySelector(${JSON.stringify(action(name))}).click()`);
      check(`${width} ${name}: clic en botón deshabilitado conserva todo resultado`, JSON.stringify(await view()) === before);
    };
    const numericalView = observed => { const { review, ...numbers } = observed; return JSON.stringify(numbers); };
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
      const node = selector => root.querySelector(selector);
      const text = item => item.textContent.replace(/\\s+/gu, ' ').trim();
      const time = selector => ({ datetime: node(selector).getAttribute('datetime'), text: text(node(selector)) });
      const money = item => ({ cents: item.getAttribute('data-cents'), text: text(item) });
      const exposure = node('[data-credit-exposure]');
      const exposureAmounts = node('[data-credit-exposure-amounts]');
      const review = node('[data-credit-review]');
      return {
        company: { state: node('[data-credit-company]').dataset.state, label: text(node('[data-credit-company-label]')), stateText: text(node('[data-credit-company-state]')) },
        buyer: { state: node('[data-credit-buyer]').dataset.state, label: text(node('[data-credit-buyer-label]')), stateText: text(node('[data-credit-buyer-state]')) },
        requested: { ...money(node('[data-credit-requested]')), currency: node('[data-credit-requested]').getAttribute('data-currency') },
        evaluated: time('[data-credit-evaluated-at]'),
        exposure: { outcome: exposure.dataset.outcome, reason: exposure.getAttribute('data-reason'), coverage: exposure.getAttribute('data-coverage'),
          label: text(node('[data-credit-exposure-label]')), message: text(node('[data-credit-exposure-message]')),
          observed: time('[data-credit-observed-at]'), observedHidden: node('[data-credit-observed-row]').hidden, hidden: exposureAmounts.hidden,
          asOf: exposureAmounts.getAttribute('data-as-of'), date: time('[data-credit-as-of]'),
          amounts: ['company', 'with-request'].map(name => money(node('[data-credit-exposure-amount="' + name + '"]'))) },
        comparisons: Array.from(root.querySelectorAll('[data-credit-comparison]')).map(card => ({
          id: card.dataset.creditComparison, status: card.getAttribute('data-status'), position: card.getAttribute('data-position'), reason: card.getAttribute('data-reason'),
          label: text(card.querySelector('[data-credit-comparison-label]')), statusLabel: text(card.querySelector('[data-credit-comparison-status]')),
          positionLabel: text(card.querySelector('[data-credit-comparison-position]')), reasonLabel: text(card.querySelector('[data-credit-comparison-reason-label]')),
          amounts: ['limit', 'compared', 'difference'].map(name => money(card.querySelector('[data-credit-comparison-amount="' + name + '"]'))),
          placeholders: ['limit', 'compared', 'difference'].map(name => { const item = card.querySelector('[data-credit-comparison-empty="' + name + '"]');
            return { hidden: item.hidden, text: text(item) }; }) })),
        review: { status: review.dataset.status, reason: review.getAttribute('data-opening-reason'),
          statusLabel: text(node('[data-credit-review-status]')), actionLabel: text(node('[data-credit-action-result]')), openingLabel: text(node('[data-credit-opening-reason]')),
          blockedReason: text(node('[data-credit-response-blocked-reason]')),
          quorum: { count: node('[data-credit-quorum]').getAttribute('data-count'), text: text(node('[data-credit-quorum]')) },
          count: { count: node('[data-credit-acceptance-count]').getAttribute('data-count'), text: text(node('[data-credit-acceptance-count]')) },
          countPlaceholder: { hidden: node('[data-credit-no-acceptance-count]').hidden, text: text(node('[data-credit-no-acceptance-count]')) },
          datesHidden: node('[data-credit-review-dates]').hidden, historyHidden: node('[data-credit-history]').hidden,
          historyEmptyHidden: node('[data-credit-history-empty]').hidden,
          created: time('[data-credit-created-at]'), last: time('[data-credit-last-occurred-at]'),
          contacts: Array.from(root.querySelectorAll('[data-credit-contact]')).map(card => ({
            id: card.dataset.creditContact, state: card.getAttribute('data-state'), responseState: card.getAttribute('data-response-state'),
            label: text(card.querySelector('[data-credit-contact-label]')), stateLabel: text(card.querySelector('[data-credit-contact-state]')),
            responseLabel: text(card.querySelector('[data-credit-contact-response]')), reasonLabel: text(card.querySelector('[data-credit-contact-reason]')) })),
          history: Array.from(root.querySelectorAll('[data-credit-history-row]')).map(row => ({
            reviewerKey: row.getAttribute('data-reviewer-key'), decision: row.getAttribute('data-decision'),
            label: text(row.querySelector('[data-credit-history-contact]')), decisionLabel: text(row.querySelector('[data-credit-history-decision]')),
            date: { datetime: row.querySelector('time').getAttribute('datetime'), text: text(row.querySelector('time')) } })) },
      };
    })()`);
    const state = () => evaluate(`({
      scenarioId: document.querySelector(${JSON.stringify(SCENARIO)}).value,
      reviewerKey: document.querySelector(${JSON.stringify(REVIEWER)}).value
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
    const verify = async (scenarioId, phase = 'not_open', history = [], reviewerKey = 'a') => {
      const label = `${width} ${scenarioId}/${phase}/${history.length}/${reviewerKey}`;
      const expected = CASES[scenarioId];
      const actual = await view();
      const review = expectedReview(scenarioId, phase, history);
      const reason = unknownReason(scenarioId);
      const observedAt = observedTime(scenarioId);
      const exposureText = reason ? EXPOSURE_LABELS[reason] : EXPOSURE_LABELS.observed;
      const numeric = (observed, wanted) => observed.cents === (wanted === null ? null : String(wanted)) && observed.text === (wanted === null ? '' : MONEY[wanted]);
      const instant = (observed, wanted) => observed.datetime === wanted && observed.text === (wanted === null ? '' : INSTANT_TEXT[wanted]);
      check(`${label}: selección explícita de caso y contacto`, JSON.stringify(await state()) === JSON.stringify({ scenarioId, reviewerKey }));
      check(`${label}: empresa y comprador conservan sus estados declarados`,
        actual.company.state === (scenarioId === 'inactive-company' ? 'inactive' : 'active') && actual.company.label === 'Empresa de crédito de ejemplo'
        && actual.company.stateText === (scenarioId === 'inactive-company' ? 'Inactiva' : 'Activa')
        && actual.buyer.state === (scenarioId === 'inactive-buyer' ? 'inactive' : 'active') && actual.buyer.label === 'Comprador de ejemplo'
        && actual.buyer.stateText === (scenarioId === 'inactive-buyer' ? 'Inactivo' : 'Activo'));
      check(`${label}: solicitud monetaria exacta e independiente`, numeric(actual.requested, expected.request) && actual.requested.currency === 'EUR');
      check(`${label}: evaluación fija explícita y UTC visible`, instant(actual.evaluated, AT));
      check(`${label}: observación conocida o desconocida con motivo y cobertura`, actual.exposure.outcome === (reason ? 'unknown' : 'observed')
        && actual.exposure.reason === reason && actual.exposure.coverage === (scenarioId === 'missing' ? null : scenarioId === 'incomplete' ? 'incomplete' : 'complete')
        && actual.exposure.label === exposureText.label && actual.exposure.message === exposureText.message);
      check(`${label}: observedAt conserva metadata legítima y asOf solo importes conocidos`, instant(actual.exposure.observed, observedAt)
        && actual.exposure.observedHidden === (observedAt === null) && actual.exposure.hidden === (reason !== null) && actual.exposure.asOf === (reason ? null : observedAt)
        && instant(actual.exposure.date, reason ? null : observedAt));
      check(`${label}: exposición e hipótesis exactas; ausencia nunca cero`, numeric(actual.exposure.amounts[0], expected.exposure)
        && numeric(actual.exposure.amounts[1], expected.projected));
      check(`${label}: tres dimensiones independientes y ordenadas`, JSON.stringify(actual.comparisons.map(item => item.id)) === JSON.stringify(Object.keys(COMPARISON_LABELS)));
      for (const [index, comparison] of actual.comparisons.entries()) {
        const expectedReason = expected.statuses[index] === 'unconfigured' ? 'limit_unconfigured' : expected.statuses[index] === 'unknown' ? reason : null;
        check(`${label} ${comparison.id}: estado, motivo y posición numéricos`, comparison.status === expected.statuses[index]
          && comparison.position === expected.positions[index] && comparison.reason === expectedReason
          && comparison.label === COMPARISON_LABELS[comparison.id] && comparison.statusLabel === STATUS_LABELS[comparison.status]
          && comparison.positionLabel === (comparison.position ? POSITION_LABELS[comparison.position] : '')
          && comparison.reasonLabel === (expectedReason === 'limit_unconfigured' ? 'Sin límite declarado' : expectedReason ? EXPOSURE_LABELS[expectedReason].label : ''));
        check(`${label} ${comparison.id}: límite, comparado y diferencia firmada literales`,
          [expected.limits[index], expected.compared[index], expected.differences[index]].every((wanted, moneyIndex) => numeric(comparison.amounts[moneyIndex], wanted)));
        check(`${label} ${comparison.id}: textos de ausencia solo junto a datos realmente ausentes`,
          [expected.limits[index], expected.compared[index], expected.differences[index]].every((wanted, moneyIndex) =>
            comparison.placeholders[moneyIndex].hidden === (wanted !== null)
            && comparison.placeholders[moneyIndex].text === ['Sin límite declarado', 'Sin importe conocido', 'Sin comparación'][moneyIndex]));
      }
      check(`${label}: revisión declarada separada de límites`, actual.review.status === phase && actual.review.statusLabel === REVIEW_LABELS[phase]
        && actual.review.actionLabel === REVIEW_LABELS[phase]
        && actual.review.reason === review.reason && actual.review.openingLabel === (review.reason ? OPENING_LABELS[review.reason] : ''));
      check(`${label}: quórum siempre declarado y aceptaciones solo tras apertura`, actual.review.quorum.count === '2' && actual.review.quorum.text === '2'
        && actual.review.count.count === (review.count === null ? null : String(review.count)) && actual.review.count.text === (review.count === null ? '' : String(review.count))
        && actual.review.countPlaceholder.hidden === (review.count !== null) && actual.review.countPlaceholder.text === 'Sin revisión abierta');
      check(`${label}: fechas de expediente no inventadas ni conservadas de otro caso`, instant(actual.review.created, review.createdAt)
        && instant(actual.review.last, review.lastOccurredAt) && actual.review.datesHidden === !review.opened);
      check(`${label}: historial visible solo cuando contiene declaraciones`, actual.review.historyHidden === (history.length === 0)
        && actual.review.historyEmptyHidden === (history.length !== 0));
      check(`${label}: historial ordenado con contacto, decisión y fecha exactos`, JSON.stringify(actual.review.history) === JSON.stringify(history.map((item, index) => ({
        reviewerKey: item.reviewerKey, decision: item.decision, label: CONTACTS[item.reviewerKey], decisionLabel: DECISION_LABELS[item.decision],
        date: { datetime: DECISIONS_AT[index], text: INSTANT_TEXT[DECISIONS_AT[index]] } }))));
      check(`${label}: cinco contactos descriptivos sin sustituir selección`, JSON.stringify(actual.review.contacts.map(item => item.id)) === JSON.stringify(Object.keys(CONTACTS)));
      for (const contact of actual.review.contacts) {
        const eligible = eligibleKeys(scenarioId).includes(contact.id);
        const decided = history.some(item => item.reviewerKey === contact.id);
        const responseState = !review.opened ? 'not_open' : decided ? 'responded' : eligible ? 'awaiting' : 'not_eligible';
        const status = contactState(scenarioId, contact.id);
        const explanation = !review.opened || eligible ? '' : contact.id === 'inactive' ? RESPONSE_LABELS.reviewer_inactive
          : contact.id === 'buyer' ? RESPONSE_LABELS.buyer_separation_required : RESPONSE_LABELS.reviewer_not_selected;
        check(`${label} contacto ${contact.id}: estado y respuesta declarada sin permiso implícito`, contact.state === status
          && contact.label === CONTACTS[contact.id] && contact.stateLabel === (status === 'active' ? 'Activo' : 'Inactivo')
          && contact.responseState === responseState && contact.responseLabel === CONTACT_LABELS[responseState] && contact.reasonLabel === explanation);
      }
      const canRespond = phase === 'pending' && eligibleKeys(scenarioId).includes(reviewerKey) && !history.some(item => item.reviewerKey === reviewerKey);
      const responseBlock = phase === 'not_open' ? RESPONSE_LABELS.review_required : phase === 'opening_blocked' ? OPENING_LABELS[review.reason]
        : phase !== 'pending' ? RESPONSE_LABELS.review_terminal : canRespond ? ''
          : history.some(item => item.reviewerKey === reviewerKey) ? RESPONSE_LABELS.reviewer_already_decided
            : reviewerKey === 'inactive' ? RESPONSE_LABELS.reviewer_inactive : reviewerKey === 'buyer' ? RESPONSE_LABELS.buyer_separation_required : RESPONSE_LABELS.reviewer_not_selected;
      check(`${label}: explicación de respuesta corresponde al control seleccionado`, actual.review.blockedReason === responseBlock);
      const availability = await evaluate(`({ open: !document.querySelector(${JSON.stringify(action('open'))}).disabled,
        select: !document.querySelector(${JSON.stringify(REVIEWER)}).disabled,
        accept: !document.querySelector(${JSON.stringify(action('accept'))}).disabled,
        reject: !document.querySelector(${JSON.stringify(action('reject'))}).disabled })`);
      check(`${label}: acciones disponibles solo con expediente pendiente y contacto elegible`, JSON.stringify(availability) === JSON.stringify({
        open: phase === 'not_open', select: phase === 'pending', accept: canRespond, reject: canRespond }));
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
    const setupWriteLog = await evaluate('window.__companyCreditReviewAudit.storageWrites');
    const setupStorageWrites = setupWriteLog.length;
    check(`${width}: escrituras iniciales pertenecen solo a la guía`, setupWriteLog.every(write => write.storage === 'session' && write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    await evaluate('window.__companyCreditReviewAudit.storageWrites.length = 0');
    const setupStorageEvents = storageEvents.filter((event) => event.sessionId === sessionId).length;
    const setupAudit = await evaluate('window.__companyCreditReviewAudit');
    const sharedLocation = await sharedFrameLocation();
    await evaluate(`window.__companyCreditReviewAudit.sharedFrameLocation = ${JSON.stringify(sharedLocation)}`);
    check(`${width}: arranque solo con rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, setupAudit.timers.every(timer => sharedTimer(timer, sharedLocation)) && setupAudit.beacons === 0 && setupAudit.windows === 0);
    const initial = await state();
    const initialView = await view();
    check(`${width}: dos selectores cerrados y persistentes`, await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(ROOT)});
      return root.querySelectorAll('select').length === 2 &&
        JSON.stringify(Array.from(root.querySelector(${JSON.stringify(SCENARIO)}).options).map(option => option.value)) === ${JSON.stringify(JSON.stringify(Object.keys(CASES)))} &&
        JSON.stringify(Array.from(root.querySelector(${JSON.stringify(SCENARIO)}).options).map(option => option.textContent.trim())) === ${JSON.stringify(JSON.stringify(Object.values(SCENARIO_LABELS)))} &&
        JSON.stringify(Array.from(root.querySelector(${JSON.stringify(REVIEWER)}).options).map(option => option.value)) === ${JSON.stringify(JSON.stringify(Object.keys(CONTACTS)))};
    })()`));
    check(`${width}: inicio literal within/a sin apertura implícita`, JSON.stringify(initial) === JSON.stringify(INITIAL));
    await verify('within');
    await safety('initial');
    await disabledNoop('accept');
    await disabledNoop('reject');
    const setupRequests = requests.filter(request => request.sessionId === sessionId).length;
    moduleSessions.add(sessionId);
    await evaluate('window.__companyCreditReviewAudit.moduleActive = true');
    await press('open');
    await verify('within', 'pending');

    let guideInteractionEvidence = null;
    if (width === 375) {
      guideSessions.add(sessionId);
      await evaluate('window.__companyCreditReviewAudit.guideInteraction = true');
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
        for (const [selector, controlId] of [[SCENARIO, 'credit-scenario'], [REVIEWER, 'credit-reviewer']]) {
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
      await evaluate(`document.querySelector(${JSON.stringify(SCENARIO)}).focus({ preventScroll: true })`);
      await call('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
      // Espera del arnés Node: observa el foco después del listener matchMedia.
      await delay(75);
      await wait(`innerWidth === 375 && document.activeElement.matches(${JSON.stringify(SCENARIO)})`, 'guía abierta no roba el nuevo foco del selector');
      check(`${width} guía abierta: el siguiente resize conserva el nuevo foco en Caso`, await evaluate(`
        !document.querySelector('[data-guide-card]').hidden && document.activeElement.matches(${JSON.stringify(SCENARIO)})`));
      await evaluate(`document.querySelector('[data-guide-close]').focus()`);
      await key('Enter', 'Enter', 13);
      check(`${width} guía abierta: cerrar tras resize recupera el disparador móvil`, await evaluate(visibleLauncher));
      await evaluate(`document.querySelector(${JSON.stringify(SCENARIO)}).focus({ preventScroll: true })`);
      for (const targetWidth of [1024, 375]) {
        await call('Emulation.setDeviceMetricsOverride', { width: targetWidth, height: 812, deviceScaleFactor: 1, mobile: targetWidth < 1024 });
        await delay(75);
        await wait(`innerWidth === ${targetWidth} && document.activeElement.matches(${JSON.stringify(SCENARIO)})`, 'resize conserva foco del selector');
        check(`${width} selector: el cambio a ${targetWidth}px no roba el foco`, await evaluate(`document.activeElement.matches(${JSON.stringify(SCENARIO)})`));
      }
      await probeSelectors(375);
      check(`${width} guía: abrir/cerrar/resize no altera comparaciones ni revisión`, JSON.stringify(await view()) === beforeGuide);
      await evaluate('window.__companyCreditReviewAudit.guideInteraction = false');
      await delay(75);
      guideSessions.delete(sessionId);
      const guideWrites = await evaluate(`window.__companyCreditReviewAudit.storageWrites.filter(write => write.phase === 'guide')`);
      const guideEvents = storageEvents.filter(event => event.sessionId === sessionId && event.phase === 'guide');
      check(`${width} guía: solo escritura explícita de su clave de sesión`, guideWrites.length > 0 && guideWrites.every(write =>
        write.storage === 'session' && write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
      check(`${width} guía: eventos de almacenamiento separados con clave exacta`, guideEvents.every(event =>
        event.key === GUIDE_STORAGE_KEY && event.local === false));
      check(`${width} guía: al cerrar restaura el almacenamiento inicial`, await storage() === initialStorage);
      guideInteractionEvidence = { actions: ['open/minimize', 'open/close', 'open/Escape', 'open/resize/close', 'resize-with-selector-focus'],
        widths: [375, 1024, 375, 1024, 320, 375, 1024, 375, 1024, 375], writes: guideWrites.length, mutationEvents: guideEvents.length,
        storage: 'session', key: GUIDE_STORAGE_KEY, unchangedAtEnd: true };
      await evaluate(`document.querySelector(${JSON.stringify(SCENARIO)}).focus()`);
    }

    // Apertura y primer voto con teclado: sin inferir un segundo contacto.
    await evaluate(`document.querySelector('#credit-review-title').focus()`);
    await key('Tab', 'Tab', 9);
    check(`${width}: Tab desde resultado abierto alcanza contacto`, await evaluate(`document.activeElement.matches(${JSON.stringify(REVIEWER)})`));
    check(`${width}: teclado mantiene un indicador de foco visible`, await evaluate(`(() => {
      const field = document.activeElement;
      const style = getComputedStyle(field);
      return field.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
    })()`));
    await key('ArrowDown', 'ArrowDown', 40);
    await verify('within', 'pending', [], 'b');
    check(`${width}: cambiar contacto con teclado conserva foco`, await evaluate(`document.activeElement.matches(${JSON.stringify(REVIEWER)})`));
    await key('ArrowUp', 'ArrowUp', 38);
    await verify('within', 'pending');
    await press('accept');
    const voteA = [{ reviewerKey: 'a', decision: 'accept' }];
    await verify('within', 'pending', voteA);
    await safety('pending');
    await snapshot('pending');
    const pendingView = JSON.stringify(await view());
    await select(SCENARIO, 'within');
    check(`${width}: mismo escenario conserva historial y contacto`, JSON.stringify(await view()) === pendingView && (await state()).reviewerKey === 'a');
    await disabledNoop('open');
    await disabledNoop('accept');
    await disabledNoop('reject');
    for (const reviewerKey of ['buyer', 'inactive', 'unselected', 'a']) {
      await select(REVIEWER, reviewerKey);
      await verify('within', 'pending', voteA, reviewerKey);
      await disabledNoop('accept');
      await disabledNoop('reject');
    }

    for (const scenarioId of ['above', 'missing']) {
      await select(SCENARIO, scenarioId);
      await verify(scenarioId);
      const numericBefore = numericalView(await view());
      await press('open');
      await verify(scenarioId, 'pending');
      await press('accept');
      await verify(scenarioId, 'pending', voteA);
      await select(REVIEWER, 'b');
      await press('accept');
      await verify(scenarioId, 'accepted', [...voteA, { reviewerKey: 'b', decision: 'accept' }], 'b');
      check(`${width} ${scenarioId}: aceptar no altera límites ni exposición`, numericalView(await view()) === numericBefore);
      await safety(`${scenarioId}-accepted`);
      await snapshot(`${scenarioId}-accepted`);
      await disabledNoop('accept');
      await disabledNoop('reject');
    }
    await select(SCENARIO, 'unreachable');
    await verify('unreachable');
    await press('open');
    await verify('unreachable', 'opening_blocked');
    await safety('unreachable-blocked');
    await snapshot('unreachable-blocked');
    await disabledNoop('open');

    const counts = { visits: 0, contexts: 0, observed: 0, unknown: 0, compared: 0, unconfigured: 0, unknownComparisons: 0,
      below: 0, equal: 0, above: 0, notOpen: 0, pendingZero: 0, pendingOne: 0, accepted: 0, openingBlocked: 0 };
    for (const scenarioId of Object.keys(CASES)) {
      await select(SCENARIO, scenarioId);
      const before = await verify(scenarioId);
      await safety(`${scenarioId}/not-open`);
      counts.visits++; counts.contexts++; counts.notOpen++;
      counts[before.exposure.outcome === 'observed' ? 'observed' : 'unknown']++;
      for (const item of before.comparisons) {
        counts[{ compared: 'compared', unconfigured: 'unconfigured', unknown: 'unknownComparisons' }[item.status]]++;
        if (item.position) counts[{ below_limit: 'below', equal_limit: 'equal', above_limit: 'above' }[item.position]]++;
      }
      const numericBefore = numericalView(before);
      await press('open');
      if (CASES[scenarioId].opening) {
        await verify(scenarioId, 'opening_blocked');
        await safety(`${scenarioId}/opening-blocked`);
        counts.visits++; counts.openingBlocked++;
      } else {
        await verify(scenarioId, 'pending');
        await safety(`${scenarioId}/pending-zero`);
        counts.visits++; counts.pendingZero++;
        await press('accept');
        await verify(scenarioId, 'pending', voteA);
        await safety(`${scenarioId}/pending-one`);
        counts.visits++; counts.pendingOne++;
        const second = scenarioId === 'buyer-allowed' ? 'buyer' : 'b';
        await select(REVIEWER, second);
        await press('accept');
        await verify(scenarioId, 'accepted', [...voteA, { reviewerKey: second, decision: 'accept' }], second);
        await safety(`${scenarioId}/accepted`);
        counts.visits++; counts.accepted++;
      }
      check(`${width} ${scenarioId}: expediente no recalcula ni modifica las comparaciones`, numericalView(await view()) === numericBefore);
    }
    check(`${width}: matriz principal de 54 visitas, 15 contextos y dimensiones independientes`, JSON.stringify(counts) === JSON.stringify({
      visits: 54, contexts: 15, observed: 12, unknown: 3, compared: 33, unconfigured: 9, unknownComparisons: 3,
      below: 25, equal: 5, above: 3, notOpen: 15, pendingZero: 12, pendingOne: 12, accepted: 12, openingBlocked: 3 }));
    matrixEvidence.push({ width, ...counts });

    // Un rechazo cierra incluso si queda otro contacto elegible sin responder.
    await select(SCENARIO, 'within');
    await verify('within');
    await press('open');
    await press('reject');
    await verify('within', 'rejected', [{ reviewerKey: 'a', decision: 'reject' }]);
    await disabledNoop('accept');
    await disabledNoop('reject');
    check(`${width}: contacto B sin responder no habilita un expediente rechazado`, (await view()).review.contacts.find(item => item.id === 'b').responseState === 'awaiting'
      && await evaluate(`document.querySelector(${JSON.stringify(REVIEWER)}).disabled`));
    await key('Tab', 'Tab', 9);
    check(`${width}: Tab tras cierre alcanza reset sin controles terminales habilitados`, await evaluate(`document.activeElement.matches(${JSON.stringify(action('reset'))})`));
    await select(SCENARIO, 'above');
    await press('open');
    await press('accept');
    await select(REVIEWER, 'b');
    await press('reject');
    await verify('above', 'rejected', [...voteA, { reviewerKey: 'b', decision: 'reject' }], 'b');
    await disabledNoop('accept');
    await disabledNoop('reject');
    // Contextos sin límite conservan el comparado; unknown conserva límite conocido.
    for (const scenarioId of ['zero', 'future', 'incomplete', 'unconfigured', 'exposure-only', 'request-only', 'buyer-only', 'missing']) {
      await select(SCENARIO, scenarioId);
      await verify(scenarioId);
      await safety(`${scenarioId}/cleanup`);
    }
    await press('reset');
    check(`${width}: Enter restablece caso, contacto y revisión sin abrir`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await view()) === JSON.stringify(initialView));
    check(`${width}: reset conserva el foco del botón`, await evaluate(`document.activeElement.matches(${JSON.stringify(action('reset'))})`));
    await safety('reset');
    await select(SCENARIO, 'above');
    await press('open');
    await press('accept');
    await select(REVIEWER, 'b');
    await press('accept');
    await verify('above', 'accepted', [...voteA, { reviewerKey: 'b', decision: 'accept' }], 'b');
    const finalAudit = await evaluate('window.__companyCreditReviewAudit');
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
    await wait(`(${ready}) && window.__companyCreditReviewAudit?.documentEpoch !== ${JSON.stringify(previousDocumentEpoch)}`, 'recarga limpia en otro documento');
    const reloadedAudit = await evaluate('window.__companyCreditReviewAudit');
    const reloadedSharedLocation = await sharedFrameLocation();
    check(`${width}: recarga solo permite rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, reloadedAudit.timers.every(timer => sharedTimer(timer, reloadedSharedLocation)) && reloadedAudit.beacons === 0 && reloadedAudit.windows === 0);
    check(`${width}: nuevas escrituras de arranque pertenecen solo a la guía`, reloadedAudit.storageWrites.every(write => write.storage === 'session' && write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    check(`${width}: recarga restaura caso, contacto y revisión iniciales`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await view()) === JSON.stringify(initialView));
    check(`${width}: recarga conserva el almacenamiento anterior`, await storage() === initialStorage);
    storageEvidence.at(-1).reloadGuideWrites = reloadedAudit.storageWrites.length;
    storageEvidence.at(-1).sharedLayout.reloadCalls = reloadedAudit.timers.length;

    await call('Emulation.setScriptExecutionDisabled', { value: true });
    await call('Page.reload', { ignoreCache: true });
    await wait(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(ROOT)}) && document.querySelector(${JSON.stringify(ROOT)}).dataset.ready !== 'true' && window.__companyCreditReviewAudit?.documentEpoch !== ${JSON.stringify(reloadedAudit.documentEpoch)}`, 'vista sin JavaScript en otro documento');
    check(`${width}: sin JavaScript conserva comparaciones y revisión iniciales más aviso`, JSON.stringify(await view()) === JSON.stringify(initialView) && await evaluate(`Array.from(document.querySelectorAll('noscript')).some(node => /JavaScript/u.test(node.textContent))`));
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
    runner: 'node scripts/test-company-credit-review-demo.mjs', nodeVersion: process.version,
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

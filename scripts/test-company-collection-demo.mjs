/**
 * R6.4c: condiciones y evidencia de cobros de fixtures en Chrome/CDP.
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
const PATH = '/demo/admin/condiciones-pago';
const ROOT = '[data-company-collection-demo]';
const SCENARIO = '[data-collection-scenario]';
const EVALUATION = '[data-collection-evaluation]';
const INITIAL = { scenarioId: 'partial', evaluationId: 'on' };
const USUAL_AT = '2026-10-29T10:00:00.000Z';
const FUTURE_AT = '2026-11-01T10:00:00.000Z';
const EVALUATIONS = {
  before: { at: '2026-10-30T12:00:00.000Z', position: 'before_due', days: 1, milestones: ['past', 'upcoming', 'upcoming'] },
  on: { at: '2026-10-31T12:00:00.000Z', position: 'on_due', days: 0, milestones: ['past', 'today', 'upcoming'] },
  after: { at: '2026-11-02T12:00:00.000Z', position: 'after_due', days: -2, milestones: ['past', 'past', 'upcoming'] },
};
// Expectativas literales independientes: no se importa el modelo ni se calcula
// el calendario, neto o diferencia con las funciones de producción.
const CASES = {
  partial: { amounts: [4000, 0, 4000, 6000], position: 'below_expected', reversal: 'none' },
  missing: { reason: 'missing_evidence' },
  incomplete: { reason: 'incomplete_evidence' },
  future: { amounts: [4000, 0, 4000, 6000], position: 'below_expected', reversal: 'none' },
  'observed-zero': { amounts: [0, 0, 0, 10000], position: 'below_expected', reversal: 'none' },
  'immediate-equal': { amounts: [10000, 0, 10000, 0], position: 'equal_expected', reversal: 'none' },
  excess: { amounts: [12500, 0, 12500, -2500], position: 'above_expected', reversal: 'none' },
  'partial-reversal': { amounts: [15000, 2000, 13000, -3000], position: 'above_expected', reversal: 'partial' },
  'full-reversal': { amounts: [10000, 10000, 0, 10000], position: 'below_expected', reversal: 'full' },
  'declared-zero': { amounts: [0, 0, 0, 0], position: 'equal_expected', reversal: 'none' },
  unconfigured: { amounts: [4000, 0, 4000, 6000], position: 'below_expected', reversal: 'none' },
  inactive: { amounts: [10000, 0, 10000, 0], position: 'equal_expected', reversal: 'none' },
};
const MONEY = { 0: '0,00 €', 2000: '20,00 €', 4000: '40,00 €', 6000: '60,00 €', 10000: '100,00 €',
  12500: '125,00 €', 13000: '130,00 €', 15000: '150,00 €', '-2500': '-25,00 €', '-3000': '-30,00 €' };
const DAY_TEXT = { '2026-10-01': '1 oct 2026', '2026-10-29': '29 oct 2026',
  '2026-10-31': '31 oct 2026', '2026-11-03': '3 nov 2026' };
const INSTANT_TEXT = { '2026-10-29T10:00:00.000Z': '29 oct 2026, 10:00 UTC',
  '2026-10-30T12:00:00.000Z': '30 oct 2026, 12:00 UTC', '2026-10-31T12:00:00.000Z': '31 oct 2026, 12:00 UTC',
  '2026-11-01T10:00:00.000Z': '1 nov 2026, 10:00 UTC', '2026-11-02T12:00:00.000Z': '2 nov 2026, 12:00 UTC' };
const DUE_TEXT = { before_due: 'Antes del vencimiento', on_due: 'Fecha de vencimiento', after_due: 'Después del vencimiento' };
const MILESTONE_TEXT = { upcoming: 'Posterior a la evaluación', today: 'Coincide con la evaluación', past: 'Anterior a la evaluación' };
const AMOUNT_TEXT = { below_expected: 'Aplicado neto por debajo del importe declarado',
  equal_expected: 'Aplicado neto igual al importe declarado', above_expected: 'Aplicado neto por encima del importe declarado' };
const REVERSAL_TEXT = { none: 'Sin reversiones declaradas', partial: 'Reversión parcial de lo aplicado', full: 'Reversión total de lo aplicado' };
const EVIDENCE_TEXT = { missing_evidence: 'Sin evidencia', incomplete_evidence: 'Evidencia incompleta',
  future_observation: 'Observación posterior a la evaluación' };
const PRIVATE_TOKENS = ['demo.company-collection', 'company.workshop', 'company.immediate', 'company.unconfigured',
  'company.closed', 'companyKeyHash', 'policyRef', 'directoryRef', 'requestId', 'schemaVersion'];
function expectedCollection({ scenarioId, evaluationId }) {
  const item = CASES[scenarioId];
  const evaluation = EVALUATIONS[evaluationId];
  const reason = scenarioId === 'future' && evaluationId !== 'after' ? 'future_observation' : item.reason ?? null;
  const observedAt = scenarioId === 'missing' ? null : scenarioId === 'future' ? FUTURE_AT : USUAL_AT;
  const configured = scenarioId !== 'unconfigured';
  return { declared: scenarioId === 'declared-zero' ? 0 : 10000,
    companyState: scenarioId === 'inactive' ? 'inactive' : 'active',
    companyLabel: scenarioId === 'inactive' ? 'Empresa inactiva de ejemplo' : scenarioId === 'unconfigured' ? 'Empresa sin condición de ejemplo'
      : scenarioId === 'immediate-equal' ? 'Comercio de ejemplo' : 'Taller de ejemplo',
    configured, condition: !configured ? 'Sin condición configurada' : scenarioId === 'immediate-equal' ? 'Inmediata' : 'A 30 días',
    baseDate: scenarioId === 'immediate-equal' ? '2026-10-31' : '2026-10-01', evaluatedAt: evaluation.at,
    dueDate: configured ? '2026-10-31' : null, duePosition: configured ? evaluation.position : null, days: configured ? evaluation.days : null,
    milestones: configured ? [-2, 0, 3].map((offset, index) => ({ offset: String(offset),
      date: ['2026-10-29', '2026-10-31', '2026-11-03'][index], position: evaluation.milestones[index] })) : [],
    outcome: reason ? 'unknown' : 'observed', reason, coverage: scenarioId === 'missing' ? null : scenarioId === 'incomplete' ? 'incomplete' : 'complete',
    observedAt, asOf: reason ? null : observedAt, amounts: reason ? null : item.amounts,
    position: reason ? null : item.position, reversal: reason ? null : item.reversal };
}
const GUIDE_STORAGE_KEY = 'logic2b:ecom-guide:v1';
// El shell existente posiciona WhatsApp con rAF al observar layout/scroll.
// Solo se permite su caller exacto, derivado del HTML y de esta fuente local.
const sharedContactSource = await readFile(new URL('../src/components/WhatsAppContact.astro', import.meta.url), 'utf8');
const sharedContactScript = sharedContactSource.match(/<script is:inline>([\s\S]*?)<\/script>/u)?.[1]?.trim();
assert.ok(sharedContactScript, 'Falta el script compartido de layout conocido.');
const sharedFrameExpression = 'requestAnimationFrame(update)';
const sharedTimer = (timer, location) => timer.name === 'requestAnimationFrame' && timer.caller.endsWith(`(${location})`);
const action = (name) => `[data-collection-action="${name}"]`;
const chrome = [process.env.CHROME_BIN, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome']
  .find((path) => path && existsSync(path));
if (!chrome) throw new Error('Indica CHROME_BIN con la ruta de Chrome.');
const output = resolve(process.env.OUTPUT_DIR ?? 'tmp/company-collection-demo');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'ecom-company-collection-'));
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
  Object.defineProperty(window, '__companyCollectionAudit', { value: audit });
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
      const node = selector => root.querySelector(selector);
      const text = item => item.textContent.replace(/\\s+/gu, ' ').trim();
      const time = selector => ({ datetime: node(selector).getAttribute('datetime'), text: text(node(selector)) });
      const calendar = node('[data-collection-calendar]');
      const evidence = node('[data-collection-evidence]');
      const amounts = node('[data-collection-amounts]');
      const declared = node('[data-collection-declared]');
      return {
        company: { state: node('[data-collection-company]').dataset.state, text: text(node('[data-collection-company]')),
          stateText: text(node('[data-collection-company-state]')) },
        declared: { cents: declared.getAttribute('data-cents'), currency: declared.getAttribute('data-currency'), text: text(declared) },
        evaluated: time('[data-collection-evaluated-at]'),
        calendar: { outcome: calendar.dataset.outcome, position: calendar.getAttribute('data-due-position'),
          condition: text(node('[data-collection-condition]')), positionText: text(node('[data-collection-calendar-position]')),
          base: time('[data-collection-base-date]'), due: time('[data-collection-due-date]'),
          days: node('[data-collection-days-until-due]').getAttribute('data-days'), daysText: text(node('[data-collection-days-until-due]')),
          daysHidden: node('[data-collection-days-row]').hidden, noDueHidden: node('[data-collection-no-due-date]').hidden,
          milestonesHidden: node('[data-collection-milestone-section]').hidden,
          milestones: Array.from(root.querySelectorAll('[data-collection-milestone]')).map(item => ({
            offset: item.getAttribute('data-offset'), position: item.getAttribute('data-position'),
            date: item.querySelector('time').getAttribute('datetime'), dateText: text(item.querySelector('time')),
            label: text(item.querySelector('span')) })) },
        evidence: { outcome: evidence.dataset.outcome, reason: evidence.getAttribute('data-reason'),
          coverage: evidence.getAttribute('data-coverage'), label: text(node('[data-collection-evidence-label]')),
          observed: time('[data-collection-observed-at]'), observedHidden: node('[data-collection-observed-row]').hidden },
        amounts: { hidden: amounts.hidden, asOf: amounts.getAttribute('data-as-of'), position: amounts.getAttribute('data-position'),
          reversal: amounts.getAttribute('data-reversal-position'), date: time('[data-collection-as-of]'),
          positionLabel: text(node('[data-collection-position-label]')), reversalLabel: text(node('[data-collection-reversal-label]')),
          values: ['applied', 'reversed', 'net', 'difference'].map(name => { const value = node('[data-collection-amount="' + name + '"]');
            return { name, cents: value.getAttribute('data-cents'), text: text(value) }; }) },
      };
    })()`);
    const state = () => evaluate(`({
      scenarioId: document.querySelector(${JSON.stringify(SCENARIO)}).value,
      evaluationId: document.querySelector(${JSON.stringify(EVALUATION)}).value
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
    const verify = async (selection) => {
      const label = `${width} ${selection.scenarioId}/${selection.evaluationId}`;
      const expected = expectedCollection(selection);
      const actual = await view();
      check(`${label}: selectores conservan escenario y evaluación explícitos`, JSON.stringify(await state()) === JSON.stringify(selection));
      check(`${label}: empresa y estado corresponden al escenario`, actual.company.state === expected.companyState && actual.company.text === expected.companyLabel
        && actual.company.stateText === (expected.companyState === 'active' ? 'Activa' : 'Inactiva'));
      check(`${label}: importe declarado independiente, incluido cero`, actual.declared.cents === String(expected.declared)
        && actual.declared.currency === 'EUR' && actual.declared.text === MONEY[expected.declared]);
      check(`${label}: instante de evaluación explícito y UTC visible`, actual.evaluated.datetime === expected.evaluatedAt && actual.evaluated.text === INSTANT_TEXT[expected.evaluatedAt]);
      check(`${label}: condición y resultado de calendario exactos`, actual.calendar.outcome === (expected.configured ? 'configured' : 'unconfigured')
        && actual.calendar.condition === expected.condition && actual.calendar.position === expected.duePosition);
      check(`${label}: base declarada y vencimiento no se infieren de evidencia`, actual.calendar.base.datetime === expected.baseDate
        && actual.calendar.base.text === DAY_TEXT[expected.baseDate] && actual.calendar.due.datetime === expected.dueDate);
      check(`${label}: días firmados hasta vencimiento o ausencia real`, actual.calendar.days === (expected.days === null ? null : String(expected.days)));
      check(`${label}: fecha ausente, días e hitos se muestran solo cuando existen`, actual.calendar.daysHidden === !expected.configured
        && actual.calendar.noDueHidden === expected.configured && actual.calendar.milestonesHidden === !expected.configured);
      check(`${label}: hitos cronológicos sin envíos`, JSON.stringify(actual.calendar.milestones.map(({ offset, date, position }) => ({ offset, date, position })))
        === JSON.stringify(expected.milestones) && actual.calendar.milestones.every(item => item.dateText === DAY_TEXT[item.date]
          && item.label === MILESTONE_TEXT[item.position]));
      if (expected.configured) {
        check(`${label}: calendario conocido mantiene fechas y días legibles`, actual.calendar.due.text === DAY_TEXT[expected.dueDate]
          && actual.calendar.daysText === String(expected.days) && actual.calendar.positionText === DUE_TEXT[expected.duePosition]);
      } else {
        check(`${label}: sin condición limpia vencimiento, días e hitos previos`, actual.calendar.due.text === '' && actual.calendar.daysText === ''
          && actual.calendar.milestones.length === 0 && actual.calendar.positionText === 'Sin fecha calculada');
      }
      check(`${label}: evidencia clasificada con cobertura y motivo exactos`, actual.evidence.outcome === expected.outcome
        && actual.evidence.reason === expected.reason && actual.evidence.coverage === expected.coverage
        && actual.evidence.label === (expected.reason ? EVIDENCE_TEXT[expected.reason] : 'Evidencia completa de ejemplo'));
      check(`${label}: observación legítima se conserva aunque sea incompleta o futura`, actual.evidence.observed.datetime === expected.observedAt
        && actual.evidence.observedHidden === (expected.observedAt === null)
        && actual.evidence.observed.text === (expected.observedAt === null ? '' : INSTANT_TEXT[expected.observedAt]));
      check(`${label}: bloque monetario visible solo con observación utilizable`, actual.amounts.hidden === (expected.outcome === 'unknown'));
      check(`${label}: asOf pertenece al snapshot observado, no a la evaluación`, actual.amounts.asOf === expected.asOf && actual.amounts.date.datetime === expected.asOf);
      check(`${label}: posiciones monetarias y reversión corresponden al snapshot`, actual.amounts.position === expected.position && actual.amounts.reversal === expected.reversal);
      if (expected.amounts) {
        check(`${label}: aplicado, revertido, neto y diferencia firmada exactos`, JSON.stringify(actual.amounts.values.map(value => value.cents)) === JSON.stringify(expected.amounts.map(String)));
        check(`${label}: dinero visible exacto conserva cero y signo negativo`, actual.amounts.values.every((value, index) => value.text === MONEY[expected.amounts[index]]));
        check(`${label}: fecha histórica y etiquetas de comparación visibles`, actual.amounts.date.text === INSTANT_TEXT[expected.asOf]
          && actual.amounts.positionLabel === AMOUNT_TEXT[expected.position] && actual.amounts.reversalLabel === REVERSAL_TEXT[expected.reversal]);
      } else {
        check(`${label}: desconocido elimina importes y atributos, nunca cero ficticio`, actual.amounts.values.every(value => value.cents === null && value.text === ''));
        check(`${label}: desconocido elimina fecha asOf y etiquetas anteriores`, actual.amounts.date.text === ''
          && actual.amounts.positionLabel === '' && actual.amounts.reversalLabel === '');
      }
      check(`${label}: etiquetas de resultado no declaran pago, impago ni saldo actual`, [actual.evidence.label,
        actual.calendar.positionText, actual.amounts.positionLabel, actual.amounts.reversalLabel].every(value => !/\b(?:pagado|impagado|moroso|saldo actual|recordatorio enviado|cobro enviado)\b/iu.test(value)));
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
    const setupWriteLog = await evaluate('window.__companyCollectionAudit.storageWrites');
    const setupStorageWrites = setupWriteLog.length;
    check(`${width}: escrituras iniciales pertenecen solo a la guía`, setupWriteLog.every(write => write.storage === 'session' && write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    await evaluate('window.__companyCollectionAudit.storageWrites.length = 0');
    const setupStorageEvents = storageEvents.filter((event) => event.sessionId === sessionId).length;
    const setupAudit = await evaluate('window.__companyCollectionAudit');
    const sharedLocation = await sharedFrameLocation();
    await evaluate(`window.__companyCollectionAudit.sharedFrameLocation = ${JSON.stringify(sharedLocation)}`);
    check(`${width}: arranque solo con rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, setupAudit.timers.every(timer => sharedTimer(timer, sharedLocation)) && setupAudit.beacons === 0 && setupAudit.windows === 0);
    const initial = await state();
    const initialView = await view();
    check(`${width}: dos selectores cerrados y persistentes`, await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(ROOT)});
      return root.querySelectorAll('select').length === 2 &&
        JSON.stringify(Array.from(root.querySelector(${JSON.stringify(SCENARIO)}).options).map(option => option.value)) === ${JSON.stringify(JSON.stringify(Object.keys(CASES)))} &&
        JSON.stringify(Array.from(root.querySelector(${JSON.stringify(EVALUATION)}).options).map(option => option.value)) === ${JSON.stringify(JSON.stringify(Object.keys(EVALUATIONS)))};
    })()`));
    check(`${width}: inicio literal parcial/evaluación on`, JSON.stringify(initial) === JSON.stringify(INITIAL));
    await verify(INITIAL);
    await safety('partial');
    await evaluate(`document.querySelector(${JSON.stringify(SCENARIO)}).focus()`);
    await snapshot('partial');
    const setupRequests = requests.filter(request => request.sessionId === sessionId).length;
    moduleSessions.add(sessionId);
    await evaluate('window.__companyCollectionAudit.moduleActive = true');

    let guideInteractionEvidence = null;
    if (width === 375) {
      guideSessions.add(sessionId);
      await evaluate('window.__companyCollectionAudit.guideInteraction = true');
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
        for (const [selector, controlId] of [[SCENARIO, 'collection-scenario'], [EVALUATION, 'collection-evaluation']]) {
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
      check(`${width} guía: abrir/cerrar/resize no altera calendario ni observación`, JSON.stringify(await view()) === beforeGuide);
      await evaluate('window.__companyCollectionAudit.guideInteraction = false');
      await delay(75);
      guideSessions.delete(sessionId);
      const guideWrites = await evaluate(`window.__companyCollectionAudit.storageWrites.filter(write => write.phase === 'guide')`);
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

    await key('Tab', 'Tab', 9);
    check(`${width}: Tab desde caso alcanza evaluación`, await evaluate(`document.activeElement.matches(${JSON.stringify(EVALUATION)})`));
    check(`${width}: teclado mantiene un indicador de foco visible`, await evaluate(`(() => {
      const field = document.activeElement;
      const style = getComputedStyle(field);
      return field.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
    })()`));
    await key('ArrowDown', 'ArrowDown', 40);
    check(`${width}: teclado cambia evaluación y mantiene foco`, await evaluate(`document.activeElement.matches(${JSON.stringify(EVALUATION)})`));
    await verify({ ...INITIAL, evaluationId: 'after' });
    await key('ArrowUp', 'ArrowUp', 38);
    await verify(INITIAL);
    await select(SCENARIO, 'missing');
    await select(EVALUATION, 'after');
    await verify({ scenarioId: 'missing', evaluationId: 'after' });
    await safety('missing-after');
    await evaluate(`document.querySelector(${JSON.stringify(EVALUATION)}).focus()`);
    await snapshot('missing-after');
    await select(SCENARIO, 'excess');
    await select(EVALUATION, 'on');
    await verify({ scenarioId: 'excess', evaluationId: 'on' });
    await safety('excess');
    await evaluate(`document.querySelector(${JSON.stringify(SCENARIO)}).focus()`);
    await snapshot('excess');
    await select(SCENARIO, 'unconfigured');
    await verify({ scenarioId: 'unconfigured', evaluationId: 'on' });
    await safety('unconfigured');
    await snapshot('unconfigured');

    // Transiciones que deben borrar valores anteriores sin borrar metadata legítima.
    for (const scenarioId of ['partial-reversal', 'incomplete', 'full-reversal', 'missing', 'excess', 'future']) {
      await select(SCENARIO, scenarioId);
      await verify({ scenarioId, evaluationId: 'on' });
    }
    for (const evaluationId of ['after', 'before', 'on']) {
      await select(EVALUATION, evaluationId);
      await verify({ scenarioId: 'future', evaluationId });
    }
    const counts = { states: 0, observed: 0, unknown: 0, configuredCalendar: 0, unconfiguredCalendar: 0,
      belowExpected: 0, equalExpected: 0, aboveExpected: 0, partialReversals: 0, fullReversals: 0, noReversal: 0 };
    for (const scenarioId of Object.keys(CASES)) {
      const previous = await state();
      await select(SCENARIO, scenarioId);
      check(`${width} ${scenarioId}: cambiar caso conserva la evaluación`, (await state()).evaluationId === previous.evaluationId);
      let historicAmounts = null;
      let observation = null;
      for (const evaluationId of Object.keys(EVALUATIONS)) {
        await select(EVALUATION, evaluationId);
        const observed = await verify({ scenarioId, evaluationId });
        if (observation === null) observation = JSON.stringify({ declared: observed.declared, company: observed.company,
          coverage: observed.evidence.coverage, observed: observed.evidence.observed });
        else check(`${width} ${scenarioId}/${evaluationId}: evaluar después no retargetea la observación ni el importe declarado`,
          JSON.stringify({ declared: observed.declared, company: observed.company, coverage: observed.evidence.coverage, observed: observed.evidence.observed }) === observation);
        if (observed.evidence.outcome === 'observed') {
          counts.observed++;
          if (historicAmounts === null) historicAmounts = JSON.stringify(observed.amounts);
          else check(`${width} ${scenarioId}/${evaluationId}: importes y asOf históricos invariantes`, JSON.stringify(observed.amounts) === historicAmounts);
          counts[{ below_expected: 'belowExpected', equal_expected: 'equalExpected', above_expected: 'aboveExpected' }[observed.amounts.position]]++;
          counts[{ none: 'noReversal', partial: 'partialReversals', full: 'fullReversals' }[observed.amounts.reversal]]++;
        } else counts.unknown++;
        counts[observed.calendar.outcome === 'configured' ? 'configuredCalendar' : 'unconfiguredCalendar']++;
        await safety(`${scenarioId}/${evaluationId}`);
        counts.states++;
      }
    }
    check(`${width}: matriz36 completa y posiciones exactas`, JSON.stringify(counts) === JSON.stringify({ states: 36,
      observed: 28, unknown: 8, configuredCalendar: 33, unconfiguredCalendar: 3,
      belowExpected: 13, equalExpected: 9, aboveExpected: 6, partialReversals: 3, fullReversals: 3, noReversal: 22 }));
    matrixEvidence.push({ width, ...counts });
    await evaluate(`document.querySelector(${JSON.stringify(action('reset'))}).focus()`);
    await key('Enter', 'Enter', 13);
    check(`${width}: Enter restablece caso, evaluación y ambos diagnósticos`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await view()) === JSON.stringify(initialView));
    check(`${width}: reset conserva el foco del botón`, await evaluate(`document.activeElement.matches(${JSON.stringify(action('reset'))})`));
    await safety('reset');
    await select(SCENARIO, 'future');
    await select(EVALUATION, 'after');
    await verify({ scenarioId: 'future', evaluationId: 'after' });
    const finalAudit = await evaluate('window.__companyCollectionAudit');
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
    await wait(`(${ready}) && window.__companyCollectionAudit?.documentEpoch !== ${JSON.stringify(previousDocumentEpoch)}`, 'recarga limpia en otro documento');
    const reloadedAudit = await evaluate('window.__companyCollectionAudit');
    const reloadedSharedLocation = await sharedFrameLocation();
    check(`${width}: recarga solo permite rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, reloadedAudit.timers.every(timer => sharedTimer(timer, reloadedSharedLocation)) && reloadedAudit.beacons === 0 && reloadedAudit.windows === 0);
    check(`${width}: nuevas escrituras de arranque pertenecen solo a la guía`, reloadedAudit.storageWrites.every(write => write.storage === 'session' && write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    check(`${width}: recarga restaura caso, evaluación y evidencia iniciales`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await view()) === JSON.stringify(initialView));
    check(`${width}: recarga conserva el almacenamiento anterior`, await storage() === initialStorage);
    storageEvidence.at(-1).reloadGuideWrites = reloadedAudit.storageWrites.length;
    storageEvidence.at(-1).sharedLayout.reloadCalls = reloadedAudit.timers.length;

    await call('Emulation.setScriptExecutionDisabled', { value: true });
    await call('Page.reload', { ignoreCache: true });
    await wait(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(ROOT)}) && document.querySelector(${JSON.stringify(ROOT)}).dataset.ready !== 'true' && window.__companyCollectionAudit?.documentEpoch !== ${JSON.stringify(reloadedAudit.documentEpoch)}`, 'vista sin JavaScript en otro documento');
    check(`${width}: sin JavaScript conserva calendario y evidencia iniciales más aviso`, JSON.stringify(await view()) === JSON.stringify(initialView) && await evaluate(`Array.from(document.querySelectorAll('noscript')).some(node => /JavaScript/u.test(node.textContent))`));
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
    runner: 'node scripts/test-company-collection-demo.mjs', nodeVersion: process.version,
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

/**
 * R6.1b: directorio de empresas y evidencia VAT de fixtures en Chrome/CDP.
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
const PATH = '/demo/admin/empresas';
const ROOT = '[data-company-directory-demo]';
const ALPHA = 'company.alpha';
const BETA = 'company.beta';
const VAT_STATES = ['not_checked', 'valid', 'invalid', 'expired', 'unavailable'];
const ROLE_LABELS = { 'role.purchasing': 'Contacto de compras', 'role.billing': 'Contacto de facturación',
  'role.logistics': 'Contacto de logística' };
const SITE_LABELS = { 'site.alpha.main': 'Sede principal A', 'site.alpha.secondary': 'Sede secundaria A',
  'site.beta.main': 'Sede principal B', 'site.beta.secondary': 'Sede secundaria B' };
const DIRECTORIES = {
  [ALPHA]: { state: 'active',
    sites: [['site.alpha.main', 'active'], ['site.alpha.secondary', 'inactive']],
    contacts: [['contact.alpha.one', 'active'], ['contact.alpha.three', 'active'], ['contact.alpha.two', 'inactive']],
    assignments: [
      ['contact.alpha.one', 'role.logistics', 'site', 'site.alpha.main'],
      ['contact.alpha.one', 'role.purchasing', 'company', null],
      ['contact.alpha.two', 'role.billing', 'site', 'site.alpha.secondary'],
    ] },
  [BETA]: { state: 'inactive',
    sites: [['site.beta.main', 'inactive'], ['site.beta.secondary', 'active']],
    contacts: [['contact.beta.one', 'inactive'], ['contact.beta.two', 'active']],
    assignments: [
      ['contact.beta.one', 'role.purchasing', 'company', null],
      ['contact.beta.two', 'role.logistics', 'site', 'site.beta.secondary'],
    ] },
};
const GUIDE_STORAGE_KEY = 'logic2b:ecom-guide:v1';
// El shell existente posiciona WhatsApp con rAF al observar layout/scroll.
// Solo se permite su caller exacto, derivado del HTML y de esta fuente local.
const sharedContactSource = await readFile(new URL('../src/components/WhatsAppContact.astro', import.meta.url), 'utf8');
const sharedContactScript = sharedContactSource.match(/<script is:inline>([\s\S]*?)<\/script>/u)?.[1]?.trim();
assert.ok(sharedContactScript, 'Falta el script compartido de layout conocido.');
const sharedFrameExpression = 'requestAnimationFrame(update)';
const sharedTimer = (timer, location) => timer.name === 'requestAnimationFrame' && timer.caller.endsWith(`(${location})`);
const action = (name) => `[data-company-action="${name}"]`;
const chrome = [process.env.CHROME_BIN, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome']
  .find((path) => path && existsSync(path));
if (!chrome) throw new Error('Indica CHROME_BIN con la ruta de Chrome.');
const output = resolve(process.env.OUTPUT_DIR ?? 'tmp/company-directory-demo');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'ecom-company-directory-'));
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
const documentHeaders = new Map();
const privacyEvidence = [];
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
  const audit = { documentEpoch: crypto.randomUUID(), storageWrites: [], timers: [], sharedFrameLocation: null, moduleActive: false, beacons: 0, windows: 0 };
  Object.defineProperty(window, '__companyDirectoryAudit', { value: audit });
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
      storageEvents.push({ sessionId: message.sessionId, event: message.method });
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
    const directory = () => evaluate(`(() => {
      const root = document.querySelector('[data-company-directory]');
      const text = node => node.innerText.replace(/\\s+/gu, ' ').trim();
      const order = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      return { companyId: root.dataset.companyId, state: root.dataset.state,
        sites: Array.from(root.querySelectorAll('[data-company-site]')).map(node => ({
          id: node.dataset.siteId, companyId: node.dataset.companyId, state: node.dataset.state, text: text(node) })).sort(order),
        contacts: Array.from(root.querySelectorAll('[data-company-contact]')).map(node => ({
          id: node.dataset.contactId, companyId: node.dataset.companyId, state: node.dataset.state, text: text(node) })).sort(order),
        assignments: Array.from(root.querySelectorAll('[data-company-assignment]')).map(node => ({
          companyId: node.dataset.companyId, contactId: node.dataset.contactId, roleId: node.dataset.roleId,
          scopeType: node.dataset.scopeType, siteId: node.dataset.siteId ?? null,
          parentContactId: node.closest('[data-company-contact]')?.dataset.contactId ?? null,
          text: text(node),
        })).sort((a, b) => {
          const left = a.contactId + '/' + a.roleId;
          const right = b.contactId + '/' + b.roleId;
          return left < right ? -1 : left > right ? 1 : 0;
        }) };
    })()`);
    const vat = () => evaluate(`(() => {
      const root = document.querySelector('[data-company-vat-result]');
      return { companyId: root.dataset.companyId, status: root.dataset.status,
        evaluationStatus: root.dataset.evaluationStatus ?? null, queryCompanyId: root.dataset.queryCompanyId ?? null,
        outcome: root.dataset.outcome ?? null, reason: root.dataset.reason ?? null,
        datesHidden: document.querySelector('[data-company-vat-dates]').hidden,
        dates: ['at', 'checkedAt', 'expiresAt'].map(name => {
          const node = document.querySelector('[data-company-vat-date="' + name + '"]');
          return { name, text: node.textContent.trim(), rowHidden: node.parentElement.hidden };
        }) };
    })()`);
    const state = () => evaluate(`({
      companyId: document.querySelector('[data-company-select]:checked').value,
      vatScenario: document.querySelector('[data-company-vat]').value
    })`);
    const privateDataAbsent = () => evaluate(`
      !/FICTIONALCOMPANYA|customer:demo:shared-reference|[a-f0-9]{64}/u.test(
        document.querySelector(${JSON.stringify(ROOT)}).outerHTML)`);
    const safety = async (stage) => {
      check(`${width} ${stage}: sin solicitudes operativas ni navegación externa`, forbiddenRequests().length === 0 && blockedRequests.length === 0);
      check(`${width} ${stage}: controles de fixture sin formularios ni campos de datos privados`, await evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(ROOT)});
        return !root.querySelector('form,textarea') &&
          Array.from(root.querySelectorAll('button')).every(button => button.type === 'button') &&
          Array.from(root.querySelectorAll('input')).every(input => input.type === 'radio') &&
          Array.from(root.querySelectorAll('a[href]')).every(link => !new URL(link.href).hostname.endsWith('.test'));
      })()`));
      check(`${width} ${stage}: todo el módulo omite VAT, referencias de perfil y hashes`, await privateDataAbsent());
      check(`${width} ${stage}: sin overflow horizontal`, await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
    };
    const verify = async (companyId, vatScenario) => {
      const expected = DIRECTORIES[companyId];
      const selected = await directory();
      const result = await vat();
      const label = `${width} ${companyId}/${vatScenario}`;
      check(`${label}: empresa y estado seleccionado conservados`, selected.companyId === companyId && selected.state === expected.state);
      check(`${label}: sedes propias y estados activos e inactivos visibles`, JSON.stringify(selected.sites.map(site => [site.id, site.state])) === JSON.stringify(expected.sites)
        && selected.sites.every(site => site.companyId === companyId && site.text.length > 0));
      check(`${label}: contactos propios incluidos los inactivos y sin rol`, JSON.stringify(selected.contacts.map(contact => [contact.id, contact.state])) === JSON.stringify(expected.contacts)
        && selected.contacts.every(contact => contact.companyId === companyId && contact.text.length > 0));
      check(`${label}: roles y scopes pertenecen a su contacto y empresa`, JSON.stringify(selected.assignments.map(item => [item.contactId, item.roleId, item.scopeType, item.siteId])) === JSON.stringify(expected.assignments)
        && selected.assignments.every(item => item.companyId === companyId && item.contactId === item.parentContactId && item.text.length > 0));
      check(`${label}: los rótulos explican cada rol y su ámbito real`, selected.assignments.every(item =>
        item.text.includes(ROLE_LABELS[item.roleId]) && item.text.includes(item.scopeType === 'company'
          ? 'Ámbito: Empresa' : 'Ámbito: Sede: ' + SITE_LABELS[item.siteId])));
      // Los radios y los fixtures del bundle son públicos; se verifica solo el área seleccionada.
      check(`${label}: área seleccionada no arrastra identidades de la otra empresa`, await evaluate(`(() => {
        const root = document.querySelector('[data-company-directory]');
        const other = ${JSON.stringify(companyId === ALPHA ? 'beta' : 'alpha')};
        const otherLabel = ${JSON.stringify(companyId === ALPHA ? 'B' : 'A')};
        const otherId = value => ['company.', 'site.', 'contact.'].some(prefix =>
          value === prefix + other || value.startsWith(prefix + other + '.'));
        return Array.from(root.querySelectorAll('*')).every(node => Array.from(node.attributes)
          .every(attr => !otherId(attr.value))) &&
          !['de ejemplo ', 'principal ', 'secundaria '].some(prefix => root.textContent.includes(prefix + otherLabel));
      })()`));
      check(`${label}: ningún panel expone VAT, referencias de perfil ni hashes`, await privateDataAbsent());
      const absent = companyId === BETA;
      const unchecked = !absent && vatScenario === 'not_checked';
      const evaluated = !absent && !unchecked;
      check(`${label}: declaración ausente y comprobación pendiente son estados diferentes`, result.companyId === companyId
        && result.status === (absent ? 'not_declared' : unchecked ? 'not_checked' : 'evaluated')
        && result.queryCompanyId === (absent ? null : ALPHA));
      const expectedOutcome = ['valid', 'invalid'].includes(vatScenario) && evaluated ? vatScenario : null;
      const expectedReason = evaluated && vatScenario === 'expired' ? 'expired' : evaluated && vatScenario === 'unavailable' ? 'not_configured' : null;
      check(`${label}: VAT positivo, negativo, caducado y ausente conservan su significado`,
        result.evaluationStatus === (evaluated ? expectedOutcome === null ? 'unusable' : 'usable' : null)
        && result.outcome === expectedOutcome && result.reason === expectedReason);
      check(`${label}: selector VAT solo disponible con declaración`, await evaluate(`
        document.querySelector('[data-company-vat-control]').hidden === ${absent} &&
        document.querySelector('[data-company-vat]').disabled === ${absent}`));
      if (!evaluated) check(`${label}: sin evaluación no se inventan fechas`, result.datesHidden && result.dates.every(date => date.text === '' && date.rowHidden));
      else if (vatScenario === 'unavailable') check(`${label}: caso ausente conserva solo el instante explícito de evaluación`,
        !result.datesHidden && /03 oct 2026, 12:00 UTC/u.test(result.dates[0].text) && !result.dates[0].rowHidden
        && result.dates.slice(1).every(date => date.text === '' && date.rowHidden));
      else check(`${label}: fechas fijas y caducidad exacta visibles`, !result.datesHidden && result.dates.every(date => /03 oct 2026/u.test(date.text) && !date.rowHidden)
        && /12:00/u.test(result.dates[0].text)
        && /11:00/u.test(result.dates[1].text) && (vatScenario === 'expired' ? result.dates[0].text === result.dates[2].text : /13:00/u.test(result.dates[2].text)));
      return selected;
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
    const authenticatedHeaders = documentHeaders.get(sessionId);
    check(`${width}: acceso guiado 200 privado, no-store, Vary Cookie y noindex`,
      authenticatedHeaders?.status === 200 && privateNoindex(authenticatedHeaders));
    check(`${width}: HTML de admin sin canonical ni hreflang, con noindex`, await evaluate(`
      /(?:^|[,\\s])noindex(?:$|[,\\s])/u.test(document.querySelector('meta[name="robots"]')?.content ?? '') &&
      !document.querySelector('link[rel="canonical"],link[hreflang]')`));
    privacyEvidence.push({ context: 'guided', method: 'GET', width, ...authenticatedHeaders });
    await evaluate(`document.querySelector('[data-guide-close]')?.click()`);
    const initialStorage = await storage();
    const setupWriteLog = await evaluate('window.__companyDirectoryAudit.storageWrites');
    const setupStorageWrites = setupWriteLog.length;
    check(`${width}: escrituras iniciales pertenecen solo a la guía`, setupWriteLog.every(write => write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    await evaluate('window.__companyDirectoryAudit.storageWrites.length = 0');
    const setupStorageEvents = storageEvents.filter((event) => event.sessionId === sessionId).length;
    const setupAudit = await evaluate('window.__companyDirectoryAudit');
    const sharedLocation = await sharedFrameLocation();
    await evaluate(`window.__companyDirectoryAudit.sharedFrameLocation = ${JSON.stringify(sharedLocation)}`);
    check(`${width}: arranque solo con rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, setupAudit.timers.every(timer => sharedTimer(timer, sharedLocation)) && setupAudit.beacons === 0 && setupAudit.windows === 0);
    const initial = await state();
    const initialDirectory = await directory();
    const initialVat = await vat();
    check(`${width}: dos empresas y cinco escenarios VAT cerrados`, await evaluate(`
      JSON.stringify(Array.from(document.querySelectorAll('[data-company-select]')).map(radio => radio.value).sort())
        === ${JSON.stringify(JSON.stringify([ALPHA, BETA]))} && document.querySelector('[data-company-vat]').options.length === 5`));
    check(`${width}: inicio Alpha sin comprobación`, JSON.stringify(initial) === JSON.stringify({ companyId: ALPHA, vatScenario: 'not_checked' }));
    await verify(ALPHA, 'not_checked');
    await safety('default');
    await snapshot('default');
    const setupRequests = requests.filter(request => request.sessionId === sessionId).length;
    moduleSessions.add(sessionId);
    await evaluate('window.__companyDirectoryAudit.moduleActive = true');

    await evaluate(`document.querySelector('[data-company-select][value="company.alpha"]').focus()`);
    await key('Tab', 'Tab', 9);
    check(`${width}: Tab desde empresa alcanza el selector VAT`, await evaluate(`document.activeElement.matches('[data-company-vat]')`));
    await key('ArrowDown', 'ArrowDown', 40);
    check(`${width}: teclado selecciona VAT positivo conservando foco`, (await state()).vatScenario === 'valid'
      && await evaluate(`document.activeElement.matches('[data-company-vat]')`));
    await verify(ALPHA, 'valid');
    check(`${width}: VAT positivo no cambia directorio, roles ni estados`, JSON.stringify(await directory()) === JSON.stringify(initialDirectory));
    await safety('valid');
    await snapshot('valid');
    await select('[data-company-vat]', 'expired');
    await verify(ALPHA, 'expired');
    await safety('expired');
    await snapshot('expired');
    await evaluate(`document.querySelector('[data-company-select][value="company.alpha"]').focus()`);
    await key('ArrowRight', 'ArrowRight', 39);
    check(`${width}: flecha cambia empresa y conserva foco nativo`, (await state()).companyId === BETA
      && (await state()).vatScenario === 'not_checked' && await evaluate(`document.activeElement.matches('[data-company-select][value="company.beta"]')`));
    await verify(BETA, 'not_checked');
    await safety('no-vat');
    await snapshot('no-vat');
    await key('ArrowLeft', 'ArrowLeft', 37);
    check(`${width}: volver a Alpha no recupera la evidencia anterior`, JSON.stringify(await state()) === JSON.stringify(initial));
    await verify(ALPHA, 'not_checked');
    check(`${width}: regreso restaura solo datos propios`, JSON.stringify(await directory()) === JSON.stringify(initialDirectory));

    for (const vatScenario of VAT_STATES) {
      await select('[data-company-vat]', vatScenario);
      const selected = await verify(ALPHA, vatScenario);
      check(`${width} ${vatScenario}: la evidencia nunca altera sedes, contactos, roles o estados`, JSON.stringify(selected) === JSON.stringify(initialDirectory));
      await safety(vatScenario);
      await evaluate(`document.querySelector('[data-company-select][value="company.beta"]').click()`);
      check(`${width} ${vatScenario}: cambio de empresa reinicia siempre VAT`, JSON.stringify(await state()) === JSON.stringify({ companyId: BETA, vatScenario: 'not_checked' }));
      await verify(BETA, 'not_checked');
      await evaluate(`document.querySelector('[data-company-select][value="company.alpha"]').click()`);
      check(`${width} ${vatScenario}: nuevo contexto Alpha empieza sin comprobación`, JSON.stringify(await state()) === JSON.stringify(initial));
      await verify(ALPHA, 'not_checked');
    }
    await select('[data-company-vat]', 'invalid');
    await evaluate(`document.querySelector(${JSON.stringify(action('reset'))}).focus()`);
    await key('Enter', 'Enter', 13);
    check(`${width}: Enter restablece empresa, directorio y evidencia`, JSON.stringify(await state()) === JSON.stringify(initial)
      && JSON.stringify(await directory()) === JSON.stringify(initialDirectory) && JSON.stringify(await vat()) === JSON.stringify(initialVat));
    await evaluate(`document.querySelector('[data-company-select][value="company.beta"]').click()`);
    const finalAudit = await evaluate('window.__companyDirectoryAudit');
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
    await wait(`(${ready}) && window.__companyDirectoryAudit?.documentEpoch !== ${JSON.stringify(previousDocumentEpoch)}`, 'recarga limpia en otro documento');
    const reloadedAudit = await evaluate('window.__companyDirectoryAudit');
    const reloadedSharedLocation = await sharedFrameLocation();
    check(`${width}: recarga solo permite rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, reloadedAudit.timers.every(timer => sharedTimer(timer, reloadedSharedLocation)) && reloadedAudit.beacons === 0 && reloadedAudit.windows === 0);
    check(`${width}: nuevas escrituras de arranque pertenecen solo a la guía`, reloadedAudit.storageWrites.every(write => write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    check(`${width}: recarga restaura empresa, directorio y evidencia iniciales`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await directory()) === JSON.stringify(initialDirectory) && JSON.stringify(await vat()) === JSON.stringify(initialVat));
    check(`${width}: recarga conserva el almacenamiento anterior`, await storage() === initialStorage);
    storageEvidence.at(-1).reloadGuideWrites = reloadedAudit.storageWrites.length;
    storageEvidence.at(-1).sharedLayout.reloadCalls = reloadedAudit.timers.length;

    await call('Emulation.setScriptExecutionDisabled', { value: true });
    await call('Page.reload', { ignoreCache: true });
    await wait(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(ROOT)}) && document.querySelector(${JSON.stringify(ROOT)}).dataset.ready !== 'true' && window.__companyDirectoryAudit?.documentEpoch !== ${JSON.stringify(reloadedAudit.documentEpoch)}`, 'vista sin JavaScript en otro documento');
    check(`${width}: sin JavaScript conserva directorio y VAT iniciales más aviso`, JSON.stringify(await directory()) === JSON.stringify(initialDirectory) && JSON.stringify(await vat()) === JSON.stringify(initialVat) && await evaluate(`Array.from(document.querySelectorAll('noscript')).some(node => /JavaScript/u.test(node.textContent))`));
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
    runner: 'node scripts/test-company-directory-demo.mjs', nodeVersion: process.version,
    result: failure === null ? 'passed' : 'failed', checksPassed: checks.length,
    checks, failure, screenshots, requestCount: requests.length,
    blockedRequests: blockedRequests.map(diagnosticRequest),
    forbiddenRequests: forbiddenRequests().map(diagnosticRequest), privacyEvidence, storageEvidence, errors,
  }, null, 2) + '\n');
  for (const task of pending.values()) clearTimeout(task.timer);
  socket?.close();
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise((resolveExit) => { child.once('exit', resolveExit); child.kill(); });
  }
  await rm(profile, { recursive: true, force: true });
  process.stdout.write(`${checks.length} comprobaciones correctas${failure ? `; fallo: ${failure}` : ''}; informe en ${output}/report.json\n`);
}

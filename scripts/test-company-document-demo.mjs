/**
 * R6.7c: referencias y evidencia documental de fixtures en Chrome/CDP.
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
const PATH = '/demo/admin/documentos-empresa';
const ROOT = '[data-company-document-demo]';
const SCENARIO = '[data-document-scenario]';
const EVALUATION = '[data-document-evaluation]';
const INITIAL = { scenarioId: 'same', evaluationId: 'first' };
const TIMES = { first: '2026-10-03T14:00:00.000Z', boundary: '2026-10-03T14:15:00.000Z', after: '2026-10-03T14:30:00.000Z' };
const TIME_LABELS = { first: '3 oct 2026 · 14:00 UTC', boundary: '3 oct 2026 · 14:15 UTC', after: '3 oct 2026 · 14:30 UTC' };
const INSTANT_TEXT = Object.fromEntries(Object.keys(TIMES).map(key => [TIMES[key], TIME_LABELS[key]]));
// Literales del plan aceptado; no importa modelo, adaptador, evaluador ni formatter del producto.
const MONEY = { 0: '0,00 EUR', 7200: '72,00 EUR', 7700: '77,00 EUR', 8200: '82,00 EUR' };
const DELTA = { 0: '0,00 EUR', 500: '+5,00 EUR', '-500': '−5,00 EUR', '-7700': '−77,00 EUR' };
const SCENARIOS = [
  {
    "id": "same",
    "label": "Datos coincidentes",
    "description": "La empresa compradora, la referencia de compra y el importe declarado coinciden en este corte. La coincidencia no valida una factura ni acredita un pago.",
    "outcome": "observed",
    "companyComparison": "matches",
    "poComparison": "matches",
    "amountComparison": "compared",
    "fixtureObservedCents": 7700,
    "visibleDeltaCents": 0,
    "reason": null,
    "observedAt": "2026-10-03T14:00:00.000Z",
    "coverage": "complete",
    "expectedPurchaseOrder": "PO 2026/0042-Á",
    "supportStatus": "declared",
    "observedBuyerCompanyId": "company.offer-demo",
    "observedPurchaseOrder": "PO 2026/0042-Á",
    "expectedFieldReason": null
  },
  {
    "id": "lower",
    "label": "Importe menor",
    "description": "La evidencia declara un importe comercial menor que la oferta. La diferencia se expresa como evidencia menos oferta.",
    "outcome": "observed",
    "companyComparison": "matches",
    "poComparison": "matches",
    "amountComparison": "compared",
    "fixtureObservedCents": 7200,
    "visibleDeltaCents": -500,
    "reason": null,
    "observedAt": "2026-10-03T14:00:00.000Z",
    "coverage": "complete",
    "expectedPurchaseOrder": "PO 2026/0042-Á",
    "supportStatus": "declared",
    "observedBuyerCompanyId": "company.offer-demo",
    "observedPurchaseOrder": "PO 2026/0042-Á",
    "expectedFieldReason": null
  },
  {
    "id": "higher",
    "label": "Importe mayor",
    "description": "La evidencia declara un importe comercial mayor que la oferta. La diferencia positiva no es un recargo ni una deuda.",
    "outcome": "observed",
    "companyComparison": "matches",
    "poComparison": "matches",
    "amountComparison": "compared",
    "fixtureObservedCents": 8200,
    "visibleDeltaCents": 500,
    "reason": null,
    "observedAt": "2026-10-03T14:00:00.000Z",
    "coverage": "complete",
    "expectedPurchaseOrder": "PO 2026/0042-Á",
    "supportStatus": "declared",
    "observedBuyerCompanyId": "company.offer-demo",
    "observedPurchaseOrder": "PO 2026/0042-Á",
    "expectedFieldReason": null
  },
  {
    "id": "zero",
    "label": "Cero declarado",
    "description": "La evidencia completa declara cero como importe comercial. Cero es un dato conocido y no significa ausencia de evidencia.",
    "outcome": "observed",
    "companyComparison": "matches",
    "poComparison": "matches",
    "amountComparison": "compared",
    "fixtureObservedCents": 0,
    "visibleDeltaCents": -7700,
    "reason": null,
    "observedAt": "2026-10-03T14:00:00.000Z",
    "coverage": "complete",
    "expectedPurchaseOrder": "PO 2026/0042-Á",
    "supportStatus": "declared",
    "observedBuyerCompanyId": "company.offer-demo",
    "observedPurchaseOrder": "PO 2026/0042-Á",
    "expectedFieldReason": null
  },
  {
    "id": "no-po",
    "label": "Sin referencia de compra",
    "description": "No se ha aportado un número PO para la oferta. El documento observado se conserva, pero su importe no se atribuye a esta referencia de compra.",
    "outcome": "observed",
    "companyComparison": "matches",
    "poComparison": "unknown",
    "amountComparison": "unknown",
    "fixtureObservedCents": 8888,
    "visibleDeltaCents": null,
    "reason": "expected_po_not_provided",
    "observedAt": "2026-10-03T14:00:00.000Z",
    "coverage": "complete",
    "expectedPurchaseOrder": null,
    "supportStatus": "not_provided",
    "observedBuyerCompanyId": "company.offer-demo",
    "observedPurchaseOrder": "PO 2026/0042-Á",
    "expectedFieldReason": "expected_not_provided"
  },
  {
    "id": "no-support",
    "label": "Sin soporte PO",
    "description": "El número PO está aportado sin soporte documental declarado. Esa ausencia no impide comparar los campos de la evidencia.",
    "outcome": "observed",
    "companyComparison": "matches",
    "poComparison": "matches",
    "amountComparison": "compared",
    "fixtureObservedCents": 7700,
    "visibleDeltaCents": 0,
    "reason": null,
    "observedAt": "2026-10-03T14:00:00.000Z",
    "coverage": "complete",
    "expectedPurchaseOrder": "PO 2026/0042-Á",
    "supportStatus": "not_provided",
    "observedBuyerCompanyId": "company.offer-demo",
    "observedPurchaseOrder": "PO 2026/0042-Á",
    "expectedFieldReason": null
  },
  {
    "id": "company-missing",
    "label": "Comprador no aportado",
    "description": "El documento no declara su empresa compradora. La referencia observada se conserva y el importe no se atribuye a la oferta.",
    "outcome": "observed",
    "companyComparison": "unknown",
    "poComparison": "matches",
    "amountComparison": "unknown",
    "fixtureObservedCents": 8888,
    "visibleDeltaCents": null,
    "reason": "company_not_provided",
    "observedAt": "2026-10-03T14:00:00.000Z",
    "coverage": "complete",
    "expectedPurchaseOrder": "PO 2026/0042-Á",
    "supportStatus": "declared",
    "observedBuyerCompanyId": null,
    "observedPurchaseOrder": "PO 2026/0042-Á",
    "expectedFieldReason": "observed_not_provided"
  },
  {
    "id": "company-different",
    "label": "Otro comprador",
    "description": "El documento declara otra empresa compradora. Se muestra esa discrepancia y se oculta su importe para esta comparación.",
    "outcome": "observed",
    "companyComparison": "differs",
    "poComparison": "matches",
    "amountComparison": "unknown",
    "fixtureObservedCents": 8888,
    "visibleDeltaCents": null,
    "reason": "company_mismatch",
    "observedAt": "2026-10-03T14:00:00.000Z",
    "coverage": "complete",
    "expectedPurchaseOrder": "PO 2026/0042-Á",
    "supportStatus": "declared",
    "observedBuyerCompanyId": "company.document-other",
    "observedPurchaseOrder": "PO 2026/0042-Á",
    "expectedFieldReason": null
  },
  {
    "id": "po-missing",
    "label": "PO observada no aportada",
    "description": "El documento no aporta un número PO. La empresa observada se conserva y el importe no se atribuye a la oferta.",
    "outcome": "observed",
    "companyComparison": "matches",
    "poComparison": "unknown",
    "amountComparison": "unknown",
    "fixtureObservedCents": 8888,
    "visibleDeltaCents": null,
    "reason": "observed_po_not_provided",
    "observedAt": "2026-10-03T14:00:00.000Z",
    "coverage": "complete",
    "expectedPurchaseOrder": "PO 2026/0042-Á",
    "supportStatus": "declared",
    "observedBuyerCompanyId": "company.offer-demo",
    "observedPurchaseOrder": null,
    "expectedFieldReason": "observed_not_provided"
  },
  {
    "id": "po-different",
    "label": "Otra PO observada",
    "description": "El número PO observado cambia una mayúscula por una minúscula. Los textos se comparan literalmente, sin corregirlos.",
    "outcome": "observed",
    "companyComparison": "matches",
    "poComparison": "differs",
    "amountComparison": "unknown",
    "fixtureObservedCents": 8888,
    "visibleDeltaCents": null,
    "reason": "po_mismatch",
    "observedAt": "2026-10-03T14:00:00.000Z",
    "coverage": "complete",
    "expectedPurchaseOrder": "PO 2026/0042-Á",
    "supportStatus": "declared",
    "observedBuyerCompanyId": "company.offer-demo",
    "observedPurchaseOrder": "PO 2026/0042-á",
    "expectedFieldReason": null
  },
  {
    "id": "amount-missing",
    "label": "Importe no aportado",
    "description": "Los campos de empresa y PO coinciden, pero no se ha declarado una magnitud comercial comparable. No se utiliza un total fiscal como sustituto.",
    "outcome": "observed",
    "companyComparison": "matches",
    "poComparison": "matches",
    "amountComparison": "unknown",
    "fixtureObservedCents": null,
    "visibleDeltaCents": null,
    "reason": "commercial_amount_not_provided",
    "observedAt": "2026-10-03T14:00:00.000Z",
    "coverage": "complete",
    "expectedPurchaseOrder": "PO 2026/0042-Á",
    "supportStatus": "declared",
    "observedBuyerCompanyId": "company.offer-demo",
    "observedPurchaseOrder": "PO 2026/0042-Á",
    "expectedFieldReason": null
  },
  {
    "id": "response-missing",
    "label": "Sin respuesta",
    "description": "No se ha aportado ninguna respuesta para esta consulta. No se inventan documento, fecha de observación ni importes.",
    "outcome": "unknown",
    "companyComparison": null,
    "poComparison": null,
    "amountComparison": null,
    "fixtureObservedCents": null,
    "visibleDeltaCents": null,
    "reason": "missing_response",
    "observedAt": null,
    "coverage": null,
    "expectedPurchaseOrder": "PO 2026/0042-Á",
    "supportStatus": "declared",
    "observedBuyerCompanyId": null,
    "observedPurchaseOrder": null,
    "expectedFieldReason": null
  },
  {
    "id": "not-configured",
    "label": "Sin caso configurado",
    "description": "La consulta es válida, pero no hay una respuesta preparada para ella en este ejemplo.",
    "outcome": "unknown",
    "companyComparison": null,
    "poComparison": null,
    "amountComparison": null,
    "fixtureObservedCents": null,
    "visibleDeltaCents": null,
    "reason": "not_configured",
    "observedAt": null,
    "coverage": null,
    "expectedPurchaseOrder": "PO 2026/0042-Á",
    "supportStatus": "declared",
    "observedBuyerCompanyId": null,
    "observedPurchaseOrder": null,
    "expectedFieldReason": null
  },
  {
    "id": "unavailable",
    "label": "Evidencia no disponible",
    "description": "La respuesta del ejemplo declara que la evidencia no está disponible. No hay fecha ni documento observados.",
    "outcome": "unknown",
    "companyComparison": null,
    "poComparison": null,
    "amountComparison": null,
    "fixtureObservedCents": null,
    "visibleDeltaCents": null,
    "reason": "unavailable",
    "observedAt": null,
    "coverage": null,
    "expectedPurchaseOrder": "PO 2026/0042-Á",
    "supportStatus": "declared",
    "observedBuyerCompanyId": null,
    "observedPurchaseOrder": null,
    "expectedFieldReason": null
  },
  {
    "id": "unsupported",
    "label": "Consulta no admitida",
    "description": "La respuesta del ejemplo declara que esta consulta no está admitida. Esto no afirma que no exista un documento externo.",
    "outcome": "unknown",
    "companyComparison": null,
    "poComparison": null,
    "amountComparison": null,
    "fixtureObservedCents": null,
    "visibleDeltaCents": null,
    "reason": "unsupported",
    "observedAt": null,
    "coverage": null,
    "expectedPurchaseOrder": "PO 2026/0042-Á",
    "supportStatus": "declared",
    "observedBuyerCompanyId": null,
    "observedPurchaseOrder": null,
    "expectedFieldReason": null
  },
  {
    "id": "future",
    "label": "Corte posterior",
    "description": "El corte se observó a las 14:15 UTC. Solo puede mostrarse al evaluar ese instante o uno posterior; cambiar la evaluación no cambia la evidencia.",
    "outcome": "time-dependent",
    "companyComparison": "matches",
    "poComparison": "matches",
    "amountComparison": "compared",
    "fixtureObservedCents": 8200,
    "visibleDeltaCents": 500,
    "reason": "future_observation at first evaluation only",
    "observedAt": "2026-10-03T14:15:00.000Z",
    "coverage": "complete",
    "expectedPurchaseOrder": "PO 2026/0042-Á",
    "supportStatus": "declared",
    "observedBuyerCompanyId": "company.offer-demo",
    "observedPurchaseOrder": "PO 2026/0042-Á",
    "expectedFieldReason": null
  },
  {
    "id": "incomplete",
    "label": "Evidencia incompleta",
    "description": "El corte declarado es incompleto. Se conserva su fecha como metadato y no se presentan datos documentales parciales.",
    "outcome": "unknown",
    "companyComparison": null,
    "poComparison": null,
    "amountComparison": null,
    "fixtureObservedCents": null,
    "visibleDeltaCents": null,
    "reason": "incomplete_evidence",
    "observedAt": "2026-10-03T14:00:00.000Z",
    "coverage": "incomplete",
    "expectedPurchaseOrder": "PO 2026/0042-Á",
    "supportStatus": "declared",
    "observedBuyerCompanyId": null,
    "observedPurchaseOrder": null,
    "expectedFieldReason": null
  },
  {
    "id": "document-missing",
    "label": "Sin documento en el corte",
    "description": "El corte declara cobertura completa, pero no aporta un documento. Esto no demuestra que no exista un documento externo.",
    "outcome": "unknown",
    "companyComparison": null,
    "poComparison": null,
    "amountComparison": null,
    "fixtureObservedCents": null,
    "visibleDeltaCents": null,
    "reason": "document_not_provided",
    "observedAt": "2026-10-03T14:00:00.000Z",
    "coverage": "complete",
    "expectedPurchaseOrder": "PO 2026/0042-Á",
    "supportStatus": "declared",
    "observedBuyerCompanyId": null,
    "observedPurchaseOrder": null,
    "expectedFieldReason": null
  }
];
const LABELS = {
  "scope": "Datos ficticios. Este ejemplo no emite facturas ni registra pedidos o cobros.",
  "company": "Empresa compradora",
  "delta": "Diferencia: evidencia menos oferta",
  "coverage": {
    "complete": "Cobertura declarada completa",
    "incomplete": "Cobertura declarada incompleta"
  },
  "field": {
    "matches": "Coincide en este campo",
    "differs": "Difiere en este campo",
    "unknown": "No se puede comparar"
  },
  "fieldReason": {
    "expected_not_provided": "El dato esperado no se ha aportado.",
    "observed_not_provided": "El dato observado no se ha aportado."
  },
  "amountPosition": {
    "below_declared": "El importe declarado en la evidencia es menor.",
    "equal_declared": "Los importes declarados son iguales.",
    "above_declared": "El importe declarado en la evidencia es mayor."
  },
  "amountUnknownLabel": "No se puede comparar el importe",
  "amountReason": {
    "company_not_provided": "Falta la empresa compradora declarada en el documento.",
    "company_mismatch": "El documento declara otra empresa compradora.",
    "expected_po_not_provided": "No se ha aportado una referencia de compra para la oferta.",
    "observed_po_not_provided": "El documento no aporta una referencia de compra.",
    "po_mismatch": "El número PO observado difiere del aportado.",
    "commercial_amount_not_provided": "No se ha declarado un importe de la misma magnitud comercial."
  },
  "evidence": {
    "observed": {
      "label": "Documento declarado en el corte",
      "message": "Cada campo conserva su propio resultado de comparación."
    },
    "missing_response": {
      "label": "Sin respuesta aportada",
      "message": "No hay respuesta para esta consulta. No se conocen documento, fecha ni importes observados."
    },
    "not_configured": {
      "label": "Sin evidencia configurada",
      "message": "No hay evidencia preparada para esta consulta en el ejemplo."
    },
    "unavailable": {
      "label": "Evidencia no disponible",
      "message": "La respuesta declara que la evidencia no está disponible. No aporta fecha ni documento."
    },
    "unsupported": {
      "label": "Consulta no admitida",
      "message": "La respuesta del ejemplo no admite esta consulta. No afirma inexistencia documental."
    },
    "future_observation": {
      "label": "Corte posterior a la evaluación",
      "message": "La fecha declarada del corte es posterior a la evaluación. Aún no se muestran documento ni comparaciones."
    },
    "incomplete_evidence": {
      "label": "Evidencia incompleta",
      "message": "El corte no declara cobertura completa. Sus datos documentales permanecen desconocidos."
    },
    "document_not_provided": {
      "label": "Documento no aportado en el corte",
      "message": "El corte no aporta un documento. Esto no demuestra que no exista un documento externo."
    }
  },
  "nullValues": "No aportado para campo esperado/observado ausente; Sin dato para fecha metadata ausente; Sin comparación para dinero sin comparación. Placeholders no incluyen0 ni importe formateado.",
  "support": {
    "declared": "Soporte PO declarado",
    "not_provided": "Sin soporte PO declarado"
  },
  "purchaseOrder": {
    "declared": "Referencia de compra aportada",
    "not_provided": "Referencia de compra no aportada"
  },
  "fieldExpected": "Referencia aportada",
  "fieldObserved": "Documento del ejemplo",
  "amountExpected": "Total comercial de la oferta",
  "amountObserved": "Importe comercial de la evidencia"
};
const FEEDBACK = { reset: "Selecciona un ejemplo y un momento de evaluación. Los datos son ficticios.", selection: "Selección actualizada. El resultado corresponde al ejemplo y al momento elegidos." };
const PRIVATE_TOKENS = ['demo.company-document.', 'demo.offer-demo.', 'company.offer-demo', 'company.document-other', 'contact.offer-demo.',
  'offer.one', 'offer.two', 'offer.three',
  'identityRef', 'companyKeyHash', 'policyRef', 'directoryRef', 'requestId', 'declarationId', 'adapterId', 'evidenceRef', 'schemaVersion',
  'commercialAmount', '8888', '88,88'];
const expectedFor = ({scenarioId,evaluationId}) => {
  const row = SCENARIOS.find(item => item.id === scenarioId);
  assert.ok(row, 'Caso cerrado');
  const observed = row.outcome === 'observed' || (scenarioId === 'future' && evaluationId !== 'first');
  const compared = observed && row.amountComparison === 'compared';
  const globalReason = observed ? null : scenarioId === 'future' ? 'future_observation' : row.reason;
  const amountReason = observed && !compared ? row.reason : null;
  const position = !compared ? null : row.visibleDeltaCents < 0 ? 'below_declared' : row.visibleDeltaCents > 0 ? 'above_declared' : 'equal_declared';
  return { row, observed, compared, globalReason, amountReason, position };
};
const GUIDE_STORAGE_KEY = 'logic2b:ecom-guide:v1';
// El shell existente posiciona WhatsApp con rAF al observar layout/scroll.
// Solo se permite su caller exacto, derivado del HTML y de esta fuente local.
const sharedContactSource = await readFile(new URL('../src/components/WhatsAppContact.astro', import.meta.url), 'utf8');
const sharedContactScript = sharedContactSource.match(/<script is:inline>([\s\S]*?)<\/script>/u)?.[1]?.trim();
assert.ok(sharedContactScript, 'Falta el script compartido de layout conocido.');
const sharedFrameExpression = 'requestAnimationFrame(update)';
const sharedTimer = (timer, location) => timer.name === 'requestAnimationFrame' && timer.caller.endsWith(`(${location})`);
const action = (name) => `[data-document-action="${name}"]`;
const chrome = [process.env.CHROME_BIN, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome']
  .find((path) => path && existsSync(path));
if (!chrome) throw new Error('Indica CHROME_BIN con la ruta de Chrome.');
const output = resolve(process.env.OUTPUT_DIR ?? 'tmp/company-document-demo');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'ecom-company-document-'));
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
  Object.defineProperty(window, '__companyDocumentAudit', { value: audit });
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
      const previous = await evaluate(`({ value: document.querySelector(${JSON.stringify(selector)}).value, feedback: document.querySelector('[data-document-feedback]').textContent.trim() })`);
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
      const message = previous.value === value ? previous.feedback : FEEDBACK.selection;
      check(`${width} ${selector}: mensaje visible describe sólo el cambio aplicado`, await evaluate(`document.querySelector('[data-document-feedback]').textContent.trim()`) === message);
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
      check(`${width} ${name}: mensaje visible corresponde a la acción simulada`, await evaluate(`document.querySelector('[data-document-feedback]').textContent.trim()`) === FEEDBACK[name]);
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
      const item = (marker, scope = root) => node('[data-document-' + marker + ']', scope);
      const time = name => {
        const value = node('[data-document-time="' + name + '"]');
        const empty = root.querySelector('[data-document-time-empty="' + name + '"]');
        return { datetime: value.getAttribute('datetime'), text: text(value), emptyHidden: empty?.hidden ?? null, emptyText: empty ? text(empty) : null };
      };
      const money = name => {
        const value = node('[data-document-amount="' + name + '"]');
        const empty = root.querySelector('[data-document-amount-empty="' + name + '"]');
        return { cents: value.getAttribute('data-cents'), text: text(value), emptyHidden: empty?.hidden ?? null,
          emptyText: empty ? text(empty) : null };
      };
      const field = name => {
        const scope = node('[data-document-field="' + name + '"]');
        const value = side => {
          const element = node('[data-document-field-value="' + side + '"]', scope);
          const empty = node('[data-document-field-empty="' + side + '"]', scope);
          return { present: element.getAttribute('data-present'), text: text(element), emptyHidden: empty.hidden, emptyText: text(empty) };
        };
        return { outcome: scope.getAttribute('data-outcome'), reason: scope.getAttribute('data-reason'),
          label: text(item('field-label', scope)), reasonLabel: text(item('field-reason', scope)), reasonHidden: item('field-reason', scope).hidden,
          expected: value('expected'), observed: value('observed') };
      };
      const referencePo = item('reference-po');
      const evidence = item('evidence');
      const metadata = item('metadata');
      const observedDocument = item('observed');
      const comparisons = item('comparisons');
      const amount = item('amount-comparison');
      return {
        description: text(item('scenario-description')),
        buyer: text(item('buyer-label')), offer: text(item('offer-label')),
        referencePo: { text: text(referencePo), present: referencePo.getAttribute('data-present'),
          label: text(item('po-label')), emptyHidden: item('reference-po-empty').hidden, emptyText: text(item('reference-po-empty')) },
        support: { status: item('support').getAttribute('data-status'), text: text(item('support')) },
        referenceAmount: money('reference'), evaluation: time('evaluation'),
        evidence: { outcome: evidence.getAttribute('data-outcome'), reason: evidence.getAttribute('data-reason'),
          label: text(item('evidence-label')), message: text(item('evidence-message')) },
        metadata: { present: metadata.getAttribute('data-present'), hidden: metadata.hidden, coverage: metadata.getAttribute('data-coverage'),
          label: text(item('coverage-label')), observedAt: time('observed') },
        document: { present: observedDocument.getAttribute('data-present'), hidden: observedDocument.hidden,
          label: text(item('observed-label')), asOf: time('document-as-of') },
        comparisons: { present: comparisons.getAttribute('data-present'), hidden: comparisons.hidden, emptyHidden: item('no-comparisons').hidden,
          company: field('company'), purchaseOrder: field('purchaseOrder'),
          amount: { outcome: amount.getAttribute('data-outcome'), reason: amount.getAttribute('data-reason'), position: amount.getAttribute('data-position'),
            label: text(item('amount-label')), reasonLabel: text(item('amount-reason')), reasonHidden: item('amount-reason').hidden,
            expected: money('expected'), observed: money('observed'), delta: money('delta'), asOf: time('amount-as-of'), asOfHidden: item('amount-time-row').hidden } },
      };
    })()`);
    const state = () => evaluate(`({ scenarioId: document.querySelector(${JSON.stringify(SCENARIO)}).value,
      evaluationId: document.querySelector(${JSON.stringify(EVALUATION)}).value })`);
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
    const verify = async (selection = INITIAL) => {
      const { row, observed, compared, globalReason, amountReason, position } = expectedFor(selection);
      const label = `${width} ${selection.scenarioId}/${selection.evaluationId}`;
      const actual = await view();
      const numeric = (got, wanted, delta = false) => got.cents === (wanted === null ? null : String(wanted))
        && got.text === (wanted === null ? '' : (delta ? DELTA : MONEY)[wanted])
        && (got.emptyHidden === null || got.emptyHidden === (wanted !== null));
      const instant = (got, wanted) => got.datetime === wanted && got.text === (wanted === null ? '' : INSTANT_TEXT[wanted])
        && (got.emptyHidden === null || got.emptyHidden === (wanted !== null));
      check(`${label}: selección explícita y descripción exactas`, JSON.stringify(await state()) === JSON.stringify(selection) && actual.description === row.description);
      check(`${label}: empresa y oferta esperadas son alias públicos`, actual.buyer === 'Empresa de ejemplo' && actual.offer === 'Oferta 1');
      check(`${label}: PO conserva literal y ausencia independiente`, actual.referencePo.text === (row.expectedPurchaseOrder ?? '')
        && actual.referencePo.present === String(row.expectedPurchaseOrder !== null) && actual.referencePo.emptyHidden === (row.expectedPurchaseOrder !== null)
        && actual.referencePo.emptyText === 'No aportado' && actual.referencePo.label === LABELS.purchaseOrder[row.expectedPurchaseOrder === null ? 'not_provided' : 'declared']);
      check(`${label}: soporte PO separado del documento observado`, actual.support.status === row.supportStatus && actual.support.text === LABELS.support[row.supportStatus]);
      check(`${label}: total de oferta conocido se conserva incluso sin evidencia`, numeric(actual.referenceAmount, 7700));
      check(`${label}: instante de evaluación explícito y texto UTC exacto`, instant(actual.evaluation, TIMES[selection.evaluationId]));
      const evidenceLabel = LABELS.evidence[observed ? 'observed' : globalReason];
      check(`${label}: resultado y motivo global visibles exactos`, actual.evidence.outcome === (observed ? 'observed' : 'unknown') && actual.evidence.reason === globalReason
        && actual.evidence.label === evidenceLabel.label && actual.evidence.message === evidenceLabel.message);
      const hasMetadata = row.observedAt !== null;
      check(`${label}: metadata presente no equivale a documento utilizable`, actual.metadata.present === String(hasMetadata) && actual.metadata.hidden === !hasMetadata
        && actual.metadata.coverage === row.coverage && actual.metadata.label === (hasMetadata ? LABELS.coverage[row.coverage] : '')
        && instant(actual.metadata.observedAt, row.observedAt) && actual.metadata.observedAt.emptyText === 'Fecha del corte: sin dato.');
      check(`${label}: documento ausente limpia alias y asOf, conserva metadata legítima aparte`, actual.document.present === String(observed)
        && actual.document.hidden === !observed
        && actual.document.label === (observed ? 'Documento del ejemplo' : '') && instant(actual.document.asOf, observed ? row.observedAt : null));
      check(`${label}: comparaciones sólo visibles cuando dominio las conoce`, actual.comparisons.present === String(observed)
        && actual.comparisons.hidden === !observed && actual.comparisons.emptyHidden === observed);
      for (const name of ['company', 'purchaseOrder']) {
        const field = actual.comparisons[name];
        const outcome = observed ? row[name === 'company' ? 'companyComparison' : 'poComparison'] : null;
        const expected = !observed ? null : name === 'company' ? 'Empresa de ejemplo' : row.expectedPurchaseOrder;
        const gotValue = !observed ? null : name === 'company' ? row.observedBuyerCompanyId === null ? null : row.observedBuyerCompanyId === 'company.offer-demo' ? 'Empresa de ejemplo' : 'Otra empresa de ejemplo' : row.observedPurchaseOrder;
        const reason = outcome !== 'unknown' ? null : expected === null ? 'expected_not_provided' : 'observed_not_provided';
        check(`${label} ${name}: resultado y razón propios, sin validación global`, field.outcome === outcome && field.reason === reason
          && field.label === (outcome === null ? '' : LABELS.field[outcome]) && field.reasonLabel === (reason === null ? '' : LABELS.fieldReason[reason])
          && field.reasonHidden === (reason === null));
        for (const [side, wanted] of [['expected', expected], ['observed', gotValue]]) {
          check(`${label} ${name}/${side}: valor literal o ausencia limpia`, field[side].text === (wanted ?? '')
            && field[side].present === String(wanted !== null) && field[side].emptyHidden === (wanted !== null) && field[side].emptyText === 'No aportado');
        }
      }
      const amount = actual.comparisons.amount;
      check(`${label}: magnitud monetaria atribuible sólo desde comparación`, amount.outcome === (observed ? compared ? 'compared' : 'unknown' : null)
        && amount.reason === amountReason && amount.position === position
        && amount.label === (!observed ? '' : compared ? LABELS.amountPosition[position] : LABELS.amountUnknownLabel)
        && amount.reasonLabel === (amountReason === null ? '' : LABELS.amountReason[amountReason]) && amount.reasonHidden === (amountReason === null));
      check(`${label}: esperado monetario pertenece a comparación existente`, numeric(amount.expected, observed ? 7700 : null));
      check(`${label}: importe declarado distingue cero real y ausencia`, numeric(amount.observed, compared ? row.fixtureObservedCents : null));
      check(`${label}: delta firmado literal y no calculado desde cifra ajena`, numeric(amount.delta, compared ? row.visibleDeltaCents : null, true));
      check(`${label}: asOf monetario sólo cuando importe comparado`, instant(amount.asOf, compared ? row.observedAt : null) && amount.asOfHidden === !compared);
      check(`${label}: placeholders monetarios separados del número`, [amount.expected,amount.observed,amount.delta].every(value => value.emptyText === 'Sin comparación'));
      check(`${label}: evaluación permite retroceder sin caducidad automática`, await evaluate(`Array.from(document.querySelector(${JSON.stringify(EVALUATION)}).options).every(option => !option.disabled)`));
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
    const setupWriteLog = await evaluate('window.__companyDocumentAudit.storageWrites');
    const setupStorageWrites = setupWriteLog.length;
    check(`${width}: tres escrituras iniciales pertenecen solo a la guía`, setupStorageWrites === 3 && setupWriteLog.every(write => write.storage === 'session' && write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    await evaluate('window.__companyDocumentAudit.storageWrites.length = 0');
    const setupStorageEvents = storageEvents.filter((event) => event.sessionId === sessionId).length;
    const setupAudit = await evaluate('window.__companyDocumentAudit');
    const sharedLocation = await sharedFrameLocation();
    await evaluate(`window.__companyDocumentAudit.sharedFrameLocation = ${JSON.stringify(sharedLocation)}`);
    check(`${width}: arranque solo con rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, setupAudit.timers.every(timer => sharedTimer(timer, sharedLocation)) && setupAudit.beacons === 0 && setupAudit.windows === 0);
    const initial = await state();
    const initialView = await view();
    check(`${width}: dos selectores cerrados persistentes`, await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(ROOT)});
      return root.querySelectorAll('select').length === 2 &&
        JSON.stringify(Array.from(root.querySelector(${JSON.stringify(SCENARIO)}).options).map(option => [option.value, option.textContent.trim(), option.disabled])) === ${JSON.stringify(JSON.stringify(SCENARIOS.map(row => [row.id,row.label,false])))} &&
        JSON.stringify(Array.from(root.querySelector(${JSON.stringify(EVALUATION)}).options).map(option => [option.value, option.textContent.trim(), option.disabled])) === ${JSON.stringify(JSON.stringify(Object.keys(TIMES).map(key => [key,TIME_LABELS[key],false])))};
    })()`));
    check(`${width}: inicio literal same/first`, JSON.stringify(initial) === JSON.stringify(INITIAL));
    await verify();
    check(`${width}: mensaje inicial honesto`, await evaluate(`document.querySelector('[data-document-feedback]').textContent.trim()`) === FEEDBACK.reset);
    await safety('initial');
    const setupRequests = requests.filter(request => request.sessionId === sessionId).length;
    moduleSessions.add(sessionId);
    await evaluate('window.__companyDocumentAudit.moduleActive = true');
    let guideInteractionEvidence = null;
    if (width === 375) {
      guideSessions.add(sessionId);
      await evaluate('window.__companyDocumentAudit.guideInteraction = true');
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
        for (const [selector, controlId] of [[SCENARIO, 'document-scenario'], [EVALUATION, 'document-evaluation']]) {
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
      check(`${width} guía: abrir/cerrar/resize no altera referencia ni evidencia`, JSON.stringify(await view()) === beforeGuide);
      await evaluate('window.__companyDocumentAudit.guideInteraction = false');
      await delay(75);
      guideSessions.delete(sessionId);
      const guideWrites = await evaluate(`window.__companyDocumentAudit.storageWrites.filter(write => write.phase === 'guide')`);
      const guideEvents = storageEvents.filter(event => event.sessionId === sessionId && event.phase === 'guide');
      check(`${width} guía: ocho escrituras explícitas de su clave de sesión`, guideWrites.length === 8 && guideWrites.every(write =>
        write.storage === 'session' && write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
      check(`${width} guía: eventos de almacenamiento separados con clave exacta`, guideEvents.every(event =>
        event.key === GUIDE_STORAGE_KEY && event.local === false));
      check(`${width} guía: al cerrar restaura el almacenamiento inicial`, await storage() === initialStorage);
      guideInteractionEvidence = { actions: ['open/minimize', 'open/close', 'open/Escape', 'open/resize/close', 'resize-with-selector-focus'],
        widths: [375, 1024, 375, 1024, 320, 375, 1024, 375, 1024, 375], writes: guideWrites.length, mutationEvents: guideEvents.length,
        storage: 'session', key: GUIDE_STORAGE_KEY, unchangedAtEnd: true };
      await evaluate(`document.querySelector(${JSON.stringify(SCENARIO)}).focus()`);
    }

    await snapshot('same');
    await evaluate(`document.querySelector(${JSON.stringify(SCENARIO)}).focus()`);
    await key('ArrowDown', 'ArrowDown', 40);
    await verify({ scenarioId: 'lower', evaluationId: 'first' });
    check(`${width}: teclado conserva nodo y foco de Ejemplo`, await evaluate(`document.activeElement.matches(${JSON.stringify(SCENARIO)})`));
    check(`${width}: foco visible con contorno real`, await evaluate(`(() => {
      const field = document.activeElement, style = getComputedStyle(field);
      return field.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
    })()`));
    await snapshot('lower');
    await key('Tab', 'Tab', 9);
    check(`${width}: Tab alcanza Momento de evaluación`, await evaluate(`document.activeElement.matches(${JSON.stringify(EVALUATION)})`));
    await key('ArrowDown', 'ArrowDown', 40);
    await verify({ scenarioId: 'lower', evaluationId: 'boundary' });
    check(`${width}: evaluación por teclado conserva foco`, await evaluate(`document.activeElement.matches(${JSON.stringify(EVALUATION)})`));
    await select(EVALUATION, 'first');
    await select(SCENARIO, 'company-different');
    await verify({ scenarioId: 'company-different', evaluationId: 'first' });
    await safety('company-different');
    await snapshot('company-different');
    await select(SCENARIO, 'future');
    await verify({ scenarioId: 'future', evaluationId: 'first' });
    await safety('future');
    await snapshot('future');

    const counts = { visits: 0, observed: 0, unknown: 0, metadata: 0, noMetadata: 0, amountCompared: 0, amountUnknown: 0,
      below: 0, equal: 0, above: 0, companyMatches: 0, companyDiffers: 0, companyUnknown: 0,
      poMatches: 0, poDiffers: 0, poUnknown: 0 };
    for (const row of SCENARIOS) for (const evaluationId of Object.keys(TIMES)) {
      await select(SCENARIO, row.id); await select(EVALUATION, evaluationId);
      const selection = { scenarioId: row.id, evaluationId };
      const actual = await verify(selection);
      await safety(`matriz/${row.id}/${evaluationId}`);
      counts.visits++;
      counts[actual.evidence.outcome]++;
      counts[actual.metadata.present === 'true' ? 'metadata' : 'noMetadata']++;
      if (actual.evidence.outcome === 'observed') {
        counts[actual.comparisons.amount.outcome === 'compared' ? 'amountCompared' : 'amountUnknown']++;
        const position = actual.comparisons.amount.position;
        if (position) counts[{below_declared:'below',equal_declared:'equal',above_declared:'above'}[position]]++;
        counts[{matches:'companyMatches',differs:'companyDiffers',unknown:'companyUnknown'}[actual.comparisons.company.outcome]]++;
        counts[{matches:'poMatches',differs:'poDiffers',unknown:'poUnknown'}[actual.comparisons.purchaseOrder.outcome]]++;
      }
    }
    check(`${width}: 54 estados y conteos independientes exactos`, JSON.stringify(counts) === JSON.stringify({
      visits: 54, observed: 35, unknown: 19, metadata: 42, noMetadata: 12, amountCompared: 17, amountUnknown: 18,
      below: 6, equal: 6, above: 5, companyMatches: 29, companyDiffers: 3, companyUnknown: 3,
      poMatches: 26, poDiffers: 3, poUnknown: 6 }));
    matrixEvidence.push({ width, ...counts });

    // Transiciones adicionales observan limpieza real, no suman visitas a la matriz.
    await press('reset');
    for (const scenarioId of ['same','company-different','same','response-missing','incomplete','document-missing','no-support','no-po','same','zero','response-missing']) {
      await select(SCENARIO, scenarioId);
      await verify({ scenarioId, evaluationId: 'first' });
      await safety(`limpieza/${scenarioId}`);
    }
    await select(SCENARIO, 'future');
    await verify({ scenarioId: 'future', evaluationId: 'first' });
    const futureMetadata = JSON.stringify((await view()).metadata);
    await select(EVALUATION, 'boundary');
    const boundary = await verify({ scenarioId: 'future', evaluationId: 'boundary' });
    check(`${width}: igualdad temporal admite el corte sin regenerarlo`, boundary.evidence.outcome === 'observed' && JSON.stringify(boundary.metadata) === futureMetadata);
    await select(EVALUATION, 'after');
    const later = await verify({ scenarioId: 'future', evaluationId: 'after' });
    check(`${width}: evaluar más tarde conserva documento, asOf y comparaciones`, JSON.stringify(later.document) === JSON.stringify(boundary.document) && JSON.stringify(later.comparisons) === JSON.stringify(boundary.comparisons));
    await select(EVALUATION, 'first');
    const earlier = await verify({ scenarioId: 'future', evaluationId: 'first' });
    check(`${width}: retroceder limpia documento/comparaciones sin borrar fecha futura declarada`, earlier.evidence.reason === 'future_observation' && JSON.stringify(earlier.metadata) === futureMetadata);
    await select(SCENARIO, 'higher'); await select(EVALUATION, 'after');
    await verify({ scenarioId: 'higher', evaluationId: 'after' });
    await select(SCENARIO, 'company-different');
    await verify({ scenarioId: 'company-different', evaluationId: 'after' });
    const beforeNoop = JSON.stringify(await view());
    await select(SCENARIO, 'company-different'); await select(EVALUATION, 'after');
    check(`${width}: opciones idénticas conservan vista y mensaje`, JSON.stringify(await view()) === beforeNoop);
    await press('reset');
    await verify();
    check(`${width}: Enter restablece ambos controles y resultados`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await view()) === JSON.stringify(initialView));
    check(`${width}: reset conserva foco visible del botón`, await evaluate(`document.activeElement.matches(${JSON.stringify(action('reset'))}) && document.activeElement.matches(':focus-visible')`));
    await safety('reset');
    await select(SCENARIO, 'future'); await select(EVALUATION, 'boundary');
    await verify({ scenarioId: 'future', evaluationId: 'boundary' });
    const finalAudit = await evaluate('window.__companyDocumentAudit');
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
    await wait(`(${ready}) && window.__companyDocumentAudit?.documentEpoch !== ${JSON.stringify(previousDocumentEpoch)}`, 'recarga limpia en otro documento');
    const reloadedAudit = await evaluate('window.__companyDocumentAudit');
    const reloadedSharedLocation = await sharedFrameLocation();
    check(`${width}: recarga solo permite rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, reloadedAudit.timers.every(timer => sharedTimer(timer, reloadedSharedLocation)) && reloadedAudit.beacons === 0 && reloadedAudit.windows === 0);
    check(`${width}: dos nuevas escrituras de arranque pertenecen solo a la guía`, reloadedAudit.storageWrites.length === 2 && reloadedAudit.storageWrites.every(write => write.storage === 'session' && write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    check(`${width}: recarga restaura caso y evaluación iniciales`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await view()) === JSON.stringify(initialView));
    check(`${width}: recarga conserva el almacenamiento anterior`, await storage() === initialStorage);
    storageEvidence.at(-1).reloadGuideWrites = reloadedAudit.storageWrites.length;
    storageEvidence.at(-1).sharedLayout.reloadCalls = reloadedAudit.timers.length;

    await call('Emulation.setScriptExecutionDisabled', { value: true });
    await call('Page.reload', { ignoreCache: true });
    await wait(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(ROOT)}) && document.querySelector(${JSON.stringify(ROOT)}).dataset.ready !== 'true' && window.__companyDocumentAudit?.documentEpoch !== ${JSON.stringify(reloadedAudit.documentEpoch)}`, 'vista sin JavaScript en otro documento');
    check(`${width}: sin JavaScript conserva referencia y evidencia iniciales más aviso`, JSON.stringify(await view()) === JSON.stringify(initialView) && await evaluate(`Array.from(document.querySelectorAll('noscript')).some(node => /JavaScript/u.test(node.textContent))`));
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
    runner: 'node scripts/test-company-document-demo.mjs', nodeVersion: process.version,
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

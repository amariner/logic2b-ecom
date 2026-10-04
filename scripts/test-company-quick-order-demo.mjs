/**
 * R6.8d: SKU, CSV e intención histórica de fixtures en Chrome/CDP.
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
const PATH = '/demo/admin/listas-sku';
const ROOT = '[data-company-quick-order-demo]';
const SCENARIO = '[data-quick-order-scenario]';
const INITIAL = { scenarioId: 'sku-identified' };
// Oráculo literal del plan aceptado; no importa ni ejecuta el modelo o los contratos de producción.
const SCENARIOS = [
  {
    "id": "sku-identified",
    "family": "sku",
    "label": "SKU · Identificado",
    "description": "Una referencia literal identifica una variante. Las dos unidades siguen siendo una intención de ejemplo.",
    "lines": [
      {
        "sku": "KIT-A",
        "quantityUnits": 2
      }
    ],
    "expected": [
      {
        "outcome": "resolved",
        "identity": [
          1,
          11
        ],
        "matchCount": 1,
        "diagnostics": []
      }
    ]
  },
  {
    "id": "sku-not-found",
    "family": "sku",
    "label": "SKU · Espacios significativos",
    "description": "El texto conserva un espacio al principio y otro al final. No se recorta para buscar una coincidencia.",
    "lines": [
      {
        "sku": " KIT-A ",
        "quantityUnits": 2
      }
    ],
    "expected": [
      {
        "outcome": "unresolved",
        "reason": "sku_not_found",
        "identity": null,
        "matchCount": 0,
        "diagnostics": []
      }
    ]
  },
  {
    "id": "sku-ambiguous",
    "family": "sku",
    "label": "SKU · Varias coincidencias",
    "description": "Dos variantes comparten exactamente el mismo SKU. El ejemplo no elige ninguna.",
    "lines": [
      {
        "sku": "SHARED",
        "quantityUnits": 2
      }
    ],
    "expected": [
      {
        "outcome": "unresolved",
        "reason": "sku_ambiguous",
        "identity": null,
        "matchCount": 2,
        "diagnostics": []
      }
    ]
  },
  {
    "id": "list-repeated",
    "family": "list",
    "label": "Lista · Filas conservadas",
    "description": "Dos filas repiten un SKU y otra declara una variante distinta del mismo producto. Se conservan por separado, incluida la cantidad cero.",
    "lines": [
      {
        "sku": "KIT-A",
        "quantityUnits": 2
      },
      {
        "sku": "KIT-A",
        "quantityUnits": 3
      },
      {
        "sku": "KIT-B-NEW",
        "quantityUnits": 0
      }
    ],
    "expected": [
      {
        "outcome": "resolved",
        "identity": [
          1,
          11
        ],
        "matchCount": 1,
        "diagnostics": [
          {
            "code": "repeated_sku",
            "relatedPositions": [
              2
            ]
          },
          {
            "code": "multiple_variants_for_product",
            "relatedPositions": [
              2,
              3
            ]
          }
        ]
      },
      {
        "outcome": "resolved",
        "identity": [
          1,
          11
        ],
        "matchCount": 1,
        "diagnostics": [
          {
            "code": "repeated_sku",
            "relatedPositions": [
              1
            ]
          },
          {
            "code": "multiple_variants_for_product",
            "relatedPositions": [
              1,
              3
            ]
          }
        ]
      },
      {
        "outcome": "resolved",
        "identity": [
          1,
          12
        ],
        "matchCount": 1,
        "diagnostics": [
          {
            "code": "multiple_variants_for_product",
            "relatedPositions": [
              1,
              2
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "csv-valid",
    "family": "csv",
    "label": "CSV · Texto interpretable",
    "description": "Las comillas del CSV conservan una coma y una comilla dentro de los SKU. La cantidad cero se mantiene.",
    "text": "sku,quantity_units\n\"PACK,SMALL\",2\n\"LABEL\"\"BLUE\",0",
    "expectedParser": {
      "outcome": "parsed",
      "headerPresent": true,
      "decodedRows": [
        [
          "PACK,SMALL",
          "2"
        ],
        [
          "LABEL\"BLUE",
          "0"
        ]
      ],
      "diagnostics": []
    },
    "expected": [
      {
        "outcome": "resolved",
        "identity": [
          3,
          31
        ],
        "matchCount": 1,
        "quantityUnits": 2,
        "diagnostics": [
          {
            "code": "multiple_variants_for_product",
            "relatedPositions": [
              2
            ]
          }
        ]
      },
      {
        "outcome": "resolved",
        "identity": [
          3,
          32
        ],
        "matchCount": 1,
        "quantityUnits": 0,
        "diagnostics": [
          {
            "code": "multiple_variants_for_product",
            "relatedPositions": [
              1
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "csv-invalid-field",
    "family": "csv",
    "label": "CSV · Cantidad escrita no válida",
    "description": "Una cantidad contiene decimales. Se muestran las dos filas decodificadas, pero no se crea una lista ni se identifica la fila correcta por separado.",
    "text": "sku,quantity_units\nKIT-A,2.5\nKIT-B-NEW,2",
    "expectedParser": {
      "outcome": "invalid",
      "headerPresent": true,
      "decodedRows": [
        [
          "KIT-A",
          "2.5"
        ],
        [
          "KIT-B-NEW",
          "2"
        ]
      ],
      "diagnostics": [
        {
          "category": "field",
          "code": "invalid_quantity",
          "at": {
            "offset": 25,
            "line": 2,
            "column": 7
          },
          "recordNumber": 2,
          "fieldNumber": 2
        }
      ]
    },
    "expected": []
  },
  {
    "id": "csv-invalid-structure",
    "family": "csv",
    "label": "CSV · Comilla sin cerrar",
    "description": "El texto termina dentro de un campo entrecomillado. El registro anterior no se transforma en una lista parcial.",
    "text": "sku,quantity_units\nKIT-A,2\n\"KIT-B-NEW,3",
    "expectedParser": {
      "outcome": "invalid",
      "headerPresent": false,
      "decodedRows": [],
      "diagnostics": [
        {
          "category": "syntax",
          "code": "unclosed_quote",
          "at": {
            "offset": 39,
            "line": 3,
            "column": 13
          },
          "recordNumber": 3,
          "fieldNumber": 1
        }
      ]
    },
    "expected": []
  },
  {
    "id": "history-same-and-renamed",
    "family": "history",
    "label": "Histórico · SKU conservado o cambiado",
    "description": "Las dos variantes declaradas figuran en el catálogo comparado. Una conserva su SKU y la otra tiene un texto distinto; la intención original no se reescribe.",
    "lines": [
      {
        "sku": "KIT-A",
        "quantityUnits": 2,
        "identity": {
          "productId": 1,
          "variantId": 11
        }
      },
      {
        "sku": "KIT-B",
        "quantityUnits": 3,
        "identity": {
          "productId": 1,
          "variantId": 12
        }
      }
    ],
    "expected": [
      {
        "identityComparison": {
          "outcome": "found",
          "comparedSku": "KIT-A",
          "skuRelation": "same"
        },
        "skuComparison": {
          "outcome": "resolved",
          "identity": [
            1,
            11
          ],
          "matchCount": 1,
          "relationToHistoricalIdentity": "same"
        }
      },
      {
        "identityComparison": {
          "outcome": "found",
          "comparedSku": "KIT-B-NEW",
          "skuRelation": "different"
        },
        "skuComparison": {
          "outcome": "unresolved",
          "reason": "sku_not_found",
          "identity": null,
          "matchCount": 0,
          "relationToHistoricalIdentity": null
        }
      }
    ]
  },
  {
    "id": "history-reused",
    "family": "history",
    "label": "Histórico · SKU reutilizado",
    "description": "Los SKU del origen coinciden con otras variantes. Una variante declarada no figura y la otra aparece con otro SKU; ninguna se sustituye por la coincidencia textual.",
    "lines": [
      {
        "sku": "OLD-C",
        "quantityUnits": 4,
        "identity": {
          "productId": 1,
          "variantId": 13
        }
      },
      {
        "sku": "OLD-D",
        "quantityUnits": 5,
        "identity": {
          "productId": 1,
          "variantId": 14
        }
      }
    ],
    "expected": [
      {
        "identityComparison": {
          "outcome": "not_found",
          "comparedSku": null,
          "skuRelation": null
        },
        "skuComparison": {
          "outcome": "resolved",
          "identity": [
            4,
            42
          ],
          "matchCount": 1,
          "relationToHistoricalIdentity": "different"
        }
      },
      {
        "identityComparison": {
          "outcome": "found",
          "comparedSku": "NEW-D",
          "skuRelation": "different"
        },
        "skuComparison": {
          "outcome": "resolved",
          "identity": [
            4,
            43
          ],
          "matchCount": 1,
          "relationToHistoricalIdentity": "different"
        }
      }
    ]
  },
  {
    "id": "history-ambiguous-and-undeclared",
    "family": "history",
    "label": "Histórico · Ambigüedad y datos ausentes",
    "description": "Una variante declarada figura aunque su SKU tenga varias coincidencias. Otra fila no indica la variante de origen y no se deduce de su SKU único.",
    "lines": [
      {
        "sku": "SHARED",
        "quantityUnits": 6,
        "identity": {
          "productId": 2,
          "variantId": 21
        }
      },
      {
        "sku": "UNDECLARED",
        "quantityUnits": 7,
        "identity": null
      }
    ],
    "expected": [
      {
        "identityComparison": {
          "outcome": "found",
          "comparedSku": "SHARED",
          "skuRelation": "same"
        },
        "skuComparison": {
          "outcome": "unresolved",
          "reason": "sku_ambiguous",
          "identity": null,
          "matchCount": 2,
          "relationToHistoricalIdentity": null
        }
      },
      {
        "identityComparison": {
          "outcome": "not_provided",
          "comparedSku": null,
          "skuRelation": null
        },
        "skuComparison": {
          "outcome": "resolved",
          "identity": [
            5,
            51
          ],
          "matchCount": 1,
          "relationToHistoricalIdentity": "not_provided"
        }
      }
    ]
  }
];
const LABELS = {
  "familyLabels": {
    "sku": "SKU literal",
    "list": "Lista de ejemplo",
    "csv": "Texto CSV de ejemplo",
    "history": "Intención histórica del ejemplo"
  },
  "inputLabels": {
    "sku": "Fila aportada",
    "list": "Filas aportadas",
    "csv": "Texto de muestra",
    "history": "Filas históricas declaradas"
  },
  "resultLabels": {
    "sku": "Identificación por SKU",
    "list": "Identificación por fila",
    "csv": "Lectura del CSV",
    "history": "Dos comparaciones independientes"
  },
  "resultMessages": {
    "sku": "El SKU se compara literalmente con este catálogo.",
    "list": "Las filas se conservan por separado; sus unidades no se suman.",
    "csvParsed": "El texto forma una lista íntegra de ejemplo. A continuación se identifica cada SKU.",
    "csvInvalid": "No se ha creado una lista de intención; no se identifica ninguna fila por separado.",
    "history": "La variante declarada y el texto SKU se comparan por separado. No se crea otra lista ni se sustituye la variante de origen."
  },
  "resolution": {
    "resolved": "SKU identificado en este catálogo",
    "sku_not_found": "SKU no encontrado en este catálogo",
    "sku_ambiguous": "Varias coincidencias de SKU"
  },
  "diagnostics": {
    "repeated_sku": "SKU repetido en la lista",
    "multiple_variants_for_product": "Variantes distintas del mismo producto"
  },
  "relatedLabel": "Una posición: «Otra fila relacionada: N». Varias: «Otras filas relacionadas: N, M». Respeta orden de relatedLineIds, no sumar ni deduplicar decisiones.",
  "historicalIdentity": {
    "found": "La variante declarada figura en este catálogo",
    "not_found": "La variante declarada no figura en este catálogo",
    "not_provided": "Variante de origen no indicada"
  },
  "historicalSkuRelation": {
    "same": "La variante conserva el mismo SKU",
    "different": "La variante tiene otro SKU"
  },
  "skuToHistoricalRelation": {
    "same": "El SKU identifica la variante de origen",
    "different": "El SKU identifica otra variante",
    "not_provided": "El SKU no permite deducir la variante de origen"
  },
  "parser": {
    "parsed": {
      "label": "Texto interpretado",
      "message": "Las filas forman una lista íntegra de ejemplo; todavía no describen un pedido."
    },
    "invalid": {
      "label": "Texto no interpretable como lista",
      "message": "Los diagnósticos describen el texto. Ninguna fila se usa como intención parcial."
    }
  },
  "csvDiagnosticLabels": {
    "invalid_quantity": "Cantidad escrita no válida",
    "unclosed_quote": "Falta la comilla de cierre"
  },
  "csvLocation": "«Línea L, columna C» desde diagnostic.at; null se oculta. recordNumber/fieldNumber se conservan en DTO para QA, no se usan para inventar otra posición.",
  "csvDecodedLabel": "Filas decodificadas para revisar",
  "csvFieldLabels": [
    "SKU escrito",
    "Cantidad escrita"
  ],
  "spaceNote": "Contiene un espacio al principio y otro al final.",
  "zero": "0 unidades declaradas; nunca guion, vacío, línea eliminada ni total.",
  "identityTitles": {
    "historical": "Variante de origen indicada",
    "comparison": "Comparación por variante declarada",
    "sku": "Comparación por SKU del origen",
    "comparedSku": "SKU de la variante en el catálogo comparado"
  },
  "relationCopy": "Los dos catálogos son ficticios. Comparamos las variantes indicadas en el ejemplo; no recuperamos pedidos reales.",
  "nullPlaceholders": {
    "identity": "Sin variante identificada",
    "historical": "No indicada",
    "comparedSku": "No consta en esta comparación"
  },
  "closedVocabulary": "Solo los dos diagnósticos CSV de estos fixtures se presentan. Si una regresión devuelve otro código sin label acordado, error fijo; no mostrar el código técnico como texto al usuario."
};
const METADATA = {
  "1:11": {
    "productLabel": "Kit de muestra",
    "variantLabel": "Esencial"
  },
  "1:12": {
    "productLabel": "Kit de muestra",
    "variantLabel": "Ampliado"
  },
  "1:13": {
    "productLabel": "Kit de muestra",
    "variantLabel": "Serie C"
  },
  "1:14": {
    "productLabel": "Kit de muestra",
    "variantLabel": "Serie D"
  },
  "2:21": {
    "productLabel": "Muestra de cerámica",
    "variantLabel": "Natural"
  },
  "3:31": {
    "productLabel": "Embalaje de muestra",
    "variantLabel": "Pequeño"
  },
  "3:32": {
    "productLabel": "Embalaje de muestra",
    "variantLabel": "Etiqueta azul"
  },
  "4:41": {
    "productLabel": "Muestra alternativa",
    "variantLabel": "Compartida"
  },
  "4:42": {
    "productLabel": "Muestra alternativa",
    "variantLabel": "Serie C alternativa"
  },
  "4:43": {
    "productLabel": "Muestra alternativa",
    "variantLabel": "Serie D alternativa"
  },
  "5:51": {
    "productLabel": "Soporte de muestra",
    "variantLabel": "Único"
  }
};
const FEEDBACK = {"reset": "Ejemplo local preparado. Los datos se conservan por fila.", "selection": "Ejemplo cambiado. El resultado corresponde a la entrada seleccionada."};
const PRIVATE_TOKENS = ['demo.quick-order.', 'company-quick-order-identity-v1', 'company-quick-order-csv-v1', 'company-quick-order-history-v1', 'originCatalogRef', 'catalogRef', 'capturedAt', 'schemaVersion', 'lineId', 'row.1', 'row.2', 'row.3', 'companyKeyHash', 'directoryRef', 'policyRef'];
const GUIDE_STORAGE_KEY = 'logic2b:ecom-guide:v1';
// El shell existente posiciona WhatsApp con rAF al observar layout/scroll.
// Solo se permite su caller exacto, derivado del HTML y de esta fuente local.
const sharedContactSource = await readFile(new URL('../src/components/WhatsAppContact.astro', import.meta.url), 'utf8');
const sharedContactScript = sharedContactSource.match(/<script is:inline>([\s\S]*?)<\/script>/u)?.[1]?.trim();
assert.ok(sharedContactScript, 'Falta el script compartido de layout conocido.');
const sharedFrameExpression = 'requestAnimationFrame(update)';
const sharedTimer = (timer, location) => timer.name === 'requestAnimationFrame' && timer.caller.endsWith(`(${location})`);
const action = (name) => { assert.equal(name, 'reset'); return '[data-quick-order-reset]'; };
const chrome = [process.env.CHROME_BIN, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome']
  .find((path) => path && existsSync(path));
if (!chrome) throw new Error('Indica CHROME_BIN con la ruta de Chrome.');
const output = resolve(process.env.OUTPUT_DIR ?? 'tmp/company-quick-order-demo');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'ecom-company-quick-order-'));
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
  Object.defineProperty(window, '__companyQuickOrderAudit', { value: audit });
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
      const previous = await evaluate(`({ value: document.querySelector(${JSON.stringify(selector)}).value, feedback: document.querySelector('[data-quick-order-feedback]').textContent.trim() })`);
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
      check(`${width} ${selector}: mensaje visible describe sólo el cambio aplicado`, await evaluate(`document.querySelector('[data-quick-order-feedback]').textContent.trim()`) === message);
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
      check(`${width} ${name}: mensaje visible corresponde a la acción simulada`, await evaluate(`document.querySelector('[data-quick-order-feedback]').textContent.trim()`) === FEEDBACK[name]);
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
        const value = scope.querySelector(selector);
        if (!value) throw new Error('Falta marker: ' + selector);
        return value;
      };
      const item = (name, scope = root) => node('[data-quick-order-' + name + ']', scope);
      const text = value => value.textContent.replace(/\\s+/gu, ' ').trim();
      const value = (name, scope = root) => text(item(name, scope));
      const attrs = (element, names) => Object.fromEntries(names.map(name => [name,element.getAttribute('data-' + name)]));
      const sku = (scope) => {
        const code = item('sku', scope), note = item('space-note', scope);
        return { literal: code.textContent, attr: code.getAttribute('data-sku'), whiteSpace: getComputedStyle(code).whiteSpace,
          note: text(note), noteHidden: note.hidden };
      };
      const identity = (scope, selector = 'identity') => {
        const container = item(selector, scope), empty = item(selector === 'declared-identity' ? 'declared-identity-empty' : 'identity-empty', scope);
        return { present: container.getAttribute('data-present'), hidden: container.hidden,
          product: value('product-label', container), variant: value('variant-label', container),
          empty: text(empty), emptyHidden: empty.hidden };
      };
      const parser = item('parser'), csv = item('csv');
      const inputRows = item('input-rows'), resultRows = item('result-rows');
      return {
        description: value('scenario-description'), family: value('family-label'), familyAttr: root.getAttribute('data-family'), inputLabel: value('input-label'),
        catalogLabel: value('catalog-label'), originLabel: value('origin-label'), originHidden: item('origin-label').hidden,
        resultLabel: value('result-label'), resultMessage: value('result-message'),
        relationCopy: value('relation-copy'), relationHidden: item('relation-copy').hidden,
        csv: { text: csv.textContent, hidden: csv.hidden, whiteSpace: getComputedStyle(csv).whiteSpace },
        inputRows: { present: inputRows.getAttribute('data-present'), hidden: inputRows.hidden,
          rows: Array.from(root.querySelectorAll('[data-quick-order-input-row]')).map(row => ({
            ...attrs(row,['position','quantity-units']), sku: sku(row), quantity: value('quantity', row),
            declared: row.querySelector('[data-quick-order-declared-identity]') ? identity(row,'declared-identity') : null })) },
        parser: { present: parser.getAttribute('data-present'), hidden: parser.hidden, outcome: parser.getAttribute('data-outcome'),
          headerPresent: parser.getAttribute('data-header-present'), decodedHidden: item('decoded').hidden, diagnosticsHidden: item('csv-diagnostics').hidden, label: value('parser-label'), message: value('parser-message'),
          decoded: Array.from(parser.querySelectorAll('[data-quick-order-decoded-row]')).map(row => ({
            position: row.getAttribute('data-position'), fields: Array.from(row.querySelectorAll('[data-quick-order-decoded-field]')).map(field => ({ kind: field.getAttribute('data-quick-order-decoded-field'), text: field.textContent })),
            hasIdentity: !!row.querySelector('[data-quick-order-identity],[data-quick-order-sku-comparison],[data-quick-order-row]'),
            forbiddenAttrs: Array.from([row,...row.querySelectorAll('*')]).some(element => ['data-quantity-units','data-outcome','data-match-count'].some(name=>element.hasAttribute(name))) })),
          diagnostics: Array.from(parser.querySelectorAll('[data-quick-order-csv-diagnostic]')).map(row => ({
            ...attrs(row,['category','code','offset','line','column','record','field']), label: value('csv-diagnostic-label',row), location: value('csv-location',row), locationHidden: item('csv-location',row).hidden })) },
        resultRows: { present: resultRows.getAttribute('data-present'), hidden: resultRows.hidden,
          rows: Array.from(root.querySelectorAll('[data-quick-order-row]')).map(row => {
            const common = { ...attrs(row,['kind','position','quantity-units']), sku: sku(row), quantity: value('quantity',row) };
            if (row.dataset.kind === 'resolution') return { ...common, ...attrs(row,['outcome','reason','match-count']),
              label: value('resolution-label',row), matchLabel: value('match-count',row), diagnosticsHidden: item('row-diagnostics',row).hidden, identity: identity(row), diagnostics: Array.from(row.querySelectorAll('[data-quick-order-row-diagnostic]')).map(diagnostic => ({
                code: diagnostic.getAttribute('data-code'), label: value('diagnostic-label',diagnostic), relatedLabel: value('related-label',diagnostic) })) };
            const ic = item('identity-comparison',row), sc = item('sku-comparison',row);
            const compared = item('compared-sku',ic), comparedEmpty = item('compared-sku-empty',ic);
            return { ...common, declared: identity(row,'declared-identity'),
              identityComparison: { ...attrs(ic,['outcome','sku-relation']), label: value('identity-comparison-label',ic),
                relationLabel: value('sku-relation-label',ic), relationHidden: item('sku-relation-label',ic).hidden,
                compared: { present: compared.getAttribute('data-present'), hidden: compared.hidden, sku: sku(compared),
                  empty: text(comparedEmpty), emptyHidden: comparedEmpty.hidden } },
              skuComparison: { ...attrs(sc,['outcome','reason','match-count','relation']), label: value('sku-comparison-label',sc), matchLabel: value('match-count',sc),
                relationLabel: value('relation-label',sc), relationHidden: item('relation-label',sc).hidden, identity: identity(sc) } };
          }) }
      };
    })()`);
    const state = () => evaluate(`({ scenarioId: document.querySelector(${JSON.stringify(SCENARIO)}).value })`);
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
        return !root.querySelector('form,input,textarea,time,[data-total],[data-price],[data-stock],[data-pay],[data-submit],[data-product-id],[data-variant-id]') &&
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
      const scenario = SCENARIOS.find(row => row.id === selection.scenarioId);
      assert.ok(scenario);
      const label = `${width} ${scenario.id}`;
      const actual = await view();
      const isHistory = scenario.family === 'history';
      const parser = scenario.expectedParser ?? null;
      const rows = scenario.expected;
      const input = scenario.lines ?? [];
      const checkSku = (got, wanted, context) => {
        check(`${label} ${context}: SKU literal sin trim ni sustitución`, got.literal === (wanted ?? '') && got.attr === wanted);
        check(`${label} ${context}: espacios preservados y nota independiente`, ['pre-wrap','break-spaces'].includes(got.whiteSpace)
          && got.note === (wanted === ' KIT-A ' ? LABELS.spaceNote : '') && got.noteHidden === (wanted !== ' KIT-A '));
      };
      const checkIdentity = (got, tuple, placeholder, context) => {
        const names = tuple === null ? null : METADATA[tuple.join(':')];
        assert.ok(tuple === null || names);
        check(`${label} ${context}: nombre unido por identidad explícita o ausencia limpia`, got.present === String(tuple !== null) && got.hidden === (tuple === null)
          && got.product === (names?.productLabel ?? '') && got.variant === (names?.variantLabel ?? '')
          && got.emptyHidden === (tuple !== null) && got.empty === placeholder);
      };
      check(`${label}: selección, familia y descripción exactas`, JSON.stringify(await state()) === JSON.stringify(selection)
        && actual.description === scenario.description && actual.family === LABELS.familyLabels[scenario.family] && actual.familyAttr === scenario.family);
      check(`${label}: cabeceras de entrada, catálogo y origen declarados`, actual.inputLabel === LABELS.inputLabels[scenario.family]
        && actual.catalogLabel === 'Catálogo comparado del ejemplo' && actual.originLabel === (isHistory ? 'Catálogo de origen del ejemplo' : '') && actual.originHidden === !isHistory);
      const resultKind = scenario.family === 'csv' ? parser.outcome === 'parsed' ? 'csvParsed' : 'csvInvalid' : scenario.family;
      check(`${label}: lectura no promete pedido ni sustituye identidad`, actual.resultLabel === LABELS.resultLabels[scenario.family]
        && actual.resultMessage === LABELS.resultMessages[resultKind] && actual.relationCopy === LABELS.relationCopy && actual.relationHidden === !isHistory);
      check(`${label}: texto CSV exacto o limpieza completa fuera de CSV`, actual.csv.text === (scenario.text ?? '')
        && actual.csv.hidden === (scenario.family !== 'csv') && ['pre-wrap','break-spaces'].includes(actual.csv.whiteSpace));
      check(`${label}: filas de entrada conservadas sin agregación`, actual.inputRows.rows.length === input.length
        && actual.inputRows.present === String(input.length > 0) && actual.inputRows.hidden === (input.length === 0));
      input.forEach((line,index) => {
        const got = actual.inputRows.rows[index];
        check(`${label} entrada ${index+1}: ordinal y unidades declaradas incluyendo cero`, got.position === String(index+1)
          && got['quantity-units'] === String(line.quantityUnits) && got.quantity === `${line.quantityUnits} ${line.quantityUnits === 1 ? 'unidad declarada' : 'unidades declaradas'}`);
        checkSku(got.sku,line.sku,`entrada ${index+1}`);
        if(isHistory) checkIdentity(got.declared,line.identity ? [line.identity.productId,line.identity.variantId] : null,LABELS.nullPlaceholders.historical,`entrada ${index+1} origen`);
        else check(`${label} entrada ${index+1}: no inventa identidad histórica`, got.declared === null);
      });
      check(`${label}: parser nulo o resultado explícito sin estado residual`, actual.parser.present === String(parser !== null) && actual.parser.hidden === (parser === null)
        && actual.parser.outcome === (parser?.outcome ?? null) && actual.parser.headerPresent === (parser === null ? null : String(parser.headerPresent))
        && actual.parser.label === (parser === null ? '' : LABELS.parser[parser.outcome].label)
        && actual.parser.message === (parser === null ? '' : LABELS.parser[parser.outcome].message));
      const decoded = parser?.outcome === 'invalid' ? parser.decodedRows : [];
      check(`${label}: filas decodificadas sólo texto inválido, sin intención parcial`, actual.parser.decoded.length === decoded.length && actual.parser.decodedHidden === (decoded.length === 0));
      decoded.forEach((fields,index) => {
        const got = actual.parser.decoded[index];
        check(`${label} decodificada ${index+1}: campos literales sin identidad ni cantidades numéricas`, got.position === String(index+1)
          && JSON.stringify(got.fields) === JSON.stringify(fields.map((text,i)=>({kind:i===0?'sku':'quantity',text}))) && !got.hasIdentity && !got.forbiddenAttrs);
      });
      const csvDiagnostics = parser?.diagnostics ?? [];
      check(`${label}: diagnósticos CSV completos o retirados`, actual.parser.diagnostics.length === csvDiagnostics.length && actual.parser.diagnosticsHidden === (csvDiagnostics.length === 0));
      csvDiagnostics.forEach((diagnostic,index) => {
        const got = actual.parser.diagnostics[index];
        check(`${label} diagnóstico CSV ${index+1}: ubicación literal y motivo humanos`, got.category === diagnostic.category && got.code === diagnostic.code
          && got.offset === String(diagnostic.at.offset) && got.line === String(diagnostic.at.line) && got.column === String(diagnostic.at.column)
          && got.record === String(diagnostic.recordNumber) && got.field === String(diagnostic.fieldNumber)
          && got.label === LABELS.csvDiagnosticLabels[diagnostic.code] && got.location === `Línea ${diagnostic.at.line}, columna ${diagnostic.at.column}` && !got.locationHidden);
      });
      check(`${label}: exactamente las filas de identidad esperadas`, actual.resultRows.rows.length === rows.length
        && actual.resultRows.present === String(rows.length>0) && actual.resultRows.hidden === (rows.length===0));
      rows.forEach((expected,index) => {
        const got = actual.resultRows.rows[index];
        const sku = scenario.family === 'csv' ? parser.decodedRows[index][0] : input[index].sku;
        const quantity = scenario.family === 'csv' ? expected.quantityUnits : input[index].quantityUnits;
        check(`${label} resultado ${index+1}: ordinal, familia y cero nunca se omiten`, got.kind === (isHistory?'history':'resolution') && got.position === String(index+1)
          && got['quantity-units'] === String(quantity) && got.quantity === `${quantity} ${quantity === 1 ? 'unidad declarada' : 'unidades declaradas'}`);
        checkSku(got.sku,sku,`resultado ${index+1}`);
        if(!isHistory) {
          check(`${label} resultado ${index+1}: resolución exacta sin candidatos ni compra`, got.outcome === expected.outcome && got.reason === (expected.reason??null)
            && got['match-count'] === String(expected.matchCount) && got.matchLabel === `Coincidencias en el catálogo: ${expected.matchCount}` && got.label === LABELS.resolution[expected.reason??expected.outcome]);
          checkIdentity(got.identity,expected.identity,LABELS.nullPlaceholders.identity,`resultado ${index+1}`);
          check(`${label} resultado ${index+1}: todos los diagnósticos por fila`, got.diagnostics.length === expected.diagnostics.length && got.diagnosticsHidden === (expected.diagnostics.length === 0));
          expected.diagnostics.forEach((diagnostic,d) => {
            const related = diagnostic.relatedPositions;
            check(`${label} resultado ${index+1}/${diagnostic.code}: ordinales relacionados sin agregar unidades`, got.diagnostics[d].code === diagnostic.code
              && got.diagnostics[d].label === LABELS.diagnostics[diagnostic.code]
              && got.diagnostics[d].relatedLabel === `${related.length===1?'Otra fila relacionada':'Otras filas relacionadas'}: ${related.join(', ')}`);
          });
        } else {
          const ic=expected.identityComparison,sc=expected.skuComparison;
          const historical = input[index].identity;
          checkIdentity(got.declared,historical?[historical.productId,historical.variantId]:null,LABELS.nullPlaceholders.historical,`resultado ${index+1} origen`);
          check(`${label} histórico ${index+1}: identidad declarada y relación SKU independientes`, got.identityComparison.outcome === ic.outcome
            && got.identityComparison['sku-relation'] === ic.skuRelation && got.identityComparison.label === LABELS.historicalIdentity[ic.outcome]
            && got.identityComparison.relationLabel === (ic.skuRelation===null?'':LABELS.historicalSkuRelation[ic.skuRelation]) && got.identityComparison.relationHidden === (ic.skuRelation===null));
          const compared = got.identityComparison.compared;
          checkSku(compared.sku,ic.comparedSku,`histórico ${index+1} SKU comparado`);
          check(`${label} histórico ${index+1}: SKU comparado ausente no se rellena por lookup`, compared.present === String(ic.comparedSku!==null)
            && compared.hidden === (ic.comparedSku===null) && compared.emptyHidden === (ic.comparedSku!==null) && compared.empty === LABELS.nullPlaceholders.comparedSku);
          check(`${label} histórico ${index+1}: comparación SKU no sustituye origen`, got.skuComparison.outcome === sc.outcome && got.skuComparison.reason === (sc.reason??null)
            && got.skuComparison['match-count'] === String(sc.matchCount) && got.skuComparison.matchLabel === `Coincidencias en el catálogo: ${sc.matchCount}` && got.skuComparison.relation === sc.relationToHistoricalIdentity
            && got.skuComparison.label === LABELS.resolution[sc.reason??sc.outcome]
            && got.skuComparison.relationLabel === (sc.relationToHistoricalIdentity===null?'':LABELS.skuToHistoricalRelation[sc.relationToHistoricalIdentity])
            && got.skuComparison.relationHidden === (sc.relationToHistoricalIdentity===null));
          checkIdentity(got.skuComparison.identity,sc.identity,LABELS.nullPlaceholders.identity,`histórico ${index+1} resultado SKU`);
        }
      });
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
    const setupWriteLog = await evaluate('window.__companyQuickOrderAudit.storageWrites');
    const setupStorageWrites = setupWriteLog.length;
    check(`${width}: tres escrituras iniciales pertenecen solo a la guía`, setupStorageWrites === 3 && setupWriteLog.every(write => write.storage === 'session' && write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    await evaluate('window.__companyQuickOrderAudit.storageWrites.length = 0');
    const setupStorageEvents = storageEvents.filter((event) => event.sessionId === sessionId).length;
    const setupAudit = await evaluate('window.__companyQuickOrderAudit');
    const sharedLocation = await sharedFrameLocation();
    await evaluate(`window.__companyQuickOrderAudit.sharedFrameLocation = ${JSON.stringify(sharedLocation)}`);
    check(`${width}: arranque solo con rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, setupAudit.timers.every(timer => sharedTimer(timer, sharedLocation)) && setupAudit.beacons === 0 && setupAudit.windows === 0);
    const initial = await state();
    const initialView = await view();
    check(`${width}: un selector cerrado persistente y diez ejemplos`, await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(ROOT)});
      return root.querySelectorAll('select').length === 1 && root.querySelectorAll('button').length === 1 &&
        JSON.stringify(Array.from(root.querySelector(${JSON.stringify(SCENARIO)}).options).map(option => [option.value, option.textContent.trim(), option.disabled])) === ${JSON.stringify(JSON.stringify(SCENARIOS.map(row => [row.id,row.label,false])))};
    })()`));
    check(`${width}: inicio literal sku-identified`, JSON.stringify(initial) === JSON.stringify(INITIAL));
    await verify();
    check(`${width}: mensaje inicial honesto`, await evaluate(`document.querySelector('[data-quick-order-feedback]').textContent.trim()`) === FEEDBACK.reset);
    await safety('initial');
    const setupRequests = requests.filter(request => request.sessionId === sessionId).length;
    moduleSessions.add(sessionId);
    await evaluate('window.__companyQuickOrderAudit.moduleActive = true');
    let guideInteractionEvidence = null;
    if (width === 375) {
      guideSessions.add(sessionId);
      await evaluate('window.__companyQuickOrderAudit.guideInteraction = true');
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
        for (const [selector, controlId] of [[SCENARIO, 'quick-order-scenario']]) {
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
      check(`${width} guía: abrir/cerrar/resize no altera entrada ni resultados`, JSON.stringify(await view()) === beforeGuide);
      await evaluate('window.__companyQuickOrderAudit.guideInteraction = false');
      await delay(75);
      guideSessions.delete(sessionId);
      const guideWrites = await evaluate(`window.__companyQuickOrderAudit.storageWrites.filter(write => write.phase === 'guide')`);
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

    await evaluate(`document.querySelector(${JSON.stringify(SCENARIO)}).focus()`);
    await key('ArrowDown', 'ArrowDown', 40);
    await verify({ scenarioId: 'sku-not-found' });
    check(`${width}: teclado conserva nodo y foco de Ejemplo`, await evaluate(`document.activeElement.matches(${JSON.stringify(SCENARIO)})`));
    check(`${width}: foco visible con contorno real`, await evaluate(`(() => {
      const field = document.activeElement, style = getComputedStyle(field);
      return field.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
    })()`));
    await key('Tab', 'Tab', 9);
    check(`${width}: Tab alcanza Restablecer ejemplo sin acciones intermedias`, await evaluate(`document.activeElement.matches(${JSON.stringify(action('reset'))})`));
    await key('Enter', 'Enter', 13);
    await verify();
    for (const scenarioId of ['list-repeated','csv-invalid-field','history-reused','history-ambiguous-and-undeclared']) {
      await evaluate(`document.querySelector(${JSON.stringify(SCENARIO)}).focus()`);
      await select(SCENARIO, scenarioId);
      await verify({ scenarioId });
      await safety(`captura/${scenarioId}`);
      await snapshot(scenarioId);
    }

    const counts = { visits:0, resultRows:0, resolutionRows:0, resolved:0, notFound:0, ambiguous:0, repeated:0, multipleVariants:0,
      historyRows:0, identityFound:0, identityNotFound:0, identityNotProvided:0, historyResolved:0, historyNotFound:0, historyAmbiguous:0,
      relationSame:0, relationDifferent:0, relationNotProvided:0, parsed:0, invalid:0, decodedInvalid:0, csvDiagnostics:0, zeroRows:0 };
    for (const scenario of SCENARIOS) {
      await select(SCENARIO, scenario.id);
      const actual = await verify({scenarioId:scenario.id});
      await safety(`matriz/${scenario.id}`);
      counts.visits++;
      for (const row of actual.resultRows.rows) {
        counts.resultRows++;
        if (row['quantity-units']==='0') counts.zeroRows++;
        if(row.kind==='resolution') {
          counts.resolutionRows++;
          counts[row.outcome==='resolved'?'resolved':row.reason==='sku_not_found'?'notFound':'ambiguous']++;
          for(const diagnostic of row.diagnostics) counts[diagnostic.code==='repeated_sku'?'repeated':'multipleVariants']++;
        } else {
          counts.historyRows++;
          counts[{found:'identityFound',not_found:'identityNotFound',not_provided:'identityNotProvided'}[row.identityComparison.outcome]]++;
          counts[row.skuComparison.outcome==='resolved'?'historyResolved':row.skuComparison.reason==='sku_not_found'?'historyNotFound':'historyAmbiguous']++;
          if(row.skuComparison.relation!==null) counts[{same:'relationSame',different:'relationDifferent',not_provided:'relationNotProvided'}[row.skuComparison.relation]]++;
        }
      }
      if(actual.parser.outcome!==null) counts[actual.parser.outcome]++;
      counts.decodedInvalid+=actual.parser.decoded.length;
      counts.csvDiagnostics+=actual.parser.diagnostics.length;
    }
    check(`${width}: diez visitas y conteos independientes exactos por fila`, JSON.stringify(counts) === JSON.stringify({
      visits:10,resultRows:14,resolutionRows:8,resolved:6,notFound:1,ambiguous:1,repeated:2,multipleVariants:5,
      historyRows:6,identityFound:4,identityNotFound:1,identityNotProvided:1,historyResolved:4,historyNotFound:1,historyAmbiguous:1,
      relationSame:1,relationDifferent:2,relationNotProvided:1,parsed:1,invalid:2,decodedInvalid:2,csvDiagnostics:2,zeroRows:2 }));
    matrixEvidence.push({width,...counts});

    // Las transiciones adicionales observan limpieza; no se suman a las diez visitas principales.
    for (const scenarioId of ['csv-valid','csv-invalid-field','csv-invalid-structure','history-reused','sku-not-found','history-ambiguous-and-undeclared','sku-ambiguous','list-repeated','csv-invalid-field','sku-identified']) {
      await select(SCENARIO,scenarioId);
      await verify({scenarioId});
      await safety(`limpieza/${scenarioId}`);
    }
    const beforeNoop=JSON.stringify(await view());
    await select(SCENARIO,'sku-identified');
    check(`${width}: mismo ejemplo conserva vista y feedback`, JSON.stringify(await view())===beforeNoop);
    await press('reset');
    await verify();
    check(`${width}: Enter restablece selección, parser y filas`, JSON.stringify(await state())===JSON.stringify(initial) && JSON.stringify(await view())===JSON.stringify(initialView));
    check(`${width}: reset conserva foco visible del botón`, await evaluate(`document.activeElement.matches(${JSON.stringify(action('reset'))}) && document.activeElement.matches(':focus-visible')`));
    await safety('reset');
    await select(SCENARIO,'history-reused');
    await verify({scenarioId:'history-reused'});
    const finalAudit = await evaluate('window.__companyQuickOrderAudit');
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
    await wait(`(${ready}) && window.__companyQuickOrderAudit?.documentEpoch !== ${JSON.stringify(previousDocumentEpoch)}`, 'recarga limpia en otro documento');
    const reloadedAudit = await evaluate('window.__companyQuickOrderAudit');
    const reloadedSharedLocation = await sharedFrameLocation();
    check(`${width}: recarga solo permite rAF del shell verificado, sin timers del módulo ni beacon/ventanas`, reloadedAudit.timers.every(timer => sharedTimer(timer, reloadedSharedLocation)) && reloadedAudit.beacons === 0 && reloadedAudit.windows === 0);
    check(`${width}: dos nuevas escrituras de arranque pertenecen solo a la guía`, reloadedAudit.storageWrites.length === 2 && reloadedAudit.storageWrites.every(write => write.storage === 'session' && write.method === 'setItem' && write.key === GUIDE_STORAGE_KEY));
    check(`${width}: recarga restaura ejemplo inicial`, JSON.stringify(await state()) === JSON.stringify(initial) && JSON.stringify(await view()) === JSON.stringify(initialView));
    check(`${width}: recarga conserva el almacenamiento anterior`, await storage() === initialStorage);
    storageEvidence.at(-1).reloadGuideWrites = reloadedAudit.storageWrites.length;
    storageEvidence.at(-1).sharedLayout.reloadCalls = reloadedAudit.timers.length;

    await call('Emulation.setScriptExecutionDisabled', { value: true });
    await call('Page.reload', { ignoreCache: true });
    await wait(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(ROOT)}) && document.querySelector(${JSON.stringify(ROOT)}).dataset.ready !== 'true' && window.__companyQuickOrderAudit?.documentEpoch !== ${JSON.stringify(reloadedAudit.documentEpoch)}`, 'vista sin JavaScript en otro documento');
    check(`${width}: sin JavaScript conserva entrada y resultados iniciales más aviso`, JSON.stringify(await view()) === JSON.stringify(initialView) && await evaluate(`Array.from(document.querySelectorAll('noscript')).some(node => /JavaScript/u.test(node.textContent))`));
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
    runner: 'node scripts/test-company-quick-order-demo.mjs', nodeVersion: process.version,
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

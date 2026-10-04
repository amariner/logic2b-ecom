import type { Platform } from './create-platform';
import {
  defineCompanyQuickOrderCatalog, defineCompanyQuickOrderList, previewCompanyQuickOrderList,
  defineCompanyQuickOrderHistory, previewCompanyQuickOrderHistory, parseCompanyQuickOrderCsv,
  type CompanyQuickOrderList, type CompanyQuickOrderHistory, type CompanyQuickOrderIdentity,
  type CompanyQuickOrderPreview, type CompanyQuickOrderHistoryPreview, type CompanyQuickOrderCsvResult,
  type CompanyQuickOrderCsvDiagnostic,
} from '../modules/companies';

export type CompanyQuickOrderDemoScenarioId = 'sku-identified' | 'sku-not-found' | 'sku-ambiguous'
  | 'list-repeated' | 'csv-valid' | 'csv-invalid-field' | 'csv-invalid-structure'
  | 'history-same-and-renamed' | 'history-reused' | 'history-ambiguous-and-undeclared';
export type CompanyQuickOrderDemoSelection = Readonly<{ scenarioId: CompanyQuickOrderDemoScenarioId }>;
export type CompanyQuickOrderDemoFeedback = Readonly<{
  tone: 'info'; code: 'initial' | 'selection_changed'; message: string;
}>;
export type CompanyQuickOrderDemoState = Readonly<{
  selection: CompanyQuickOrderDemoSelection; feedback: CompanyQuickOrderDemoFeedback;
}>;
export type CompanyQuickOrderDemoSku = Readonly<{ literal: string; spaceNote: string | null }>;
export type CompanyQuickOrderDemoIdentityLabel = Readonly<{ productLabel: string; variantLabel: string }>;
export type CompanyQuickOrderDemoInputRow = Readonly<{
  position: number; sku: CompanyQuickOrderDemoSku; quantityUnits: number; quantityLabel: string;
  historicalIdentity: CompanyQuickOrderDemoIdentityLabel | null;
}>;
export type CompanyQuickOrderDemoInput = Readonly<{
  kind: 'rows' | 'csv'; label: string; catalogLabel: string; originLabel: string | null;
  csvText: string | null; rows: readonly CompanyQuickOrderDemoInputRow[];
}>;
export type CompanyQuickOrderDemoCsvDiagnostic = Readonly<{
  category: CompanyQuickOrderCsvDiagnostic['category']; code: CompanyQuickOrderCsvDiagnostic['code']; label: string;
  at: Readonly<{ offset: number; line: number; column: number }> | null;
  recordNumber: number | null; fieldNumber: number | null; locationLabel: string | null;
}>;
export type CompanyQuickOrderDemoParser = Readonly<{
  outcome: 'parsed' | 'invalid'; label: string; message: string; headerPresent: boolean;
  decodedRows: readonly Readonly<{ position: number; fields: readonly string[] }>[];
  diagnostics: readonly CompanyQuickOrderDemoCsvDiagnostic[];
}>;
export type CompanyQuickOrderDemoRowDiagnostic = Readonly<{
  code: 'repeated_sku' | 'multiple_variants_for_product'; label: string;
  relatedPositions: readonly number[]; relatedLabel: string;
}>;
export type CompanyQuickOrderDemoResolutionRow = Readonly<{
  kind: 'resolution'; position: number; sku: CompanyQuickOrderDemoSku; quantityUnits: number; quantityLabel: string;
  outcome: 'resolved' | 'unresolved'; reason: 'sku_not_found' | 'sku_ambiguous' | null; matchCount: number;
  label: string; identity: CompanyQuickOrderDemoIdentityLabel | null; diagnostics: readonly CompanyQuickOrderDemoRowDiagnostic[];
}>;
export type CompanyQuickOrderDemoHistoricalIdentityComparison = Readonly<{
  outcome: 'found' | 'not_found' | 'not_provided'; label: string; comparedSku: CompanyQuickOrderDemoSku | null;
  skuRelation: 'same' | 'different' | null; skuRelationLabel: string | null;
}>;
export type CompanyQuickOrderDemoHistoricalSkuComparison = Readonly<{
  outcome: 'resolved' | 'unresolved'; reason: 'sku_not_found' | 'sku_ambiguous' | null; matchCount: number;
  label: string; identity: CompanyQuickOrderDemoIdentityLabel | null;
  relationToHistoricalIdentity: 'same' | 'different' | 'not_provided' | null; relationLabel: string | null;
}>;
export type CompanyQuickOrderDemoHistoryRow = Readonly<{
  kind: 'history'; position: number; sku: CompanyQuickOrderDemoSku; quantityUnits: number; quantityLabel: string;
  historicalIdentity: CompanyQuickOrderDemoIdentityLabel | null;
  identityComparison: CompanyQuickOrderDemoHistoricalIdentityComparison;
  skuComparison: CompanyQuickOrderDemoHistoricalSkuComparison;
}>;
/** Proyección de pantalla: ninguna referencia interna, catálogo bruto ni intención nueva. */
export type CompanyQuickOrderDemoView = Readonly<{
  selection: CompanyQuickOrderDemoSelection;
  scenarioOptions: readonly Readonly<{ id: CompanyQuickOrderDemoScenarioId; label: string }>[];
  scenarioDescription: string; family: 'sku' | 'list' | 'csv' | 'history'; familyLabel: string;
  input: CompanyQuickOrderDemoInput; parser: CompanyQuickOrderDemoParser | null;
  resultLabel: string; resultMessage: string;
  rows: readonly (CompanyQuickOrderDemoResolutionRow | CompanyQuickOrderDemoHistoryRow)[];
  feedback: CompanyQuickOrderDemoFeedback;
}>;

export class CompanyQuickOrderDemoContractError extends Error {
  readonly code = 'company_quick_order_demo_invalid';
  constructor() { super('Los datos no pertenecen al ejemplo de listas y repetición.'); this.name = 'CompanyQuickOrderDemoContractError'; }
}
function invalid(): never { throw new CompanyQuickOrderDemoContractError(); }
function boundary<T>(operation: () => T): T { try { return operation(); } catch { return invalid(); } }
function record(input: unknown, keys: readonly string[], partial = false): Readonly<Record<string, unknown>> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const actual = Reflect.ownKeys(input);
  if (!partial && actual.length !== keys.length) return invalid();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !keys.includes(key) || !descriptor?.enumerable || !('value' in descriptor)) return invalid();
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}
/** Solo se aplica a objetos internos, una vez capturada y validada cualquier entrada desconocida. */
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function ownValue(input: unknown, key: string): unknown {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  return descriptor?.enumerable && 'value' in descriptor ? descriptor.value : undefined;
}
export function canShowCompanyQuickOrderDemo(
  env: Readonly<{ DEMO_MODE?: string | undefined }> | undefined, platform: Pick<Platform, 'manifest'>,
): boolean {
  try {
    return ownValue(env, 'DEMO_MODE') === 'true' &&
      ownValue(ownValue(ownValue(platform, 'manifest'), 'deployment'), 'mode') === 'demo';
  } catch { return false; }
}

const ORIGIN_CATALOG = /* @__PURE__ */ defineCompanyQuickOrderCatalog({"schemaVersion":1,"source":"fixture","profile":"company-quick-order-identity-v1","ref":"demo.quick-order.origin","capturedAt":"2026-10-01T10:00:00.000Z","products":[{"id":1,"variants":[{"id":11,"productId":1,"sku":"KIT-A"},{"id":12,"productId":1,"sku":"KIT-B"},{"id":13,"productId":1,"sku":"OLD-C"},{"id":14,"productId":1,"sku":"OLD-D"}]},{"id":2,"variants":[{"id":21,"productId":2,"sku":"SHARED"}]},{"id":3,"variants":[{"id":31,"productId":3,"sku":"PACK,SMALL"},{"id":32,"productId":3,"sku":"LABEL\"BLUE"}]},{"id":4,"variants":[{"id":41,"productId":4,"sku":"SHARED"}]},{"id":5,"variants":[{"id":51,"productId":5,"sku":"UNDECLARED"}]}]});
const COMPARED_CATALOG = /* @__PURE__ */ defineCompanyQuickOrderCatalog({"schemaVersion":1,"source":"fixture","profile":"company-quick-order-identity-v1","ref":"demo.quick-order.compared","capturedAt":"2026-10-03T10:00:00.000Z","products":[{"id":1,"variants":[{"id":11,"productId":1,"sku":"KIT-A"},{"id":12,"productId":1,"sku":"KIT-B-NEW"},{"id":14,"productId":1,"sku":"NEW-D"}]},{"id":2,"variants":[{"id":21,"productId":2,"sku":"SHARED"}]},{"id":3,"variants":[{"id":31,"productId":3,"sku":"PACK,SMALL"},{"id":32,"productId":3,"sku":"LABEL\"BLUE"}]},{"id":4,"variants":[{"id":41,"productId":4,"sku":"SHARED"},{"id":42,"productId":4,"sku":"OLD-C"},{"id":43,"productId":4,"sku":"OLD-D"}]},{"id":5,"variants":[{"id":51,"productId":5,"sku":"UNDECLARED"}]}]});
const PRESENTATION = /* @__PURE__ */ freeze([{"productId":1,"productLabel":"Kit de muestra","variants":[{"variantId":11,"variantLabel":"Esencial"},{"variantId":12,"variantLabel":"Ampliado"},{"variantId":13,"variantLabel":"Serie C"},{"variantId":14,"variantLabel":"Serie D"}]},{"productId":2,"productLabel":"Muestra de cerámica","variants":[{"variantId":21,"variantLabel":"Natural"}]},{"productId":3,"productLabel":"Embalaje de muestra","variants":[{"variantId":31,"variantLabel":"Pequeño"},{"variantId":32,"variantLabel":"Etiqueta azul"}]},{"productId":4,"productLabel":"Muestra alternativa","variants":[{"variantId":41,"variantLabel":"Compartida"},{"variantId":42,"variantLabel":"Serie C alternativa"},{"variantId":43,"variantLabel":"Serie D alternativa"}]},{"productId":5,"productLabel":"Soporte de muestra","variants":[{"variantId":51,"variantLabel":"Único"}]}] as const);
const COPY = /* @__PURE__ */ freeze({
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
  "spaceNote": "Contiene un espacio al principio y otro al final."
} as const);
const FEEDBACK = /* @__PURE__ */ freeze({"initial":"Ejemplo local preparado. Los datos se conservan por fila.","selection_changed":"Ejemplo cambiado. El resultado corresponde a la entrada seleccionada."} as const);
type ScenarioBase = Readonly<{ id: CompanyQuickOrderDemoScenarioId; label: string; description: string }>;
type Scenario = ScenarioBase & (
  | Readonly<{ family: 'sku' | 'list'; list: CompanyQuickOrderList }>
  | Readonly<{ family: 'csv'; text: string }>
  | Readonly<{ family: 'history'; history: CompanyQuickOrderHistory }>
);
const SCENARIOS: readonly Scenario[] = /* @__PURE__ */ (() => {
  const definitions = [
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
    ]
  },
  {
    "id": "csv-valid",
    "family": "csv",
    "label": "CSV · Texto interpretable",
    "description": "Las comillas del CSV conservan una coma y una comilla dentro de los SKU. La cantidad cero se mantiene.",
    "text": "sku,quantity_units\n\"PACK,SMALL\",2\n\"LABEL\"\"BLUE\",0"
  },
  {
    "id": "csv-invalid-field",
    "family": "csv",
    "label": "CSV · Cantidad escrita no válida",
    "description": "Una cantidad contiene decimales. Se muestran las dos filas decodificadas, pero no se crea una lista ni se identifica la fila correcta por separado.",
    "text": "sku,quantity_units\nKIT-A,2.5\nKIT-B-NEW,2"
  },
  {
    "id": "csv-invalid-structure",
    "family": "csv",
    "label": "CSV · Comilla sin cerrar",
    "description": "El texto termina dentro de un campo entrecomillado. El registro anterior no se transforma en una lista parcial.",
    "text": "sku,quantity_units\nKIT-A,2\n\"KIT-B-NEW,3"
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
    ]
  }
] as const;
  return Object.freeze(definitions.map((definition): Scenario => {
    const base = { id: definition.id, label: definition.label, description: definition.description };
    if (definition.family === 'csv') return Object.freeze({ ...base, family: 'csv', text: definition.text });
    const lines = definition.lines.map((line, index) => ({ ...line, id: `row.${index + 1}` }));
    if (definition.family === 'history') return Object.freeze({ ...base, family: 'history',
      history: defineCompanyQuickOrderHistory({ schemaVersion: 1, source: 'fixture', profile: 'company-quick-order-history-v1',
        id: `demo.quick-order.history.${definition.id}`, version: 1,
        originCatalogRef: { ref: ORIGIN_CATALOG.ref, capturedAt: ORIGIN_CATALOG.capturedAt },
        originCatalog: ORIGIN_CATALOG, lines }),
    });
    return Object.freeze({ ...base, family: definition.family,
      list: defineCompanyQuickOrderList({ schemaVersion: 1, source: 'fixture', profile: 'company-quick-order-identity-v1',
        id: `demo.quick-order.list.${definition.id}`, version: 1, origin: 'structured',
        catalogRef: { ref: COMPARED_CATALOG.ref, capturedAt: COMPARED_CATALOG.capturedAt }, lines }),
    });
  }));
})();
const OPTIONS = /* @__PURE__ */ (() => Object.freeze(SCENARIOS.map(({ id, label }) => Object.freeze({ id, label }))))();

function scenarioId(input: unknown): CompanyQuickOrderDemoScenarioId {
  if (typeof input !== 'string' || !SCENARIOS.some(scenario => scenario.id === input)) return invalid();
  return input as CompanyQuickOrderDemoScenarioId;
}
function state(input: unknown): CompanyQuickOrderDemoState {
  const captured = record(input, ['selection', 'feedback']);
  const selection = record(captured.selection, ['scenarioId']);
  const id = scenarioId(selection.scenarioId);
  const feedback = record(captured.feedback, ['tone', 'code', 'message']);
  if (feedback.tone !== 'info' || (feedback.code !== 'initial' && feedback.code !== 'selection_changed') ||
    feedback.message !== FEEDBACK[feedback.code] || (feedback.code === 'initial' && id !== 'sku-identified')) return invalid();
  return freeze({ selection: { scenarioId: id }, feedback: { tone: 'info', code: feedback.code, message: FEEDBACK[feedback.code] } });
}
export function createCompanyQuickOrderDemo(): CompanyQuickOrderDemoState {
  return freeze({ selection: { scenarioId: 'sku-identified' }, feedback: { tone: 'info', code: 'initial', message: FEEDBACK.initial } });
}
export function configureCompanyQuickOrderDemo(input: unknown, patchInput: unknown): CompanyQuickOrderDemoState {
  return boundary(() => {
    const current = state(input); const patch = record(patchInput, ['scenarioId'], true);
    const id = Object.hasOwn(patch, 'scenarioId') ? scenarioId(patch.scenarioId) : current.selection.scenarioId;
    if (id === current.selection.scenarioId) return current;
    return freeze({ selection: { scenarioId: id }, feedback: { tone: 'info', code: 'selection_changed', message: FEEDBACK.selection_changed } });
  });
}
function sku(literal: string): CompanyQuickOrderDemoSku {
  return Object.freeze({ literal, spaceNote: literal === ' KIT-A ' ? COPY.spaceNote : null });
}
function quantityLabel(quantityUnits: number): string {
  return `${quantityUnits} ${quantityUnits === 1 ? 'unidad declarada' : 'unidades declaradas'}`;
}
function identityLabel(identity: CompanyQuickOrderIdentity): CompanyQuickOrderDemoIdentityLabel {
  const product = PRESENTATION.find(candidate => candidate.productId === identity.productId);
  const variant = product?.variants.find(candidate => candidate.variantId === identity.variantId);
  if (!product || !variant) return invalid();
  return Object.freeze({ productLabel: product.productLabel, variantLabel: variant.variantLabel });
}
function resolutionLabel(reason: 'sku_not_found' | 'sku_ambiguous' | null): string {
  return COPY.resolution[reason ?? 'resolved'];
}
function resolutionRows(preview: CompanyQuickOrderPreview): readonly CompanyQuickOrderDemoResolutionRow[] {
  const positions = new Map(preview.list.lines.map((line, index) => [line.id, index + 1]));
  return preview.lines.map(row => ({ kind: 'resolution', position: row.position, sku: sku(row.line.sku),
    quantityUnits: row.line.quantityUnits, quantityLabel: quantityLabel(row.line.quantityUnits),
    outcome: row.outcome, reason: row.reason, matchCount: row.matchCount, label: resolutionLabel(row.reason),
    identity: row.identity === null ? null : identityLabel(row.identity),
    diagnostics: row.diagnostics.map(diagnostic => {
      const relatedPositions = diagnostic.relatedLineIds.map(id => positions.get(id) ?? invalid());
      return { code: diagnostic.code, label: COPY.diagnostics[diagnostic.code], relatedPositions,
        relatedLabel: `${relatedPositions.length === 1 ? 'Otra fila relacionada' : 'Otras filas relacionadas'}: ${relatedPositions.join(', ')}` };
    }),
  }));
}
function historyRows(preview: CompanyQuickOrderHistoryPreview): readonly CompanyQuickOrderDemoHistoryRow[] {
  return preview.lines.map(row => {
    const identity = row.identityComparison; const text = row.skuComparison;
    return { kind: 'history', position: row.position, sku: sku(row.line.sku),
      quantityUnits: row.line.quantityUnits, quantityLabel: quantityLabel(row.line.quantityUnits),
      historicalIdentity: row.line.identity === null ? null : identityLabel(row.line.identity),
      identityComparison: { outcome: identity.outcome, label: COPY.historicalIdentity[identity.outcome],
        comparedSku: identity.comparedSku === null ? null : sku(identity.comparedSku), skuRelation: identity.skuRelation,
        skuRelationLabel: identity.skuRelation === null ? null : COPY.historicalSkuRelation[identity.skuRelation] },
      skuComparison: { outcome: text.outcome, reason: text.reason, matchCount: text.matchCount,
        label: resolutionLabel(text.reason), identity: text.identity === null ? null : identityLabel(text.identity),
        relationToHistoricalIdentity: text.relationToHistoricalIdentity,
        relationLabel: text.relationToHistoricalIdentity === null ? null : COPY.skuToHistoricalRelation[text.relationToHistoricalIdentity] },
    };
  });
}
function parserView(result: CompanyQuickOrderCsvResult): CompanyQuickOrderDemoParser {
  return { outcome: result.outcome, ...COPY.parser[result.outcome], headerPresent: result.header !== null,
    decodedRows: result.rows.map(row => ({ position: row.position, fields: row.record.fields.map(field => field.value) })),
    diagnostics: result.diagnostics.map(diagnostic => {
      if (diagnostic.code !== 'invalid_quantity' && diagnostic.code !== 'unclosed_quote') return invalid();
      return { category: diagnostic.category, code: diagnostic.code, label: COPY.csvDiagnosticLabels[diagnostic.code],
        at: diagnostic.at === null ? null : { ...diagnostic.at }, recordNumber: diagnostic.recordNumber,
        fieldNumber: diagnostic.fieldNumber,
        locationLabel: diagnostic.at === null ? null : `Línea ${diagnostic.at.line}, columna ${diagnostic.at.column}` };
    }),
  };
}
function inputRows(lines: readonly Readonly<{ sku: string; quantityUnits: number; identity?: CompanyQuickOrderIdentity | null }>[]): readonly CompanyQuickOrderDemoInputRow[] {
  return lines.map((line, index) => ({ position: index + 1, sku: sku(line.sku), quantityUnits: line.quantityUnits,
    quantityLabel: quantityLabel(line.quantityUnits), historicalIdentity: line.identity == null ? null : identityLabel(line.identity) }));
}
export function getCompanyQuickOrderDemoView(input: unknown): CompanyQuickOrderDemoView {
  return boundary(() => {
    const current = state(input);
    const scenario = SCENARIOS.find(candidate => candidate.id === current.selection.scenarioId) ?? invalid();
    const base = { selection: current.selection, scenarioOptions: OPTIONS, scenarioDescription: scenario.description,
      family: scenario.family, familyLabel: COPY.familyLabels[scenario.family], resultLabel: COPY.resultLabels[scenario.family],
      feedback: current.feedback };
    const inputBase = { label: COPY.inputLabels[scenario.family], catalogLabel: 'Catálogo comparado del ejemplo' };
    if (scenario.family === 'csv') {
      const parsed = parseCompanyQuickOrderCsv({ schemaVersion: 1, source: 'fixture', profile: 'company-quick-order-csv-v1',
        id: `demo.quick-order.csv.${scenario.id}`, version: 1,
        catalogRef: { ref: COMPARED_CATALOG.ref, capturedAt: COMPARED_CATALOG.capturedAt }, text: scenario.text });
      // Una entrada inválida jamás resuelve ni transforma un prefijo en intención.
      const rows = parsed.outcome === 'parsed'
        ? resolutionRows(previewCompanyQuickOrderList({ catalog: COMPARED_CATALOG, list: parsed.list })) : [];
      return freeze({ ...base, input: { ...inputBase, kind: 'csv', originLabel: null, csvText: scenario.text, rows: [] },
        parser: parserView(parsed), resultMessage: COPY.resultMessages[parsed.outcome === 'parsed' ? 'csvParsed' : 'csvInvalid'], rows });
    }
    if (scenario.family === 'history') {
      const preview = previewCompanyQuickOrderHistory({ history: scenario.history, comparedCatalog: COMPARED_CATALOG,
        identityRelation: 'same_declared_space' });
      return freeze({ ...base,
        input: { ...inputBase, kind: 'rows', originLabel: 'Catálogo de origen del ejemplo', csvText: null, rows: inputRows(preview.history.lines) },
        parser: null, resultMessage: COPY.resultMessages.history, rows: historyRows(preview) });
    }
    const preview = previewCompanyQuickOrderList({ catalog: COMPARED_CATALOG, list: scenario.list });
    return freeze({ ...base,
      input: { ...inputBase, kind: 'rows', originLabel: null, csvText: null, rows: inputRows(preview.list.lines) },
      parser: null, resultMessage: COPY.resultMessages[scenario.family], rows: resolutionRows(preview) });
  });
}

import type { Platform } from './create-platform';
import {
  defineCompanyPurchaseOrderDeclaration, previewCompanyPurchaseOrderDeclaration,
  defineCompanyDocumentRequest, defineCompanyDocumentResponse,
  createFixtureCompanyDocumentAdapter, evaluateCompanyDocumentEvidence,
  type CompanyDocumentRequest, type CompanyDocumentResponse, type CompanyDocumentEvidence,
  type CompanyDocumentEvaluation, type CompanyDocumentFieldComparison, type CompanyDocumentAmountComparison,
} from '../modules/companies';

export type CompanyDocumentDemoSelection = Readonly<{
  scenarioId: 'same' | 'lower' | 'higher' | 'zero' | 'no-po' | 'no-support' | 'company-missing'
    | 'company-different' | 'po-missing' | 'po-different' | 'amount-missing' | 'response-missing'
    | 'not-configured' | 'unavailable' | 'unsupported' | 'future' | 'incomplete' | 'document-missing';
  evaluationId: 'first' | 'boundary' | 'after';
}>;
export type CompanyDocumentDemoFeedback = Readonly<{
  tone: 'info'; code: 'initial' | 'selection_changed'; message: string;
}>;
export type CompanyDocumentDemoState = Readonly<{
  selection: CompanyDocumentDemoSelection; feedback: CompanyDocumentDemoFeedback;
}>;
export type CompanyDocumentDemoMoney = Readonly<{ currency: 'EUR'; amountCents: number; formatted: string }>;
export type CompanyDocumentDemoField = Readonly<{
  outcome: CompanyDocumentFieldComparison['outcome']; reason: CompanyDocumentFieldComparison['reason'];
  label: string; reasonLabel: string | null; expectedValue: string | null; observedValue: string | null;
}>;
export type CompanyDocumentDemoAmount = Readonly<{
  outcome: CompanyDocumentAmountComparison['outcome']; reason: CompanyDocumentAmountComparison['reason'];
  label: string; reasonLabel: string | null; expected: CompanyDocumentDemoMoney;
  observed: CompanyDocumentDemoMoney | null; delta: CompanyDocumentDemoMoney | null;
  position: CompanyDocumentAmountComparison['position']; asOf: string | null; asOfLabel: string | null;
}>;
/** Proyección privada de pantalla: no contiene consultas, vínculos, tokens ni importes ajenos. */
export type CompanyDocumentDemoView = Readonly<{
  selection: CompanyDocumentDemoSelection;
  scenarioOptions: readonly Readonly<{ id: CompanyDocumentDemoSelection['scenarioId']; label: string }>[];
  evaluationOptions: readonly Readonly<{ id: CompanyDocumentDemoSelection['evaluationId']; label: string }>[];
  scenarioDescription: string;
  reference: Readonly<{
    buyerCompanyLabel: string; offerLabel: string; purchaseOrderNumber: string | null; purchaseOrderLabel: string;
    supportStatus: 'declared' | 'not_provided'; supportLabel: string; declaredAmount: CompanyDocumentDemoMoney;
  }>;
  evaluatedAt: string; evaluatedAtLabel: string;
  evidence: Readonly<{
    outcome: CompanyDocumentEvaluation['outcome']; reason: CompanyDocumentEvaluation['reason']; label: string; message: string;
    metadata: Readonly<{ coverage: 'complete' | 'incomplete'; coverageLabel: string; observedAt: string; observedAtLabel: string }> | null;
    document: Readonly<{ label: string; asOf: string; asOfLabel: string }> | null;
  }>;
  comparisons: Readonly<{ company: CompanyDocumentDemoField; purchaseOrder: CompanyDocumentDemoField; amount: CompanyDocumentDemoAmount }> | null;
  feedback: CompanyDocumentDemoFeedback;
}>;

export class CompanyDocumentDemoContractError extends Error {
  readonly code = 'company_document_demo_invalid';
  constructor() { super('Los datos no pertenecen al ejemplo documental.'); this.name = 'CompanyDocumentDemoContractError'; }
}
function invalid(): never { throw new CompanyDocumentDemoContractError(); }
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
function ownValue(input: unknown, key: string): unknown {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  return descriptor?.enumerable && 'value' in descriptor ? descriptor.value : undefined;
}
/** Gate de lectura local. Nunca activa documentos, proveedores ni superficies operativas. */
export function canShowCompanyDocumentDemo(
  env: Readonly<{ DEMO_MODE?: string | undefined }> | undefined, platform: Pick<Platform, 'manifest'>,
): boolean {
  try {
    return ownValue(env, 'DEMO_MODE') === 'true' &&
      ownValue(ownValue(ownValue(platform, 'manifest'), 'deployment'), 'mode') === 'demo';
  } catch { return false; }
}

const BASE_DECLARATION = /* @__PURE__ */ defineCompanyPurchaseOrderDeclaration({
  "schemaVersion": 1,
  "source": "fixture",
  "profile": "company-po-reference-v1",
  "id": "demo.company-document.po.base",
  "version": 1,
  "recordedAt": "2026-10-03T14:00:00.000Z",
  "binding": {
    "negotiation": {
      "schemaVersion": 1,
      "source": "fixture",
      "profile": "company-offer-eur-cents-v1",
      "id": "demo.offer-demo.negotiation",
      "version": 4,
      "createdAt": "2026-10-03T11:30:00.000Z",
      "context": {
        "directory": {
          "schemaVersion": 1,
          "source": "fixture",
          "id": "demo.offer-demo.directory",
          "version": 1,
          "capturedAt": "2026-10-03T10:00:00.000Z",
          "companies": [
            {
              "id": "company.offer-demo",
              "displayName": "Empresa de ejemplo",
              "state": "active",
              "vatId": null
            }
          ],
          "sites": [],
          "contacts": [
            {
              "id": "contact.offer-demo.buyer",
              "companyId": "company.offer-demo",
              "displayName": "Comprador de ejemplo",
              "state": "active",
              "identityRef": null
            }
          ],
          "roles": [],
          "assignments": []
        },
        "catalog": {
          "schemaVersion": 1,
          "source": "fixture",
          "ref": "demo.offer-demo.catalog",
          "capturedAt": "2026-10-03T10:00:00.000Z",
          "currency": "EUR",
          "products": [
            {
              "id": 1,
              "active": true,
              "variants": [
                {
                  "id": 11,
                  "productId": 1,
                  "status": "active",
                  "priceCents": 1000
                },
                {
                  "id": 12,
                  "productId": 1,
                  "status": "active",
                  "priceCents": 1500
                }
              ]
            },
            {
              "id": 2,
              "active": true,
              "variants": [
                {
                  "id": 21,
                  "productId": 2,
                  "status": "active",
                  "priceCents": 2000
                }
              ]
            }
          ]
        },
        "request": {
          "schemaVersion": 1,
          "source": "fixture",
          "profile": "company-offer-eur-cents-v1",
          "id": "demo.offer-demo.request",
          "version": 1,
          "directoryRef": {
            "id": "demo.offer-demo.directory",
            "version": 1,
            "capturedAt": "2026-10-03T10:00:00.000Z"
          },
          "catalogRef": {
            "ref": "demo.offer-demo.catalog",
            "capturedAt": "2026-10-03T10:00:00.000Z"
          },
          "companyId": "company.offer-demo",
          "buyerContactId": "contact.offer-demo.buyer",
          "requestedAt": "2026-10-03T11:00:00.000Z",
          "currency": "EUR",
          "lines": [
            {
              "productId": 1,
              "variantId": 11,
              "quantityUnits": 4
            },
            {
              "productId": 2,
              "variantId": 21,
              "quantityUnits": 2
            }
          ]
        }
      },
      "revisions": [
        {
          "id": "offer.one",
          "revision": 1,
          "previousRevisionId": null,
          "proposedBy": "seller",
          "createdAt": "2026-10-03T12:00:00.000Z",
          "expiresAt": "2026-10-10T12:00:00.000Z",
          "lines": [
            {
              "productId": 1,
              "variantId": 11,
              "quantityUnits": 4,
              "unitPriceCents": 900
            },
            {
              "productId": 2,
              "variantId": 21,
              "quantityUnits": 2,
              "unitPriceCents": 1800
            }
          ],
          "shippingCents": 500
        },
        {
          "id": "offer.two",
          "revision": 2,
          "previousRevisionId": "offer.one",
          "proposedBy": "buyer",
          "createdAt": "2026-10-03T13:00:00.000Z",
          "expiresAt": "2026-10-11T12:00:00.000Z",
          "lines": [
            {
              "productId": 1,
              "variantId": 12,
              "quantityUnits": 3,
              "unitPriceCents": 1400
            }
          ],
          "shippingCents": 0
        },
        {
          "id": "offer.three",
          "revision": 3,
          "previousRevisionId": "offer.two",
          "proposedBy": "seller",
          "createdAt": "2026-10-03T14:00:00.000Z",
          "expiresAt": "2026-10-11T12:00:00.000Z",
          "lines": [
            {
              "productId": 1,
              "variantId": 12,
              "quantityUnits": 3,
              "unitPriceCents": 1350
            },
            {
              "productId": 2,
              "variantId": 21,
              "quantityUnits": 1,
              "unitPriceCents": 1750
            }
          ],
          "shippingCents": 200
        }
      ]
    },
    "revisionId": "offer.one"
  },
  "purchaseOrder": {
    "issuerCompanyId": "company.offer-demo",
    "number": "PO 2026/0042-Á",
    "documentReference": "demo.company-document.po-support"
  }
});
const ADAPTER_ID = 'demo.company-document.adapter';
type Scenario = Readonly<{
  id: CompanyDocumentDemoSelection['scenarioId']; label: string; description: string;
  request: CompanyDocumentRequest; response: CompanyDocumentResponse | null; withoutResponse: boolean;
}>;
type FixtureAnswer = Readonly<{ kind: 'missing' | 'not_configured' | 'unavailable' | 'unsupported' }>
  | Readonly<{ kind: 'evidence'; evidence: CompanyDocumentEvidence }>;
function scenario(
  id: CompanyDocumentDemoSelection['scenarioId'], label: string, description: string,
  po: 'provided' | 'missing' | 'no_support', answer: FixtureAnswer,
): Scenario {
  const originalPo = BASE_DECLARATION.purchaseOrder;
  if (originalPo === null) return invalid();
  const declaration = defineCompanyPurchaseOrderDeclaration({ ...BASE_DECLARATION,
    id: `demo.company-document.po.${id}`,
    purchaseOrder: po === 'missing' ? null : { ...originalPo, documentReference: po === 'no_support' ? null : originalPo.documentReference },
  });
  const request = defineCompanyDocumentRequest({ schemaVersion: 1, source: 'fixture',
    profile: 'company-commercial-document-evidence-v1', id: `demo.company-document.query.${id}`, declaration });
  let response: CompanyDocumentResponse | null = null;
  if (answer.kind === 'evidence') response = defineCompanyDocumentResponse({ source: 'fixture', adapterId: ADAPTER_ID,
    request, outcome: 'evidence', evidence: answer.evidence });
  else if (answer.kind === 'unavailable' || answer.kind === 'unsupported') {
    response = defineCompanyDocumentResponse({ source: 'fixture', adapterId: ADAPTER_ID, request, outcome: 'unavailable', reason: answer.kind });
  }
  return Object.freeze({ id, label, description, request, response, withoutResponse: answer.kind === 'missing' });
}
// Son datos de entrada del fixture; los resultados y diferencias los produce exclusivamente el contrato.
const SCENARIOS = /* @__PURE__ */ Object.freeze([
  scenario("same", "Datos coincidentes", "La empresa compradora, la referencia de compra y el importe declarado coinciden en este corte. La coincidencia no valida una factura ni acredita un pago.", "provided",
    {"kind": "evidence", "evidence": {"ref": "demo.company-document.evidence.same", "observedAt": "2026-10-03T14:00:00.000Z", "coverage": "complete", "document": {"reference": "demo.company-document.document.same", "companyId": "company.offer-demo", "purchaseOrderNumber": "PO 2026/0042-Á", "commercialAmount": {"basis": "bound_offer_total_as_declared", "currency": "EUR", "amountCents": 7700}}}}),
  scenario("lower", "Importe menor", "La evidencia declara un importe comercial menor que la oferta. La diferencia se expresa como evidencia menos oferta.", "provided",
    {"kind": "evidence", "evidence": {"ref": "demo.company-document.evidence.lower", "observedAt": "2026-10-03T14:00:00.000Z", "coverage": "complete", "document": {"reference": "demo.company-document.document.lower", "companyId": "company.offer-demo", "purchaseOrderNumber": "PO 2026/0042-Á", "commercialAmount": {"basis": "bound_offer_total_as_declared", "currency": "EUR", "amountCents": 7200}}}}),
  scenario("higher", "Importe mayor", "La evidencia declara un importe comercial mayor que la oferta. La diferencia positiva no es un recargo ni una deuda.", "provided",
    {"kind": "evidence", "evidence": {"ref": "demo.company-document.evidence.higher", "observedAt": "2026-10-03T14:00:00.000Z", "coverage": "complete", "document": {"reference": "demo.company-document.document.higher", "companyId": "company.offer-demo", "purchaseOrderNumber": "PO 2026/0042-Á", "commercialAmount": {"basis": "bound_offer_total_as_declared", "currency": "EUR", "amountCents": 8200}}}}),
  scenario("zero", "Cero declarado", "La evidencia completa declara cero como importe comercial. Cero es un dato conocido y no significa ausencia de evidencia.", "provided",
    {"kind": "evidence", "evidence": {"ref": "demo.company-document.evidence.zero", "observedAt": "2026-10-03T14:00:00.000Z", "coverage": "complete", "document": {"reference": "demo.company-document.document.zero", "companyId": "company.offer-demo", "purchaseOrderNumber": "PO 2026/0042-Á", "commercialAmount": {"basis": "bound_offer_total_as_declared", "currency": "EUR", "amountCents": 0}}}}),
  scenario("no-po", "Sin referencia de compra", "No se ha aportado un número PO para la oferta. El documento observado se conserva, pero su importe no se atribuye a esta referencia de compra.", "missing",
    {"kind": "evidence", "evidence": {"ref": "demo.company-document.evidence.no-po", "observedAt": "2026-10-03T14:00:00.000Z", "coverage": "complete", "document": {"reference": "demo.company-document.document.no-po", "companyId": "company.offer-demo", "purchaseOrderNumber": "PO 2026/0042-Á", "commercialAmount": {"basis": "bound_offer_total_as_declared", "currency": "EUR", "amountCents": 8888}}}}),
  scenario("no-support", "Sin soporte PO", "El número PO está aportado sin soporte documental declarado. Esa ausencia no impide comparar los campos de la evidencia.", "no_support",
    {"kind": "evidence", "evidence": {"ref": "demo.company-document.evidence.no-support", "observedAt": "2026-10-03T14:00:00.000Z", "coverage": "complete", "document": {"reference": "demo.company-document.document.no-support", "companyId": "company.offer-demo", "purchaseOrderNumber": "PO 2026/0042-Á", "commercialAmount": {"basis": "bound_offer_total_as_declared", "currency": "EUR", "amountCents": 7700}}}}),
  scenario("company-missing", "Comprador no aportado", "El documento no declara su empresa compradora. La referencia observada se conserva y el importe no se atribuye a la oferta.", "provided",
    {"kind": "evidence", "evidence": {"ref": "demo.company-document.evidence.company-missing", "observedAt": "2026-10-03T14:00:00.000Z", "coverage": "complete", "document": {"reference": "demo.company-document.document.company-missing", "companyId": null, "purchaseOrderNumber": "PO 2026/0042-Á", "commercialAmount": {"basis": "bound_offer_total_as_declared", "currency": "EUR", "amountCents": 8888}}}}),
  scenario("company-different", "Otro comprador", "El documento declara otra empresa compradora. Se muestra esa discrepancia y se oculta su importe para esta comparación.", "provided",
    {"kind": "evidence", "evidence": {"ref": "demo.company-document.evidence.company-different", "observedAt": "2026-10-03T14:00:00.000Z", "coverage": "complete", "document": {"reference": "demo.company-document.document.company-different", "companyId": "company.document-other", "purchaseOrderNumber": "PO 2026/0042-Á", "commercialAmount": {"basis": "bound_offer_total_as_declared", "currency": "EUR", "amountCents": 8888}}}}),
  scenario("po-missing", "PO observada no aportada", "El documento no aporta un número PO. La empresa observada se conserva y el importe no se atribuye a la oferta.", "provided",
    {"kind": "evidence", "evidence": {"ref": "demo.company-document.evidence.po-missing", "observedAt": "2026-10-03T14:00:00.000Z", "coverage": "complete", "document": {"reference": "demo.company-document.document.po-missing", "companyId": "company.offer-demo", "purchaseOrderNumber": null, "commercialAmount": {"basis": "bound_offer_total_as_declared", "currency": "EUR", "amountCents": 8888}}}}),
  scenario("po-different", "Otra PO observada", "El número PO observado cambia una mayúscula por una minúscula. Los textos se comparan literalmente, sin corregirlos.", "provided",
    {"kind": "evidence", "evidence": {"ref": "demo.company-document.evidence.po-different", "observedAt": "2026-10-03T14:00:00.000Z", "coverage": "complete", "document": {"reference": "demo.company-document.document.po-different", "companyId": "company.offer-demo", "purchaseOrderNumber": "PO 2026/0042-á", "commercialAmount": {"basis": "bound_offer_total_as_declared", "currency": "EUR", "amountCents": 8888}}}}),
  scenario("amount-missing", "Importe no aportado", "Los campos de empresa y PO coinciden, pero no se ha declarado una magnitud comercial comparable. No se utiliza un total fiscal como sustituto.", "provided",
    {"kind": "evidence", "evidence": {"ref": "demo.company-document.evidence.amount-missing", "observedAt": "2026-10-03T14:00:00.000Z", "coverage": "complete", "document": {"reference": "demo.company-document.document.amount-missing", "companyId": "company.offer-demo", "purchaseOrderNumber": "PO 2026/0042-Á", "commercialAmount": null}}}),
  scenario("response-missing", "Sin respuesta", "No se ha aportado ninguna respuesta para esta consulta. No se inventan documento, fecha de observación ni importes.", "provided",
    {"kind": "missing"}),
  scenario("not-configured", "Sin caso configurado", "La consulta es válida, pero no hay una respuesta preparada para ella en este ejemplo.", "provided",
    {"kind": "not_configured"}),
  scenario("unavailable", "Evidencia no disponible", "La respuesta del ejemplo declara que la evidencia no está disponible. No hay fecha ni documento observados.", "provided",
    {"kind": "unavailable"}),
  scenario("unsupported", "Consulta no admitida", "La respuesta del ejemplo declara que esta consulta no está admitida. Esto no afirma que no exista un documento externo.", "provided",
    {"kind": "unsupported"}),
  scenario("future", "Corte posterior", "El corte se observó a las 14:15 UTC. Solo puede mostrarse al evaluar ese instante o uno posterior; cambiar la evaluación no cambia la evidencia.", "provided",
    {"kind": "evidence", "evidence": {"ref": "demo.company-document.evidence.future", "observedAt": "2026-10-03T14:15:00.000Z", "coverage": "complete", "document": {"reference": "demo.company-document.document.future", "companyId": "company.offer-demo", "purchaseOrderNumber": "PO 2026/0042-Á", "commercialAmount": {"basis": "bound_offer_total_as_declared", "currency": "EUR", "amountCents": 8200}}}}),
  scenario("incomplete", "Evidencia incompleta", "El corte declarado es incompleto. Se conserva su fecha como metadato y no se presentan datos documentales parciales.", "provided",
    {"kind": "evidence", "evidence": {"ref": "demo.company-document.evidence.incomplete", "observedAt": "2026-10-03T14:00:00.000Z", "coverage": "incomplete", "document": null}}),
  scenario("document-missing", "Sin documento en el corte", "El corte declara cobertura completa, pero no aporta un documento. Esto no demuestra que no exista un documento externo.", "provided",
    {"kind": "evidence", "evidence": {"ref": "demo.company-document.evidence.document-missing", "observedAt": "2026-10-03T14:00:00.000Z", "coverage": "complete", "document": null}}),
]);
const ADAPTER = /* @__PURE__ */ createFixtureCompanyDocumentAdapter({ adapterId: ADAPTER_ID,
  cases: SCENARIOS.flatMap(item => item.response === null ? [] : [item.response]),
});
const SCENARIO_OPTIONS = /* @__PURE__ */ Object.freeze(SCENARIOS.map(item => Object.freeze({ id: item.id, label: item.label })));
const EVALUATIONS = /* @__PURE__ */ Object.freeze([
  Object.freeze({ id: "first" as const, at: "2026-10-03T14:00:00.000Z", label: "3 oct 2026 · 14:00 UTC" }),
  Object.freeze({ id: "boundary" as const, at: "2026-10-03T14:15:00.000Z", label: "3 oct 2026 · 14:15 UTC" }),
  Object.freeze({ id: "after" as const, at: "2026-10-03T14:30:00.000Z", label: "3 oct 2026 · 14:30 UTC" }),
]);
const EVALUATION_OPTIONS = /* @__PURE__ */ Object.freeze(EVALUATIONS.map(item => Object.freeze({ id: item.id, label: item.label })));
const FIELD_LABELS = /* @__PURE__ */ Object.freeze({
  "matches": "Coincide en este campo",
  "differs": "Difiere en este campo",
  "unknown": "No se puede comparar"
});
const FIELD_REASON_LABELS = /* @__PURE__ */ Object.freeze({
  "expected_not_provided": "El dato esperado no se ha aportado.",
  "observed_not_provided": "El dato observado no se ha aportado."
});
const AMOUNT_LABELS = /* @__PURE__ */ Object.freeze({
  "below_declared": "El importe declarado en la evidencia es menor.",
  "equal_declared": "Los importes declarados son iguales.",
  "above_declared": "El importe declarado en la evidencia es mayor."
});
const AMOUNT_REASON_LABELS = /* @__PURE__ */ Object.freeze({
  "company_not_provided": "Falta la empresa compradora declarada en el documento.",
  "company_mismatch": "El documento declara otra empresa compradora.",
  "expected_po_not_provided": "No se ha aportado una referencia de compra para la oferta.",
  "observed_po_not_provided": "El documento no aporta una referencia de compra.",
  "po_mismatch": "El número PO observado difiere del aportado.",
  "commercial_amount_not_provided": "No se ha declarado un importe de la misma magnitud comercial."
});
const COVERAGE_LABELS = /* @__PURE__ */ Object.freeze({
  "complete": "Cobertura declarada completa",
  "incomplete": "Cobertura declarada incompleta"
});
const SUPPORT_LABELS = /* @__PURE__ */ Object.freeze({
  "declared": "Soporte PO declarado",
  "not_provided": "Sin soporte PO declarado"
});
const PO_LABELS = /* @__PURE__ */ Object.freeze({
  "declared": "Referencia de compra aportada",
  "not_provided": "Referencia de compra no aportada"
});
const EVIDENCE_LABELS = /* @__PURE__ */ Object.freeze({
  observed: Object.freeze({"label": "Documento declarado en el corte", "message": "Cada campo conserva su propio resultado de comparación."}),
  missing_response: Object.freeze({"label": "Sin respuesta aportada", "message": "No hay respuesta para esta consulta. No se conocen documento, fecha ni importes observados."}),
  not_configured: Object.freeze({"label": "Sin evidencia configurada", "message": "No hay evidencia preparada para esta consulta en el ejemplo."}),
  unavailable: Object.freeze({"label": "Evidencia no disponible", "message": "La respuesta declara que la evidencia no está disponible. No aporta fecha ni documento."}),
  unsupported: Object.freeze({"label": "Consulta no admitida", "message": "La respuesta del ejemplo no admite esta consulta. No afirma inexistencia documental."}),
  future_observation: Object.freeze({"label": "Corte posterior a la evaluación", "message": "La fecha declarada del corte es posterior a la evaluación. Aún no se muestran documento ni comparaciones."}),
  incomplete_evidence: Object.freeze({"label": "Evidencia incompleta", "message": "El corte no declara cobertura completa. Sus datos documentales permanecen desconocidos."}),
  document_not_provided: Object.freeze({"label": "Documento no aportado en el corte", "message": "El corte no aporta un documento. Esto no demuestra que no exista un documento externo."}),
});
const FEEDBACK = /* @__PURE__ */ Object.freeze({
  initial: Object.freeze({ tone: 'info' as const, code: 'initial' as const, message: "Selecciona un ejemplo y un momento de evaluación. Los datos son ficticios." }),
  selection_changed: Object.freeze({ tone: 'info' as const, code: 'selection_changed' as const, message: "Selección actualizada. El resultado corresponde al ejemplo y al momento elegidos." }),
});

function selectedScenario(input: unknown): Scenario {
  if (typeof input !== 'string') return invalid();
  const found = SCENARIOS.find(item => item.id === input);
  if (!found) return invalid();
  return found;
}
function selectedEvaluation(input: unknown): (typeof EVALUATIONS)[number] {
  if (typeof input !== 'string') return invalid();
  const found = EVALUATIONS.find(item => item.id === input);
  if (!found) return invalid();
  return found;
}
function readSelection(input: unknown): CompanyDocumentDemoSelection {
  const row = record(input, ['scenarioId', 'evaluationId']);
  return Object.freeze({ scenarioId: selectedScenario(row.scenarioId).id, evaluationId: selectedEvaluation(row.evaluationId).id });
}
function readState(input: unknown): CompanyDocumentDemoState {
  const row = record(input, ['selection', 'feedback']);
  const selection = readSelection(row.selection);
  const feedback = record(row.feedback, ['tone', 'code', 'message']);
  const code = feedback.code;
  if (code !== 'initial' && code !== 'selection_changed') return invalid();
  if (feedback.tone !== FEEDBACK[code].tone || feedback.message !== FEEDBACK[code].message) return invalid();
  if (code === 'initial' && (selection.scenarioId !== 'same' || selection.evaluationId !== 'first')) return invalid();
  return Object.freeze({ selection, feedback: Object.freeze({ ...FEEDBACK[code] }) });
}
function money(amountCents: number, signed = false): CompanyDocumentDemoMoney {
  if (!Number.isSafeInteger(amountCents) || Object.is(amountCents, -0)) return invalid();
  const cents = BigInt(amountCents); const absolute = cents < 0n ? -cents : cents;
  const sign = cents < 0n ? '−' : signed && cents > 0n ? '+' : '';
  const integer = (absolute / 100n).toLocaleString('es-ES'); const fraction = String(absolute % 100n).padStart(2, '0');
  return Object.freeze({ currency: 'EUR', amountCents, formatted: `${sign}${integer},${fraction} EUR` });
}
function timeLabel(at: string): string {
  const found = EVALUATIONS.find(item => item.at === at);
  if (!found) return invalid();
  return found.label;
}
function buyerLabel(id: string | null): string | null {
  if (id === null) return null;
  if (id === 'company.offer-demo') return 'Empresa de ejemplo';
  if (id === 'company.document-other') return 'Otra empresa de ejemplo';
  return invalid();
}
function fieldView(field: CompanyDocumentFieldComparison, company: boolean): CompanyDocumentDemoField {
  return Object.freeze({ outcome: field.outcome, reason: field.reason, label: FIELD_LABELS[field.outcome],
    reasonLabel: field.reason === null ? null : FIELD_REASON_LABELS[field.reason],
    expectedValue: company ? buyerLabel(field.expected) : field.expected,
    observedValue: company ? buyerLabel(field.observed) : field.observed });
}
function amountView(amount: CompanyDocumentAmountComparison): CompanyDocumentDemoAmount {
  const expected = money(amount.expected.amountCents);
  if (amount.outcome === 'unknown') return Object.freeze({ outcome: amount.outcome, reason: amount.reason,
    label: 'No se puede comparar el importe', reasonLabel: AMOUNT_REASON_LABELS[amount.reason], expected,
    observed: null, delta: null, position: null, asOf: null, asOfLabel: null });
  return Object.freeze({ outcome: amount.outcome, reason: null, label: AMOUNT_LABELS[amount.position], reasonLabel: null, expected,
    observed: money(amount.observed.amountCents), delta: money(amount.deltaCents, true), position: amount.position,
    asOf: amount.asOf, asOfLabel: timeLabel(amount.asOf) });
}

export function createCompanyDocumentDemo(): CompanyDocumentDemoState {
  return Object.freeze({ selection: Object.freeze({ scenarioId: 'same', evaluationId: 'first' }), feedback: Object.freeze({ ...FEEDBACK.initial }) });
}
export function configureCompanyDocumentDemo(stateInput: unknown, patchInput: unknown): CompanyDocumentDemoState {
  return boundary(() => {
    const state = readState(stateInput);
    const patch = record(patchInput, ['scenarioId', 'evaluationId'], true);
    const selection = readSelection({ ...state.selection, ...patch });
    if (selection.scenarioId === state.selection.scenarioId && selection.evaluationId === state.selection.evaluationId) return state;
    return Object.freeze({ selection, feedback: Object.freeze({ ...FEEDBACK.selection_changed }) });
  });
}
export function getCompanyDocumentDemoView(stateInput: unknown): CompanyDocumentDemoView {
  return boundary(() => {
    const state = readState(stateInput); const scenario = selectedScenario(state.selection.scenarioId);
    const evaluation = selectedEvaluation(state.selection.evaluationId);
    // Consulta sin caso y respuesta no aportada son dos recorridos distintos del contrato real.
    const response = scenario.withoutResponse ? null : ADAPTER.read(scenario.request);
    const result = evaluateCompanyDocumentEvidence({ request: scenario.request, expectedAdapterId: ADAPTER_ID,
      evaluatedAt: evaluation.at, response });
    const po = previewCompanyPurchaseOrderDeclaration({ declaration: result.request.declaration, binding: result.request.declaration.binding });
    const company = buyerLabel(result.expected.companyId);
    if (company === null) return invalid();
    const labels = result.outcome === 'observed' ? EVIDENCE_LABELS.observed : EVIDENCE_LABELS[result.reason];
    const metadata = result.evidenceMetadata;
    return Object.freeze({ selection: state.selection, scenarioOptions: SCENARIO_OPTIONS, evaluationOptions: EVALUATION_OPTIONS,
      scenarioDescription: scenario.description,
      reference: Object.freeze({ buyerCompanyLabel: company, offerLabel: 'Oferta 1',
        purchaseOrderNumber: result.expected.purchaseOrderNumber, purchaseOrderLabel: PO_LABELS[po.purchaseOrderStatus],
        supportStatus: po.documentReferenceStatus, supportLabel: SUPPORT_LABELS[po.documentReferenceStatus],
        declaredAmount: money(result.expected.commercialAmount.amountCents) }),
      evaluatedAt: result.evaluatedAt, evaluatedAtLabel: timeLabel(result.evaluatedAt),
      evidence: Object.freeze({ outcome: result.outcome, reason: result.reason, label: labels.label, message: labels.message,
        metadata: metadata === null ? null : Object.freeze({ coverage: metadata.coverage, coverageLabel: COVERAGE_LABELS[metadata.coverage],
          observedAt: metadata.observedAt, observedAtLabel: timeLabel(metadata.observedAt) }),
        document: result.outcome !== 'observed' ? null : Object.freeze({ label: 'Documento del ejemplo',
          asOf: result.observation.asOf, asOfLabel: timeLabel(result.observation.asOf) }) }),
      // No leer observation.document.commercialAmount: puede pertenecer a otra empresa o PO.
      comparisons: result.outcome !== 'observed' ? null : Object.freeze({ company: fieldView(result.comparisons.company, true),
        purchaseOrder: fieldView(result.comparisons.purchaseOrder, false), amount: amountView(result.comparisons.amount) }),
      feedback: state.feedback });
  });
}

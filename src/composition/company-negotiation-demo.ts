import {
  defineCompanyDirectory, defineCompanyCatalogSnapshot, defineCompanyNegotiationRequest,
  createCompanyNegotiation, appendCompanyOfferRevision, previewCompanyOfferRevision,
  compareCompanyOfferRevisions, type CompanyNegotiation, type CompanyOfferAmountLine,
  type CompanyOfferSnapshot,
} from '../modules/companies';
import type { Platform } from './create-platform';
import {
  createCompanyPreliminaryArtifact, previewCompanyPreliminaryArtifact, applyCompanyPreliminaryAction,
  defineCompanyPreliminaryBinding, type CompanyPreliminaryArtifact, type CompanyPreliminaryBinding,
  type CompanyPreliminaryActionCommand, type CompanyPreliminarySnapshot,
} from './company-preliminary-order';

export type CompanyNegotiationDemoComparisonId = 'one-two' | 'two-three' | 'one-three';
export type CompanyNegotiationDemoOfferId = 'one' | 'two' | 'three';
export type CompanyNegotiationDemoMomentId = 'start' | 'first-expiry' | 'second-expiry' | 'after';
export type CompanyNegotiationDemoAction = 'issue' | 'approve' | 'expire' | 'cancel';
export type CompanyNegotiationDemoSelection = Readonly<{
  comparisonId: CompanyNegotiationDemoComparisonId; offerId: CompanyNegotiationDemoOfferId;
  momentId: CompanyNegotiationDemoMomentId;
}>;
export type CompanyNegotiationDemoFeedbackCode = 'initial' | 'comparison_changed' | 'offer_changed' | 'moment_changed'
  | 'draft_created' | 'draft_exists' | 'draft_required' | 'issue_simulated' | 'approve_simulated'
  | 'expire_simulated' | 'cancel_simulated' | 'action_blocked';
export type CompanyNegotiationDemoFeedback = Readonly<{
  tone: 'info'; code: CompanyNegotiationDemoFeedbackCode; message: string;
}>;
/** Artefacto interno en memoria. La vista nunca lo serializa ni acredita su procedencia. */
export type CompanyNegotiationDemoState = Readonly<{
  selection: CompanyNegotiationDemoSelection; artifact: CompanyPreliminaryArtifact | null;
  artifactSequence: number; feedback: CompanyNegotiationDemoFeedback;
}>;
export type CompanyNegotiationDemoLineView = Readonly<{
  variantId: number; variantLabel: string; sku: string; quantityUnits: number;
  unitPriceCents: number; lineTotalCents: number;
}>;
export type CompanyNegotiationDemoOfferSummary = Readonly<{
  offerId: CompanyNegotiationDemoOfferId; label: string; sideLabel: string;
  createdAt: string; expiresAt: string; subtotalCents: number; shippingCents: number; totalCents: number;
}>;
type LineField = 'variantId' | 'quantityUnits' | 'unitPriceCents';
type DemoStatus = 'draft' | 'issued' | 'approved' | 'expired' | 'cancelled';
export type CompanyNegotiationDemoView = Readonly<{
  selection: CompanyNegotiationDemoSelection; companyLabel: string; buyerLabel: string;
  comparisonOptions: readonly Readonly<{ id: CompanyNegotiationDemoComparisonId; label: string }>[];
  offerOptions: readonly Readonly<{ id: CompanyNegotiationDemoOfferId; label: string; sideLabel: string }>[];
  momentOptions: readonly Readonly<{
    id: CompanyNegotiationDemoMomentId; label: string; at: string; disabled: boolean; reason: string | null;
  }>[];
  selectedMoment: Readonly<{ id: CompanyNegotiationDemoMomentId; label: string; at: string }>;
  comparison: Readonly<{
    id: CompanyNegotiationDemoComparisonId; label: string;
    before: CompanyNegotiationDemoOfferSummary; after: CompanyNegotiationDemoOfferSummary;
    lineChanges: readonly Readonly<{
      productId: number; productLabel: string; kind: 'added' | 'removed' | 'changed'; kindLabel: string;
      changedFields: readonly LineField[]; changeLabels: readonly string[];
      before: CompanyNegotiationDemoLineView | null; after: CompanyNegotiationDemoLineView | null;
    }>[];
    deltas: Readonly<{ subtotalCents: number; shippingCents: number; totalCents: number }>;
  }>;
  selectedOffer: Readonly<{
    id: CompanyNegotiationDemoOfferId; label: string; sideLabel: string; createdAt: string; expiresAt: string; totalCents: number;
  }>;
  terms: Readonly<{ depositCents: 2000; gateLabel: string; message: string }>;
  preliminary: Readonly<{
    offerId: CompanyNegotiationDemoOfferId; offerLabel: string; status: DemoStatus; statusLabel: string;
    createdAt: string; expiresAt: string; totalCents: number; issuedAt: string | null;
    approvedAt: string | null; lastOccurredAt: string;
    history: readonly Readonly<{ action: CompanyNegotiationDemoAction; label: string; occurredAt: string }>[];
  }> | null;
  canCreate: boolean; createBlockedReason: string | null;
  actions: readonly Readonly<{ id: CompanyNegotiationDemoAction; label: string; available: boolean; blockedReason: string | null }>[];
  feedback: CompanyNegotiationDemoFeedback;
}>;

function invalid(): never { throw new RangeError('Estado del ejemplo de ofertas y presupuesto inválido.'); }
function boundary<T>(operation: () => T): T { try { return operation(); } catch { return invalid(); } }
function record(input: unknown, keys: readonly string[], partial = false): Readonly<Record<string, unknown>> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const actual = Reflect.ownKeys(input);
  if ((!partial && actual.length !== keys.length) || (partial && actual.length === 0)) return invalid();
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
export function canShowCompanyNegotiationDemo(
  env: Readonly<{ DEMO_MODE?: string }> | undefined,
  platform: Pick<Platform, 'manifest'> | undefined,
): boolean {
  try {
    return ownValue(env, 'DEMO_MODE') === 'true' &&
      ownValue(ownValue(ownValue(platform, 'manifest'), 'deployment'), 'mode') === 'demo';
  } catch { return false; }
}

// Fixtures privados. Ninguna cifra declarada se convierte en precio operativo.
function buildNegotiation(): CompanyNegotiation {
  const directory = defineCompanyDirectory({
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
});
  const catalog = defineCompanyCatalogSnapshot({
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
});
  const request = defineCompanyNegotiationRequest({
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
});
  let negotiation = createCompanyNegotiation({ ...{"id": "demo.offer-demo.negotiation", "createdAt": "2026-10-03T11:30:00.000Z"}, context: { directory, catalog, request } });
  const revisions = [
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
];
  for (const revision of revisions) {
    const result = appendCompanyOfferRevision({ negotiation, context: negotiation.context,
      command: { negotiationId: negotiation.id, expectedVersion: negotiation.version, revision } });
    if (result.outcome !== 'appended') return invalid();
    negotiation = result.negotiation;
  }
  return negotiation;
}
const NEGOTIATION = /* @__PURE__ */ buildNegotiation();
const PAIRS = /* @__PURE__ */ Object.freeze(([
  {
    "id": "one-two",
    "label": "Oferta 1 → oferta 2",
    "before": "one",
    "after": "two"
  },
  {
    "id": "two-three",
    "label": "Oferta 2 → oferta 3",
    "before": "two",
    "after": "three"
  },
  {
    "id": "one-three",
    "label": "Oferta 1 → oferta 3",
    "before": "one",
    "after": "three"
  }
] as const).map(item => Object.freeze(item)));
const OFFERS = /* @__PURE__ */ Object.freeze(([
  {
    "id": "one",
    "label": "Oferta 1",
    "sideLabel": "Propuesta del vendedor",
    "revisionId": "offer.one"
  },
  {
    "id": "two",
    "label": "Oferta 2",
    "sideLabel": "Propuesta del comprador",
    "revisionId": "offer.two"
  },
  {
    "id": "three",
    "label": "Oferta 3",
    "sideLabel": "Propuesta del vendedor",
    "revisionId": "offer.three"
  }
] as const).map(item => Object.freeze(item)));
const MOMENTS = /* @__PURE__ */ Object.freeze(([
  {
    "id": "start",
    "label": "3 oct · 14:00 UTC",
    "at": "2026-10-03T14:00:00.000Z"
  },
  {
    "id": "first-expiry",
    "label": "10 oct · 12:00 UTC",
    "at": "2026-10-10T12:00:00.000Z"
  },
  {
    "id": "second-expiry",
    "label": "11 oct · 12:00 UTC",
    "at": "2026-10-11T12:00:00.000Z"
  },
  {
    "id": "after",
    "label": "12 oct · 12:00 UTC",
    "at": "2026-10-12T12:00:00.000Z"
  }
] as const).map(item => Object.freeze(item)));
const METADATA = /* @__PURE__ */ Object.freeze([
  {
    "productId": 1,
    "productLabel": "Muestra de cerámica",
    "variantId": 11,
    "variantLabel": "Natural",
    "sku": "DEMO-CER-N"
  },
  {
    "productId": 1,
    "productLabel": "Muestra de cerámica",
    "variantId": 12,
    "variantLabel": "Azul",
    "sku": "DEMO-CER-A"
  },
  {
    "productId": 2,
    "productLabel": "Soporte de muestra",
    "variantId": 21,
    "variantLabel": "Único",
    "sku": "DEMO-SOP-U"
  }
].map(item => Object.freeze(item)));
const FEEDBACK_MESSAGES = /* @__PURE__ */ Object.freeze({
  "initial": "Compara las propuestas y crea un borrador cuando quieras simular sus acciones.",
  "comparison_changed": "Comparación cambiada. La selección del presupuesto se conserva.",
  "offer_changed": "Oferta cambiada. Crea un nuevo borrador; las acciones anteriores no se trasladan.",
  "moment_changed": "Momento cambiado. No se ha aplicado ninguna acción.",
  "draft_created": "Borrador de ejemplo creado a partir de la oferta seleccionada.",
  "draft_exists": "El borrador actual se conserva con sus acciones.",
  "draft_required": "Crea un borrador de ejemplo antes de simular acciones.",
  "issue_simulated": "Emisión simulada. No se ha enviado ningún presupuesto.",
  "approve_simulated": "Aprobación simulada. No acredita aceptación legal ni autorización de compra.",
  "expire_simulated": "Caducidad simulada mediante una acción explícita.",
  "cancel_simulated": "Cancelación simulada. El historial del ejemplo se conserva.",
  "action_blocked": "La acción no está disponible en el estado y momento seleccionados."
});
const ACTION_LABELS = /* @__PURE__ */ Object.freeze({
  "issue": "Simular emisión",
  "approve": "Simular aprobación",
  "expire": "Simular caducidad",
  "cancel": "Simular cancelación"
});
const STATUS_LABELS = /* @__PURE__ */ Object.freeze({
  "draft": "Borrador de ejemplo",
  "issued": "Emisión simulada",
  "approved": "Aprobación simulada",
  "expired": "Caducidad simulada",
  "cancelled": "Cancelación simulada"
});
const HISTORY_LABELS = /* @__PURE__ */ Object.freeze({
  "issue": "Emisión simulada",
  "approve": "Aprobación simulada",
  "expire": "Caducidad simulada",
  "cancel": "Cancelación simulada"
});
const KIND_LABELS = /* @__PURE__ */ Object.freeze({
  "added": "Producto incorporado",
  "removed": "Producto retirado",
  "changed": "Producto modificado"
});
const CHANGE_LABELS = /* @__PURE__ */ Object.freeze({
  "variantId": "Cambia la variante",
  "quantityUnits": "Cambia la cantidad",
  "unitPriceCents": "Cambia el precio unitario"
});
const LABELS = /* @__PURE__ */ Object.freeze({
  "termsGate": "Condición declarada: conversión por anticipo",
  "termsMessage": "Anticipo ilustrativo; no se simulan cobros ni conversiones a pedido.",
  "createBlockedReason": "El borrador actual se conserva. Selecciona otra oferta o restablece el ejemplo para crear uno nuevo.",
  "draftRequired": "Crea un borrador para simular acciones.",
  "actionUnavailable": "No disponible en el estado y momento seleccionados.",
  "momentUnavailable": "Este momento es anterior a la creación o a la última acción aplicada.",
  "sequenceExhausted": "Se ha alcanzado el límite de recorridos del ejemplo. Restablécelo para continuar."
});

function feedback(code: CompanyNegotiationDemoFeedbackCode): CompanyNegotiationDemoFeedback {
  return Object.freeze({ tone: 'info', code, message: FEEDBACK_MESSAGES[code] });
}
function readSelection(input: unknown): CompanyNegotiationDemoSelection {
  const row = record(input, ['comparisonId', 'offerId', 'momentId']);
  const pair = PAIRS.find(item => item.id === row.comparisonId);
  const offer = OFFERS.find(item => item.id === row.offerId);
  const moment = MOMENTS.find(item => item.id === row.momentId);
  if (!pair || !offer || !moment) return invalid();
  return Object.freeze({ comparisonId: pair.id, offerId: offer.id, momentId: moment.id });
}
function artifactId(sequence: number, offerId: CompanyNegotiationDemoOfferId): string {
  return `demo.offer-preliminary.n${sequence}.${offerId}`;
}
function actionId(sequence: number, step: number, action: CompanyNegotiationDemoAction): string {
  return `demo.offer-preliminary.n${sequence}.s${step}.${action}`;
}
function bindingFor(offerId: CompanyNegotiationDemoOfferId, sequence: number): CompanyPreliminaryBinding {
  const offer = OFFERS.find(item => item.id === offerId)!;
  return defineCompanyPreliminaryBinding({ negotiation: NEGOTIATION, revisionId: offer.revisionId,
    terms: { preliminaryId: `quote_demo_n${sequence}_${offerId}`, depositCents: 2000, conversionGate: 'deposit' } });
}
function readState(input: unknown): Readonly<{ state: CompanyNegotiationDemoState; snapshot: CompanyPreliminarySnapshot | null }> {
  const row = record(input, ['selection', 'artifact', 'artifactSequence', 'feedback']);
  const selection = readSelection(row.selection);
  if (typeof row.artifactSequence !== 'number' || !Number.isSafeInteger(row.artifactSequence) ||
    row.artifactSequence < 0 || Object.is(row.artifactSequence, -0)) return invalid();
  const sequence = row.artifactSequence;
  const note = record(row.feedback, ['tone', 'code', 'message']);
  if (typeof note.code !== 'string' || !Object.hasOwn(FEEDBACK_MESSAGES, note.code)) return invalid();
  const code = note.code as CompanyNegotiationDemoFeedbackCode;
  if (note.tone !== 'info' || note.message !== FEEDBACK_MESSAGES[code]) return invalid();
  const snapshot = row.artifact === null ? null : previewCompanyPreliminaryArtifact({ artifact: row.artifact });
  if (snapshot) {
    const artifact = snapshot.artifact;
    // Compara copias canónicas completas: una oferta equivalente en dinero no es este fixture.
    if (sequence === 0 || artifact.id !== artifactId(sequence, selection.offerId) ||
      JSON.stringify(artifact.binding) !== JSON.stringify(bindingFor(selection.offerId, sequence)) ||
      !MOMENTS.some(item => item.at === artifact.createdAt)) return invalid();
    for (const [index, command] of artifact.actions.entries()) {
      if (command.id !== actionId(sequence, index + 1, command.action) || command.artifactId !== artifact.id ||
        command.expectedVersion !== index + 1 || !MOMENTS.some(item => item.at === command.occurredAt)) return invalid();
    }
    if (MOMENTS.find(item => item.id === selection.momentId)!.at < snapshot.lastOccurredAt) return invalid();
  }
  return Object.freeze({ state: Object.freeze({ selection, artifact: snapshot?.artifact ?? null,
    artifactSequence: sequence, feedback: feedback(code) }), snapshot });
}
function commandFor(state: CompanyNegotiationDemoState, snapshot: CompanyPreliminarySnapshot,
  action: CompanyNegotiationDemoAction): CompanyPreliminaryActionCommand {
  return Object.freeze({ id: actionId(state.artifactSequence, snapshot.artifact.actions.length + 1, action),
    artifactId: snapshot.artifact.id, expectedVersion: snapshot.order.version, action,
    occurredAt: MOMENTS.find(item => item.id === state.selection.momentId)!.at });
}
function transitionFor(state: CompanyNegotiationDemoState, snapshot: CompanyPreliminarySnapshot, action: CompanyNegotiationDemoAction) {
  const result = applyCompanyPreliminaryAction({ artifact: snapshot.artifact,
    binding: bindingFor(state.selection.offerId, state.artifactSequence), command: commandFor(state, snapshot, action) });
  // Los IDs siempre son nuevos. Un replay/conflicto aquí señalaría un estado ajeno al perfil local.
  if (result.outcome !== 'applied' && result.outcome !== 'blocked') return invalid();
  return result;
}
export function createCompanyNegotiationDemo(): CompanyNegotiationDemoState {
  return Object.freeze({ selection: Object.freeze({ comparisonId: 'one-two', offerId: 'one', momentId: 'start' }),
    artifact: null, artifactSequence: 0, feedback: feedback('initial') });
}
export function configureCompanyNegotiationDemo(stateInput: unknown, input: unknown): CompanyNegotiationDemoState {
  return boundary(() => {
    const { state, snapshot } = readState(stateInput);
    const patch = record(input, ['comparisonId', 'offerId', 'momentId'], true);
    const next = readSelection({ ...state.selection, ...patch });
    if (next.offerId !== state.selection.offerId) {
      if (Object.hasOwn(patch, 'momentId') && next.momentId !== 'start') return invalid();
      return Object.freeze({ ...state, selection: Object.freeze({ ...next, momentId: 'start' }),
        artifact: null, feedback: feedback('offer_changed') });
    }
    if (snapshot && MOMENTS.find(item => item.id === next.momentId)!.at < snapshot.lastOccurredAt) return invalid();
    const code = next.momentId !== state.selection.momentId ? 'moment_changed'
      : next.comparisonId !== state.selection.comparisonId ? 'comparison_changed' : null;
    return code ? Object.freeze({ ...state, selection: next, feedback: feedback(code) }) : state;
  });
}
export function createCompanyNegotiationDemoDraft(stateInput: unknown): CompanyNegotiationDemoState {
  return boundary(() => {
    const { state } = readState(stateInput);
    if (state.artifact) return Object.freeze({ ...state, feedback: feedback('draft_exists') });
    if (state.artifactSequence === Number.MAX_SAFE_INTEGER) return invalid();
    const sequence = state.artifactSequence + 1;
    const snapshot = createCompanyPreliminaryArtifact({ id: artifactId(sequence, state.selection.offerId),
      createdAt: MOMENTS.find(item => item.id === state.selection.momentId)!.at,
      binding: bindingFor(state.selection.offerId, sequence) });
    return Object.freeze({ ...state, artifact: snapshot.artifact, artifactSequence: sequence, feedback: feedback('draft_created') });
  });
}
export function applyCompanyNegotiationDemoAction(stateInput: unknown, input: unknown): CompanyNegotiationDemoState {
  return boundary(() => {
    const { state, snapshot } = readState(stateInput);
    const command = record(input, ['action']);
    if (typeof command.action !== 'string' || !Object.hasOwn(ACTION_LABELS, command.action)) return invalid();
    const action = command.action as CompanyNegotiationDemoAction;
    if (!snapshot) return Object.freeze({ ...state, feedback: feedback('draft_required') });
    const result = transitionFor(state, snapshot, action);
    if (result.outcome === 'blocked') return Object.freeze({ ...state, feedback: feedback('action_blocked') });
    return Object.freeze({ ...state, artifact: result.snapshot.artifact, feedback: feedback(`${action}_simulated`) });
  });
}
function offerSummary(id: CompanyNegotiationDemoOfferId, offer: CompanyOfferSnapshot['offer']): CompanyNegotiationDemoOfferSummary {
  const selected = OFFERS.find(item => item.id === id)!;
  return Object.freeze({ offerId: selected.id, label: selected.label, sideLabel: selected.sideLabel,
    createdAt: offer.createdAt, expiresAt: offer.expiresAt, subtotalCents: offer.subtotalCents,
    shippingCents: offer.shippingCents, totalCents: offer.totalCents });
}
function lineView(line: CompanyOfferAmountLine | null): CompanyNegotiationDemoLineView | null {
  if (!line) return null;
  const metadata = METADATA.find(item => item.productId === line.productId && item.variantId === line.variantId);
  if (!metadata) return invalid();
  return Object.freeze({ variantId: metadata.variantId, variantLabel: metadata.variantLabel, sku: metadata.sku,
    quantityUnits: line.quantityUnits, unitPriceCents: line.unitPriceCents, lineTotalCents: line.lineTotalCents });
}
export function getCompanyNegotiationDemoView(stateInput: unknown): CompanyNegotiationDemoView {
  return boundary(() => {
    const { state, snapshot } = readState(stateInput);
    const pair = PAIRS.find(item => item.id === state.selection.comparisonId)!;
    const selected = OFFERS.find(item => item.id === state.selection.offerId)!;
    const moment = MOMENTS.find(item => item.id === state.selection.momentId)!;
    const comparison = compareCompanyOfferRevisions({ negotiation: NEGOTIATION, context: NEGOTIATION.context,
      beforeRevisionId: OFFERS.find(item => item.id === pair.before)!.revisionId,
      afterRevisionId: OFFERS.find(item => item.id === pair.after)!.revisionId });
    const offer = previewCompanyOfferRevision({ negotiation: NEGOTIATION, context: NEGOTIATION.context, revisionId: selected.revisionId }).offer;
    let preliminary: CompanyNegotiationDemoView['preliminary'] = null;
    if (snapshot) {
      const status = snapshot.order.status;
      if (status !== 'draft' && status !== 'issued' && status !== 'approved' && status !== 'expired' && status !== 'cancelled') return invalid();
      preliminary = Object.freeze({ offerId: selected.id, offerLabel: selected.label, status, statusLabel: STATUS_LABELS[status],
        createdAt: snapshot.artifact.createdAt, expiresAt: snapshot.order.expiresAt, totalCents: snapshot.order.totalCents,
        issuedAt: snapshot.order.issuedAt, approvedAt: snapshot.order.approvedAt, lastOccurredAt: snapshot.lastOccurredAt,
        history: Object.freeze(snapshot.artifact.actions.map(command => Object.freeze({ action: command.action,
          label: HISTORY_LABELS[command.action], occurredAt: command.occurredAt }))) });
    }
    const canCreate = snapshot === null && state.artifactSequence < Number.MAX_SAFE_INTEGER;
    return Object.freeze({ selection: state.selection, companyLabel: 'Empresa de ejemplo', buyerLabel: 'Comprador de ejemplo',
      comparisonOptions: Object.freeze(PAIRS.map(item => Object.freeze({ id: item.id, label: item.label }))),
      offerOptions: Object.freeze(OFFERS.map(item => Object.freeze({ id: item.id, label: item.label, sideLabel: item.sideLabel }))),
      momentOptions: Object.freeze(MOMENTS.map(item => {
        const disabled = snapshot !== null && item.at < snapshot.lastOccurredAt;
        return Object.freeze({ ...item, disabled, reason: disabled ? LABELS.momentUnavailable : null });
      })), selectedMoment: moment,
      comparison: Object.freeze({ id: pair.id, label: pair.label,
        before: offerSummary(pair.before, comparison.before), after: offerSummary(pair.after, comparison.after),
        lineChanges: Object.freeze(comparison.lineChanges.map(change => {
          const metadata = METADATA.find(item => item.productId === change.productId);
          if (!metadata) return invalid();
          return Object.freeze({ productId: change.productId, productLabel: metadata.productLabel,
            kind: change.kind, kindLabel: KIND_LABELS[change.kind], changedFields: change.changedFields,
            changeLabels: Object.freeze(change.changedFields.map(field => CHANGE_LABELS[field])),
            before: lineView(change.before), after: lineView(change.after) });
        })), deltas: comparison.deltas }),
      selectedOffer: Object.freeze({ id: selected.id, label: selected.label, sideLabel: selected.sideLabel,
        createdAt: offer.createdAt, expiresAt: offer.expiresAt, totalCents: offer.totalCents }),
      terms: Object.freeze({ depositCents: 2000, gateLabel: LABELS.termsGate, message: LABELS.termsMessage }),
      preliminary, canCreate,
      createBlockedReason: canCreate ? null : snapshot ? LABELS.createBlockedReason : LABELS.sequenceExhausted,
      actions: Object.freeze((['issue', 'approve', 'expire', 'cancel'] as const).map(action => {
        // Son consultas descartadas; ni un probe ni cambiar fecha registra un evento.
        const available = snapshot !== null && transitionFor(state, snapshot, action).outcome === 'applied';
        return Object.freeze({ id: action, label: ACTION_LABELS[action], available,
          blockedReason: available ? null : snapshot ? LABELS.actionUnavailable : LABELS.draftRequired });
      })), feedback: state.feedback,
    });
  });
}

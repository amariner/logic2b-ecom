import { shopConfig } from '../../shop.config';
import {
  assertOrderDocumentVoid,
  createD1OrderDocuments,
  planExternalOrderDocument,
  planGeneratedOrderDocument,
  renderOrderDocument,
  type ExternalOrderDocumentType,
  type GeneratedOrderDocumentType,
  type OrderDocumentDetail,
  type OrderDocumentSnapshot,
} from '../modules/orders';
import { createAuditDiff, createAuditEntry, serializeAuditDiff } from '../shared-kernel/audit';

const ACTOR = Object.freeze({ kind: 'admin', id: 'admin-panel', label: 'Panel de administración' } as const);

export type OrderDocumentMutation = Readonly<{
  outcome: 'applied' | 'idempotent' | 'conflict' | 'not-found' | 'invalid-state';
  detail: OrderDocumentDetail | null;
}>;

export type IssueGeneratedOrderDocumentInput = Readonly<{
  orderId: number;
  fulfillmentId: number;
  documentType: GeneratedOrderDocumentType;
  templateId: string;
  idempotencyKey: string;
}>;

export type RegisterExternalOrderDocumentInput = Readonly<{
  orderId: number;
  documentType: ExternalOrderDocumentType;
  refundId?: number;
  provider: string;
  externalReference: string;
  documentNumber: string;
  externalUrl?: string;
  idempotencyKey: string;
}>;

type AddressSnapshot = Readonly<{
  name: string;
  company: string | null;
  street: string;
  postalCode: string;
  city: string;
  phone: string | null;
}>;

function newId(prefix: string): string { return `${prefix}_${crypto.randomUUID()}`; }

function assertKey(value: string): void {
  if (value.trim() !== value || value.length < 8 || value.length > 200) {
    throw new RangeError('Idempotency key inválida.');
  }
}

function addressSnapshot(raw: string, fallbackName: string): AddressSnapshot {
  const parsed = JSON.parse(raw) as Partial<Record<'name' | 'company' | 'street' | 'postal_code' | 'city' | 'phone', unknown>>;
  const text = (value: unknown, fallback = ''): string => typeof value === 'string' && value.trim() ? value.trim() : fallback;
  return Object.freeze({
    name: text(parsed.name, fallbackName),
    company: text(parsed.company) || null,
    street: text(parsed.street),
    postalCode: text(parsed.postal_code),
    city: text(parsed.city),
    phone: text(parsed.phone) || null,
  });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function auditValues(entry: ReturnType<typeof createAuditEntry>): readonly unknown[] {
  return [entry.audit_id, entry.occurred_at, entry.actor.kind, entry.actor.id,
    entry.actor.label ?? null, entry.action, entry.entity.type, entry.entity.id,
    entry.entity.reference ?? null, entry.correlation_id, entry.source_event_id,
    serializeAuditDiff(entry.diff), entry.occurred_at];
}

export function createOrderDocumentOperations(
  db: D1Database,
  now = () => new Date().toISOString(),
) {
  const documents = createD1OrderDocuments(db);

  function previousStatements(
    previous: NonNullable<Awaited<ReturnType<typeof documents.generatedContext>>['previous']>,
    operationKey: string,
    at: string,
  ): readonly D1PreparedStatement[] {
    return [
      db.prepare(`UPDATE order_documents SET status='superseded',
        lifecycle_version=lifecycle_version+1, updated_at=?
        WHERE id=? AND status='active' AND lifecycle_version=?`)
        .bind(at, previous.id, previous.lifecycle_version),
      db.prepare(`INSERT INTO order_document_events (
        document_id, transition, from_status, to_status, lifecycle_version_after,
        actor_kind, actor_id, idempotency_key, detail_json, occurred_at
      ) SELECT id, 'superseded', 'active', 'superseded', lifecycle_version,
        'admin', ?, ?, '{}', ? FROM order_documents
        WHERE id=? AND status='superseded' AND lifecycle_version=?`)
        .bind(ACTOR.id, `${operationKey}:supersede`, at, previous.id, previous.lifecycle_version + 1),
    ];
  }

  async function issueGenerated(input: IssueGeneratedOrderDocumentInput): Promise<OrderDocumentMutation> {
    assertKey(input.idempotencyKey);
    const replay = await documents.findByIssueKey(input.idempotencyKey);
    if (replay) return { outcome: 'idempotent', detail: replay };
    const context = await documents.generatedContext({
      orderId: input.orderId, fulfillmentId: input.fulfillmentId,
      templateId: input.templateId, type: input.documentType,
    });
    if (!context.order) return { outcome: 'not-found', detail: null };
    let plan;
    try {
      plan = planGeneratedOrderDocument({
        documentType: input.documentType,
        order: {
          id: context.order.id, orderNumber: context.order.order_number,
          status: context.order.status, totalCents: context.order.total_cents,
          currency: context.order.currency,
        },
        fulfillment: context.fulfillment ? {
          id: context.fulfillment.id, orderId: context.fulfillment.order_id,
          status: context.fulfillment.status,
        } : null,
        template: context.template ? {
          id: context.template.id, documentType: context.template.document_type,
          version: context.template.version, renderer: context.template.renderer,
          active: context.template.active === 1,
        } : null,
        previous: context.previous ? {
          id: context.previous.id, documentVersion: context.previous.document_version,
          status: context.previous.status,
        } : null,
        idempotencyKey: input.idempotencyKey,
      });
    } catch {
      return { outcome: 'invalid-state', detail: context.previous ? await documents.find(context.previous.id) : null };
    }
    if (context.lines.length === 0 || !context.fulfillment) return { outcome: 'invalid-state', detail: null };
    const at = now();
    const id = newId('doc');
    const snapshot: OrderDocumentSnapshot = Object.freeze({
      schema: 1,
      issuedAt: at,
      document: Object.freeze({
        number: plan.documentNumber, type: plan.documentType, version: plan.documentVersion,
        templateId: plan.template.id, templateVersion: plan.template.version,
      }),
      seller: Object.freeze({ name: shopConfig.name, legalName: shopConfig.legalName }),
      order: Object.freeze({ id: context.order.id, number: context.order.order_number }),
      recipient: addressSnapshot(context.order.address_json, context.order.customer_name),
      fulfillment: Object.freeze({
        id: context.fulfillment.id, carrier: context.fulfillment.carrier,
        trackingNumber: context.fulfillment.tracking_number,
      }),
      lines: Object.freeze(context.lines.map((line) => Object.freeze({
        orderItemId: line.order_item_id, sku: line.sku, name: line.name, quantity: line.quantity,
      }))),
    });
    const content = renderOrderDocument(snapshot);
    const digest = await sha256(content);
    const audit = createAuditEntry({ event_id: newId('docaudit'), occurred_at: at }, {
      actor: ACTOR,
      action: 'orders.document_issued',
      entity: { type: 'order_document', id, reference: plan.documentNumber },
      diff: createAuditDiff({}, {
        status: 'active', document_type: plan.documentType,
        document_version: plan.documentVersion, order_id: input.orderId,
      }, ['status', 'document_type', 'document_version', 'order_id']),
    });
    const statements: D1PreparedStatement[] = [
      ...(context.previous ? previousStatements(context.previous, input.idempotencyKey, at) : []),
      db.prepare(`INSERT INTO order_documents (
        id, document_number, order_id, document_type, source, template_id,
        fulfillment_id, refund_id, document_version, lifecycle_version, status,
        expected_amount_cents, currency, external_provider, external_reference,
        external_url, snapshot_json, content_sha256, idempotency_key, supersedes_id,
        issued_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'generated', ?, ?, NULL, ?, 1, 'active',
        NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, plan.documentNumber, input.orderId, plan.documentType, plan.template.id,
          plan.fulfillment.id, plan.documentVersion, JSON.stringify(snapshot), digest,
          input.idempotencyKey, plan.supersedesId, at, at, at),
      db.prepare(`INSERT INTO order_document_artifacts (
        document_id, content_type, content_text, content_sha256, byte_size, created_at
      ) VALUES (?, 'text/html', ?, ?, ?, ?)`)
        .bind(id, content, digest, new TextEncoder().encode(content).byteLength, at),
      db.prepare(`INSERT INTO order_document_events (
        document_id, transition, from_status, to_status, lifecycle_version_after,
        actor_kind, actor_id, idempotency_key, detail_json, occurred_at
      ) VALUES (?, 'created', NULL, 'active', 1, 'admin', ?, ?, ?, ?)`)
        .bind(id, ACTOR.id, `${input.idempotencyKey}:created`, JSON.stringify({ template_id: plan.template.id }), at),
      db.prepare(`INSERT INTO audit_log (
        audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
        entity_type, entity_id, entity_reference, correlation_id,
        source_event_id, diff_json, created_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM order_documents WHERE id=?`)
        .bind(...auditValues(audit), id),
    ];
    try {
      await db.batch(statements);
      return { outcome: 'applied', detail: await documents.find(id) };
    } catch {
      const raced = await documents.findByIssueKey(input.idempotencyKey);
      return raced ? { outcome: 'idempotent', detail: raced } : { outcome: 'conflict', detail: null };
    }
  }

  async function registerExternal(input: RegisterExternalOrderDocumentInput): Promise<OrderDocumentMutation> {
    assertKey(input.idempotencyKey);
    const replay = await documents.findByIssueKey(input.idempotencyKey);
    if (replay) return { outcome: 'idempotent', detail: replay };
    const context = await documents.externalContext({
      orderId: input.orderId, type: input.documentType, refundId: input.refundId ?? null,
    });
    if (!context.order) return { outcome: 'not-found', detail: null };
    let plan;
    try {
      plan = planExternalOrderDocument({
        documentType: input.documentType,
        order: {
          id: context.order.id, orderNumber: context.order.order_number,
          status: context.order.status, totalCents: context.order.total_cents,
          currency: context.order.currency,
        },
        refund: context.refund ? {
          id: context.refund.id, orderId: context.refund.order_id,
          status: context.refund.status, totalCents: context.refund.total_cents,
        } : null,
        previous: context.previous ? {
          id: context.previous.id, documentVersion: context.previous.document_version,
          status: context.previous.status,
        } : null,
        provider: input.provider, externalReference: input.externalReference,
        documentNumber: input.documentNumber,
        ...(input.externalUrl === undefined ? {} : { externalUrl: input.externalUrl }),
        idempotencyKey: input.idempotencyKey,
      });
    } catch {
      return { outcome: 'invalid-state', detail: context.previous ? await documents.find(context.previous.id) : null };
    }
    const at = now();
    const id = newId('doc');
    const snapshot = Object.freeze({
      schema: 1,
      issuedAt: at,
      document: Object.freeze({
        number: plan.documentNumber, type: plan.documentType,
        version: plan.documentVersion, source: 'external',
      }),
      seller: Object.freeze({ name: shopConfig.name, legalName: shopConfig.legalName }),
      order: Object.freeze({ id: context.order.id, number: context.order.order_number }),
      recipient: addressSnapshot(context.order.address_json, context.order.customer_name),
      external: Object.freeze({
        provider: plan.provider, reference: plan.externalReference, url: plan.externalUrl,
        expectedAmountCents: plan.expectedAmountCents, currency: plan.currency,
        refundId: plan.refundId,
      }),
    });
    const serialized = JSON.stringify(snapshot);
    const digest = await sha256(serialized);
    const audit = createAuditEntry({ event_id: newId('docaudit'), occurred_at: at }, {
      actor: ACTOR,
      action: 'orders.external_document_registered',
      entity: { type: 'order_document', id, reference: plan.documentNumber },
      diff: createAuditDiff({}, {
        status: 'active', document_type: plan.documentType,
        document_version: plan.documentVersion, order_id: input.orderId,
        expected_amount_cents: plan.expectedAmountCents,
      }, ['status', 'document_type', 'document_version', 'order_id', 'expected_amount_cents']),
    });
    const statements: D1PreparedStatement[] = [
      ...(context.previous ? previousStatements(context.previous, input.idempotencyKey, at) : []),
      db.prepare(`INSERT INTO order_documents (
        id, document_number, order_id, document_type, source, template_id,
        fulfillment_id, refund_id, document_version, lifecycle_version, status,
        expected_amount_cents, currency, external_provider, external_reference,
        external_url, snapshot_json, content_sha256, idempotency_key, supersedes_id,
        issued_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'external', NULL, NULL, ?, ?, 1, 'active',
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, plan.documentNumber, input.orderId, plan.documentType, plan.refundId,
          plan.documentVersion, plan.expectedAmountCents, plan.currency, plan.provider,
          plan.externalReference, plan.externalUrl, serialized, digest,
          input.idempotencyKey, plan.supersedesId, at, at, at),
      db.prepare(`INSERT INTO order_document_events (
        document_id, transition, from_status, to_status, lifecycle_version_after,
        actor_kind, actor_id, idempotency_key, detail_json, occurred_at
      ) VALUES (?, 'created', NULL, 'active', 1, 'provider', ?, ?, ?, ?)`)
        .bind(id, plan.provider, `${input.idempotencyKey}:created`,
          JSON.stringify({ external_reference: plan.externalReference }), at),
      db.prepare(`INSERT INTO audit_log (
        audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
        entity_type, entity_id, entity_reference, correlation_id,
        source_event_id, diff_json, created_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM order_documents WHERE id=?`)
        .bind(...auditValues(audit), id),
    ];
    try {
      await db.batch(statements);
      return { outcome: 'applied', detail: await documents.find(id) };
    } catch {
      const raced = await documents.findByIssueKey(input.idempotencyKey);
      return raced ? { outcome: 'idempotent', detail: raced } : { outcome: 'conflict', detail: null };
    }
  }

  async function voidDocument(
    id: string,
    expectedVersion: number,
    idempotencyKey: string,
    reason: string,
  ): Promise<OrderDocumentMutation> {
    assertKey(idempotencyKey);
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 3 || normalizedReason.length > 240) {
      return { outcome: 'invalid-state', detail: await documents.find(id) };
    }
    const replay = await documents.findByVoidKey(idempotencyKey);
    if (replay) return { outcome: replay.document.id === id ? 'idempotent' : 'conflict', detail: replay };
    const detail = await documents.find(id);
    if (!detail) return { outcome: 'not-found', detail: null };
    if (detail.document.lifecycle_version !== expectedVersion) return { outcome: 'conflict', detail };
    try { assertOrderDocumentVoid(detail.document.status, expectedVersion); }
    catch { return { outcome: 'invalid-state', detail }; }
    const at = now();
    const audit = createAuditEntry({ event_id: newId('docaudit'), occurred_at: at }, {
      actor: ACTOR,
      action: 'orders.document_voided',
      entity: { type: 'order_document', id, reference: detail.document.document_number },
      diff: createAuditDiff({ status: 'active' }, { status: 'voided', reason: normalizedReason }, ['status', 'reason']),
    });
    const results = await db.batch([
      db.prepare(`UPDATE order_documents SET status='voided', lifecycle_version=lifecycle_version+1,
        void_idempotency_key=?, void_reason=?, voided_at=?, updated_at=?
        WHERE id=? AND status='active' AND lifecycle_version=?`)
        .bind(idempotencyKey, normalizedReason, at, at, id, expectedVersion),
      db.prepare(`INSERT INTO order_document_events (
        document_id, transition, from_status, to_status, lifecycle_version_after,
        actor_kind, actor_id, idempotency_key, detail_json, occurred_at
      ) SELECT id, 'voided', 'active', 'voided', lifecycle_version,
        'admin', ?, ?, ?, ? FROM order_documents
        WHERE id=? AND status='voided' AND void_idempotency_key=?`)
        .bind(ACTOR.id, `${idempotencyKey}:voided`, JSON.stringify({ reason: normalizedReason }),
          at, id, idempotencyKey),
      db.prepare(`INSERT INTO audit_log (
        audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
        entity_type, entity_id, entity_reference, correlation_id,
        source_event_id, diff_json, created_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM order_documents
        WHERE id=? AND status='voided' AND void_idempotency_key=?`)
        .bind(...auditValues(audit), id, idempotencyKey),
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1) {
      const raced = await documents.findByVoidKey(idempotencyKey);
      return raced ? { outcome: raced.document.id === id ? 'idempotent' : 'conflict', detail: raced }
        : { outcome: 'conflict', detail: await documents.find(id) };
    }
    return { outcome: 'applied', detail: await documents.find(id) };
  }

  return Object.freeze({
    list: (orderId?: number) => documents.list(orderId),
    find: (id: string) => documents.find(id),
    artifact: (id: string) => documents.artifact(id),
    adminOptions: () => documents.adminOptions(),
    issueGenerated,
    registerExternal,
    voidDocument,
  });
}

export type OrderDocumentOperations = ReturnType<typeof createOrderDocumentOperations>;

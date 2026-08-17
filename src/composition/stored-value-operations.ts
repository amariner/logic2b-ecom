import {
  createD1StoredValue,
  generateGiftCardCode,
  giftCardCodeHash,
  type StoredValueKind,
  type StoredValueState,
} from '../modules/payments';
import { createAuditDiff, createAuditEntry, serializeAuditDiff, type AuditEntry } from '../shared-kernel/audit';
import type { ReserveEventIdentity } from '../shared-kernel/events';
import { reservePlatformEventIdentity } from './event-context';

export type StoredValuePolicyInput = Readonly<{
  legalReviewReference: string;
  funding: 'purchased' | 'promotional' | 'refund' | 'manual';
  expiry: 'none' | 'fixed';
  transferability: 'not_enabled' | 'project_defined';
  cashOut: 'not_enabled' | 'project_defined';
}>;

export type IssueStoredValueInput = Readonly<{
  kind: StoredValueKind;
  label: string;
  currency: string;
  amountCents: number;
  ownerKeyHash?: string;
  expiresAt: string | null;
  policy: StoredValuePolicyInput;
  idempotencyKey: string;
}>;

function auditValues(entry: AuditEntry): readonly unknown[] {
  return [entry.audit_id, entry.occurred_at, entry.actor.kind, entry.actor.id,
    entry.actor.label ?? null, entry.action, entry.entity.type, entry.entity.id,
    entry.entity.reference ?? null, entry.correlation_id, entry.source_event_id,
    serializeAuditDiff(entry.diff), entry.occurred_at];
}

function auditStatement(db: D1Database, entry: AuditEntry): D1PreparedStatement {
  return db.prepare(`INSERT INTO audit_log (audit_id,occurred_at,actor_kind,actor_id,
    actor_label,action,entity_type,entity_id,entity_reference,correlation_id,
    source_event_id,diff_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(...auditValues(entry));
}

function policyJson(policy: StoredValuePolicyInput) {
  const reference = policy.legalReviewReference.trim();
  if (reference.length < 3 || reference.length > 200) throw new RangeError('Referencia de revisión legal inválida.');
  return Object.freeze({
    schema: 1,
    legal_review_reference: reference,
    funding: policy.funding,
    expiry: policy.expiry,
    transferability: policy.transferability,
    cash_out: policy.cashOut,
  });
}

export function createStoredValueOperations(
  db: D1Database,
  reserveIdentity: ReserveEventIdentity = reservePlatformEventIdentity,
) {
  const stored = createD1StoredValue(db);
  return Object.freeze({
    list: stored.list,

    async issue(input: IssueStoredValueInput): Promise<Readonly<{
      outcome: 'applied' | 'conflict';
      accountId?: string;
      giftCardCode?: string;
    }>> {
      if (!/^[a-zA-Z0-9_-]{8,100}$/.test(input.idempotencyKey)) {
        throw new RangeError('idempotencyKey inválida.');
      }
      if (await stored.ledgerAccountId(input.idempotencyKey)) return { outcome: 'conflict' };
      const currency = input.currency.trim().toUpperCase();
      const policy = policyJson(input.policy);
      if ((input.expiresAt === null) !== (input.policy.expiry === 'none')) {
        throw new RangeError('La caducidad no coincide con la política declarada.');
      }
      if (input.expiresAt !== null && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.expiresAt)) {
        throw new RangeError('expiresAt inválido.');
      }
      const identity = reserveIdentity();
      const ownerKeyHash = input.ownerKeyHash?.trim().toLowerCase();
      const existing = input.kind === 'store_credit' && ownerKeyHash
        ? await stored.findByOwnerKeyHash(ownerKeyHash, currency)
        : null;
      const accountId = existing?.id ?? `sv_${input.kind}_${crypto.randomUUID()}`;
      const giftCardCode = input.kind === 'gift_card' ? generateGiftCardCode() : undefined;
      if (input.kind === 'store_credit' && !/^[a-f0-9]{64}$/.test(ownerKeyHash ?? '')) {
        throw new RangeError('ownerKeyHash inválido; debe proceder de una identidad de servidor.');
      }
      if (input.kind === 'gift_card' && ownerKeyHash !== undefined) {
        throw new RangeError('Una tarjeta regalo no acepta identidad de cliente.');
      }
      const entry = createAuditEntry(identity, {
        actor: { kind: 'admin', id: 'admin:stored-value' },
        action: existing ? 'payments.store_credit_credited' : 'payments.stored_value_issued',
        entity: { type: 'stored_value_account', id: accountId },
        diff: createAuditDiff(
          { balance_cents: existing?.balance_cents ?? 0, version: existing?.version ?? null },
          { balance_cents: (existing?.balance_cents ?? 0) + input.amountCents,
            version: (existing?.version ?? 1) + 1 },
          ['balance_cents', 'version'],
        ),
      });
      const mutations = existing
        ? stored.creditStatements(existing, input.amountCents, input.idempotencyKey,
          identity.occurred_at, { schema: 1, source: policy.funding,
            legal_review_reference: policy.legal_review_reference })
        : stored.issueStatements({
          id: accountId, kind: input.kind, label: input.label, currency,
          amountCents: input.amountCents,
          ...(giftCardCode === undefined ? {} : { codeHash: await giftCardCodeHash(giftCardCode) }),
          ...(ownerKeyHash === undefined ? {} : { ownerKeyHash }),
          expiresAt: input.expiresAt, policy, idempotencyKey: input.idempotencyKey,
          occurredAt: identity.occurred_at,
        });
      const results = await db.batch([auditStatement(db, entry), ...mutations]);
      if (results.some((result) => result.meta.changes !== 1)) return { outcome: 'conflict' };
      return { outcome: 'applied', accountId,
        ...(giftCardCode === undefined ? {} : { giftCardCode }) };
    },

    async changeState(
      id: string,
      expectedVersion: number,
      state: StoredValueState,
    ): Promise<'applied' | 'not-found' | 'conflict'> {
      const account = await stored.findById(id);
      if (!account) return 'not-found';
      if (account.version !== expectedVersion) return 'conflict';
      let mutation: D1PreparedStatement;
      try {
        mutation = stored.stateStatement(account, state, new Date().toISOString());
      } catch (error) {
        if (error instanceof RangeError) return 'conflict';
        throw error;
      }
      const identity = reserveIdentity();
      const entry = createAuditEntry(identity, {
        actor: { kind: 'admin', id: 'admin:stored-value' },
        action: 'payments.stored_value_state_changed',
        entity: { type: 'stored_value_account', id },
        diff: createAuditDiff({ state: account.state, version: account.version },
          { state, version: account.version + 1 }, ['state', 'version']),
      });
      const results = await db.batch([auditStatement(db, entry), mutation]);
      return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1 ? 'applied' : 'conflict';
    },
  });
}

export type StoredValueOperations = ReturnType<typeof createStoredValueOperations>;

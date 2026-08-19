import type {
  CustomerAuthRateLimitOutcome,
  CustomerAuthRateLimitRepository,
} from '../application/passwordless-auth-ports';

type ThrottleRow = Readonly<{
  idempotency_key: string;
  scope: 'contact_start' | 'challenge_failure';
  subject_digest: string;
  decision: 'accepted' | 'limited';
  short_window_count: number;
  daily_window_count: number;
  occurred_at: string;
  expires_at: string;
}>;

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const OPAQUE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[_:-][a-z0-9]+)+$/u;
const DAY_MS = 24 * 60 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

export class CustomerAuthRateLimitConflictError extends Error {
  readonly code = 'customer_auth_rate_limit_persistence_conflict';

  constructor() {
    super('El límite durable de autenticación no pudo confirmarse.');
    this.name = 'CustomerAuthRateLimitConflictError';
  }
}

function conflict(): never {
  throw new CustomerAuthRateLimitConflictError();
}

function digest(value: string): string {
  if (!HASH_PATTERN.test(value)) return conflict();
  return value;
}

function key(value: string): string {
  if (value.length < 8 || value.length > 160 || !OPAQUE_ID_PATTERN.test(value)) {
    return conflict();
  }
  return value;
}

function instant(value: string): Readonly<{ value: string; milliseconds: number }> {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    return conflict();
  }
  return Object.freeze({ value, milliseconds });
}

function expiry(
  occurredAt: Readonly<{ value: string; milliseconds: number }>,
  expiresAt: string,
  exactDay: boolean,
): string {
  const expiration = instant(expiresAt);
  const duration = expiration.milliseconds - occurredAt.milliseconds;
  if (duration <= 0 || duration > DAY_MS || (exactDay && duration !== DAY_MS)) {
    return conflict();
  }
  return expiration.value;
}

function firstBatchRow<T>(result: D1Result<unknown> | undefined): T | null {
  const row = result?.results?.[0];
  return row === undefined ? null : row as T;
}

function sameInput(
  row: ThrottleRow,
  input: Readonly<{
    scope: ThrottleRow['scope'];
    subjectDigest: string;
    occurredAt: string;
    expiresAt: string;
    idempotencyKey: string;
  }>,
): boolean {
  return row.scope === input.scope &&
    row.subject_digest === input.subjectDigest &&
    row.occurred_at === input.occurredAt &&
    row.expires_at === input.expiresAt &&
    row.idempotency_key === input.idempotencyKey;
}

function outcome(row: ThrottleRow, replayed: boolean): CustomerAuthRateLimitOutcome {
  return Object.freeze({
    outcome: replayed ? 'replayed' : row.decision,
    limited: row.decision === 'limited',
  });
}

/**
 * Ventanas deslizantes exactas sobre D1. Cada decisión se inserta y lee en una
 * sola batch transaccional; la clave idempotente congela también sus contadores.
 */
export function createD1CustomerAuthRateLimitRepository(
  db: D1Database,
): CustomerAuthRateLimitRepository {
  async function recordContactStart(input: Readonly<{
    contactIdentityHash: string;
    occurredAt: string;
    expiresAt: string;
    idempotencyKey: string;
  }>) {
    const subjectDigest = digest(input.contactIdentityHash);
    const occurred = instant(input.occurredAt);
    const expiresAt = expiry(occurred, input.expiresAt, true);
    const idempotencyKey = key(input.idempotencyKey);
    const cutoff15m = new Date(occurred.milliseconds - FIFTEEN_MINUTES_MS).toISOString();
    const cutoff24h = new Date(occurred.milliseconds - DAY_MS).toISOString();
    const normalized = Object.freeze({
      scope: 'contact_start' as const,
      subjectDigest,
      occurredAt: occurred.value,
      expiresAt,
      idempotencyKey,
    });
    try {
      const results = await db.batch([
        db.prepare(`DELETE FROM customer_auth_throttle_events
          WHERE expires_at <= ?`).bind(occurred.value),
        db.prepare(`INSERT OR IGNORE INTO customer_auth_throttle_events (
          idempotency_key, scope, subject_digest, decision,
          short_window_count, daily_window_count, occurred_at, expires_at
        ) SELECT ?, 'contact_start', ?,
          CASE WHEN
            (SELECT count(*) + 1 FROM customer_auth_throttle_events
              WHERE scope = 'contact_start' AND subject_digest = ?
                AND occurred_at > ? AND occurred_at <= ?) > 3
            OR
            (SELECT count(*) + 1 FROM customer_auth_throttle_events
              WHERE scope = 'contact_start' AND subject_digest = ?
                AND occurred_at > ? AND occurred_at <= ?) > 10
          THEN 'limited' ELSE 'accepted' END,
          (SELECT count(*) + 1 FROM customer_auth_throttle_events
            WHERE scope = 'contact_start' AND subject_digest = ?
              AND occurred_at > ? AND occurred_at <= ?),
          (SELECT count(*) + 1 FROM customer_auth_throttle_events
            WHERE scope = 'contact_start' AND subject_digest = ?
              AND occurred_at > ? AND occurred_at <= ?),
          ?, ?`).bind(
          idempotencyKey, subjectDigest,
          subjectDigest, cutoff15m, occurred.value,
          subjectDigest, cutoff24h, occurred.value,
          subjectDigest, cutoff15m, occurred.value,
          subjectDigest, cutoff24h, occurred.value,
          occurred.value, expiresAt,
        ),
        db.prepare(`SELECT idempotency_key, scope, subject_digest, decision,
          short_window_count, daily_window_count, occurred_at, expires_at
          FROM customer_auth_throttle_events WHERE idempotency_key = ?`)
          .bind(idempotencyKey),
      ]);
      const row = firstBatchRow<ThrottleRow>(results[2]);
      if (row === null || !sameInput(row, normalized)) return conflict();
      const replayed = results[1]?.meta.changes !== 1;
      return Object.freeze({
        ...outcome(row, replayed),
        count15m: row.short_window_count,
        count24h: row.daily_window_count,
      });
    } catch (error) {
      if (error instanceof CustomerAuthRateLimitConflictError) throw error;
      return conflict();
    }
  }

  async function recordChallengeFailure(input: Readonly<{
    challengeDigest: string;
    occurredAt: string;
    expiresAt: string;
    idempotencyKey: string;
  }>) {
    const subjectDigest = digest(input.challengeDigest);
    const occurred = instant(input.occurredAt);
    const expiresAt = expiry(occurred, input.expiresAt, false);
    const idempotencyKey = key(input.idempotencyKey);
    const normalized = Object.freeze({
      scope: 'challenge_failure' as const,
      subjectDigest,
      occurredAt: occurred.value,
      expiresAt,
      idempotencyKey,
    });
    try {
      const results = await db.batch([
        db.prepare(`DELETE FROM customer_auth_throttle_events
          WHERE expires_at <= ?`).bind(occurred.value),
        db.prepare(`INSERT OR IGNORE INTO customer_auth_throttle_events (
          idempotency_key, scope, subject_digest, decision,
          short_window_count, daily_window_count, occurred_at, expires_at
        ) SELECT ?, 'challenge_failure', ?,
          CASE WHEN
            (SELECT count(*) + 1 FROM customer_auth_throttle_events
              WHERE scope = 'challenge_failure' AND subject_digest = ?
                AND expires_at > ?) >= 5
          THEN 'limited' ELSE 'accepted' END,
          (SELECT count(*) + 1 FROM customer_auth_throttle_events
            WHERE scope = 'challenge_failure' AND subject_digest = ?
              AND expires_at > ?),
          (SELECT count(*) + 1 FROM customer_auth_throttle_events
            WHERE scope = 'challenge_failure' AND subject_digest = ?
              AND expires_at > ?),
          ?, ?`).bind(
          idempotencyKey, subjectDigest,
          subjectDigest, occurred.value,
          subjectDigest, occurred.value,
          subjectDigest, occurred.value,
          occurred.value, expiresAt,
        ),
        db.prepare(`SELECT idempotency_key, scope, subject_digest, decision,
          short_window_count, daily_window_count, occurred_at, expires_at
          FROM customer_auth_throttle_events WHERE idempotency_key = ?`)
          .bind(idempotencyKey),
      ]);
      const row = firstBatchRow<ThrottleRow>(results[2]);
      if (row === null || !sameInput(row, normalized)) return conflict();
      const replayed = results[1]?.meta.changes !== 1;
      return Object.freeze({
        ...outcome(row, replayed),
        failures: row.short_window_count,
      });
    } catch (error) {
      if (error instanceof CustomerAuthRateLimitConflictError) throw error;
      return conflict();
    }
  }

  async function challengeFailureState(input: Readonly<{
    challengeDigest: string;
    at: string;
  }>): Promise<Readonly<{ limited: boolean; failures: number }>> {
    const challengeDigest = digest(input.challengeDigest);
    const at = instant(input.at).value;
    try {
      const results = await db.batch([
        db.prepare(`DELETE FROM customer_auth_throttle_events
          WHERE expires_at <= ?`).bind(at),
        db.prepare(`SELECT count(*) AS total FROM customer_auth_throttle_events
          WHERE scope = 'challenge_failure' AND subject_digest = ?
            AND expires_at > ?`).bind(challengeDigest, at),
      ]);
      const failures = Number(firstBatchRow<{ total: number }>(results[1])?.total ?? 0);
      if (!Number.isSafeInteger(failures) || failures < 0) return conflict();
      return Object.freeze({ limited: failures >= 5, failures });
    } catch (error) {
      if (error instanceof CustomerAuthRateLimitConflictError) throw error;
      return conflict();
    }
  }

  async function purgeExpired(at: string): Promise<number> {
    const instantAt = instant(at).value;
    try {
      const result = await db.prepare(`DELETE FROM customer_auth_throttle_events
        WHERE expires_at <= ?`).bind(instantAt).run();
      return result.meta.changes ?? 0;
    } catch {
      return conflict();
    }
  }

  return Object.freeze({
    recordContactStart,
    recordChallengeFailure,
    challengeFailureState,
    purgeExpired,
  });
}

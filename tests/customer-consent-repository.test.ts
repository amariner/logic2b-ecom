import { describe, expect, it } from 'vitest';
import {
  ConsentConflictError,
  createD1ConsentRepository,
  type GrantConsentCommand,
  type WithdrawConsentCommand,
} from '../src/modules/customers';
import { SqliteD1 } from './sqlite-d1';

const PROFILE_SUBJECT = { kind: 'customer_profile', id: 'cus_consent_a' } as const;
const SCOPE = { channel: 'email', purposeId: 'marketing.newsletter' } as const;
const AT = '2026-08-17T12:00:00.000Z';

function insertProfile(db: SqliteD1): void {
  db.sqlite.prepare(`INSERT INTO customer_profiles (
    id, primary_email, email_identity_hash, status, version, created_at, updated_at
  ) VALUES ('cus_consent_a', 'consent@example.com', ?, 'active', 1, ?, ?)`)
    .run('a'.repeat(64), AT, AT);
}

function grant(overrides: Partial<GrantConsentCommand> = {}): GrantConsentCommand {
  return {
    action: 'grant',
    affirmed: true,
    evidenceId: 'consent_ev_001',
    subject: PROFILE_SUBJECT,
    scope: SCOPE,
    legalNotice: { noticeId: 'privacy.marketing', version: '2026-08-17' },
    source: { kind: 'storefront', reference: 'form_footer' },
    region: 'ES',
    occurredAt: AT,
    recordedAt: '2026-08-17T12:00:01.000Z',
    expectedVersion: 0,
    idempotencyKey: 'idem:consent:grant:001',
    ...overrides,
  };
}

function withdraw(overrides: Partial<WithdrawConsentCommand> = {}): WithdrawConsentCommand {
  return {
    action: 'withdraw',
    evidenceId: 'consent_ev_002',
    subject: PROFILE_SUBJECT,
    scope: SCOPE,
    source: { kind: 'storefront', reference: 'center_preferences' },
    region: 'ES',
    occurredAt: '2026-08-17T13:00:00.000Z',
    recordedAt: '2026-08-17T13:00:01.000Z',
    expectedVersion: 1,
    idempotencyKey: 'idem:consent:withdraw:001',
    ...overrides,
  };
}

describe('repositorio D1 de consentimiento R5.2', () => {
  it('persiste y relee evidencia de perfil por alcance y versión', async () => {
    const db = new SqliteD1();
    insertProfile(db);
    const repository = createD1ConsentRepository(db.asD1());

    const result = await repository.append(grant());

    expect(result).toMatchObject({ outcome: 'appended', state: { status: 'granted', version: 1 } });
    expect(await repository.history(PROFILE_SUBJECT, SCOPE)).toEqual([result.evidence]);
    expect(await repository.current(PROFILE_SUBJECT, SCOPE)).toMatchObject({
      status: 'granted', version: 1, currentGrant: result.evidence,
    });
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('hace converger dos retries guest concurrentes en una sola evidencia', async () => {
    const db = new SqliteD1();
    const repository = createD1ConsentRepository(db.asD1());
    const command = grant({
      subject: { kind: 'contact_identity', id: 'b'.repeat(64) },
      evidenceId: 'consent_guest_001',
      idempotencyKey: 'idem:consent:guest:001',
    });

    const outcomes = await Promise.all([repository.append(command), repository.append(command)]);

    expect(outcomes.map(({ outcome }) => outcome).toSorted()).toEqual(['appended', 'replayed']);
    expect(outcomes[0]!.evidence).toEqual(outcomes[1]!.evidence);
    expect(db.value('SELECT count(*) AS value FROM customer_consent_evidence')).toBe(1);
  });

  it('deja un solo ganador cuando dos comandos distintos compiten por la versión', async () => {
    const db = new SqliteD1();
    insertProfile(db);
    const repository = createD1ConsentRepository(db.asD1());
    const attempts = await Promise.allSettled([
      repository.append(grant()),
      repository.append(grant({
        evidenceId: 'consent_ev_rival',
        source: { kind: 'operator', reference: 'operator_admin' },
        idempotencyKey: 'idem:consent:grant:rival',
      })),
    ]);

    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(attempts.find(({ status }) => status === 'rejected'))
      .toMatchObject({ reason: expect.any(ConsentConflictError) });
    expect(db.value('SELECT count(*) AS value FROM customer_consent_evidence')).toBe(1);
  });

  it('retira, reconsiente y reproduce cada comando sin duplicar filas', async () => {
    const db = new SqliteD1();
    insertProfile(db);
    const repository = createD1ConsentRepository(db.asD1());
    const grantCommand = grant();
    const first = await repository.append(grantCommand);
    const second = await repository.append(withdraw());
    const thirdCommand = grant({
      evidenceId: 'consent_ev_003',
      legalNotice: { noticeId: 'privacy.marketing', version: '2026-09-01' },
      occurredAt: '2026-09-01T09:00:00.000Z',
      recordedAt: '2026-09-01T09:00:01.000Z',
      expectedVersion: 2,
      idempotencyKey: 'idem:consent:grant:002',
    });
    const third = await repository.append(thirdCommand);

    expect(await repository.append(grantCommand)).toMatchObject({ outcome: 'replayed' });
    expect(await repository.append(thirdCommand)).toMatchObject({ outcome: 'replayed' });
    expect(first.evidence.action).toBe('granted');
    expect(second.evidence).toMatchObject({
      action: 'withdrawn', withdrawsEvidenceId: first.evidence.id,
    });
    expect(third.state).toMatchObject({ status: 'granted', version: 3 });
    expect(db.value('SELECT count(*) AS value FROM customer_consent_evidence')).toBe(3);
  });

  it('enmascara conflictos D1 sin incluir contacto, HMAC o detalles internos', async () => {
    const db = new SqliteD1();
    const repository = createD1ConsentRepository(db.asD1());
    const contactHash = 'c'.repeat(64);
    let error: unknown;
    try {
      await repository.append(grant({
        subject: { kind: 'customer_profile', id: 'cus_missing' },
        idempotencyKey: 'idem:consent:missing:001',
      }));
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ConsentConflictError);
    const message = error instanceof Error ? error.message : String(error);
    expect(message).toBe('La operación de consentimiento no pudo confirmarse.');
    expect(message).not.toContain('consent@example.com');
    expect(message).not.toContain(contactHash);
    expect(message).not.toContain('customer_consent_profile_conflict');
  });
});

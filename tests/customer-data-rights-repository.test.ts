import { describe, expect, it } from 'vitest';
import {
  DataRightsConflictError,
  createD1DataRightsRepository,
  type DataRightsCommand,
  type DataRightsPlan,
} from '../src/modules/customers';
import { SqliteD1 } from './sqlite-d1';

const HASH = 'b'.repeat(64);
const TIMES = [
  '2026-08-18T08:00:00.000Z',
  '2026-08-18T08:01:00.000Z',
  '2026-08-18T08:02:00.000Z',
] as const;

function insertProfile(db: SqliteD1): void {
  db.sqlite.prepare(`INSERT INTO customer_profiles (
    id, primary_email, email_identity_hash, status, version, created_at, updated_at
  ) VALUES ('profile:rights:1', 'private@example.com', ?, 'active', 1, ?, ?)`)
    .run('a'.repeat(64), TIMES[0], TIMES[0]);
}

function requested(overrides: Partial<DataRightsCommand> = {}): DataRightsCommand {
  return {
    evidenceId: 'evidence:rights:1',
    requestId: 'request:rights:1',
    subject: { kind: 'customer_profile', id: 'profile:rights:1' },
    requestKind: 'access',
    actorId: 'actor:requester:1',
    occurredAt: TIMES[0],
    recordedAt: TIMES[0],
    expectedVersion: 0,
    idempotencyKey: 'idem:rights:requested:1',
    action: 'requested',
    requestPayloadReference: null,
    ...overrides,
  } as DataRightsCommand;
}

function verified(overrides: Partial<DataRightsCommand> = {}): DataRightsCommand {
  return {
    evidenceId: 'evidence:rights:2',
    requestId: 'request:rights:1',
    subject: { kind: 'customer_profile', id: 'profile:rights:1' },
    requestKind: 'access',
    actorId: 'actor:verifier:1',
    occurredAt: TIMES[1],
    recordedAt: TIMES[1],
    expectedVersion: 1,
    idempotencyKey: 'idem:rights:verified:1',
    action: 'identity_verified',
    methodId: 'method:account_session',
    evidenceReference: 'proof:session:1',
    ...overrides,
  } as DataRightsCommand;
}

function plan(): DataRightsPlan {
  return {
    id: 'plan:rights:1',
    mode: 'dry_run',
    fingerprint: HASH,
    createdBy: 'actor:planner:1',
    createdAt: '2026-08-18T08:01:30.000Z',
    decisions: [
      {
        ownerId: 'orders:snapshots',
        operation: 'retain',
        policyReasonId: 'policy:fiscal_retention',
        payloadReference: null,
      },
      {
        ownerId: 'customers:profiles',
        operation: 'export',
        policyReasonId: 'policy:subject_access',
        payloadReference: null,
      },
    ],
  };
}

describe('repositorio D1 de derechos de datos R5.3b', () => {
  it('persiste y reconstruye solicitud, verificación y plan normalizado por requestId', async () => {
    const db = new SqliteD1();
    insertProfile(db);
    const repository = createD1DataRightsRepository(db.asD1());

    expect(await repository.append(requested())).toMatchObject({
      outcome: 'appended', state: { status: 'verification_pending', version: 1 },
    });
    expect(await repository.append(verified())).toMatchObject({
      outcome: 'appended', state: { status: 'verified', version: 2 },
    });
    const attached: DataRightsCommand = {
      evidenceId: 'evidence:rights:3',
      requestId: 'request:rights:1',
      subject: { kind: 'customer_profile', id: 'profile:rights:1' },
      requestKind: 'access',
      actorId: 'actor:planner:1',
      occurredAt: TIMES[2],
      recordedAt: TIMES[2],
      expectedVersion: 2,
      idempotencyKey: 'idem:rights:plan:1',
      action: 'plan_attached',
      plan: plan(),
    };
    expect(await repository.append(attached)).toMatchObject({
      outcome: 'appended', state: { status: 'planned', version: 3 },
    });

    const history = await repository.history('request:rights:1');
    expect(history).toHaveLength(3);
    expect(history[2]?.details).toMatchObject({
      action: 'plan_attached',
      plan: {
        decisions: [
          { ownerId: 'customers:profiles', operation: 'export' },
          { ownerId: 'orders:snapshots', operation: 'retain' },
        ],
      },
    });
    expect(db.value('SELECT count(*) AS value FROM customer_data_rights_plan_decisions')).toBe(2);
    expect(JSON.stringify(history)).not.toContain('private@example.com');
  });

  it('reproduce un retry idéntico y rechaza reutilizar su clave con otro comando', async () => {
    const db = new SqliteD1();
    insertProfile(db);
    const repository = createD1DataRightsRepository(db.asD1());
    const command = requested();

    expect((await repository.append(command)).outcome).toBe('appended');
    expect((await repository.append(command)).outcome).toBe('replayed');
    await expect(repository.append(requested({ actorId: 'actor:other:1' })))
      .rejects.toBeInstanceOf(DataRightsConflictError);
    expect(db.value('SELECT count(*) AS value FROM customer_data_rights_evidence')).toBe(1);
  });

  it('deja un único ganador cuando dos escritores compiten por la misma versión', async () => {
    const db = new SqliteD1();
    insertProfile(db);
    const repository = createD1DataRightsRepository(db.asD1());
    await repository.append(requested());

    const outcomes = await Promise.allSettled([
      repository.append(verified()),
      repository.append(verified({
        evidenceId: 'evidence:rights:rival',
        actorId: 'actor:verifier:2',
        idempotencyKey: 'idem:rights:verified:rival',
        evidenceReference: 'proof:session:rival',
      })),
    ]);

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(db.value('SELECT count(*) AS value FROM customer_data_rights_evidence')).toBe(2);
    expect(await repository.current('request:rights:1')).toMatchObject({
      status: 'verified', version: 2,
    });
  });

  it('admite una identidad guest HMAC sin búsquedas por email', async () => {
    const db = new SqliteD1();
    const repository = createD1DataRightsRepository(db.asD1());
    const contactHash = 'c'.repeat(64);
    await repository.append(requested({
      evidenceId: 'evidence:guest:1',
      requestId: 'request:guest:1',
      subject: { kind: 'contact_identity', id: contactHash },
      idempotencyKey: 'idem:rights:guest:1',
    }));

    expect(await repository.current('request:guest:1')).toMatchObject({
      subject: { kind: 'contact_identity', id: contactHash },
      status: 'verification_pending',
    });
    expect(db.value(`SELECT count(*) AS value FROM customer_data_rights_evidence
      WHERE customer_profile_id IS NULL AND contact_identity_hash='${contactHash}'`)).toBe(1);
  });

  it('devuelve conflictos estables sin filtrar PII, referencias, claves o SQL', async () => {
    const db = new SqliteD1();
    insertProfile(db);
    const repository = createD1DataRightsRepository(db.asD1());
    await repository.append(requested());

    const message = await repository.append(verified({
      expectedVersion: 0,
      evidenceReference: 'proof:private:1',
      idempotencyKey: 'idem:rights:private:1',
    })).catch((error: unknown) => error instanceof Error ? error.message : String(error));
    expect(message).toBe('La operación de derechos de datos no pudo confirmarse.');
    expect(message).not.toContain('private@example.com');
    expect(message).not.toContain('proof:private:1');
    expect(message).not.toContain('idem:rights:private:1');
    expect(message).not.toContain('customer_data_rights_version_conflict');
  });
});

import { describe, expect, it } from 'vitest';
import {
  dataRightsState,
  recordDataRightsEvidence,
  type DataRightsCommand,
  type DataRightsEvidence,
  type DataRightsEvidenceDetails,
  type DataRightsPlan,
} from '../src/modules/customers';

const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);
const TIMES = [
  '2026-08-17T08:00:00.000Z',
  '2026-08-17T08:01:00.000Z',
  '2026-08-17T08:02:00.000Z',
  '2026-08-17T08:03:00.000Z',
  '2026-08-17T08:04:00.000Z',
  '2026-08-17T08:05:00.000Z',
] as const;

function command(
  history: readonly DataRightsEvidence[],
  details: DataRightsEvidenceDetails,
  overrides: Partial<DataRightsCommand> = {},
): DataRightsCommand {
  const sequence = history.length + 1;
  return {
    evidenceId: `evidence:${sequence}`,
    requestId: 'request:data:1',
    subject: { kind: 'customer_profile', id: 'profile:1' },
    requestKind: 'access',
    actorId: 'actor:requester',
    occurredAt: TIMES[sequence - 1]!,
    recordedAt: TIMES[sequence - 1]!,
    expectedVersion: history.length,
    idempotencyKey: `rights-command-${sequence}`,
    ...details,
    ...overrides,
  } as DataRightsCommand;
}

function append(
  history: DataRightsEvidence[],
  details: DataRightsEvidenceDetails,
  overrides: Partial<DataRightsCommand> = {},
): DataRightsEvidence {
  const outcome = recordDataRightsEvidence(history, command(history, details, overrides));
  history.push(outcome.evidence);
  return outcome.evidence;
}

function verifiedHistory(requestKind: 'access' | 'rectification' = 'access'): DataRightsEvidence[] {
  const history: DataRightsEvidence[] = [];
  append(history, {
    action: 'requested',
    requestPayloadReference: requestKind === 'rectification' ? 'vault:correction:1' : null,
  }, { requestKind });
  append(history, {
    action: 'identity_verified',
    methodId: 'method:account_session',
    evidenceReference: 'proof:session:1',
  }, { requestKind, actorId: 'actor:verifier' });
  return history;
}

function plan(overrides: Partial<DataRightsPlan> = {}): DataRightsPlan {
  return {
    id: 'plan:rights:1',
    mode: 'dry_run',
    fingerprint: HASH,
    createdBy: 'actor:planner',
    createdAt: TIMES[1],
    decisions: [
      { ownerId: 'orders:snapshots', operation: 'retain', policyReasonId: 'policy:fiscal_retention', payloadReference: null },
      { ownerId: 'customers:profiles', operation: 'export', policyReasonId: 'policy:subject_access', payloadReference: null },
    ],
    ...overrides,
  };
}

describe('derechos de datos R5.3a', () => {
  it('recibe y verifica una solicitud sin almacenar PII en el contrato', () => {
    const history = verifiedHistory('rectification');
    const state = dataRightsState(history);

    expect(state).toMatchObject({
      status: 'verified',
      requestKind: 'rectification',
      requestPayloadReference: 'vault:correction:1',
      verification: {
        methodId: 'method:account_session',
        evidenceReference: 'proof:session:1',
        verifiedBy: 'actor:verifier',
      },
    });
    expect(JSON.stringify(history)).not.toContain('@');
  });

  it('rechaza rectificación sin referencia opaca y plan antes de verificar', () => {
    expect(() => recordDataRightsEvidence([], command([], {
      action: 'requested', requestPayloadReference: null,
    }, { requestKind: 'rectification' }))).toThrow(/rectificación exige payloadReference/i);

    const history: DataRightsEvidence[] = [];
    append(history, { action: 'requested', requestPayloadReference: null });
    expect(() => recordDataRightsEvidence(history, command(history, {
      action: 'plan_attached', plan: plan(),
    }))).toThrow(/Plan antes de verificar/i);
  });

  it('acota el instante del dry-run y normaliza un propietario único', () => {
    const history = verifiedHistory();
    const attached = append(history, { action: 'plan_attached', plan: plan() }, {
      actorId: 'actor:planner',
    });
    expect(attached.details.action === 'plan_attached' &&
      attached.details.plan.decisions.map(({ ownerId }) => ownerId))
      .toEqual(['customers:profiles', 'orders:snapshots']);

    const duplicateOwner = plan({ decisions: [
      { ownerId: 'customers:profiles', operation: 'export', policyReasonId: 'policy:access', payloadReference: null },
      { ownerId: 'customers:profiles', operation: 'retain', policyReasonId: 'policy:retention', payloadReference: null },
    ] });
    expect(() => recordDataRightsEvidence(verifiedHistory(), command(verifiedHistory(), {
      action: 'plan_attached', plan: duplicateOwner,
    }))).toThrow(/propietarios únicos/i);

    const futurePlan = plan({ createdAt: TIMES[3] });
    const verified = verifiedHistory();
    expect(() => recordDataRightsEvidence(verified, command(verified, {
      action: 'plan_attached', plan: futurePlan,
    }))).toThrow(/entre la verificación y su evidencia/i);

    const preVerificationPlan = plan({ createdAt: TIMES[0] });
    expect(() => recordDataRightsEvidence(verified, command(verified, {
      action: 'plan_attached', plan: preVerificationPlan,
    }))).toThrow(/entre la verificación y su evidencia/i);
  });

  it('exige doble control y bloquea planes con revisión manual', () => {
    const sameActor = verifiedHistory();
    append(sameActor, { action: 'plan_attached', plan: plan() }, { actorId: 'actor:planner' });
    expect(() => recordDataRightsEvidence(sameActor, command(sameActor, {
      action: 'plan_approved', planFingerprint: HASH,
    }, { actorId: 'actor:planner' }))).toThrow(/doble control/i);

    const manual = verifiedHistory();
    append(manual, { action: 'plan_attached', plan: plan({ decisions: [{
      ownerId: 'payments:ledger', operation: 'manual_review',
      policyReasonId: 'policy:legal_review', payloadReference: null,
    }] }) }, { actorId: 'actor:planner' });
    expect(() => recordDataRightsEvidence(manual, command(manual, {
      action: 'plan_approved', planFingerprint: HASH,
    }, { actorId: 'actor:approver' }))).toThrow(/revisión manual/i);
  });

  it('liga aprobación, ejecución y artefactos al fingerprint revisado', () => {
    const history = verifiedHistory();
    append(history, { action: 'plan_attached', plan: plan() }, { actorId: 'actor:planner' });
    append(history, { action: 'plan_approved', planFingerprint: HASH }, { actorId: 'actor:approver' });

    expect(() => recordDataRightsEvidence(history, command(history, {
      action: 'execution_started', planFingerprint: OTHER_HASH,
    }, { actorId: 'actor:executor' }))).toThrow(/plan aprobado coincidente/i);

    append(history, { action: 'execution_started', planFingerprint: HASH }, { actorId: 'actor:executor' });
    append(history, {
      action: 'completed', planFingerprint: HASH,
      artifactReferences: ['artifact:export:1'],
    }, { actorId: 'actor:executor' });
    expect(dataRightsState(history)).toMatchObject({
      status: 'completed',
      approvedBy: 'actor:approver',
      approvedPlanFingerprint: HASH,
      artifactReferences: ['artifact:export:1'],
      version: 6,
    });
  });

  it('reproduce retries idénticos y rechaza clave o versión conflictivas', () => {
    const first = command([], { action: 'requested', requestPayloadReference: null });
    const appended = recordDataRightsEvidence([], first);
    expect(recordDataRightsEvidence([appended.evidence], first)).toMatchObject({ outcome: 'replayed' });

    expect(() => recordDataRightsEvidence([appended.evidence], {
      ...first, actorId: 'actor:different',
    })).toThrow(/Conflicto de idempotencia/i);
    expect(() => recordDataRightsEvidence([appended.evidence], command([appended.evidence], {
      action: 'identity_verified', methodId: 'method:session', evidenceReference: 'proof:session:2',
    }, { expectedVersion: 0 }))).toThrow(/Conflicto de versión/i);
  });

  it('rechaza contexto mezclado y tiempo regresivo', () => {
    const history = verifiedHistory();
    expect(() => recordDataRightsEvidence(history, command(history, {
      action: 'plan_attached', plan: plan(),
    }, { requestId: 'request:data:other' }))).toThrow(/mezcla solicitudes o sujetos/i);
    expect(() => recordDataRightsEvidence(history, command(history, {
      action: 'plan_attached', plan: plan(),
    }, { occurredAt: TIMES[0], recordedAt: TIMES[2] }))).toThrow(/retroceder en el tiempo/i);
  });
});

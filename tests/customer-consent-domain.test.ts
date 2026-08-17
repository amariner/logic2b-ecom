import { describe, expect, it } from 'vitest';
import {
  communicationDecision,
  consentState,
  recordConsent,
  type ConsentEvidence,
  type ConsentScope,
  type ConsentSubject,
  type GrantConsentCommand,
  type WithdrawConsentCommand,
} from '../src/modules/customers';

const subject: ConsentSubject = { kind: 'customer_profile', id: 'profile_01' };
const scope: ConsentScope = { channel: 'email', purposeId: 'marketing.newsletter' };

function grant(overrides: Partial<GrantConsentCommand> = {}): GrantConsentCommand {
  return {
    action: 'grant',
    affirmed: true,
    evidenceId: 'consent_ev_001',
    subject,
    scope,
    legalNotice: { noticeId: 'privacy.marketing', version: '2026-08-17' },
    source: { kind: 'storefront', reference: 'form_footer' },
    region: 'ES',
    occurredAt: '2026-08-17T10:00:00.000Z',
    recordedAt: '2026-08-17T10:00:01.000Z',
    expectedVersion: 0,
    idempotencyKey: 'idem-grant-001',
    ...overrides,
  };
}

function withdraw(overrides: Partial<WithdrawConsentCommand> = {}): WithdrawConsentCommand {
  return {
    action: 'withdraw',
    evidenceId: 'consent_ev_002',
    subject,
    scope,
    source: { kind: 'storefront', reference: 'center_preferences' },
    region: 'ES',
    occurredAt: '2026-08-17T11:00:00.000Z',
    recordedAt: '2026-08-17T11:00:01.000Z',
    expectedVersion: 1,
    idempotencyKey: 'idem-withdraw-001',
    ...overrides,
  };
}

describe('customer consent domain (R5.2)', () => {
  it('requires an affirmative grant and records scoped evidence without direct contact PII', () => {
    const guestGrant = grant({
      subject: { kind: 'contact_identity', id: 'a'.repeat(64) },
    });
    const result = recordConsent([], guestGrant);

    expect(result.outcome).toBe('appended');
    expect(result.state).toMatchObject({ status: 'granted', version: 1 });
    expect(result.evidence).toMatchObject({
      action: 'granted',
      scope,
      legalNotice: { noticeId: 'privacy.marketing', version: '2026-08-17' },
      source: { kind: 'storefront', reference: 'form_footer' },
      region: 'ES',
      withdrawsEvidenceId: null,
    });
    expect(JSON.stringify(result.evidence)).not.toContain('@');
    expect(() => recordConsent([], { ...grant(), affirmed: false } as unknown as GrantConsentCommand))
      .toThrow('afirmarse explícitamente');
  });

  it('keeps channel and purpose independent', () => {
    const smsScope: ConsentScope = { channel: 'sms', purposeId: scope.purposeId };
    const serviceScope: ConsentScope = { channel: 'email', purposeId: 'service.product_updates' };
    const email = recordConsent([], grant()).state;
    const sms = recordConsent([], grant({
      evidenceId: 'consent_ev_sms',
      scope: smsScope,
      idempotencyKey: 'idem-grant-sms',
    })).state;

    expect(email.status).toBe('granted');
    expect(sms.status).toBe('granted');
    expect(consentState([], subject, serviceScope).status).toBe('not_recorded');
    expect(() => consentState([email.lastEvidence!], subject, smsScope))
      .toThrow('mezcla sujetos o finalidades');
  });

  it('withdraws and later reconsents without mutating prior evidence', () => {
    const first = recordConsent([], grant());
    const second = recordConsent([first.evidence], withdraw());
    const third = recordConsent([first.evidence, second.evidence], grant({
      evidenceId: 'consent_ev_003',
      legalNotice: { noticeId: 'privacy.marketing', version: '2026-09-01' },
      occurredAt: '2026-09-01T09:00:00.000Z',
      recordedAt: '2026-09-01T09:00:01.000Z',
      expectedVersion: 2,
      idempotencyKey: 'idem-grant-002',
    }));

    expect(first.evidence).toMatchObject({ action: 'granted', version: 1, withdrawsEvidenceId: null });
    expect(second.evidence).toMatchObject({
      action: 'withdrawn',
      version: 2,
      withdrawsEvidenceId: first.evidence.id,
      legalNotice: first.evidence.legalNotice,
    });
    expect(third.state).toMatchObject({ status: 'granted', version: 3 });
    expect(third.evidence.legalNotice.version).toBe('2026-09-01');
  });

  it('replays an identical idempotent command and rejects a changed request', () => {
    const command = grant();
    const first = recordConsent([], command);
    const replay = recordConsent([first.evidence], command);

    expect(replay).toMatchObject({ outcome: 'replayed', evidence: first.evidence });
    expect(replay.state.version).toBe(1);
    expect(() => recordConsent([first.evidence], {
      ...command,
      evidenceId: 'consent_ev_changed',
    })).toThrow('Conflicto de idempotencia');
    expect(() => recordConsent([first.evidence], {
      ...command,
      expectedVersion: 1,
    })).toThrow('Conflicto de idempotencia');
    expect(() => recordConsent([first.evidence], {
      ...command,
      affirmed: false,
    } as unknown as GrantConsentCommand)).toThrow('Conflicto de idempotencia');
  });

  it('rejects stale versions, time travel and malformed append-only histories', () => {
    const first = recordConsent([], grant());
    expect(() => recordConsent([first.evidence], withdraw({ expectedVersion: 0 })))
      .toThrow('Conflicto de versión');
    expect(() => recordConsent([first.evidence], withdraw({
      occurredAt: '2026-08-17T09:00:00.000Z',
      recordedAt: '2026-08-17T09:00:01.000Z',
    }))).toThrow('retroceder en el tiempo');

    const invalidVersion = { ...first.evidence, version: 2 } as ConsentEvidence;
    expect(() => consentState([invalidVersion], subject, scope))
      .toThrow('Secuencia de consentimiento inválida');
  });

  it('never treats a preference as consent and leaves required transactions independent', () => {
    const missing = consentState([], subject, scope);
    const active = recordConsent([], grant()).state;

    expect(communicationDecision({
      messageClass: 'consent_required', consent: missing, preference: 'subscribed',
    })).toEqual({ allowed: false, authority: 'missing_consent' });
    expect(communicationDecision({
      messageClass: 'consent_required', consent: active, preference: 'unsubscribed',
    })).toEqual({ allowed: false, authority: 'preference_opt_out' });
    expect(communicationDecision({
      messageClass: 'consent_required', consent: active, preference: 'unset',
    })).toEqual({ allowed: true, authority: 'active_consent' });
    expect(communicationDecision({
      messageClass: 'transactional_required', consent: missing, preference: 'unsubscribed',
    })).toEqual({ allowed: true, authority: 'transactional_required' });
  });
});

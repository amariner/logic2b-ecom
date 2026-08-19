import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_AUTH_ATTEMPT_COOKIE_NAME,
  CUSTOMER_AUTH_ATTEMPT_COOKIE_OPTIONS,
  CUSTOMER_AUTH_ATTEMPT_MAX_TTL_MS,
  PASSWORDLESS_PROOF_BYTES,
  createCustomerAuthAttempt,
  createPasswordlessProof,
  customerAuthAttemptCsrfToken,
  customerSessionCsrfToken,
  isPasswordlessProof,
  passwordlessProofDigest,
  verifyCustomerAuthAttempt,
  verifyCustomerSessionCsrfToken,
} from '../src/modules/customers';

const SECRET = 'customer-auth-csrf-secret-for-tests-only-'.repeat(2);
const OTHER_SECRET = 'other-customer-auth-csrf-secret-for-tests-'.repeat(2);
const CHALLENGE = 'auth_challenge:browser:1';
const OTHER_CHALLENGE = 'auth_challenge:browser:2';
const ISSUED_AT = '2026-08-19T08:00:00.000Z';
const EXPIRES_AT = '2026-08-19T08:10:00.000Z';
const DURING_ATTEMPT = '2026-08-19T08:01:00.000Z';

describe('WebCrypto passwordless R5.4d', () => {
  it('genera un proof CSPRNG de 256 bits y solo expone su SHA-256', async () => {
    const first = await createPasswordlessProof();
    const second = await createPasswordlessProof();

    expect(PASSWORDLESS_PROOF_BYTES).toBe(32);
    expect(first.proof).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(first.proofDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.proofDigest).toBe(await passwordlessProofDigest(first.proof));
    expect(second.proof).not.toBe(first.proof);
    expect(second.proofDigest).not.toBe(first.proofDigest);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('rechaza proofs que no sean exactamente 32 bytes base64url canónicos', async () => {
    for (const proof of ['', 'a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}=`, 'á'.repeat(43)]) {
      expect(isPasswordlessProof(proof)).toBe(false);
      await expect(passwordlessProofDigest(proof)).rejects.toThrow(/proof passwordless inválido/i);
    }
  });

  it('emite una cookie host-only firmada sin challenge ni proof y deriva un CSRF separado', async () => {
    const proof = await createPasswordlessProof();
    const attempt = await createCustomerAuthAttempt({
      challengeId: CHALLENGE,
      secret: SECRET,
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
    });
    const csrf = await customerAuthAttemptCsrfToken(SECRET, attempt.cookieValue);

    expect(CUSTOMER_AUTH_ATTEMPT_COOKIE_NAME).toBe('__Host-l2b-customer-auth-attempt');
    expect(CUSTOMER_AUTH_ATTEMPT_COOKIE_OPTIONS).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    expect(CUSTOMER_AUTH_ATTEMPT_COOKIE_OPTIONS).not.toHaveProperty('domain');
    expect(attempt.cookieValue.split('.')).toHaveLength(5);
    expect(attempt.cookieValue).not.toContain(CHALLENGE);
    expect(attempt.cookieValue).not.toContain(proof.proof);
    expect(attempt.cookieValue).not.toContain(SECRET);
    expect(csrf).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(csrf).not.toBe(attempt.cookieValue.split('.').at(-1));
    expect(Object.isFrozen(attempt)).toBe(true);
  });

  it('solo verifica cookie, challenge y CSRF del mismo navegador', async () => {
    const first = await createCustomerAuthAttempt({
      challengeId: CHALLENGE,
      secret: SECRET,
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
    });
    const second = await createCustomerAuthAttempt({
      challengeId: OTHER_CHALLENGE,
      secret: SECRET,
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
    });
    const firstCsrf = await customerAuthAttemptCsrfToken(SECRET, first.cookieValue);
    const secondCsrf = await customerAuthAttemptCsrfToken(SECRET, second.cookieValue);
    const verify = (overrides: Partial<Parameters<typeof verifyCustomerAuthAttempt>[0]> = {}) =>
      verifyCustomerAuthAttempt({
        challengeId: CHALLENGE,
        secret: SECRET,
        cookieValue: first.cookieValue,
        csrfToken: firstCsrf,
        at: DURING_ATTEMPT,
        ...overrides,
      });

    await expect(verify()).resolves.toBe(true);
    await expect(verify({ challengeId: OTHER_CHALLENGE })).resolves.toBe(false);
    await expect(verify({ cookieValue: second.cookieValue })).resolves.toBe(false);
    await expect(verify({ csrfToken: secondCsrf })).resolves.toBe(false);
    await expect(verify({ secret: OTHER_SECRET })).resolves.toBe(false);
    await expect(verify({ cookieValue: '' })).resolves.toBe(false);
  });

  it('falla cerrado ante manipulación, reloj anterior o caducidad', async () => {
    const attempt = await createCustomerAuthAttempt({
      challengeId: CHALLENGE,
      secret: SECRET,
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
    });
    const csrf = await customerAuthAttemptCsrfToken(SECRET, attempt.cookieValue);
    const last = attempt.cookieValue.at(-1)!;
    const tampered = `${attempt.cookieValue.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`;
    const verify = (cookieValue: string, at: string) => verifyCustomerAuthAttempt({
      challengeId: CHALLENGE,
      secret: SECRET,
      cookieValue,
      csrfToken: csrf,
      at,
    });

    await expect(verify(tampered, DURING_ATTEMPT)).resolves.toBe(false);
    await expect(verify(attempt.cookieValue, '2026-08-19T07:59:59.999Z')).resolves.toBe(false);
    await expect(verify(attempt.cookieValue, EXPIRES_AT)).resolves.toBe(false);
  });

  it('impide que la cookie dure más que el challenge de diez minutos', async () => {
    expect(CUSTOMER_AUTH_ATTEMPT_MAX_TTL_MS).toBe(600_000);
    await expect(createCustomerAuthAttempt({
      challengeId: CHALLENGE,
      secret: SECRET,
      issuedAt: ISSUED_AT,
      expiresAt: new Date(Date.parse(ISSUED_AT) + CUSTOMER_AUTH_ATTEMPT_MAX_TTL_MS + 1).toISOString(),
    })).rejects.toThrow(/caducidad del intento inválida/i);
    await expect(createCustomerAuthAttempt({
      challengeId: CHALLENGE,
      secret: 'too-short',
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
    })).rejects.toThrow(/mínimo de seguridad/i);
    await expect(customerAuthAttemptCsrfToken(SECRET, 'malformed')).rejects.toThrow(/cookie de intento inválida/i);
  });

  it('liga el CSRF de sesión a id y generación con un dominio HMAC separado', async () => {
    const subject = { sessionId: 'customer_session:csrf:1', generation: 3 } as const;
    const token = await customerSessionCsrfToken(SECRET, subject);
    const attempt = await createCustomerAuthAttempt({
      challengeId: CHALLENGE,
      secret: SECRET,
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
    });
    const attemptToken = await customerAuthAttemptCsrfToken(SECRET, attempt.cookieValue);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(token).not.toBe(attemptToken);
    await expect(verifyCustomerSessionCsrfToken(SECRET, subject, token)).resolves.toBe(true);
    await expect(verifyCustomerSessionCsrfToken(SECRET, { ...subject, generation: 4 }, token)).resolves.toBe(false);
    await expect(verifyCustomerSessionCsrfToken(
      SECRET,
      { ...subject, sessionId: 'customer_session:csrf:other' },
      token,
    )).resolves.toBe(false);
    await expect(verifyCustomerSessionCsrfToken(OTHER_SECRET, subject, token)).resolves.toBe(false);
    await expect(verifyCustomerSessionCsrfToken(SECRET, subject, 'malformed')).resolves.toBe(false);
  });

  it('rechaza sujetos CSRF de sesión no canónicos', async () => {
    for (const subject of [
      { sessionId: '', generation: 1 },
      { sessionId: 'customer_session:1', generation: 0 },
      { sessionId: 'customer_session:1', generation: 1.5 },
      { sessionId: ' customer_session:1', generation: 1 },
    ]) {
      await expect(customerSessionCsrfToken(SECRET, subject)).rejects.toThrow(/sujeto csrf de sesión inválido/i);
      await expect(verifyCustomerSessionCsrfToken(SECRET, subject, 'a'.repeat(43)))
        .rejects.toThrow(/sujeto csrf de sesión inválido/i);
    }
  });
});

export const PASSWORDLESS_PROOF_BYTES = 32;
export const CUSTOMER_AUTH_ATTEMPT_MAX_TTL_MS = 10 * 60 * 1_000;
export const CUSTOMER_AUTH_ATTEMPT_COOKIE_NAME = '__Host-l2b-customer-auth-attempt';
export const CUSTOMER_AUTH_ATTEMPT_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/' as const,
});

export type PreparedPasswordlessProof = Readonly<{
  proof: string;
  proofDigest: string;
}>;

export type CustomerAuthAttempt = Readonly<{
  cookieValue: string;
  issuedAt: string;
  expiresAt: string;
}>;

const encoder = new TextEncoder();
const BASE64URL_256_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const ATTEMPT_VERSION = 'v1';
const ATTEMPT_DOMAIN = 'logic2b:customer-auth-attempt:v1';
const CSRF_DOMAIN = 'logic2b:customer-auth-csrf:v1';
const SESSION_CSRF_DOMAIN = 'logic2b:customer-session-csrf:v1';
const OPAQUE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[_:-][a-z0-9]+)+$/u;

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (!BASE64URL_256_PATTERN.test(value)) return null;
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes.length === PASSWORDLESS_PROOF_BYTES && base64Url(bytes) === value ? bytes : null;
  } catch {
    return null;
  }
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function random256(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(PASSWORDLESS_PROOF_BYTES));
}

function secureSecret(secret: string): Uint8Array<ArrayBuffer> {
  const bytes = encoder.encode(secret);
  if (bytes.length < 32 || bytes.length > 4_096 || /[\u0000-\u001f\u007f]/u.test(secret)) {
    throw new RangeError('El secreto de autenticación no cumple el mínimo de seguridad.');
  }
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    secureSecret(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function hmac(key: CryptoKey, value: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

function validChallengeId(challengeId: string): boolean {
  return challengeId.length <= 180 && OPAQUE_ID_PATTERN.test(challengeId);
}

function validSessionCsrfSubject(subject: Readonly<{ sessionId: string; generation: number }>): boolean {
  return subject.sessionId.length <= 200 && OPAQUE_ID_PATTERN.test(subject.sessionId) &&
    Number.isSafeInteger(subject.generation) && subject.generation >= 1;
}

function instant(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!value.endsWith('Z') || !Number.isFinite(parsed)) throw new RangeError(`${label} inválido.`);
  return parsed;
}

function attemptMessage(issuedAt: number, expiresAt: number, nonce: string, challengeId: string): string {
  return `${ATTEMPT_DOMAIN}:${issuedAt}:${expiresAt}:${nonce}:${challengeId}`;
}

type ParsedAttempt = Readonly<{
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  signature: Uint8Array<ArrayBuffer>;
}>;

function parseAttempt(cookieValue: string): ParsedAttempt | null {
  if (cookieValue.length > 256 || /[\u0000-\u0020\u007f]/u.test(cookieValue)) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 5 || parts[0] !== ATTEMPT_VERSION ||
      !/^\d{13}$/u.test(parts[1]!) || !/^\d{13}$/u.test(parts[2]!)) {
    return null;
  }
  const issuedAt = Number(parts[1]);
  const expiresAt = Number(parts[2]);
  const nonce = parts[3]!;
  const signature = base64UrlBytes(parts[4]!);
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) ||
      base64UrlBytes(nonce) === null || signature === null) {
    return null;
  }
  return Object.freeze({ issuedAt, expiresAt, nonce, signature });
}

export function isPasswordlessProof(value: string): boolean {
  return base64UrlBytes(value) !== null;
}

export async function passwordlessProofDigest(proof: string): Promise<string> {
  if (!isPasswordlessProof(proof)) throw new RangeError('Proof passwordless inválido.');
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(proof)));
}

export async function createPasswordlessProof(): Promise<PreparedPasswordlessProof> {
  const proof = base64Url(random256());
  return Object.freeze({ proof, proofDigest: await passwordlessProofDigest(proof) });
}

export async function createCustomerAuthAttempt(input: Readonly<{
  challengeId: string;
  secret: string;
  issuedAt: string;
  expiresAt: string;
}>): Promise<CustomerAuthAttempt> {
  if (!validChallengeId(input.challengeId)) throw new RangeError('Challenge de intento inválido.');
  const issuedAt = instant(input.issuedAt, 'Emisión del intento');
  const expiresAt = instant(input.expiresAt, 'Caducidad del intento');
  if (expiresAt <= issuedAt || expiresAt - issuedAt > CUSTOMER_AUTH_ATTEMPT_MAX_TTL_MS) {
    throw new RangeError('Caducidad del intento inválida.');
  }
  const nonce = base64Url(random256());
  const signature = await hmac(await hmacKey(input.secret),
    attemptMessage(issuedAt, expiresAt, nonce, input.challengeId));
  return Object.freeze({
    cookieValue: `${ATTEMPT_VERSION}.${issuedAt}.${expiresAt}.${nonce}.${signature}`,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  });
}

export async function customerAuthAttemptCsrfToken(secret: string, cookieValue: string): Promise<string> {
  if (parseAttempt(cookieValue) === null) throw new RangeError('Cookie de intento inválida.');
  return hmac(await hmacKey(secret), `${CSRF_DOMAIN}:${cookieValue}`);
}

export async function customerSessionCsrfToken(
  secret: string,
  subject: Readonly<{ sessionId: string; generation: number }>,
): Promise<string> {
  if (!validSessionCsrfSubject(subject)) throw new RangeError('Sujeto CSRF de sesión inválido.');
  return hmac(await hmacKey(secret), `${SESSION_CSRF_DOMAIN}:${subject.sessionId}:${subject.generation}`);
}

export async function verifyCustomerSessionCsrfToken(
  secret: string,
  subject: Readonly<{ sessionId: string; generation: number }>,
  csrfToken: string,
): Promise<boolean> {
  if (!validSessionCsrfSubject(subject)) throw new RangeError('Sujeto CSRF de sesión inválido.');
  const signature = base64UrlBytes(csrfToken);
  if (signature === null) return false;
  return crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    signature,
    encoder.encode(`${SESSION_CSRF_DOMAIN}:${subject.sessionId}:${subject.generation}`),
  );
}

export async function verifyCustomerAuthAttempt(input: Readonly<{
  challengeId: string;
  secret: string;
  cookieValue: string;
  csrfToken: string;
  at: string;
}>): Promise<boolean> {
  const key = await hmacKey(input.secret);
  const at = instant(input.at, 'Instante de verificación');
  const attempt = parseAttempt(input.cookieValue);
  const csrf = base64UrlBytes(input.csrfToken);
  if (attempt === null || csrf === null || !validChallengeId(input.challengeId) ||
      attempt.issuedAt > at || attempt.expiresAt <= at ||
      attempt.expiresAt - attempt.issuedAt > CUSTOMER_AUTH_ATTEMPT_MAX_TTL_MS) {
    return false;
  }
  const signatureValid = await crypto.subtle.verify(
    'HMAC',
    key,
    attempt.signature,
    encoder.encode(attemptMessage(attempt.issuedAt, attempt.expiresAt, attempt.nonce, input.challengeId)),
  );
  const csrfValid = await crypto.subtle.verify(
    'HMAC',
    key,
    csrf,
    encoder.encode(`${CSRF_DOMAIN}:${input.cookieValue}`),
  );
  return signatureValid && csrfValid;
}

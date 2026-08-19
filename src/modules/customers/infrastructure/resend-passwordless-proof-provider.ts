import type { PasswordlessProofProvider } from '../application/passwordless-auth-ports';
import { normalizeCustomerEmail } from '../domain/customer-profile';
import {
  CUSTOMER_AUTH_ATTEMPT_MAX_TTL_MS,
  createPasswordlessProof,
  isPasswordlessProof,
  passwordlessProofDigest,
} from './passwordless-web-crypto';

export type ResendPasswordlessTrackingConfig = Readonly<{
  domainId: string;
  domain: string;
  click: false;
  open: false;
  attestationRef: string;
}>;

export type ResendPasswordlessTrackingAttestation = Readonly<{
  provider: 'resend';
  domainId: string;
  domain: string;
  click: false;
  open: false;
  attestationRef: string;
}>;

export type ResendPasswordlessProofProviderConfig = Readonly<{
  apiKey: string;
  origin: `https://${string}`;
  from: Readonly<{
    name: string;
    address: string;
  }>;
  subject: string;
  tracking: ResendPasswordlessTrackingConfig;
  fetcher?: typeof fetch;
  now?: () => number;
}>;

const RESEND_API_ORIGIN = 'https://api.resend.com';
const RESEND_EMAILS_URL = `${RESEND_API_ORIGIN}/emails`;
const METHODS = Object.freeze(['email_magic_link'] as const);
const PROVIDER_REFERENCE_PREFIX = 'resend_magic:';
const CHALLENGE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[_:-][a-z0-9]+)+$/u;
const ATTESTATION_REF_PATTERN = /^[a-z][a-z0-9]*(?:[._:/-][a-z0-9][a-z0-9-]*)+$/u;

export class ResendPasswordlessConfigurationError extends Error {
  readonly code = 'resend_passwordless_configuration_invalid';

  constructor() {
    super('La configuración segura de entrega passwordless no está acreditada.');
    this.name = 'ResendPasswordlessConfigurationError';
  }
}

function configurationError(): never {
  throw new ResendPasswordlessConfigurationError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactHttpsOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.origin === value;
  } catch {
    return false;
  }
}

function canonicalDomain(value: string): boolean {
  if (value.length < 3 || value.length > 253 || value !== value.toLowerCase() || value.includes('..')) return false;
  const labels = value.split('.');
  return labels.length >= 2 && labels.every((label) =>
    label.length >= 1 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label));
}

function apiKey(value: string): boolean {
  return value.length >= 8 && value.length <= 512 && value.trim() === value &&
    !/[\u0000-\u0020\u007f]/u.test(value);
}

function opaqueReference(value: string, maximum = 200): boolean {
  return value.length >= 8 && value.length <= maximum && ATTESTATION_REF_PATTERN.test(value);
}

function challengeId(value: string): boolean {
  return value.length <= 180 && CHALLENGE_ID_PATTERN.test(value);
}

function providerReference(challenge: string): string | null {
  if (!challengeId(challenge)) return null;
  const reference = `${PROVIDER_REFERENCE_PREFIX}${challenge}`;
  return reference.length <= 200 ? reference : null;
}

function challengeFromProviderReference(reference: string): string | null {
  if (!reference.startsWith(PROVIDER_REFERENCE_PREFIX) || reference.length > 200) return null;
  const challenge = reference.slice(PROVIDER_REFERENCE_PREFIX.length);
  return providerReference(challenge) === reference ? challenge : null;
}

function futureExpiry(value: string, now: number): boolean {
  const expiresAt = Date.parse(value);
  return value.endsWith('Z') && Number.isFinite(expiresAt) && Number.isFinite(now) &&
    expiresAt > now && expiresAt - now <= CUSTOMER_AUTH_ATTEMPT_MAX_TTL_MS;
}

function sender(config: ResendPasswordlessProofProviderConfig): Readonly<{ from: string; address: string }> {
  const name = config.from.name.trim();
  if (name !== config.from.name || name.length < 1 || name.length > 120 || /[<>\u0000-\u001f\u007f]/u.test(name)) {
    configurationError();
  }
  let address: string;
  try {
    address = normalizeCustomerEmail(config.from.address);
  } catch {
    configurationError();
  }
  if (address !== config.from.address || address.slice(address.lastIndexOf('@') + 1) !== config.tracking.domain) {
    configurationError();
  }
  return Object.freeze({ from: `${name} <${address}>`, address });
}

function validateConfiguration(config: ResendPasswordlessProofProviderConfig): void {
  if (!apiKey(config.apiKey) || !exactHttpsOrigin(config.origin) ||
      !canonicalDomain(config.tracking.domain) ||
      !/^[A-Za-z0-9_-]{8,200}$/u.test(config.tracking.domainId) ||
      config.tracking.click !== false || config.tracking.open !== false ||
      !opaqueReference(config.tracking.attestationRef) ||
      config.subject.length < 3 || config.subject.length > 160 ||
      config.subject.trim() !== config.subject || /[\u0000-\u001f\u007f]/u.test(config.subject)) {
    configurationError();
  }
  sender(config);
}

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function acceptedResendResponse(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && value.id.length >= 8 && value.id.length <= 200 &&
    !/[\u0000-\u001f\u007f]/u.test(value.id);
}

export async function attestResendPasswordlessTracking(input: Readonly<{
  apiKey: string;
  tracking: ResendPasswordlessTrackingConfig;
  fetcher?: typeof fetch;
}>): Promise<ResendPasswordlessTrackingAttestation> {
  if (!apiKey(input.apiKey) || !canonicalDomain(input.tracking.domain) ||
      !/^[A-Za-z0-9_-]{8,200}$/u.test(input.tracking.domainId) ||
      input.tracking.click !== false || input.tracking.open !== false ||
      !opaqueReference(input.tracking.attestationRef)) {
    configurationError();
  }
  const fetcher = input.fetcher ?? fetch;
  try {
    const response = await fetcher(
      `${RESEND_API_ORIGIN}/domains/${encodeURIComponent(input.tracking.domainId)}`,
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${input.apiKey}`,
          accept: 'application/json',
        },
      },
    );
    if (!response.ok) configurationError();
    const body: unknown = await response.json();
    if (!isRecord(body) || body.object !== 'domain' || body.id !== input.tracking.domainId ||
        body.name !== input.tracking.domain || body.status !== 'verified' ||
        body.click_tracking !== false || body.open_tracking !== false ||
        !isRecord(body.capabilities) || body.capabilities.sending !== 'enabled') {
      configurationError();
    }
    return Object.freeze({
      provider: 'resend',
      domainId: input.tracking.domainId,
      domain: input.tracking.domain,
      click: false,
      open: false,
      attestationRef: input.tracking.attestationRef,
    });
  } catch (error) {
    if (error instanceof ResendPasswordlessConfigurationError) throw error;
    configurationError();
  }
}

export async function createResendPasswordlessProofProvider(
  config: ResendPasswordlessProofProviderConfig,
): Promise<PasswordlessProofProvider> {
  validateConfiguration(config);
  const configuredSender = sender(config);
  const fetcher = config.fetcher ?? fetch;
  const now = config.now ?? Date.now;

  return Object.freeze({
    id: 'resend',
    methods: METHODS,

    async prepare(input) {
      const reference = providerReference(input.challengeId);
      if (input.method !== 'email_magic_link' || reference === null ||
          input.expectedOrigin !== config.origin || !exactHttpsOrigin(input.expectedOrigin) ||
          !futureExpiry(input.expiresAt, now())) {
        configurationError();
      }
      return Object.freeze({ providerReference: reference, ...(await createPasswordlessProof()) });
    },

    async deliver(input) {
      try {
        const reference = providerReference(input.challengeId);
        if (input.method !== 'email_magic_link' || reference === null ||
            input.providerReference !== reference || input.expectedOrigin !== config.origin ||
            !exactHttpsOrigin(input.expectedOrigin) || !futureExpiry(input.expiresAt, now()) ||
            !isPasswordlessProof(input.proof)) {
          return Object.freeze({ deliveryAccepted: false });
        }
        const destination = normalizeCustomerEmail(input.destinationReference);
        if (destination !== input.destinationReference) return Object.freeze({ deliveryAccepted: false });
        // La configuración de tracking puede cambiar fuera del despliegue. Se
        // revalida inmediatamente antes de cada envío para que un isolate
        // caliente nunca confíe indefinidamente en una atestación antigua.
        await attestResendPasswordlessTracking({
          apiKey: config.apiKey,
          tracking: config.tracking,
          fetcher,
        });
        const magicLink = `${config.origin}/cuenta/acceso/confirmar#challenge=${encodeURIComponent(input.challengeId)}` +
          `&proof=${input.proof}`;
        const escapedLink = htmlEscape(magicLink);
        const response = await fetcher(RESEND_EMAILS_URL, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            'content-type': 'application/json',
            'Idempotency-Key': `customer-auth/${input.challengeId}`,
          },
          body: JSON.stringify({
            from: configuredSender.from,
            to: [destination],
            subject: config.subject,
            text: `Confirma tu acceso desde este enlace:\n\n${magicLink}\n\nEl enlace caduca pronto y solo funciona una vez.`,
            html: `<p>Confirma tu acceso desde este enlace:</p><p><a href="${escapedLink}">Acceder a mi cuenta</a></p>` +
              '<p>El enlace caduca pronto y solo funciona una vez.</p>',
          }),
        });
        if (!response.ok) return Object.freeze({ deliveryAccepted: false });
        const body: unknown = await response.json();
        return Object.freeze({ deliveryAccepted: acceptedResendResponse(body) });
      } catch {
        return Object.freeze({ deliveryAccepted: false });
      }
    },

    async verify(input) {
      const challenge = challengeFromProviderReference(input.providerReference);
      if (input.method !== 'email_magic_link' || challenge === null ||
          input.expectedOrigin !== config.origin || !exactHttpsOrigin(input.expectedOrigin) ||
          !isPasswordlessProof(input.proof)) {
        return Object.freeze({ verified: false, proofDigest: null, verificationReference: null });
      }
      return Object.freeze({
        verified: true,
        proofDigest: await passwordlessProofDigest(input.proof),
        verificationReference: input.providerReference,
      });
    },
  } satisfies PasswordlessProofProvider);
}

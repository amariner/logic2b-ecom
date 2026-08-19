import { describe, expect, it } from 'vitest';
import {
  ResendPasswordlessConfigurationError,
  attestResendPasswordlessTracking,
  createResendPasswordlessProofProvider,
  type ResendPasswordlessProofProviderConfig,
} from '../src/modules/customers';

const NOW = Date.parse('2026-08-19T09:00:00.000Z');
const EXPIRES_AT = '2026-08-19T09:10:00.000Z';
const CHALLENGE = 'auth_challenge:mail:1';
const DOMAIN_ID = 'd91cd9bd-1176-453e-8fc1-35364d380206';
const API_KEY = 're_passwordless_test_key';

const TRACKING = {
  domainId: DOMAIN_ID,
  domain: 'mail.example.com',
  click: false,
  open: false,
  attestationRef: 'resend:tracking-disabled:customer-auth:v1',
} as const;

function domainResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    object: 'domain',
    id: DOMAIN_ID,
    name: TRACKING.domain,
    status: 'verified',
    click_tracking: false,
    open_tracking: false,
    capabilities: { sending: 'enabled', receiving: 'disabled' },
    ...overrides,
  });
}

type FetchCall = Readonly<{ input: string; init: RequestInit | undefined }>;

function queuedFetch(items: Array<Response | Error>): Readonly<{
  fetcher: typeof fetch;
  calls: FetchCall[];
}> {
  const calls: FetchCall[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ input: String(input), init });
    const next = items.shift();
    if (next === undefined) throw new Error('unexpected fetch');
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetcher, calls };
}

function providerConfig(fetcher: typeof fetch): ResendPasswordlessProofProviderConfig {
  return {
    apiKey: API_KEY,
    origin: 'https://shop.example.com',
    from: { name: 'Tienda Example', address: 'acceso@mail.example.com' },
    subject: 'Tu enlace seguro de acceso',
    tracking: TRACKING,
    fetcher,
    now: () => NOW,
  };
}

describe('atestación Resend passwordless R5.4d', () => {
  it('acredita por API dominio verificado, envío activo y tracking deshabilitado', async () => {
    const transport = queuedFetch([domainResponse()]);
    const attestation = await attestResendPasswordlessTracking({
      apiKey: API_KEY,
      tracking: TRACKING,
      fetcher: transport.fetcher,
    });

    expect(attestation).toEqual({ provider: 'resend', ...TRACKING });
    expect(Object.isFrozen(attestation)).toBe(true);
    expect(JSON.stringify(attestation)).not.toContain(API_KEY);
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]!.input).toBe(`https://api.resend.com/domains/${DOMAIN_ID}`);
    const headers = new Headers(transport.calls[0]!.init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${API_KEY}`);
    expect(transport.calls[0]!.init?.method).toBe('GET');
  });

  it.each([
    ['click tracking activo', { click_tracking: true }],
    ['open tracking activo', { open_tracking: true }],
    ['dominio distinto', { name: 'other.example.com' }],
    ['dominio sin verificar', { status: 'pending' }],
    ['envío deshabilitado', { capabilities: { sending: 'disabled' } }],
  ])('falla cerrado con %s', async (_label, override) => {
    const transport = queuedFetch([domainResponse(override)]);
    await expect(attestResendPasswordlessTracking({
      apiKey: API_KEY,
      tracking: TRACKING,
      fetcher: transport.fetcher,
    })).rejects.toBeInstanceOf(ResendPasswordlessConfigurationError);
  });

  it('falla cerrado si Resend no responde o devuelve una forma no acreditable', async () => {
    for (const response of [
      new Response('unavailable', { status: 503 }),
      Response.json({ object: 'domain' }),
      new Error('network detail that must not escape'),
    ]) {
      const transport = queuedFetch([response]);
      const message = await attestResendPasswordlessTracking({
        apiKey: API_KEY,
        tracking: TRACKING,
        fetcher: transport.fetcher,
      }).catch((error: unknown) => error instanceof Error ? error.message : String(error));
      expect(message).toBe('La configuración segura de entrega passwordless no está acreditada.');
      expect(message).not.toContain('network detail');
    }
  });
});

describe('adaptador Resend PasswordlessProofProvider R5.4d', () => {
  it('prepara en memoria un proof y referencia determinista sin enviar', async () => {
    const transport = queuedFetch([]);
    const provider = await createResendPasswordlessProofProvider(providerConfig(transport.fetcher));
    const prepared = await provider.prepare({
      method: 'email_magic_link',
      challengeId: CHALLENGE,
      expectedOrigin: 'https://shop.example.com',
      expiresAt: EXPIRES_AT,
    });

    expect(provider.id).toBe('resend');
    expect(provider.methods).toEqual(['email_magic_link']);
    expect(Object.isFrozen(provider)).toBe(true);
    expect(prepared.providerReference).toBe(`resend_magic:${CHALLENGE}`);
    expect(prepared.proof).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(prepared.proofDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(prepared)).not.toContain(API_KEY);
    expect(transport.calls).toHaveLength(0);
  });

  it('entrega después de prepare con fragmento exacto e idempotencia por challenge', async () => {
    const transport = queuedFetch([domainResponse(), Response.json({ id: 'email_passwordless_123' })]);
    const provider = await createResendPasswordlessProofProvider(providerConfig(transport.fetcher));
    const prepared = await provider.prepare({
      method: 'email_magic_link',
      challengeId: CHALLENGE,
      expectedOrigin: 'https://shop.example.com',
      expiresAt: EXPIRES_AT,
    });
    const result = await provider.deliver({
      method: 'email_magic_link',
      challengeId: CHALLENGE,
      providerReference: prepared.providerReference,
      destinationReference: 'client@example.com',
      proof: prepared.proof,
      expectedOrigin: 'https://shop.example.com',
      expiresAt: EXPIRES_AT,
    });

    expect(result).toEqual({ deliveryAccepted: true });
    expect(transport.calls).toHaveLength(2);
    const delivery = transport.calls[1]!;
    expect(delivery.input).toBe('https://api.resend.com/emails');
    expect(delivery.init?.method).toBe('POST');
    const headers = new Headers(delivery.init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${API_KEY}`);
    expect(headers.get('idempotency-key')).toBe(`customer-auth/${CHALLENGE}`);
    const body = JSON.parse(String(delivery.init?.body)) as Record<string, unknown>;
    const magicLink = `https://shop.example.com/cuenta/acceso/confirmar#challenge=` +
      `auth_challenge%3Amail%3A1&proof=${prepared.proof}`;
    expect(body).toMatchObject({
      from: 'Tienda Example <acceso@mail.example.com>',
      to: ['client@example.com'],
      subject: 'Tu enlace seguro de acceso',
    });
    expect(body['text']).toContain(magicLink);
    expect(body['html']).toContain(magicLink.replace('&', '&amp;'));
    expect(String(delivery.init?.body)).not.toContain('emails_outbox');
    expect(magicLink).not.toContain('?challenge=');
  });

  it('verifica localmente la forma y devuelve solo el digest para comparar con D1', async () => {
    const transport = queuedFetch([]);
    const provider = await createResendPasswordlessProofProvider(providerConfig(transport.fetcher));
    const prepared = await provider.prepare({
      method: 'email_magic_link',
      challengeId: CHALLENGE,
      expectedOrigin: 'https://shop.example.com',
      expiresAt: EXPIRES_AT,
    });

    await expect(provider.verify({
      method: 'email_magic_link',
      providerReference: prepared.providerReference,
      proof: prepared.proof,
      expectedOrigin: 'https://shop.example.com',
    })).resolves.toEqual({
      verified: true,
      proofDigest: prepared.proofDigest,
      verificationReference: prepared.providerReference,
    });
    await expect(provider.verify({
      method: 'webauthn',
      providerReference: prepared.providerReference,
      proof: prepared.proof,
      expectedOrigin: 'https://shop.example.com',
    })).resolves.toEqual({ verified: false, proofDigest: null, verificationReference: null });
    await expect(provider.verify({
      method: 'email_magic_link',
      providerReference: prepared.providerReference,
      proof: 'invalid',
      expectedOrigin: 'https://shop.example.com',
    })).resolves.toEqual({ verified: false, proofDigest: null, verificationReference: null });
  });

  it('no llama a entrega con referencia, destino, origin o proof manipulados', async () => {
    const transport = queuedFetch([]);
    const provider = await createResendPasswordlessProofProvider(providerConfig(transport.fetcher));
    const prepared = await provider.prepare({
      method: 'email_magic_link',
      challengeId: CHALLENGE,
      expectedOrigin: 'https://shop.example.com',
      expiresAt: EXPIRES_AT,
    });
    const base = {
      method: 'email_magic_link' as const,
      challengeId: CHALLENGE,
      providerReference: prepared.providerReference,
      destinationReference: 'client@example.com',
      proof: prepared.proof,
      expectedOrigin: 'https://shop.example.com',
      expiresAt: EXPIRES_AT,
    };

    for (const input of [
      { ...base, providerReference: 'resend_magic:auth_challenge:other' },
      { ...base, destinationReference: ' Client@example.com' },
      { ...base, expectedOrigin: 'https://attacker.example.com' },
      { ...base, proof: 'invalid' },
    ]) {
      await expect(provider.deliver(input)).resolves.toEqual({ deliveryAccepted: false });
    }
    expect(transport.calls).toHaveLength(0);
  });

  it('revalida tracking antes de cada envío y bloquea un cambio remoto', async () => {
    const transport = queuedFetch([
      domainResponse(),
      Response.json({ id: 'email_passwordless_123' }),
      domainResponse({ click_tracking: true }),
    ]);
    const provider = await createResendPasswordlessProofProvider(providerConfig(transport.fetcher));
    const prepared = await provider.prepare({
      method: 'email_magic_link', challengeId: CHALLENGE,
      expectedOrigin: 'https://shop.example.com', expiresAt: EXPIRES_AT,
    });
    const delivery = {
      method: 'email_magic_link' as const,
      challengeId: CHALLENGE,
      providerReference: prepared.providerReference,
      destinationReference: 'client@example.com',
      proof: prepared.proof,
      expectedOrigin: 'https://shop.example.com',
      expiresAt: EXPIRES_AT,
    };
    await expect(provider.deliver(delivery)).resolves.toEqual({ deliveryAccepted: true });
    await expect(provider.deliver(delivery)).resolves.toEqual({ deliveryAccepted: false });
    expect(transport.calls.map((call) => call.input)).toEqual([
      `https://api.resend.com/domains/${DOMAIN_ID}`,
      'https://api.resend.com/emails',
      `https://api.resend.com/domains/${DOMAIN_ID}`,
    ]);
  });

  it('devuelve rechazo estable ante errores o respuestas ambiguas de entrega', async () => {
    for (const deliveryResponse of [
      new Response('unavailable', { status: 503 }),
      Response.json({}),
      new Error('private provider failure'),
    ]) {
      const transport = queuedFetch([domainResponse(), deliveryResponse]);
      const provider = await createResendPasswordlessProofProvider(providerConfig(transport.fetcher));
      const prepared = await provider.prepare({
        method: 'email_magic_link',
        challengeId: CHALLENGE,
        expectedOrigin: 'https://shop.example.com',
        expiresAt: EXPIRES_AT,
      });
      await expect(provider.deliver({
        method: 'email_magic_link',
        challengeId: CHALLENGE,
        providerReference: prepared.providerReference,
        destinationReference: 'client@example.com',
        proof: prepared.proof,
        expectedOrigin: 'https://shop.example.com',
        expiresAt: EXPIRES_AT,
      })).resolves.toEqual({ deliveryAccepted: false });
    }
  });

  it('rechaza configuración no canónica antes de preparar o enviar', async () => {
    const transport = queuedFetch([]);
    await expect(createResendPasswordlessProofProvider({
      ...providerConfig(transport.fetcher),
      origin: 'https://shop.example.com/' as `https://${string}`,
    })).rejects.toBeInstanceOf(ResendPasswordlessConfigurationError);
    expect(transport.calls).toHaveLength(0);

    const trackingEnabled = {
      ...providerConfig(transport.fetcher),
      tracking: { ...TRACKING, click: true },
    } as unknown as ResendPasswordlessProofProviderConfig;
    await expect(createResendPasswordlessProofProvider(trackingEnabled))
      .rejects.toBeInstanceOf(ResendPasswordlessConfigurationError);
    expect(transport.calls).toHaveLength(0);
  });
});

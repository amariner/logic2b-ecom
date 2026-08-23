import { describe, expect, it, vi } from 'vitest';
import { createCustomerAddressHttp } from '../src/composition/customer-address-http';
import { createCustomerResourceAuthorizer } from '../src/composition/customer-resource-authorization';
import {
  createCustomerAddressService,
  createD1CustomerAddressOwnershipReader,
  createD1CustomerAddressRepository,
  type CustomerAddressData,
  type CustomerOwnershipSubject,
  type CustomerResourceScope,
  type CustomerSelfServiceCapability,
} from '../src/modules/customers';
import { CUSTOMER_AUTH_SESSION_COOKIE_NAME } from '../src/modules/customers/presentation/passwordless-http';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-23T10:00:00.000Z';
const TOKEN = 'S'.repeat(43);
const CSRF = 'csrf-address-session';
const ADDRESS: CustomerAddressData = Object.freeze({
  recipientName: 'Marta Ferrer', phone: '+34 600 000 000', street: 'Carrer Major 1',
  city: 'Castelló', region: 'Castelló', postalCode: '12001', countryCode: 'ES',
});

function profile(db: SqliteD1, id: string, hash: string): void {
  db.sqlite.prepare(`INSERT INTO customer_profiles (
    id, primary_email, email_identity_hash, status, version, created_at, updated_at
  ) VALUES (?, ?, ?, 'active', 1, ?, ?)`).run(
    id, `${id.replaceAll(':', '-')}@example.test`, hash.repeat(64), AT, AT,
  );
}

function subject(profileId = 'customer_profile:one'): CustomerOwnershipSubject {
  const suffix = profileId.endsWith(':one') ? 'one' : 'two';
  return Object.freeze({
    session: Object.freeze({ id: `customer_session:${suffix}`,
      identityId: `auth_identity:${suffix}`, customerProfileId: profileId,
      status: 'active', scopes: ['customer:self'] }),
    identity: Object.freeze({ id: `auth_identity:${suffix}`,
      customerProfileId: profileId, status: 'active' }),
    profile: Object.freeze({ id: profileId, status: 'active', mergedIntoProfileId: null }),
  });
}

function request(input: Readonly<{
  method?: 'GET' | 'POST' | 'PATCH';
  body?: Record<string, unknown>;
  cookie?: boolean;
}> = {}): Request {
  const headers = new Headers();
  if (input.cookie ?? true) headers.set('cookie', `${CUSTOMER_AUTH_SESSION_COOKIE_NAME}=${TOKEN}`);
  if (input.body) headers.set('content-type', 'application/json');
  return new Request('https://shop.example/api/customer/addresses', {
    method: input.method ?? 'GET', headers,
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });
}

function setup(db: SqliteD1, input: Readonly<{
  currentSubject?: CustomerOwnershipSubject | null;
  capabilities?: readonly CustomerSelfServiceCapability[];
  scopes?: readonly CustomerResourceScope[];
}> = {}) {
  let sequence = 0;
  const addresses = createCustomerAddressService(
    createD1CustomerAddressRepository(db.asD1()),
    () => `address:http-${++sequence}`,
  );
  const metrics = { count: vi.fn() };
  const value = createCustomerAddressHttp({
    sessionContext: vi.fn(async () => input.currentSubject === undefined
      ? Object.freeze({ subject: subject(), csrfToken: CSRF,
        verifyCsrf: async (token: string) => token === CSRF })
      : input.currentSubject === null ? null : Object.freeze({
        subject: input.currentSubject, csrfToken: CSRF,
        verifyCsrf: async (token: string) => token === CSRF,
      })),
    authorizer: createCustomerResourceAuthorizer(
      createD1CustomerAddressOwnershipReader(db.asD1()),
    ),
    addresses,
    activeCapabilities: input.capabilities ?? ['CUS-006'],
    grantedScopes: input.scopes ?? ['customer:addresses:read', 'customer:addresses:write'],
    observability: metrics,
    ordersAvailable: true,
    now: () => AT,
  });
  return { value, addresses, metrics };
}

function payload(data = ADDRESS, extra: Record<string, unknown> = {}) {
  return { address: data, csrfToken: CSRF, idempotencyKey: 'address-http-command-one', ...extra };
}

describe('HTTP owner-only de direcciones R5.5f', () => {
  it('lista solo la revisión vigente del owner y expone CSRF sin selectores internos', async () => {
    const db = new SqliteD1();
    profile(db, 'customer_profile:one', 'a');
    profile(db, 'customer_profile:two', 'b');
    const access = setup(db);
    await access.addresses.createOwned({ ownerProfileId: 'customer_profile:one', data: ADDRESS,
      idempotencyKey: 'seed-address-owner-one', occurredAt: AT });
    await access.addresses.createOwned({ ownerProfileId: 'customer_profile:two', data: ADDRESS,
      idempotencyKey: 'seed-address-owner-two', occurredAt: AT });

    const response = await access.value.list(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    const body = await response.json() as { addresses: Array<{ publicRef: string }>; csrfToken: string };
    expect(body.addresses).toHaveLength(1);
    expect(body.addresses[0]?.publicRef).toMatch(/^addr_[0-9a-f]{32}$/u);
    expect(body.csrfToken).toBe(CSRF);
    expect(JSON.stringify(body)).not.toContain('customer_profile:');
    const view = await access.value.listView(request());
    expect(view).toMatchObject({ ordersAvailable: true, csrfToken: CSRF });
  });

  it('crea una sola vez, reproduce el mismo resultado y rechaza reutilizar la clave', async () => {
    const db = new SqliteD1();
    profile(db, 'customer_profile:one', 'a');
    const access = setup(db);
    const first = await access.value.create(request({ method: 'POST', body: payload() }));
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    const replay = await access.value.create(request({ method: 'POST', body: payload() }));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(firstBody);
    const conflict = await access.value.create(request({ method: 'POST', body: payload(
      { ...ADDRESS, city: 'València' },
    ) }));
    expect(conflict.status).toBe(409);
    expect(db.value('SELECT count(*) AS value FROM customer_address_revisions')).toBe(1);
    expect(access.metrics.count).toHaveBeenCalledWith({ operation: 'create', outcome: 'replayed' });
  });

  it('revisa por addr_+owner+CAS y convierte IDOR o versión obsoleta en respuestas seguras', async () => {
    const db = new SqliteD1();
    profile(db, 'customer_profile:one', 'a');
    profile(db, 'customer_profile:two', 'b');
    const access = setup(db);
    const created = await access.addresses.createOwned({ ownerProfileId: 'customer_profile:one',
      data: ADDRESS, idempotencyKey: 'seed-address-revision-one', occurredAt: AT });
    if (created.address === null) throw new Error('fixture no creada');

    const revisePayload = payload(
      { ...ADDRESS, street: 'Carrer Major 2' },
      { revision: 1, idempotencyKey: 'address-http-revise-one' },
    );
    const revised = await access.value.revise(request({ method: 'PATCH', body: revisePayload }),
      created.address.publicRef);
    expect(revised.status).toBe(200);
    const revisedBody = await revised.json();
    expect(revisedBody).toMatchObject({ address: { revision: 2, data: { street: 'Carrer Major 2' } } });
    const replay = await access.value.revise(request({ method: 'PATCH', body: revisePayload }),
      created.address.publicRef);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(revisedBody);
    expect(access.metrics.count).toHaveBeenCalledWith({ operation: 'revise', outcome: 'replayed' });

    const stale = await access.value.revise(request({ method: 'PATCH', body: payload(
      ADDRESS, { revision: 1, idempotencyKey: 'address-http-revise-stale' },
    ) }), created.address.publicRef);
    expect(stale.status).toBe(409);
    const wrongOwner = setup(db, { currentSubject: subject('customer_profile:two') });
    const idor = await wrongOwner.value.revise(request({ method: 'PATCH', body: payload(
      ADDRESS, { revision: 2, idempotencyKey: 'address-http-revise-idor' },
    ) }), created.address.publicRef);
    expect(idor.status).toBe(404);
    const invalid = await access.value.revise(request({ method: 'PATCH', body: payload(
      ADDRESS, { revision: 2, idempotencyKey: 'address-http-revise-invalid' },
    ) }), 'customer_profile:one');
    expect(invalid.status).toBe(404);
  });

  it('falla antes de persistencia sin sesión, scope, capability o CSRF y no registra PII', async () => {
    const db = new SqliteD1();
    profile(db, 'customer_profile:one', 'a');
    for (const access of [setup(db, { currentSubject: null }), setup(db, { scopes: [] }),
      setup(db, { capabilities: [] })]) {
      const response = await access.value.create(request({ method: 'POST', body: payload() }));
      expect(response.status).toBe(404);
    }
    const access = setup(db);
    const badCsrf = await access.value.create(request({ method: 'POST', body: payload(
      ADDRESS, { csrfToken: 'wrong' },
    ) }));
    expect(badCsrf.status).toBe(403);
    const injected = await access.value.create(request({ method: 'POST', body: {
      ...payload(), ownerProfileId: 'customer_profile:two',
    } }));
    expect(injected.status).toBe(400);
    const duplicateField = await access.value.create(new Request(
      'https://shop.example/api/customer/addresses', {
        method: 'POST',
        headers: { cookie: `${CUSTOMER_AUTH_SESSION_COOKIE_NAME}=${TOKEN}`,
          'content-type': 'application/x-www-form-urlencoded' },
        body: `operation=create&csrfToken=${CSRF}&csrfToken=wrong`,
      },
    ));
    expect(duplicateField.status).toBe(400);
    const oversized = await access.value.create(request({ method: 'POST', body: payload(
      { ...ADDRESS, street: 'X'.repeat(17_000) },
    ) }));
    expect(oversized.status).toBe(400);
    expect(db.value('SELECT count(*) AS value FROM customer_address_revisions')).toBe(0);
    expect(JSON.stringify(access.metrics.count.mock.calls)).not.toContain('Marta Ferrer');
    expect(JSON.stringify(access.metrics.count.mock.calls)).not.toContain('Carrer Major');
  });
});

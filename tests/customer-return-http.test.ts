import { describe, expect, it, vi } from 'vitest';
import { createCustomerReturnHttp } from '../src/composition/customer-return-http';
import type { CustomerReturnRequestService } from '../src/composition/customer-return-request-service';
import type { CustomerOwnershipSubject, CustomerResourceScope } from '../src/modules/customers';
import { CUSTOMER_AUTH_SESSION_COOKIE_NAME } from '../src/modules/customers/presentation/passwordless-http';

const TOKEN = 'R'.repeat(43);
const CSRF = 'return-session-csrf';
const AT = '2026-08-24T12:00:00.000Z';
const REF = `ret_${'a'.repeat(32)}`;
const ORDER = `ord_${'b'.repeat(32)}`;
const VIEW = Object.freeze({ publicRef: REF, orderPublicRef: ORDER, status: 'requested',
  reason: 'other' as const, version: 1, requestedAt: AT,
  lines: Object.freeze([{ orderItemId: 7, name: 'Producto', requestedQuantity: 1 }]) });

function subject(profileId = 'customer_profile:one'): CustomerOwnershipSubject {
  return Object.freeze({
    session: Object.freeze({ id: 'customer_session:return', identityId: 'auth_identity:return',
      customerProfileId: profileId, status: 'active', scopes: ['customer:self'] }),
    identity: Object.freeze({ id: 'auth_identity:return', customerProfileId: profileId, status: 'active' }),
    profile: Object.freeze({ id: profileId, status: 'active', mergedIntoProfileId: null }),
  });
}

function request(method: 'GET' | 'POST' = 'GET', body?: Record<string, unknown>, cookie = true) {
  const headers = new Headers();
  if (cookie) headers.set('cookie', `${CUSTOMER_AUTH_SESSION_COOKIE_NAME}=${TOKEN}`);
  if (body) headers.set('content-type', 'application/json');
  if (method === 'POST') headers.set('origin', 'https://shop.example');
  return new Request('https://shop.example/api/customer/returns', {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function setup(input: Readonly<{
  currentSubject?: CustomerOwnershipSubject | null;
  scopes?: readonly CustomerResourceScope[];
}> = {}) {
  const returns: CustomerReturnRequestService = Object.freeze({
    listOwned: vi.fn(async () => [VIEW]),
    readOwned: vi.fn(async (_owner, ref) => ref === REF ? VIEW : null),
    listEligibilityOwned: vi.fn(async () => [Object.freeze({ orderPublicRef: ORDER,
      orderNumber: 'ORDER-ONE', ownershipVersion: 2, lines: Object.freeze([{
        orderItemId: 7, name: 'Producto', availableQuantity: 1, lastDeliveredAt: AT,
      }]) })]),
    createOwned: vi.fn(async () => ({ outcome: 'applied' as const, request: VIEW })),
  });
  const metrics = { count: vi.fn() };
  const value = createCustomerReturnHttp({
    sessionContext: vi.fn(async () => input.currentSubject === null ? null : Object.freeze({
      subject: input.currentSubject ?? subject(), csrfToken: CSRF,
      verifyCsrf: async (token: string) => token === CSRF,
    })),
    returns, activeCapabilities: ['CUS-005'],
    grantedScopes: input.scopes ?? ['customer:returns:read', 'customer:returns:create'],
    expectedOrigin: 'https://shop.example',
    observability: metrics, ordersAvailable: true, addressesAvailable: true, now: () => AT,
  });
  return { value, returns, metrics };
}

function payload(extra: Record<string, unknown> = {}) {
  return { orderPublicRef: ORDER, ownershipVersion: 2, reason: 'other',
    lines: [{ orderItemId: 7, quantity: 1 }], csrfToken: CSRF,
    idempotencyKey: 'customer-return-http-one', ...extra };
}

describe('HTTP owner-only de devoluciones R5.5h', () => {
  it('lista solicitudes y elegibilidad del perfil sin identificadores internos', async () => {
    const access = setup();
    const response = await access.value.list(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ requests: [{ publicRef: REF }],
      eligibility: [{ orderPublicRef: ORDER }], csrfToken: CSRF });
    expect(JSON.stringify(body)).not.toContain('customer_profile:');
    await expect(access.value.listView(request())).resolves.toMatchObject({
      ordersAvailable: true, addressesAvailable: true,
    });
  });

  it('consulta exclusivamente ret_ del owner y uniforma ausencia, IDOR y formato', async () => {
    const access = setup();
    expect((await access.value.read(request(), REF)).status).toBe(200);
    for (const ref of [`ret_${'c'.repeat(32)}`, 'RMA-C-ONE', 'customer_profile:one']) {
      const response = await access.value.read(request(), ref);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: { code: 'customer.resource.not_found' } });
    }
  });

  it('crea con owner de sesión, CSRF e idempotencia y nunca acepta owner del body', async () => {
    const access = setup();
    const response = await access.value.create(request('POST', payload()));
    expect(response.status).toBe(201);
    expect(access.returns.createOwned).toHaveBeenCalledWith({
      orderPublicRef: ORDER, ownerProfileId: 'customer_profile:one', expectedOwnershipVersion: 2,
      reason: 'other', lines: [{ orderItemId: 7, quantity: 1 }],
      idempotencyKey: 'customer-return-http-one', occurredAt: AT,
    });
    expect((await access.value.create(request('POST', payload({ csrfToken: 'wrong' })))).status).toBe(403);
    expect((await access.value.create(request('POST', payload({ ownerProfileId: 'customer_profile:two' })))).status).toBe(400);

    const form = new URLSearchParams({ orderPublicRef: ORDER, ownershipVersion: '2',
      orderItemId: '7', quantity: '2', reason: 'damaged', csrfToken: CSRF,
      idempotencyKey: 'customer-return-http-form' });
    const formResponse = await access.value.create(new Request('https://shop.example/cuanta/devoluciones', {
      method: 'POST', headers: { cookie: `${CUSTOMER_AUTH_SESSION_COOKIE_NAME}=${TOKEN}`,
        'content-type': 'application/x-www-form-urlencoded', origin: 'https://shop.example' }, body: form,
    }));
    expect(formResponse.status).toBe(201);
    expect(access.returns.createOwned).toHaveBeenLastCalledWith(expect.objectContaining({
      reason: 'damaged', lines: [{ orderItemId: 7, quantity: 2 }],
    }));

    for (const origin of [null, 'https://alias.shop.example']) {
      const headers = new Headers({ cookie: `${CUSTOMER_AUTH_SESSION_COOKIE_NAME}=${TOKEN}`,
        'content-type': 'application/json' });
      if (origin !== null) headers.set('origin', origin);
      const rejected = await access.value.create(new Request('https://shop.example/api/customer/returns', {
        method: 'POST', headers, body: JSON.stringify(payload()),
      }));
      expect(rejected.status).toBe(403);
    }
    expect(access.metrics.count).toHaveBeenCalledWith({ operation: 'create',
      outcome: 'denied', reason: 'invalid_origin' });
  });

  it('falla cerrado sin sesión o scopes y conserva redirección solo para SSR', async () => {
    expect((await setup({ currentSubject: null }).value.list(request())).status).toBe(404);
    expect((await setup({ scopes: [] }).value.create(request('POST', payload()))).status).toBe(404);
    const access = setup();
    expect((await access.value.list(request('GET', undefined, false))).status).toBe(404);
    const view = await access.value.listView(request('GET', undefined, false));
    expect(view).toBeInstanceOf(Response);
    expect((view as Response).status).toBe(303);
  });
});

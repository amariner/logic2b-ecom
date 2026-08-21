import { describe, expect, it, vi } from 'vitest';
import { createCustomerOrderAccessHttp } from '../src/composition/customer-order-access-http';
import { createCustomerResourceAuthorizer } from '../src/composition/customer-resource-authorization';
import {
  createCustomerOrderListService,
  createD1CustomerOwnedOrderListReader,
  createD1CustomerOrderOwnershipReader,
  createD1CustomerOwnedOrderReader,
  type CustomerOwnershipSubject,
  type CustomerOwnedOrderReader,
  type CustomerResourceScope,
  type CustomerSelfServiceCapability,
} from '../src/modules/customers';
import { CUSTOMER_AUTH_SESSION_COOKIE_NAME } from '../src/modules/customers/presentation/passwordless-http';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-21T12:00:00.000Z';
const TOKEN = 'T'.repeat(43);

function profile(db: SqliteD1, id: string, hash: string): void {
  db.sqlite.prepare(`INSERT INTO customer_profiles (
    id, primary_email, email_identity_hash, status, version, created_at, updated_at
  ) VALUES (?, ?, ?, 'active', 1, ?, ?)`).run(
    id, `${id.replaceAll(':', '-')}@example.test`, hash.repeat(64), AT, AT,
  );
}

function order(db: SqliteD1, suffix: string, owner: string | null): string {
  db.sqlite.prepare(`INSERT INTO orders (
    order_number, email, customer_name, address_json, subtotal_cents,
    shipping_cents, total_cents, status, stripe_session_id, currency,
    tracking_carrier, tracking_number, customer_profile_id
  ) VALUES (?, ?, ?, ?, 1000, 200, 1200, 'shipped', ?, 'EUR', 'Correos', ?, ?)`)
    .run(
      `ORDER-ACCESS-${suffix}`,
      `private-${suffix}@example.test`,
      `Private ${suffix}`,
      JSON.stringify({ street: `Secret ${suffix}` }),
      `stripe-session-${suffix}`,
      `TRACK-${suffix}`,
      owner,
    );
  return String(db.value(`SELECT access.public_ref AS value
    FROM customer_order_access_refs access JOIN orders ON orders.id=access.order_id
    WHERE orders.order_number='ORDER-ACCESS-${suffix}'`));
}

function subject(profileId = 'customer_profile:one'): CustomerOwnershipSubject {
  const suffix = profileId.endsWith(':one') ? 'one' : 'two';
  return Object.freeze({
    session: Object.freeze({
      id: `customer_session:${suffix}`,
      identityId: `auth_identity:${suffix}`,
      customerProfileId: profileId,
      status: 'active',
      scopes: ['customer:self'],
    }),
    identity: Object.freeze({
      id: `auth_identity:${suffix}`,
      customerProfileId: profileId,
      status: 'active',
    }),
    profile: Object.freeze({ id: profileId, status: 'active', mergedIntoProfileId: null }),
  });
}

function request(withCookie = true): Request {
  return new Request('https://shop.example/api/customer/orders/redacted', {
    headers: withCookie ? { cookie: `${CUSTOMER_AUTH_SESSION_COOKIE_NAME}=${TOKEN}` } : {},
  });
}

function http(db: SqliteD1, input: Readonly<{
  subject?: CustomerOwnershipSubject | null;
  capabilities?: readonly CustomerSelfServiceCapability[];
  scopes?: readonly CustomerResourceScope[];
  orders?: CustomerOwnedOrderReader;
  orderList?: ReturnType<typeof createCustomerOrderListService>;
}> = {}) {
  const metrics = { count: vi.fn() };
  const ownership = createD1CustomerOrderOwnershipReader(db.asD1());
  return {
    metrics,
    value: createCustomerOrderAccessHttp({
      sessionSubject: vi.fn(async () => input.subject === undefined ? subject() : input.subject),
      authorizer: createCustomerResourceAuthorizer(ownership),
      orders: input.orders ?? createD1CustomerOwnedOrderReader(db.asD1()),
      orderList: input.orderList ?? createCustomerOrderListService(
        createD1CustomerOwnedOrderListReader(db.asD1()),
      ),
      activeCapabilities: input.capabilities ?? ['CUS-004'],
      grantedScopes: input.scopes ?? ['customer:orders:read'],
      observability: metrics,
      now: () => AT,
    }),
  };
}

async function signature(response: Response) {
  return {
    status: response.status,
    body: await response.text(),
    cache: response.headers.get('cache-control'),
    vary: response.headers.get('vary'),
    contentType: response.headers.get('content-type'),
    nosniff: response.headers.get('x-content-type-options'),
  };
}

describe('lectura HTTP autenticada de pedidos R5.5c', () => {
  it('devuelve solo el DTO mínimo al owner y fija cache privada', async () => {
    const db = new SqliteD1();
    profile(db, 'customer_profile:one', 'a');
    const publicRef = order(db, 'owned', 'customer_profile:one');
    const response = await http(db).value.read(request(), publicRef);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('vary')).toContain('Cookie');
    const body = await response.json();
    expect(body).toEqual({ order: {
      publicRef,
      orderNumber: 'ORDER-ACCESS-owned',
      status: 'shipped',
      totalCents: 1200,
      currency: 'EUR',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      tracking: { carrier: 'Correos', number: 'TRACK-owned' },
    } });
    const serialized = JSON.stringify(body);
    for (const secret of ['private-owned@example.test', 'Secret owned', 'stripe-session-owned',
      'customer_profile:one', 'address_json', 'stripe_session_id', 'customer_profile_id']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('hace indistinguibles ausencia, guest, IDOR, sesión, scope, gate y perfil fusionado', async () => {
    const db = new SqliteD1();
    profile(db, 'customer_profile:one', 'a');
    profile(db, 'customer_profile:two', 'b');
    const ownedRef = order(db, 'owned', 'customer_profile:one');
    const guestRef = order(db, 'guest', null);
    const absentRef = `ord_${'f'.repeat(32)}`;
    const merged = {
      ...subject(),
      profile: { id: 'customer_profile:one', status: 'merged' as const,
        mergedIntoProfileId: 'customer_profile:two' },
    };
    const responses = [
      http(db).value.read(request(), absentRef),
      http(db).value.read(request(), guestRef),
      http(db, { subject: subject('customer_profile:two') }).value.read(request(), ownedRef),
      http(db, { subject: null }).value.read(request(), ownedRef),
      http(db, { scopes: [] }).value.read(request(), ownedRef),
      http(db, { capabilities: [] }).value.read(request(), ownedRef),
      http(db, { subject: merged }).value.read(request(), ownedRef),
      http(db).value.read(request(false), ownedRef),
      http(db).value.read(request(), 'ORDER-ACCESS-owned'),
      http(db).value.read(request(), 'private-owned@example.test'),
    ];
    const signatures = await Promise.all((await Promise.all(responses)).map(signature));
    expect(new Set(signatures.map((value) => JSON.stringify(value)))).toHaveLength(1);
    expect(signatures[0]).toEqual({
      status: 404,
      body: JSON.stringify({ error: { code: 'customer.resource.not_found' } }),
      cache: 'private, no-store, max-age=0',
      vary: 'Cookie',
      contentType: 'application/json',
      nosniff: 'nosniff',
    });
  });

  it('revalida owner y versión al leer para cerrar una reasignación concurrente', async () => {
    const db = new SqliteD1();
    profile(db, 'customer_profile:one', 'a');
    profile(db, 'customer_profile:two', 'b');
    const publicRef = order(db, 'race', 'customer_profile:one');
    const canonical = createD1CustomerOwnedOrderReader(db.asD1());
    const racing: CustomerOwnedOrderReader = {
      async readOwned(input) {
        db.sqlite.prepare(`UPDATE orders SET customer_profile_id='customer_profile:two'
          WHERE id=(SELECT order_id FROM customer_order_access_refs WHERE public_ref=?)`)
          .run(publicRef);
        return canonical.readOwned(input);
      },
    };
    const response = await http(db, { orders: racing }).value.read(request(), publicRef);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: 'customer.resource.not_found' } });
  });
});

describe('índice HTTP autenticado de pedidos R5.5d', () => {
  it('pagina solo pedidos del perfil de sesión y nunca mezcla otro owner', async () => {
    const db = new SqliteD1();
    profile(db, 'customer_profile:one', 'a');
    profile(db, 'customer_profile:two', 'b');
    for (let index = 0; index < 12; index += 1) order(db, `one-${index}`, 'customer_profile:one');
    for (let index = 0; index < 3; index += 1) order(db, `two-${index}`, 'customer_profile:two');

    const access = http(db).value;
    const first = await access.list(request(), null);
    expect(first.status).toBe(200);
    const firstBody = await first.json() as { orders: Array<{ orderNumber: string }>; nextCursor: string | null };
    expect(firstBody.orders).toHaveLength(10);
    expect(firstBody.orders.every((entry) => entry.orderNumber.startsWith('ORDER-ACCESS-one-'))).toBe(true);
    expect(firstBody.nextCursor).toEqual(expect.any(String));

    const second = await access.list(request(), firstBody.nextCursor);
    const secondBody = await second.json() as { orders: Array<{ orderNumber: string }>; nextCursor: string | null };
    expect(secondBody.orders).toHaveLength(2);
    expect(secondBody.orders.every((entry) => entry.orderNumber.startsWith('ORDER-ACCESS-one-'))).toBe(true);
    expect(secondBody.nextCursor).toBeNull();
  });

  it('rechaza cursor manipulado sin consultar otro owner', async () => {
    const db = new SqliteD1();
    profile(db, 'customer_profile:one', 'a');
    const access = http(db);
    const response = await access.value.list(request(), 'owner=customer_profile:two');
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: { code: 'customer.request.invalid' } });
    expect(access.metrics.count).toHaveBeenLastCalledWith({ outcome: 'denied', reason: 'invalid_cursor' });
  });

  it('redirige la vista sin sesión y conserva 404 uniforme en la API', async () => {
    const db = new SqliteD1();
    const access = http(db).value;
    const page = await access.listView(request(false), null);
    expect(page).toBeInstanceOf(Response);
    expect((page as Response).status).toBe(303);
    expect((page as Response).headers.get('location')).toBe('/cuenta/acceso');
    const api = await access.list(request(false), null);
    expect(api.status).toBe(404);
    await expect(api.json()).resolves.toEqual({ error: { code: 'customer.resource.not_found' } });
  });

  it('no consulta el índice si capability, scope o perfil activo fallan', async () => {
    const db = new SqliteD1();
    const listOwned = vi.fn(async () => ({ orders: [], nextCursor: null }));
    const orderList = createCustomerOrderListService({ listOwned });
    const active = subject();
    const merged = Object.freeze({
      ...active,
      profile: Object.freeze({
        id: active.profile.id,
        status: 'merged' as const,
        mergedIntoProfileId: 'customer_profile:two',
      }),
    });
    for (const input of [
      { capabilities: [] as const, orderList },
      { scopes: [] as const, orderList },
      { subject: merged, orderList },
    ]) {
      const response = await http(db, input).value.list(request(), null);
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: { code: 'customer.resource.not_found' } });
    }
    expect(listOwned).not.toHaveBeenCalled();
  });
});

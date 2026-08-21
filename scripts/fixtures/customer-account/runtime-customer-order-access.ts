import type {
  CustomerOrderAccessHttp,
  CustomerOrderListView,
} from '../../../src/modules/customers/presentation/customer-order-access-http';
import type { CustomerOrderAccessView } from '../../../src/modules/customers/application/resource-ownership-ports';
import { customerAccountHeaders } from '../../../src/modules/customers/presentation/passwordless-http';

export const FIXTURE_ORDER_REF = `ord_${'f'.repeat(32)}`;
const ORDER = Object.freeze({
  publicRef: FIXTURE_ORDER_REF,
  orderNumber: 'L2B-2026-0042',
  status: 'shipped',
  totalCents: 12_490,
  currency: 'EUR',
  createdAt: '2026-08-18T10:30:00.000Z',
  updatedAt: '2026-08-20T08:15:00.000Z',
  tracking: Object.freeze({ carrier: 'Correos Express', number: 'PQ42FIXTURE' }),
}) satisfies CustomerOrderAccessView;
const LIST = Object.freeze({ orders: Object.freeze([ORDER]), nextCursor: null }) satisfies CustomerOrderListView;
const EMPTY_LIST = Object.freeze({ orders: Object.freeze([]), nextCursor: null }) satisfies CustomerOrderListView;

function json(body: unknown): Response {
  return Response.json(body, { headers: customerAccountHeaders() });
}

const http = Object.freeze({
  async list(): Promise<Response> { return json(LIST); },
  async read(): Promise<Response> { return json({ order: ORDER }); },
  async listView(_request: Request, cursor: string | null): Promise<CustomerOrderListView | Response> {
    if (cursor === 'empty') return EMPTY_LIST;
    if (cursor === 'invalid') return new Response(null, { status: 400, headers: customerAccountHeaders() });
    return LIST;
  },
  async readView(_request: Request, publicRef: string | undefined): Promise<CustomerOrderAccessView | Response> {
    return publicRef === FIXTURE_ORDER_REF
      ? ORDER
      : new Response(null, { status: 404, headers: customerAccountHeaders() });
  },
}) satisfies CustomerOrderAccessHttp;

/** Seam visual local: no DB, cookie, secreto, proveedor ni red. */
export async function createRuntimeCustomerOrderAccessHttp(): Promise<CustomerOrderAccessHttp> {
  return http;
}

export const customerOrderAccessRuntimeObservability = Object.freeze({ count(): void {} });

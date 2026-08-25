import type { CustomerReturnHttp, CustomerReturnListView } from '../../../src/modules/customers/presentation/customer-return-http';
import type { CustomerReturnRequestView } from '../../../src/modules/customers/application/customer-return-request-repository';
import { customerAccountHeaders } from '../../../src/modules/customers/presentation/passwordless-http';

const REF = `ret_${'f'.repeat(32)}`;
const REQUEST = Object.freeze({ publicRef: REF, orderPublicRef: `ord_${'f'.repeat(32)}`,
  status: 'requested', reason: 'not_as_expected', version: 1,
  requestedAt: '2026-08-23T12:00:00.000Z',
  lines: Object.freeze([{ orderItemId: 42, name: 'Lámpara Arista 40', requestedQuantity: 1 }]),
}) satisfies CustomerReturnRequestView;
const VIEW = Object.freeze({
  requests: Object.freeze([REQUEST]),
  eligibility: Object.freeze([Object.freeze({ orderPublicRef: `ord_${'f'.repeat(32)}`,
    orderNumber: 'L2B-2026-0042', ownershipVersion: 1,
    lines: Object.freeze([{ orderItemId: 43, name: 'Aplique Arista 20',
      availableQuantity: 2, lastDeliveredAt: '2026-08-22T12:00:00.000Z' }]),
  })]),
  csrfToken: 'C'.repeat(43), ordersAvailable: true, addressesAvailable: true,
}) satisfies CustomerReturnListView;

const http = Object.freeze({
  async list(): Promise<Response> { return Response.json(VIEW, { headers: customerAccountHeaders() }); },
  async read(_request: Request, ref: string | undefined): Promise<Response> {
    return ref === REF ? Response.json({ request: REQUEST }, { headers: customerAccountHeaders() })
      : Response.json({ error: { code: 'customer.resource.not_found' } },
        { status: 404, headers: customerAccountHeaders() });
  },
  async create(): Promise<Response> {
    return Response.json({ request: REQUEST }, { status: 201, headers: customerAccountHeaders() });
  },
  async listView(): Promise<CustomerReturnListView> { return VIEW; },
  async readView(_request: Request, ref: string | undefined): Promise<CustomerReturnRequestView | Response> {
    return ref === REF ? REQUEST : new Response('Solicitud no encontrada.', {
      status: 404, headers: customerAccountHeaders(),
    });
  },
}) satisfies CustomerReturnHttp;

/** Seam visual inerte: no DB, mutación, proveedor, cookie ni secreto. */
export async function createRuntimeCustomerReturnHttp(): Promise<CustomerReturnHttp> { return http; }
export const customerReturnRuntimeObservability = Object.freeze({ count(): void {} });

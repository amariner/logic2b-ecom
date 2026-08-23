import type {
  CustomerAddressHttp,
  CustomerAddressListView,
} from '../../../src/modules/customers/presentation/customer-address-http';
import type { CustomerAddressAccessView } from '../../../src/modules/customers/application/resource-ownership-ports';
import { customerAccountHeaders } from '../../../src/modules/customers/presentation/passwordless-http';

const CSRF_TOKEN = 'C'.repeat(43);
const ADDRESS = Object.freeze({
  publicRef: `addr_${'f'.repeat(32)}`,
  revision: 2,
  data: Object.freeze({
    recipientName: 'Marta Ferrer', phone: '+34 600 000 000',
    street: 'Carrer Major 12, 2.º B', city: 'Castelló de la Plana',
    region: 'Castelló', postalCode: '12001', countryCode: 'ES',
  }),
  validFrom: '2026-08-22T12:00:00.000Z',
}) satisfies CustomerAddressAccessView;
const VIEW = Object.freeze({
  addresses: Object.freeze([ADDRESS]), csrfToken: CSRF_TOKEN, ordersAvailable: true,
}) satisfies CustomerAddressListView;
const EMPTY = Object.freeze({
  addresses: Object.freeze([]), csrfToken: CSRF_TOKEN, ordersAvailable: true,
}) satisfies CustomerAddressListView;

const http = Object.freeze({
  async list(): Promise<Response> { return Response.json(VIEW, { headers: customerAccountHeaders() }); },
  async create(): Promise<Response> {
    return Response.json({ address: ADDRESS }, { status: 201, headers: customerAccountHeaders() });
  },
  async revise(): Promise<Response> {
    return Response.json({ address: ADDRESS }, { headers: customerAccountHeaders() });
  },
  async listView(request: Request): Promise<CustomerAddressListView> {
    return new URL(request.url).searchParams.get('empty') === '1' ? EMPTY : VIEW;
  },
}) satisfies CustomerAddressHttp;

/** Seam visual local: no DB, cookie, secreto, proveedor ni red. */
export async function createRuntimeCustomerAddressHttp(): Promise<CustomerAddressHttp> {
  return http;
}

export const customerAddressRuntimeObservability = Object.freeze({ count(): void {} });

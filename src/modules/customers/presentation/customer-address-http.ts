import type { CustomerAddressAccessView } from '../application/resource-ownership-ports';

export const CUSTOMER_ADDRESS_API_PATH = '/api/customer/addresses';
export const CUSTOMER_ADDRESS_API_PREFIX = `${CUSTOMER_ADDRESS_API_PATH}/`;
export const CUSTOMER_ADDRESS_PAGE_PATH = '/cuenta/direcciones';
export const CUSTOMER_ADDRESS_HTTP_LOCAL = 'customerAddressHttp';

export function isCustomerAddressPath(pathname: string): boolean {
  return pathname === CUSTOMER_ADDRESS_API_PATH || pathname.startsWith(CUSTOMER_ADDRESS_API_PREFIX) ||
    pathname === CUSTOMER_ADDRESS_PAGE_PATH || pathname.startsWith(`${CUSTOMER_ADDRESS_PAGE_PATH}/`);
}

export type CustomerAddressListView = Readonly<{
  addresses: readonly CustomerAddressAccessView[];
  csrfToken: string;
  ordersAvailable: boolean;
}>;

export interface CustomerAddressHttp {
  list(request: Request): Promise<Response>;
  create(request: Request): Promise<Response>;
  revise(request: Request, publicRef: string | undefined): Promise<Response>;
  listView(request: Request): Promise<CustomerAddressListView | Response>;
}

function isCustomerAddressHttp(value: unknown): value is CustomerAddressHttp {
  return typeof value === 'object' && value !== null &&
    typeof Reflect.get(value, 'list') === 'function' &&
    typeof Reflect.get(value, 'create') === 'function' &&
    typeof Reflect.get(value, 'revise') === 'function' &&
    typeof Reflect.get(value, 'listView') === 'function';
}

export function customerAddressHttpFromLocals(locals: object): CustomerAddressHttp | null {
  const value = Reflect.get(locals, CUSTOMER_ADDRESS_HTTP_LOCAL) as unknown;
  return isCustomerAddressHttp(value) ? value : null;
}

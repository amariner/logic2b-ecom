import type { CustomerOrderAccessView } from '../application/resource-ownership-ports';

export const CUSTOMER_ORDER_API_PATH = '/api/customer/orders';
export const CUSTOMER_ORDER_API_PREFIX = `${CUSTOMER_ORDER_API_PATH}/`;
export const CUSTOMER_ORDER_PAGE_PATH = '/cuenta/pedidos';
export const CUSTOMER_ORDER_ACCESS_HTTP_LOCAL = 'customerOrderAccessHttp';

export function isCustomerOrderAccessPath(pathname: string): boolean {
  return pathname === CUSTOMER_ORDER_API_PATH || pathname.startsWith(CUSTOMER_ORDER_API_PREFIX) ||
    pathname === CUSTOMER_ORDER_PAGE_PATH || pathname.startsWith(`${CUSTOMER_ORDER_PAGE_PATH}/`);
}

export type CustomerOrderListView = Readonly<{
  orders: readonly CustomerOrderAccessView[];
  nextCursor: string | null;
}>;

export interface CustomerOrderAccessHttp {
  list(request: Request, cursor: string | null): Promise<Response>;
  read(request: Request, publicRef: string | undefined): Promise<Response>;
  listView(request: Request, cursor: string | null): Promise<CustomerOrderListView | Response>;
  readView(request: Request, publicRef: string | undefined): Promise<CustomerOrderAccessView | Response>;
}

function isCustomerOrderAccessHttp(value: unknown): value is CustomerOrderAccessHttp {
  return typeof value === 'object' && value !== null &&
    typeof Reflect.get(value, 'list') === 'function' &&
    typeof Reflect.get(value, 'read') === 'function' &&
    typeof Reflect.get(value, 'listView') === 'function' &&
    typeof Reflect.get(value, 'readView') === 'function';
}

export function customerOrderAccessHttpFromLocals(locals: object): CustomerOrderAccessHttp | null {
  const value = Reflect.get(locals, CUSTOMER_ORDER_ACCESS_HTTP_LOCAL) as unknown;
  return isCustomerOrderAccessHttp(value) ? value : null;
}

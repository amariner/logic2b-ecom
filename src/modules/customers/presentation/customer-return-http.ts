import type {
  CustomerReturnEligibilityView,
  CustomerReturnRequestView,
} from '../application/customer-return-request-repository';

export const CUSTOMER_RETURN_API_PATH = '/api/customer/returns';
export const CUSTOMER_RETURN_API_PREFIX = `${CUSTOMER_RETURN_API_PATH}/`;
export const CUSTOMER_RETURN_PAGE_PATH = '/cuenta/devoluciones';
export const CUSTOMER_RETURN_HTTP_LOCAL = 'customerReturnHttp';

export function isCustomerReturnPath(pathname: string): boolean {
  return pathname === CUSTOMER_RETURN_API_PATH || pathname.startsWith(CUSTOMER_RETURN_API_PREFIX) ||
    pathname === CUSTOMER_RETURN_PAGE_PATH || pathname.startsWith(`${CUSTOMER_RETURN_PAGE_PATH}/`);
}

export type CustomerReturnListView = Readonly<{
  requests: readonly CustomerReturnRequestView[];
  eligibility: readonly CustomerReturnEligibilityView[];
  csrfToken: string;
  ordersAvailable: boolean;
  addressesAvailable: boolean;
}>;

export interface CustomerReturnHttp {
  list(request: Request): Promise<Response>;
  read(request: Request, publicRef: string | undefined): Promise<Response>;
  create(request: Request): Promise<Response>;
  listView(request: Request): Promise<CustomerReturnListView | Response>;
  readView(request: Request, publicRef: string | undefined): Promise<CustomerReturnRequestView | Response>;
}

function isHttp(value: unknown): value is CustomerReturnHttp {
  return typeof value === 'object' && value !== null &&
    ['list', 'read', 'create', 'listView', 'readView']
      .every((key) => typeof Reflect.get(value, key) === 'function');
}

export function customerReturnHttpFromLocals(locals: object): CustomerReturnHttp | null {
  const value = Reflect.get(locals, CUSTOMER_RETURN_HTTP_LOCAL) as unknown;
  return isHttp(value) ? value : null;
}

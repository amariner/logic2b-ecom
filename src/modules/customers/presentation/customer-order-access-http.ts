export const CUSTOMER_ORDER_API_PREFIX = '/api/customer/orders/';
export const CUSTOMER_ORDER_ACCESS_HTTP_LOCAL = 'customerOrderAccessHttp';

export interface CustomerOrderAccessHttp {
  read(request: Request, publicRef: string | undefined): Promise<Response>;
}

function isCustomerOrderAccessHttp(value: unknown): value is CustomerOrderAccessHttp {
  return typeof value === 'object' && value !== null &&
    typeof Reflect.get(value, 'read') === 'function';
}

export function customerOrderAccessHttpFromLocals(locals: object): CustomerOrderAccessHttp | null {
  const value = Reflect.get(locals, CUSTOMER_ORDER_ACCESS_HTTP_LOCAL) as unknown;
  return isCustomerOrderAccessHttp(value) ? value : null;
}

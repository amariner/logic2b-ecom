import type { APIRoute } from 'astro';
import { customerAddressHttpFromLocals } from '../../../../modules/customers/presentation/customer-address-http';
import { customerAccountHeaders } from '../../../../modules/customers/presentation/passwordless-http';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  const http = customerAddressHttpFromLocals(locals);
  if (http === null) {
    return Response.json({ error: { code: 'customer.resource.not_found' } }, {
      status: 404,
      headers: customerAccountHeaders(),
    });
  }
  if ([...new URL(request.url).searchParams.keys()].length > 0) {
    return Response.json({ error: { code: 'customer.request.invalid' } }, {
      status: 400,
      headers: customerAccountHeaders(),
    });
  }
  return http.revise(request, params.ref);
};

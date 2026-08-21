import type { APIRoute } from 'astro';
import { customerOrderAccessHttpFromLocals } from '../../../../modules/customers/presentation/customer-order-access-http';
import { customerAccountHeaders } from '../../../../modules/customers/presentation/passwordless-http';

export const prerender = false;

export const GET: APIRoute = async ({ request, params, locals }) => {
  const http = customerOrderAccessHttpFromLocals(locals);
  if (http === null) {
    return Response.json({ error: { code: 'customer.resource.not_found' } }, {
      status: 404,
      headers: customerAccountHeaders(),
    });
  }
  return http.read(request, params.ref);
};

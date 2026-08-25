import type { APIRoute } from 'astro';
import { customerReturnHttpFromLocals } from '../../../../modules/customers/presentation/customer-return-http';
import { customerAccountHeaders } from '../../../../modules/customers/presentation/passwordless-http';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals, params }) => {
  if ([...new URL(request.url).searchParams.keys()].length > 0) {
    return Response.json({ error: { code: 'customer.request.invalid' } }, {
      status: 400, headers: customerAccountHeaders(),
    });
  }
  const http = customerReturnHttpFromLocals(locals);
  return http?.read(request, params.ref) ?? Response.json({
    error: { code: 'customer.resource.not_found' },
  }, { status: 404, headers: customerAccountHeaders() });
};

import type { APIRoute } from 'astro';
import { customerReturnHttpFromLocals } from '../../../../modules/customers/presentation/customer-return-http';
import { customerAccountHeaders } from '../../../../modules/customers/presentation/passwordless-http';

export const prerender = false;

const unavailable = () => Response.json({ error: { code: 'customer.resource.not_found' } }, {
  status: 404, headers: customerAccountHeaders(),
});

export const GET: APIRoute = async ({ request, locals }) => {
  if ([...new URL(request.url).searchParams.keys()].length > 0) {
    return Response.json({ error: { code: 'customer.request.invalid' } }, {
      status: 400, headers: customerAccountHeaders(),
    });
  }
  return customerReturnHttpFromLocals(locals)?.list(request) ?? unavailable();
};

export const POST: APIRoute = async ({ request, locals }) =>
  customerReturnHttpFromLocals(locals)?.create(request) ?? unavailable();

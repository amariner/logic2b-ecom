import type { APIRoute } from 'astro';
import { customerAddressHttpFromLocals } from '../../../../modules/customers/presentation/customer-address-http';
import { customerAccountHeaders } from '../../../../modules/customers/presentation/passwordless-http';

export const prerender = false;

function unavailable(): Response {
  return Response.json({ error: { code: 'customer.resource.not_found' } }, {
    status: 404,
    headers: customerAccountHeaders(),
  });
}

function invalidRequest(): Response {
  return Response.json({ error: { code: 'customer.request.invalid' } }, {
    status: 400,
    headers: customerAccountHeaders(),
  });
}

export const GET: APIRoute = async ({ request, locals }) => {
  const http = customerAddressHttpFromLocals(locals);
  if (http === null) return unavailable();
  if ([...new URL(request.url).searchParams.keys()].length > 0) return invalidRequest();
  return http.list(request);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const http = customerAddressHttpFromLocals(locals);
  return http === null ? unavailable() : http.create(request);
};

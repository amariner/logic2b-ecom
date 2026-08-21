import type { APIRoute } from 'astro';
import { customerOrderAccessHttpFromLocals } from '../../../../modules/customers/presentation/customer-order-access-http';
import { customerAccountHeaders } from '../../../../modules/customers/presentation/passwordless-http';

export const prerender = false;

function invalidRequest(): Response {
  return Response.json({ error: { code: 'customer.request.invalid' } }, {
    status: 400,
    headers: customerAccountHeaders(),
  });
}

export const GET: APIRoute = async ({ request, locals }) => {
  const http = customerOrderAccessHttpFromLocals(locals);
  if (http === null) {
    return Response.json({ error: { code: 'customer.resource.not_found' } }, {
      status: 404,
      headers: customerAccountHeaders(),
    });
  }
  const search = new URL(request.url).searchParams;
  if ([...search.keys()].some((key) => key !== 'cursor') || search.getAll('cursor').length > 1) {
    return invalidRequest();
  }
  return http.list(request, search.get('cursor'));
};

import type { CustomerAccountHttp } from '../../../src/modules/customers/presentation/customer-account-http';
import { customerAccountHeaders } from '../../../src/modules/customers/presentation/passwordless-http';

const CSRF_TOKEN = 'C'.repeat(43);
const FIXTURE_AT = '2026-08-19T12:00:00.000Z';

function redirect(request: Request, path: string): Response {
  return new Response(null, {
    status: 303,
    headers: customerAccountHeaders({ location: new URL(path, request.url).toString() }),
  });
}

const http = Object.freeze({
  async requestAccess(): Promise<Response> {
    return new Response(
      '<!doctype html><html lang="es"><title>Revisa tu email</title>' +
      '<main><h1>Revisa tu email</h1><p>Solicitud recibida.</p></main></html>',
      {
        status: 202,
        headers: customerAccountHeaders({ 'content-type': 'text/html; charset=utf-8' }),
      },
    );
  },
  async confirmationView() {
    return Object.freeze({ csrfToken: CSRF_TOKEN });
  },
  async consumeAccess(request: Request): Promise<Response> {
    return redirect(request, '/cuenta/sesiones');
  },
  async currentSession() {
    return Object.freeze({
      csrfToken: CSRF_TOKEN,
      ordersAvailable: true,
      addressesAvailable: true,
      session: Object.freeze({
        issuedAt: FIXTURE_AT,
        expiresAt: '2026-08-20T12:00:00.000Z',
        absoluteExpiresAt: '2026-09-18T12:00:00.000Z',
      }),
    });
  },
  async logout(request: Request): Promise<Response> {
    return redirect(request, '/cuenta/acceso');
  },
}) satisfies CustomerAccountHttp;

/**
 * Seam visual deliberadamente inerte. Solo el modo `surface` de la config de
 * auditoría lo importa; no toca DB, proveedor, secretos, cookies ni red.
 */
export async function createRuntimeCustomerAccountHttp(): Promise<CustomerAccountHttp> {
  return http;
}

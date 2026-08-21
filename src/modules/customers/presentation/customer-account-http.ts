export const CUSTOMER_ACCOUNT_ROUTES = Object.freeze({
  access: '/cuenta/acceso',
  confirmAccess: '/cuenta/acceso/confirmar',
  sessions: '/cuenta/sesiones',
});

export const CUSTOMER_ACCOUNT_HTTP_LOCAL = 'customerAccountHttp';

export type CustomerAccessConfirmationView = Readonly<{
  /** Token real o dummy, siempre con la misma forma; nunca contiene el proof. */
  csrfToken: string;
}>;

export type CurrentCustomerSessionView = Readonly<{
  /** CSRF ligado a la sesión y su generación; logout lo valida en servidor. */
  csrfToken: string;
  session: Readonly<{
    issuedAt: string;
    expiresAt: string;
    absoluteExpiresAt: string;
  }>;
  /** Solo true cuando CUS-004 tiene rutas activas en este despliegue. */
  ordersAvailable: boolean;
}>;

/**
 * Frontera mínima entre las páginas Astro y la composición HTTP de CUS-003.
 * La presentación no conoce repositorios, secretos, cookies ni errores de
 * aplicación: cada mutación devuelve la Response completa construida por la
 * capa HTTP segura.
 */
export interface CustomerAccountHttp {
  /** Respuesta pública uniforme 202, incluida su cookie real/dummy. */
  requestAccess(request: Request): Promise<Response>;
  /** GET genérico: deriva CSRF real/dummy de la cookie previa, no del fragmento. */
  confirmationView(request: Request): Promise<CustomerAccessConfirmationView>;
  /** Consume challenge/proof/CSRF y devuelve un 303 limpio; elimina la cookie de intento. */
  consumeAccess(request: Request): Promise<Response>;
  /** Devuelve el contexto mínimo de la sesión o una redirección limpia. */
  currentSession(request: Request): Promise<CurrentCustomerSessionView | Response>;
  /** Valida Origin y session-CSRF, revoca la sesión y devuelve una Response limpia. */
  logout(request: Request): Promise<Response>;
}

function isCustomerAccountHttp(value: unknown): value is CustomerAccountHttp {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Record<keyof CustomerAccountHttp, unknown>>;
  return typeof candidate.requestAccess === 'function' &&
    typeof candidate.confirmationView === 'function' &&
    typeof candidate.consumeAccess === 'function' &&
    typeof candidate.currentSession === 'function' &&
    typeof candidate.logout === 'function';
}

export function customerAccountHttpFromLocals(locals: object): CustomerAccountHttp | null {
  const value = Reflect.get(locals, CUSTOMER_ACCOUNT_HTTP_LOCAL) as unknown;
  return isCustomerAccountHttp(value) ? value : null;
}

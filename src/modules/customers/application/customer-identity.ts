import { normalizeCustomerEmail } from '../domain/customer-profile';

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Clave no enumerable para el índice de identidad. Cada despliegue debe aportar
 * un secreto aleatorio propio; nunca se registra ni se expone al navegador.
 */
export async function customerEmailIdentityHash(email: string, secret: string): Promise<string> {
  if (secret.length < 32 || /[\u0000-\u001f\u007f]/u.test(secret)) {
    throw new RangeError('El secreto de identidad debe tener al menos 32 caracteres seguros.');
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const canonical = normalizeCustomerEmail(email);
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`logic2b:customer-email:v1:${canonical}`),
  );
  return hex(digest);
}

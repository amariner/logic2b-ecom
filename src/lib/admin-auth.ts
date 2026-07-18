/**
 * Sesión del panel de admin con cookie firmada (HMAC-SHA256 via Web Crypto,
 * compatible con el edge — nada de `crypto` de Node).
 *
 * El token es `expiry.firma`: caducidad en ms + HMAC de esa caducidad con
 * ADMIN_COOKIE_SECRET. Sin estado en servidor: verificar = comprobar firma y
 * fecha. En producción real el panel va además tras Cloudflare Access; esta
 * cookie es la capa de login que la demo enseña.
 */

export const ADMIN_COOKIE_NAME = 'admin_session';
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

/** Contraseña del panel en modo demo. Se muestra en el login: la demo enseña el flujo, no lo esconde. */
export const DEMO_ADMIN_PASSWORD = 'demo';

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-f]/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function createSessionToken(secret: string, now: number = Date.now()): Promise<string> {
  const expiry = String(now + SESSION_TTL_MS);
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(expiry));
  return `${expiry}.${toHex(signature)}`;
}

export async function verifySessionToken(
  secret: string,
  token: string,
  now: number = Date.now(),
): Promise<boolean> {
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expiry = token.slice(0, dot);
  const signature = fromHex(token.slice(dot + 1));
  if (signature === null || !/^\d{1,15}$/.test(expiry) || Number(expiry) <= now) return false;
  // subtle.verify compara en tiempo constante: sin fugas por timing.
  return crypto.subtle.verify('HMAC', await hmacKey(secret), signature, encoder.encode(expiry));
}

/**
 * Secreto de firma. En demo sin `.dev.vars` usamos un valor fijo para no
 * bloquear el arranque local; con DEMO_MODE off el secreto es obligatorio.
 */
export function resolveCookieSecret(env: {
  ADMIN_COOKIE_SECRET?: string | undefined;
  DEMO_MODE: string;
}): string | null {
  if (env.ADMIN_COOKIE_SECRET) return env.ADMIN_COOKIE_SECRET;
  return env.DEMO_MODE === 'true' ? 'demo-insecure-cookie-secret' : null;
}

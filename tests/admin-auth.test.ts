import { describe, expect, it } from 'vitest';
import {
  SESSION_TTL_MS,
  createSessionToken,
  resolveCookieSecret,
  verifySessionToken,
} from '../src/lib/admin-auth';

const SECRET = 'test-secret';
const NOW = 1_752_000_000_000;

describe('sesión firmada del admin', () => {
  it('un token recién creado verifica', async () => {
    const token = await createSessionToken(SECRET, NOW);
    expect(await verifySessionToken(SECRET, token, NOW)).toBe(true);
    expect(await verifySessionToken(SECRET, token, NOW + SESSION_TTL_MS - 1)).toBe(true);
  });

  it('caduca pasado el TTL', async () => {
    const token = await createSessionToken(SECRET, NOW);
    expect(await verifySessionToken(SECRET, token, NOW + SESSION_TTL_MS)).toBe(false);
  });

  it('rechaza firmas de otro secreto', async () => {
    const token = await createSessionToken('otro-secreto', NOW);
    expect(await verifySessionToken(SECRET, token, NOW)).toBe(false);
  });

  it('rechaza tokens manipulados', async () => {
    const token = await createSessionToken(SECRET, NOW);
    const [expiry, sig] = token.split('.') as [string, string];
    // Alargar la caducidad sin refirmar no cuela.
    expect(await verifySessionToken(SECRET, `${Number(expiry) + 1}.${sig}`, NOW)).toBe(false);
    // Ni tocar un byte de la firma.
    const flipped = (sig[0] === '0' ? '1' : '0') + sig.slice(1);
    expect(await verifySessionToken(SECRET, `${expiry}.${flipped}`, NOW)).toBe(false);
  });

  it('rechaza tokens malformados sin lanzar', async () => {
    for (const bad of ['', 'sin-punto', '.', 'abc.def', '123.', '123.zz', `${NOW}.` + 'g'.repeat(64)]) {
      expect(await verifySessionToken(SECRET, bad, NOW)).toBe(false);
    }
  });

  it('resolveCookieSecret: secreto real > fallback demo > nada', () => {
    expect(resolveCookieSecret({ ADMIN_COOKIE_SECRET: 's3cr3t', DEMO_MODE: 'true' })).toBe('s3cr3t');
    expect(resolveCookieSecret({ DEMO_MODE: 'true' })).toBe('demo-insecure-cookie-secret');
    expect(resolveCookieSecret({ DEMO_MODE: 'false' })).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  SESSION_TTL_MS,
  createSessionToken,
  resolveCookieSecret,
  verifySessionToken,
  isGuidedDemoEntry,
} from '../src/lib/admin-auth';
import { demoAdminNextPath, demoAdminEntryHref } from '../src/shared-kernel/demo-guide-routes';

const SECRET = 'test-secret';
const NOW = 1_752_000_000_000;

describe('sesión firmada del admin', () => {
  it('el acceso guiado solo se autoriza para GET explícito con DEMO_MODE true', () => {
    expect(isGuidedDemoEntry('true', 'GET', '1', false, false)).toBe(true);
    for (const mode of ['false', '', 'TRUE']) expect(isGuidedDemoEntry(mode, 'GET', '1', false, false)).toBe(false);
    expect(isGuidedDemoEntry('true', 'POST', '1', false, false)).toBe(false);
    expect(isGuidedDemoEntry('true', 'GET', null, false, false)).toBe(false);
    expect(isGuidedDemoEntry('true', 'GET', '1', true, false)).toBe(false);
    expect(isGuidedDemoEntry('true', 'GET', '1', false, true)).toBe(false);
  });

  it('el acceso guiado limita los destinos a las vistas existentes del gestor', () => {
    for (const raw of ['https://example.com', '//example.com', '/demo/admin/login', '/demo/admin/../../api/demo/reset',
      '/demo/admin/..%2f..%2fapi/demo/reset', '/api/admin/products/1', '/demo/admin\\evil', '/demo/admin#exit', '/demo/admin?\r\nlocation=//example.com']) {
      expect(demoAdminNextPath(raw)).toBe('/demo/admin');
    }
    expect(demoAdminNextPath('/demo/admin?estado=paid')).toBe('/demo/admin?estado=paid');
    expect(demoAdminNextPath('/demo/admin/pedidos/5')).toBe('/demo/admin/pedidos/5');
    expect(demoAdminNextPath('/demo/admin/segmentos')).toBe('/demo/admin/segmentos');
    expect(demoAdminNextPath('/demo/admin/segmentos/export')).toBe('/demo/admin');
    expect(demoAdminNextPath('/demo/admin/mercados')).toBe('/demo/admin/mercados');
    expect(demoAdminNextPath('/demo/admin/mercados/publish')).toBe('/demo/admin');
    expect(demoAdminNextPath('/demo/admin/publicacion')).toBe('/demo/admin/publicacion');
    expect(demoAdminNextPath('/demo/admin/publicacion/apply')).toBe('/demo/admin');
    expect(demoAdminNextPath('/demo/admin/impuestos')).toBe('/demo/admin/impuestos');
    expect(demoAdminNextPath('/demo/admin/impuestos/calculate')).toBe('/demo/admin');
    expect(demoAdminEntryHref('/demo/admin/envios')).toBe('/demo/admin/login?tour=1&next=%2Fdemo%2Fadmin%2Fenvios');
  });
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

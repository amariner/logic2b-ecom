import { describe, expect, it } from 'vitest';
import { platformManifest as demoManifest } from '../platform.config';
import { createPlatform } from '../src/composition/create-platform';
import { decideRouteAccess } from '../src/platform/configuration';
import { platformManifest as auditManifest } from '../scripts/fixtures/customer-account/platform.config';
import { createRuntimeCustomerAccountHttp } from '../scripts/fixtures/customer-account/runtime-customer-account';
import auditConfig from '../scripts/fixtures/customer-account/astro.config.mjs?raw';
import auditScript from '../scripts/audit-customer-account-local.mjs?raw';
import auditWrangler from '../scripts/fixtures/customer-account/wrangler.jsonc?raw';

describe('arnés local R5.4d', () => {
  it('usa un manifest cliente válido sin modificar el manifest demo', () => {
    const demo = createPlatform(demoManifest);
    const audit = createPlatform(auditManifest);

    expect(decideRouteAccess(demo, '/cuenta/acceso')).toMatchObject({
      allowed: false,
      status: 404,
      capabilityId: 'CUS-003',
    });
    expect(decideRouteAccess(audit, '/cuenta/acceso')).toMatchObject({
      allowed: true,
      capabilityId: 'CUS-003',
      state: 'active',
    });
    expect(decideRouteAccess(audit, '/cuenta/pedidos')).toMatchObject({
      allowed: true,
      capabilityId: 'CUS-004',
      state: 'active',
    });
    expect(audit.manifest.deployment).toMatchObject({
      id: 'customer-account-local-audit',
      mode: 'client',
      environment: 'development',
      profile: 'custom',
    });
  });

  it('limita los seams a surface y deja preflight sobre el runtime real', () => {
    expect(auditConfig).toContain("mode !== 'demo' && mode !== 'preflight' && mode !== 'surface'");
    expect(auditConfig).toContain("if (mode !== 'demo')");
    expect(auditConfig).toContain("if (mode === 'surface')");
    expect(auditConfig).toContain("find: '../../platform.config'");
    expect(auditConfig).toContain("find: './composition/runtime-customer-account'");
    expect(auditConfig).toContain("find: './composition/runtime-customer-order-access'");
    expect(auditConfig).toContain("find: './composition/customer-account-edge'");
  });

  it('mantiene la fixture visual inerte y sin dependencias externas', async () => {
    const http = await createRuntimeCustomerAccountHttp();
    await expect(http.confirmationView(new Request('https://local.test/')))
      .resolves.toMatchObject({ csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u) });
    expect(auditWrangler).toContain('"DEMO_MODE": "false"');
    expect(auditWrangler).not.toContain('d1_databases');
    expect(auditWrangler).not.toContain('RESEND_API_KEY');
  });

  it('prueba ausencia, preflight y navegador responsive sin escribir configuración', () => {
    expect(auditScript).toContain('demo ${path} permanece ausente');
    expect(auditScript).toContain('falla cerrado sin secretos');
    expect(auditScript).toContain("['scripts/a11y-audit.mjs', '--only=customer-account:']");
    expect(auditScript).toContain("AUDIT_CUSTOMER_ACCOUNT: 'true'");
    expect(auditScript).toContain('superficie activa sirve historial owner-only');
    expect(auditScript).toContain('índice API activo devuelve DTO mínimo');
    expect(auditScript).toContain("['demo', 'preflight', 'surface']");
    expect(auditScript).not.toMatch(/\b(?:writeFile|copyFile|rename|unlink)\b/u);
  });
});

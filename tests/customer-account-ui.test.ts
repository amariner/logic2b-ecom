import { describe, expect, it } from 'vitest';
import customerAccountLayout from '../src/layouts/CustomerAccount.astro?raw';
import accessPage from '../src/pages/cuenta/acceso/index.astro?raw';
import confirmPage from '../src/pages/cuenta/acceso/confirmar.astro?raw';
import sessionsPage from '../src/pages/cuenta/sesiones.astro?raw';
import confirmScript from '../src/modules/customers/presentation/customer-passwordless-confirm.ts?raw';
import astroConfig from '../astro.config.mjs?raw';

const pages = [accessPage, confirmPage, sessionsPage];

describe('superficie visual de cuenta', () => {
  it('usa un layout noindex sin scripts inline, analytics ni terceros', () => {
    expect(customerAccountLayout).toContain('noindex,nofollow,noarchive');
    expect(customerAccountLayout).toContain('name="referrer" content="no-referrer"');
    expect(customerAccountLayout).not.toMatch(/<script\b/iu);
    expect(customerAccountLayout).not.toMatch(/<style\b/iu);
    expect(customerAccountLayout).not.toContain('Base.astro');
    expect(customerAccountLayout).not.toContain('WhatsAppContact');
    expect(customerAccountLayout).not.toContain('analytics');
    expect(customerAccountLayout).not.toMatch(/https?:\/\//u);
  });

  it('impide que Astro convierta el módulo sensible en JavaScript inline', () => {
    expect(astroConfig).toContain('assetsInlineLimit(filePath)');
    expect(astroConfig).toContain("filePath.includes('confirmar.astro_astro_type_script_index_0')");
    expect(astroConfig).toContain('? false');
  });

  it('mantiene las tres páginas server-side, genéricas y separadas de persistencia', () => {
    for (const source of pages) {
      expect(source).toContain('CustomerAccount');
      expect(source).toContain('export const prerender = false');
      expect(source).not.toContain('runtime.env');
      expect(source).not.toContain('D1');
      expect(source).not.toContain('Repository');
      expect(source).not.toMatch(/https?:\/\//u);
      expect(source).not.toContain('analytics');
    }
    expect(accessPage).toContain('accountHttp.requestAccess(Astro.request)');
    expect(confirmPage).toContain('accountHttp.confirmationView(Astro.request)');
    expect(confirmPage).toContain('accountHttp.consumeAccess(Astro.request)');
    expect(sessionsPage).toContain('accountHttp.currentSession(Astro.request)');
    expect(sessionsPage).toContain('accountHttp.logout(Astro.request)');
  });

  it('solicita acceso por POST sin revelar presencia de cuenta en la vista', () => {
    expect(accessPage).toContain('method="post"');
    expect(accessPage).toContain('action={CUSTOMER_ACCOUNT_ROUTES.access}');
    expect(accessPage).toContain('si podemos tramitar la solicitud');
    expect(accessPage).not.toContain('usuario encontrado');
    expect(accessPage).not.toContain('email existe');
  });

  it('confirma con un único módulo externo y nunca coloca credenciales en el HTML', () => {
    const scripts = [...confirmPage.matchAll(/<script\b([^>]*)>/giu)];
    expect(scripts).toHaveLength(1);
    expect(confirmPage).toContain('import { initialisePasswordlessConfirmation }');
    expect(confirmPage).toContain('initialisePasswordlessConfirmation();');
    expect(confirmPage).not.toContain('name="challenge"');
    expect(confirmPage).not.toContain('name="proof"');
    expect(confirmPage).not.toContain('Astro.url.hash');
    expect(confirmPage).not.toContain('disabled:opacity-50');
    expect(confirmPage).toContain('disabled:!text-foreground');
    expect(confirmPage).toContain('disabled:[-webkit-text-fill-color:var(--foreground)]');
    expect(confirmScript).not.toContain('localStorage');
    expect(confirmScript).not.toContain('sessionStorage');
    expect(confirmScript).not.toContain('console.');
    expect(confirmScript.indexOf('history.replaceState')).toBeLessThan(confirmScript.indexOf('document.querySelector'));
  });

  it('limita sesiones al contexto actual y logout POST con session-CSRF', () => {
    expect(sessionsPage).toContain('Sesión actual');
    expect(sessionsPage).toContain('type="hidden" name="csrfToken"');
    expect(sessionsPage).toContain('Cerrar esta sesión');
    expect(sessionsPage).not.toContain('Cerrar todas');
    expect(sessionsPage).not.toContain('revokeAll');
  });
});

import { transpileModule, ScriptTarget } from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import projectDialog from '../src/components/ProjectDialog.astro?raw';
import projectForm from '../src/components/ProjectForm.astro?raw';
import checkout from '../src/components/store/CheckoutPage.astro?raw';
import arce from '../src/components/themes/arce/Catalog.astro?raw';
import noddo from '../src/components/themes/noddo/Catalog.astro?raw';
import zancada from '../src/components/themes/zancada/Theme.astro?raw';
import beacon from '../src/components/CloudflarePageview.astro?raw';
import adminLogin from '../src/pages/demo/admin/login.astro?raw';

const adminPages = import.meta.glob<string>('../src/pages/demo/admin/**/*.astro', {
  eager: true, query: '?raw', import: 'default',
});

const script = transpileModule(projectDialog.match(/<script>([\s\S]*?)<\/script>/u)![1]!, {
  compilerOptions: { target: ScriptTarget.ES2022 },
}).outputText;

function setup(demo: boolean, valid = true) {
  let submit: ((event: { preventDefault: () => void }) => Promise<void>) | undefined;
  const status = { textContent: '', className: '' };
  const button = { textContent: 'Enviar solicitud', disabled: false };
  const reset = vi.fn();
  const form = {
    dataset: demo ? { projectDemo: 'true' } : {},
    querySelector: (selector: string) => selector === '[data-form-status]' ? status : button,
    addEventListener: (_event: string, handler: typeof submit) => { submit = handler; },
    reportValidity: () => valid,
    reset,
  };
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  const readData = vi.fn(() => [['name', 'Ejemplo'], ['email', 'ejemplo@example.invalid']]);
  // Ejecuta el script real con sus tres dependencias de navegador sustituidas.
  new Function('document', 'fetch', 'FormData', script)(
    { querySelector: () => null, querySelectorAll: () => [form] },
    fetch,
    class { constructor() { return readData(); } },
  );
  return { submit: () => submit!({ preventDefault: vi.fn() }), status, reset, fetch, readData };
}

describe('aislamiento de formularios de muestra', () => {
  it('confirma la demo sin leer los campos, enviar una solicitud ni persistir datos', async () => {
    const demo = setup(true);
    await demo.submit();
    expect(demo.fetch).not.toHaveBeenCalled();
    expect(demo.readData).not.toHaveBeenCalled();
    expect(demo.reset).toHaveBeenCalledOnce();
    expect(demo.status.textContent).toContain('no se ha enviado ninguna solicitud');
  });

  it('conserva la validación antes de simular y no afirma éxito con datos inválidos', async () => {
    const demo = setup(true, false);
    await demo.submit();
    expect(demo.fetch).not.toHaveBeenCalled();
    expect(demo.reset).not.toHaveBeenCalled();
    expect(demo.status.textContent).toBe('');
  });

  it('conserva el envío progresivo en un formulario de cliente habilitado', async () => {
    const client = setup(false);
    await client.submit();
    expect(client.fetch).toHaveBeenCalledWith('/api/contact', expect.objectContaining({ method: 'POST' }));
    expect(client.readData).toHaveBeenCalledOnce();
    expect(client.status.textContent).toContain('Recibido');
  });

  it('declara métodos sin red aunque el JavaScript del formulario no llegue a ejecutarse', () => {
    expect(projectForm).toContain("method={demoMode ? 'dialog' : 'post'}");
    expect(projectForm).toContain("action={demoMode ? undefined : '/api/contact'}");
    for (const source of [checkout, arce, noddo, zancada]) {
      expect(source).toMatch(/<form method="dialog" (?:data-checkout-form|data-arce-newsletter|data-noddo-contact|data-newsletter)/u);
    }
  });

  it('el beacon exige un despliegue de cliente además de disponer de un token', () => {
    expect(beacon).toContain("runtimePlatform.manifest.deployment.mode === 'demo'");
    expect(beacon).toContain("Astro.locals.runtime?.env.DEMO_MODE === 'true'");
    expect(beacon).toContain('!demoMode && shopConfig.analytics.cfBeaconToken');
  });

  it('el panel mantiene la interfaz inerte si el manifest y la variable de entorno divergen', () => {
    const pagesWithActions = Object.values(adminPages).filter((source) => source.includes('const readOnly ='));
    expect(pagesWithActions.length).toBeGreaterThanOrEqual(10);
    for (const source of pagesWithActions) {
      expect(source).toContain("const readOnly = runtimePlatform.manifest.deployment.mode === 'demo' || Astro.locals.runtime.env.DEMO_MODE === 'true'");
    }
    expect(adminLogin).toContain("const demoMode = runtimePlatform.manifest.deployment.mode === 'demo' || env.DEMO_MODE === 'true'");
  });
});

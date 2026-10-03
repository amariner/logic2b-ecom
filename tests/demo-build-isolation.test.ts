import { describe, expect, it } from 'vitest';
import { assertDemoBuild } from '../scripts/assert-demo-build.mjs';

const config = { vars: { DEMO_MODE: 'true' }, triggers: { crons: [] as string[] } };
const local = '<form method="dialog" data-project-form data-project-demo="true"><button>Ejemplo</button></form>';
const pages = (html: string) => [{ path: 'index.html', html }];

describe('demo build artifact isolation', () => {
  it('accepts local demo forms and read-only search while preserving client builds', () => {
    expect(assertDemoBuild(config, pages(local + '<form method="get"></form>'))).toMatchObject({ checked: true, forms: 1 });
    expect(assertDemoBuild({ vars: { DEMO_MODE: 'false' } }, pages('<form method="post"></form>')).checked).toBe(false);
  });
  it.each([
    '<form method="post" action="/api/contact" data-project-form></form>',
    '<form action="/api/contact" data-project-form></form>',
    '<form method="dialog" action="/api/contact" data-project-form data-project-demo="true"></form>',
    local + '<form METHOD=POST action=/api/contact></form>',
    local + '<button formaction="/api/contact">Enviar</button>',
    '<form method="dialog" data-project-form data-project-demo="true"><button formmethod="post">Enviar</button></form>',
    '<form data-method="dialog" method="post" data-project-form data-project-demo="true"></form>',
    '<form method="dialog" data-project-form x-data-project-demo="true"></form>',
    '<form method="post" method="dialog" data-project-form data-project-demo="true"></form>',
    local + '<script src="https://static.cloudflareinsights.com/beacon.min.js"></script>',
    local + '<script data-cf-beacon="{}"></script>',
  ])('rejects client HTML or a submission override in a demo artifact', (html) => {
    expect(() => assertDemoBuild(config, pages(html))).toThrow();
  });
  it('rejects scheduled demo work and missing artifacts', () => {
    expect(() => assertDemoBuild({ ...config, triggers: { crons: ['* * * * *'] } }, pages(local))).toThrow('cron');
    expect(() => assertDemoBuild(config, [])).toThrow('HTML');
    expect(() => assertDemoBuild(config, pages('<h1>Incomplete build</h1>'))).toThrow('formulario');
  });
});

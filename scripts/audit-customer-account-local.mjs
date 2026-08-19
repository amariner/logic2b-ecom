/**
 * Evidencia local R5.4d sin activar la demo ni usar credenciales reales.
 *
 * Compila y ejecuta tres Workers efímeros y secuenciales:
 *   1. composición real de la demo: las rutas de cuenta deben ser 404;
 *   2. manifest cliente activo + runtime real sin secretos: debe fallar 503;
 *   3. manifest cliente activo + seams visuales inertes: E2E HTTP y a11y de
 *      las páginas Astro reales a 1440/375.
 *
 * Uso: node scripts/audit-customer-account-local.mjs
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_CONFIG = 'scripts/fixtures/customer-account/astro.config.mjs';
const ACCOUNT_PATHS = [
  '/cuenta/acceso',
  '/cuenta/acceso/',
  '/cuenta/acceso/confirmar',
  '/cuenta/acceso/confirmar/',
  '/cuenta/sesiones',
  '/cuenta/sesiones/',
];
const SECRET_ENV_NAMES = [
  'ADMIN_COOKIE_SECRET',
  'CLOUDFLARE_API_TOKEN',
  'CUSTOMER_AUTH_CSRF_SECRET',
  'CUSTOMER_AUTH_RATE_LIMIT_ATTESTATION',
  'CUSTOMER_AUTH_RESEND_DOMAIN_ID',
  'CUSTOMER_AUTH_RESEND_TRACKING_ATTESTATION',
  'CUSTOMER_PROFILE_HMAC_SECRET',
  'RESEND_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];
const EXPECTED_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');
const only = process.argv.find((argument) => argument.startsWith('--only='))?.slice('--only='.length);
if (only !== undefined && !['demo', 'preflight', 'surface'].includes(only)) {
  throw new Error('--only debe ser demo, preflight o surface.');
}

function safeEnvironment(extra = {}) {
  const env = { ...process.env, NO_COLOR: '1', ...extra };
  for (const name of SECRET_ENV_NAMES) delete env[name];
  return env;
}

async function availablePort() {
  const server = createServer();
  server.unref();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    server.close();
    throw new Error('No se pudo reservar un puerto local.');
  }
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function check(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`✓ ${name}`);
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const exited = once(child, 'exit');
  const timedOut = new Promise((resolve) => setTimeout(() => resolve('timeout'), 5_000));
  if (await Promise.race([exited.then(() => 'exit'), timedOut]) === 'timeout') {
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
}

async function start(mode) {
  const port = await availablePort();
  const args = [
    'exec',
    'wrangler',
    'dev',
    '--config',
    'scripts/fixtures/customer-account/wrangler.jsonc',
    '--port',
    String(port),
  ];
  const env = safeEnvironment({
    PORT: String(port),
    CUSTOMER_ACCOUNT_AUDIT_CACHE_DIR: `/private/tmp/logic-ecom-customer-account-${mode}-${port}`,
    ...(mode === 'demo' ? {} : { CUSTOMER_ACCOUNT_AUDIT_MODE: mode }),
  });
  const child = spawn('pnpm', args, {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const collect = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-24_000);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Astro (${mode}) terminó antes de arrancar.\n${output}`);
    }
    try {
      const response = await fetch(`${base}/`, { signal: AbortSignal.timeout(1_500) });
      if (response.status > 0) return { base, child, output: () => output };
    } catch {
      // El puerto aún no está escuchando.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await stop(child);
  throw new Error(`Astro (${mode}) no arrancó en 60 s.\n${output}`);
}

async function build(mode) {
  await run(
    'pnpm',
    ['exec', 'astro', 'build', '--config', FIXTURE_CONFIG],
    safeEnvironment({
      CUSTOMER_ACCOUNT_AUDIT_MODE: mode,
      CUSTOMER_ACCOUNT_AUDIT_CACHE_DIR: `/private/tmp/logic-ecom-customer-account-build-${mode}-${process.pid}`,
    }),
  );
}

async function withServer(mode, run) {
  const server = await start(mode);
  try {
    await run(server.base);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\nSalida Astro (${mode}):\n${server.output()}`);
  } finally {
    await stop(server.child);
  }
}

function secureAccountHeaders(response) {
  return response.headers.get('cache-control') === 'private, no-store, max-age=0' &&
    response.headers.get('content-security-policy') === EXPECTED_CSP &&
    response.headers.get('referrer-policy') === 'no-referrer' &&
    response.headers.get('x-content-type-options') === 'nosniff' &&
    response.headers.get('vary')?.split(',').some((value) => value.trim().toLowerCase() === 'cookie');
}

async function demoAbsence() {
  await withServer('demo', async (base) => {
    for (const path of ACCOUNT_PATHS) {
      const response = await fetch(`${base}${path}`, { redirect: 'manual' });
      check(`demo ${path} permanece ausente`, response.status === 404, `HTTP ${response.status}`);
      check(`demo ${path} no emite cookies`, response.headers.get('set-cookie') === null);
    }
  });
}

async function activePreflightFailsClosed() {
  await withServer('preflight', async (base) => {
    for (const path of ['/cuenta/acceso', '/cuenta/sesiones']) {
      const response = await fetch(`${base}${path}`, { redirect: 'manual' });
      const body = await response.text();
      check(`preflight ${path} falla cerrado sin secretos`, response.status === 503, `HTTP ${response.status}`);
      check(`preflight ${path} conserva cabeceras privadas`, secureAccountHeaders(response));
      check(`preflight ${path} no filtra configuración`, body === 'Acceso no disponible.');
      check(`preflight ${path} no emite cookies`, response.headers.get('set-cookie') === null);
    }
  });
}

async function run(command, args, env) {
  const child = spawn(command, args, {
    cwd: ROOT,
    env,
    stdio: 'inherit',
  });
  const [code, signal] = await once(child, 'exit');
  if (code !== 0) {
    throw new Error(`${command} ${args.join(' ')} terminó con ${code ?? signal}.`);
  }
}

function formControl(html, id) {
  return html.match(new RegExp(`<[^>]+id=["']${id}["'][^>]*>`, 'iu'))?.[0] ?? '';
}

async function activeSurfaceAudit() {
  await withServer('surface', async (base) => {
    const access = await fetch(`${base}/cuenta/acceso`);
    const accessHtml = await access.text();
    check('superficie activa sirve acceso', access.status === 200, `HTTP ${access.status}`);
    check('acceso activo conserva cabeceras privadas', secureAccountHeaders(access));
    const emailInput = formControl(accessHtml, 'customer-email');
    check('acceso activo habilita el formulario', emailInput !== '' && !/\sdisabled(?:\s|=|>)/iu.test(emailInput));

    const confirmation = await fetch(`${base}/cuenta/acceso/confirmar`);
    const confirmationHtml = await confirmation.text();
    check('superficie activa sirve confirmación genérica', confirmation.status === 200);
    check('confirmación conserva cabeceras privadas', secureAccountHeaders(confirmation));
    check('confirmación no recibe challenge ni proof en HTML',
      !confirmationHtml.includes('customer_auth:local-audit') && !confirmationHtml.includes('A'.repeat(43)));

    const sessions = await fetch(`${base}/cuenta/sesiones`);
    const sessionsHtml = await sessions.text();
    check('superficie activa sirve la sesión actual', sessions.status === 200 && sessionsHtml.includes('Sesión actual'));
    check('sesiones conserva cabeceras privadas', secureAccountHeaders(sessions));

    const acknowledgement = await fetch(`${base}/cuenta/acceso`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        origin: base,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'email=cliente%40example.test',
    });
    check('ruta POST de acceso responde 202 uniforme en la fixture', acknowledgement.status === 202);
    check('acknowledgement conserva cabeceras privadas', secureAccountHeaders(acknowledgement));

    await run(
      process.execPath,
      ['scripts/a11y-audit.mjs', '--only=customer-account:'],
      safeEnvironment({
        BASE_URL: base,
        AUDIT_CUSTOMER_ACCOUNT: 'true',
      }),
    );
  });
}

async function main() {
  if (only === undefined || only === 'demo') {
    console.log('R5.4d · ausencia de la demo');
    await build('demo');
    await demoAbsence();
  }
  if (only === undefined || only === 'preflight') {
    console.log(`${only === undefined ? '\n' : ''}R5.4d · preflight activo fail-closed`);
    await build('preflight');
    await activePreflightFailsClosed();
  }
  if (only === undefined || only === 'surface') {
    console.log(`${only === undefined ? '\n' : ''}R5.4d · superficie activa aislada`);
    await build('surface');
    await activeSurfaceAudit();
  }
  console.log('\n✓ Evidencia local R5.4d completada para las fases seleccionadas.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const mode = process.env.CUSTOMER_ACCOUNT_AUDIT_MODE;
if (mode !== 'demo' && mode !== 'preflight' && mode !== 'surface') {
  throw new Error('CUSTOMER_ACCOUNT_AUDIT_MODE debe ser demo, preflight o surface.');
}

const root = fileURLToPath(new URL('../../../', import.meta.url));
const platformConfig = fileURLToPath(new URL('./platform.config.ts', import.meta.url));
const runtimeFixture = fileURLToPath(new URL('./runtime-customer-account.ts', import.meta.url));
const edgeFixture = fileURLToPath(new URL('./customer-account-edge.ts', import.meta.url));
const alias = [];

if (mode !== 'demo') {
  alias.push({ find: '../../platform.config', replacement: platformConfig });
}

if (mode === 'surface') {
  alias.push(
    { find: './composition/runtime-customer-account', replacement: runtimeFixture },
    { find: './composition/customer-account-edge', replacement: edgeFixture },
  );
}

/**
 * Configuración únicamente local. `preflight` usa el runtime productivo sin
 * bindings ni secretos; `surface` conserva el gate activo y sustituye solo las
 * dependencias externas por seams inertes para QA visual.
 */
export default defineConfig({
  root,
  cacheDir: process.env.CUSTOMER_ACCOUNT_AUDIT_CACHE_DIR,
  site: 'https://ecom.logic2b.com',
  output: 'static',
  build: { format: 'file' },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORT) || 4321,
  },
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
      configPath: 'scripts/fixtures/customer-account/wrangler.jsonc',
    },
  }),
  vite: {
    plugins: [tailwindcss()],
    resolve: { alias },
    build: {
      assetsInlineLimit(filePath) {
        return filePath.includes('confirmar.astro_astro_type_script_index_0')
          ? false
          : undefined;
      },
    },
  },
});

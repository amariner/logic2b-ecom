// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// Astro 5: output 'static' + `export const prerender = false` en las páginas
// que necesitan servidor (demo/API). La landing queda 100% estática.
export default defineConfig({
  site: 'https://ecom.logic2b.com',
  output: 'static',
  adapter: cloudflare({
    platformProxy: { enabled: true }, // bindings D1 locales en `astro dev`
  }),
  vite: {
    plugins: [tailwindcss()],
  },
});

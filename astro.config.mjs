// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// Astro 5: output 'static' + `export const prerender = false` en las páginas
// que necesitan servidor (demo/API). La landing queda 100% estática.
export default defineConfig({
  site: 'https://ecom.logic2b.com',
  output: 'static',
  // `file` en vez de `directory`: las páginas estáticas se emiten como
  // `arquitectura.html`, no `arquitectura/index.html`. Los assets del Worker
  // sirven entonces `/arquitectura` con 200 directo; con `directory` esa URL
  // —la que anuncian el sitemap, el canonical, el og:url y todos los enlaces
  // internos— respondía 307 hacia la variante con barra final. Un salto por
  // visita y por rastreo, gratis de quitar. Las páginas de `/demo/*` son
  // server-rendered y no las toca este ajuste.
  build: { format: 'file' },
  // El puerto sale de `PORT` si viene en el entorno. Hace falta porque el 4321
  // lo ocupa a menudo el `astro dev` de otro proyecto de la casa (logic2b-ui):
  // con esto el panel de previsualización puede asignar uno libre en vez de
  // chocar. Sin `PORT`, el de siempre.
  server: { port: Number(process.env.PORT) || 4321 },
  adapter: cloudflare({
    platformProxy: { enabled: true }, // bindings D1 locales en `astro dev`
    // Entry point propio: añade el handler `scheduled` del cron de reset.
    workerEntryPoint: { path: 'src/worker.ts' },
  }),
  vite: {
    plugins: [tailwindcss()],
  },
});

# ROADMAP — Logic2B Commerce Kit (ecom.logic2b.com)

> **Documento de continuidad.** Cada sesión de trabajo con Claude Code debe:
> 1. Leer este fichero al empezar (junto con `CLAUDE.md`).
> 2. Actualizar el estado de la fase al terminar, con fecha y resumen de lo hecho.
> 3. Anotar decisiones tomadas y pendientes en las secciones de abajo.

## Objetivo

Demo pública + plantilla clonable de ecommerce ultraligero (Astro 5 + Cloudflare D1/Workers + Stripe Checkout) desplegada en `ecom.logic2b.com`. Especificación completa en `CLAUDE.md`.

## Estado de fases

| Fase | Descripción | Estado | Fecha | Notas |
|---|---|---|---|---|
| Pre | Propuesta de árbol + dependencias + 3 dudas | ✅ Hecho | 2026-07-17 | Esperando OK del usuario para Fase 0 |
| 0 | Scaffold Astro + Cloudflare + Tailwind + wrangler + D1 local | ✅ Hecho | 2026-07-17 | Build + check en verde. `pnpm check` es el comando de verificación |
| 1 | Migraciones, shop.config.ts, seed, tarifas envío + tests precios/portes | ⬜ Pendiente | | |
| 2 | Tienda demo: catálogo, ficha, carrito, /api/cart/quote | ⬜ Pendiente | | |
| 3 | Checkout Stripe + webhook + emails_outbox + gracias + tests webhook | ⬜ Pendiente | | |
| 4 | Backoffice: pedidos, estados, tracking, productos, envíos, CSV, emails | ⬜ Pendiente | | |
| 5 | Landing comercial + /arquitectura + SEO (antes: proponer 2 direcciones visuales y esperar elección) | ⬜ Pendiente | | |
| 6 | Deploy ecom.logic2b.com + cron reset + README + docs/CLIENTE.md | ⬜ Pendiente | | |
| 7 | bootstrap.sh + checklist demo→cliente real | ⬜ Pendiente | | |

## Repo y entornos

- GitHub: `https://github.com/amariner/logic2b-ecom` (rama `main`).
- Cloudflare: pendiente de login/configuración (Fase 6: D1 remota, deploy en ecom.logic2b.com, cron reset).

## Decisiones tomadas

- 2026-07-17: `CLAUDE.md` = copia del prompt maestro; este ROADMAP es la fuente de verdad del estado.

- 2026-07-17 (OK del usuario al arrancar desarrollo):
  - Carrito en **vanilla TS**, sin Alpine.
  - Astro 5 `output: 'static'` + `prerender = false` por página (sustituye al antiguo `hybrid`).
  - Stock: revalidar al crear sesión, decrementar solo en webhook; ventana de sobreventa aceptada en v1.
  - `zod` añadido para validar payloads de API.
- Estructura creada: `astro.config.mjs`, `wrangler.jsonc` (binding DB → ecom-demo, database_id placeholder hasta Fase 6), `tsconfig` strictest, `src/{pages,layouts,styles,lib,components}`, `migrations/`, `seed/`, `tests/`, `scripts/`.
- pnpm 11: los build scripts (esbuild/sharp/workerd) se aprueban en `pnpm-workspace.yaml` → `allowBuilds`.

## Decisiones pendientes

- (ninguna bloqueante ahora mismo)

## Cómo retomar una sesión

1. `cd /Users/es00500546/Desktop/Proyectos/ecom.logic2b.com`
2. Leer `CLAUDE.md` y este ROADMAP.
3. Continuar la primera fase en ⬜, respetando: una fase por sesión, commit al final, actualizar esta tabla, esperar OK antes de la siguiente.

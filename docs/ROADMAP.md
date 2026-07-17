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
| 1 | Migraciones, shop.config.ts, seed, tarifas envío + tests precios/portes | ✅ Hecho | 2026-07-17 | 18 tests. `pnpm db:reset` deja la D1 local sembrada (60 productos, 4 tarifas) |
| 2 | Tienda demo: catálogo, ficha, carrito, /api/cart/quote | ✅ Hecho | 2026-07-17 | Verificado en navegador: catálogo+filtros, ficha con JSON-LD, carrito con portes por CP |
| 3 | Checkout Stripe + webhook + emails_outbox + gracias + tests webhook | ✅ Hecho | 2026-07-17 | 27 tests. **Pendiente E2E real: faltan claves test de Stripe en `.dev.vars`** |
| 4 | Backoffice: pedidos, estados, tracking, productos, envíos, CSV, emails | ✅ Hecho | 2026-07-17 | Verificado: pagado→enviado genera email con tracking; CSV Packlink OK; reset OK |
| 5 | Landing comercial + /arquitectura + SEO técnico | ✅ Hecho | 2026-07-17 | Dirección B elegida (escaparate editorial). Cero JS en landing. Sitemap+JSON-LD OK |
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

- 2026-07-17 (Fase 1):
  - Zonas de envío por prefijo de CP (peninsula/baleares/canarias/ceuta-melilla) definidas en `shop.config.ts`; tarifas en D1 (`shipping_rates`), editables desde admin en Fase 4. Tarifa plana por zona + umbral de envío gratis (`free_over_cents`, null = nunca).
  - Lógica pura en `src/lib/pricing.ts` y `src/lib/shipping.ts` (sin I/O, 100% testeada).
  - Seed: `seed/products.ts` (60 productos, La Botiga del Maestrat) + `seed/seed.ts` (genera SQL; lo reutilizará `/api/demo/reset`). Ejecutar con `pnpm db:seed` (usa Node 24 con TS nativo → imports con extensión `.ts`).
  - Imágenes de producto: placeholder por categoría `/images/products/{category}.webp` — los WebP reales se crean en Fase 2.

- 2026-07-17 (Fase 2):
  - Carrito cliente (`src/lib/cart-client.ts`): SOLO `{slug, qty}` en localStorage; los precios se piden siempre a `/api/cart/quote` (`src/lib/quote.ts`, validado con zod, revalida stock y detecta líneas no servibles).
  - Imágenes placeholder por categoría en **SVG** (no WebP: sharp no accesible con pnpm estricto y no merece dependencia nueva). Al meter fotos reales, cambiar `seed/seed.ts`.
  - Layout `Shop.astro`: banner demo con tarjeta 4242 copiable, badge de carrito, footer legal. Todo `noindex`.
  - Ficha de producto con JSON-LD `Product`+`Offer` válido.

- 2026-07-17 (Fase 3):
  - `POST /api/checkout/session`: revalida quote completa contra D1 (precios, stock, cobertura CP), crea la sesión Stripe con `line_items` de servidor (envío como línea extra si > 0), inserta pedido `pending` + items con snapshot + evento. Stripe con `createFetchHttpClient` (edge).
  - `POST /api/webhooks/stripe`: firma verificada con `constructEventAsync` + SubtleCrypto. `checkout.session.completed` → transición a `paid`, stock `MAX(stock-qty,0)`, evento y email de confirmación a `emails_outbox`, todo en una `batch`. `checkout.session.expired` → `cancelled`. Idempotente en ambos casos (estado ≠ pending → no-op con 200).
  - Lógica de transición PURA en `src/lib/payment-transition.ts` (testeada: idempotencia, stock floor, contenido del email). Emails en `src/lib/emails.ts` (confirmación + enviado, este último se usa en Fase 4).
  - `/demo/checkout`: formulario de envío (CP precargado del carrito) → redirección a Stripe. `/demo/gracias`: lee el pedido por `session_id` y limpia el carrito local.
  - **Para probar E2E**: copiar `.dev.vars.example` a `.dev.vars` con claves test de Stripe y `stripe listen --forward-to localhost:4321/api/webhooks/stripe` (el `whsec` que imprime va en `.dev.vars`).

- 2026-07-17 (Fase 4):
  - Transiciones de estado en `src/lib/order-transitions.ts` (pura, testeada): pending→cancelled, paid→shipped|cancelled, shipped→delivered. **paid solo lo pone el webhook**. shipped exige transportista+tracking y encola el email de aviso.
  - Panel: `/demo/admin` (tabla+filtros+contadores), `pedidos/[id]` (líneas, dirección, timeline, marcar enviado/entregado), `productos` (edición inline nombre/precio/stock/activo), `envios` (tarifas editables + explicación del flujo), `emails` (bandeja con iframe sandbox).
  - `GET /api/admin/orders/export.csv`: pedidos `paid`, columnas compatibles Packlink/SendCloud.
  - `POST /api/demo/reset` (solo `DEMO_MODE=true`) reutiliza `seedStatements()`; página `/demo/reset` con botón.
  - Auth admin en demo: acceso libre con aviso (producción = Cloudflare Access, checklist en Fase 7).

- 2026-07-17 (Fase 5):
  - Usuario eligió **dirección B: escaparate editorial** (clara, papel cálido `#faf7f2`, serif Georgia como display, acento nogal `#8a6f5c`). El antimodelo A (terminal oscuro) queda descartado.
  - Landing `/`: héroe → problema (números en grande) → qué incluye → comparativa Shopify/Woo → acceso a demos → precios → FAQ (con `<details>`, sin JS) → CTA email. **Cero JavaScript.**
  - `/arquitectura`: flujo de compra con SVG inline, modelo de datos, envíos, argumentos de negocio. JSON-LD `TechArticle`.
  - SEO: canonical + OG en `Base.astro`, JSON-LD `Service`+`FAQPage` en `/`, `sitemap.xml` (solo páginas indexables).
  - **Precios provisionales en la landing: 1.900 € setup / 29 €/mes — CONFIRMAR con Andreu antes del deploy público.**

## Decisiones pendientes

- (ninguna bloqueante ahora mismo)

## Cómo retomar una sesión

1. `cd /Users/es00500546/Desktop/Proyectos/ecom.logic2b.com`
2. Leer `CLAUDE.md` y este ROADMAP.
3. Continuar la primera fase en ⬜, respetando: una fase por sesión, commit al final, actualizar esta tabla, esperar OK antes de la siguiente.

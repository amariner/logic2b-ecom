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
| 6 | Deploy ecom.logic2b.com + cron reset + README + docs/CLIENTE.md | ✅ Hecho | 2026-07-18 | **Desplegado y en vivo en https://ecom.logic2b.com** (Worker `ecom-logic2b`, D1 remota `ecom-demo` id `7ae9b06d…`, custom domain + cron reset activos). Pagos en **modo simulado** (sin Stripe) |
| 7 | bootstrap.sh + checklist demo→cliente real | ✅ Hecho | 2026-07-18 | `scripts/bootstrap.sh` (local probado end-to-end; `--remote` aprovisiona Cloudflare) + `docs/PRODUCCION.md` |
| 8 | Pulido de la demo (backlog abajo) | 🟡 En curso | 2026-07-18 | Rediseño Shopify + imágenes Higgsfield hechos; resto del backlog priorizado en la sección «Fase 8» |

## Repo y entornos

- GitHub: `https://github.com/amariner/logic2b-ecom` (rama `main`).
- Cloudflare: **en producción** — Worker `ecom-logic2b` en https://ecom.logic2b.com, D1 remota `ecom-demo` (`7ae9b06d-3664-4790-a87c-04bb4c67e97a`), cron reset cada 6 h, cuenta marinerandreu@gmail.com.

## Fase 8 — Pulido de la demo (backlog priorizado)

> Objetivo: demo impecable como pieza de venta. Ordenado por impacto/esfuerzo; ir marcando al completar.

**Coherencia visual y marca**
- [x] ✅ 2026-07-18 — Restyle de `/arquitectura` a la estética Shopify actual (header sticky de la landing, verde/tinta, SVG del flujo recoloreado; tokens walnut eliminados).
- [x] ✅ 2026-07-18 — Favicon (`favicon.svg` + `.ico`) y `apple-touch-icon.png` con la marca L2B.
- [x] ✅ 2026-07-18 — `og:image` 1200×630 (`/images/og.jpg`, claim + foto hero) + `twitter:card` en `Base.astro`, en todas las páginas.
- [x] ✅ 2026-07-18 — Página 404 propia (`src/pages/404.astro`) con enlaces a landing/tienda/panel; también la sirven las fichas de producto inexistentes.

**Experiencia de la demo**
- [x] 🟡 2026-07-19 — Fotos por producto: 18 variantes nuevas (3 extra × 6 categorías) generadas con Higgsfield en el estilo actual, y el seed ya reparte variantes round-robin (`seed/image-variants.ts`). **Falta un paso local de Andreu**: la red de la sesión cloud bloquea el CDN de Higgsfield, así que hay que ejecutar `node scripts/fetch-product-images.mjs` (descarga + optimiza a WebP con sharp y sube el manifest a 4) y re-sembrar.
- [x] ✅ 2026-07-18 — Búsqueda simple en el catálogo (`?q=`, LIKE escapado sobre nombre+descripción en D1, combinable con categoría/orden, cero JS cliente).
- [x] ✅ 2026-07-18 — Estados vacíos/error: catálogo sin resultados (card con CTA), ficha inexistente → 404 propia. (Carrito agotado/CP sin cobertura y admin vacío ya estaban cubiertos de fases anteriores.)
- [x] ✅ 2026-07-19 — Micro-guía: franja «1 compra → 2 panel → 3 emails» en el catálogo + tarjeta «Sigue el recorrido de la demo» en `/demo/gracias` (con la contraseña del panel). Sin JS extra.

**Robustez (sin salir del stack)**
- [x] ✅ 2026-07-18 — Auth del admin con cookie firmada: login `/demo/admin/login` (contraseña «demo» visible), middleware sobre `/demo/admin/*` y `/api/admin/*`, HMAC-SHA256 Web Crypto, 6 tests. Con `DEMO_MODE` off la capa se desactiva y manda Cloudflare Access.
- [ ] 🔒 Rate limiting básico en APIs públicas — **bloqueado en cloud**: el binding de rate limiting o las reglas WAF exigen tocar `wrangler.jsonc`/dashboard (vetados desde esta sesión). Para Andreu en local.
- [ ] 🔒 Export/backup periódico de la D1 a R2 — **bloqueado en cloud**: requiere crear el bucket y añadir el binding en `wrangler.jsonc`. Para Andreu en local.
- [x] ✅ 2026-07-19 — Campo NIF/razón social opcional en checkout (desplegable «¿Necesitas factura?»), validado en la API, guardado en `address_json` y visible en el detalle del pedido del admin.

**Medición y calidad**
- [ ] ⚠️ Cloudflare Web Analytics — **decisión pendiente de Andreu**: el beacon es un `<script>` externo y la regla de la landing es «cero JavaScript». Opciones: (a) solo en `/demo/*`, (b) aceptar el beacon `defer` también en la landing, (c) descartar. No se implementa sin OK.
- [ ] ⬜ Auditoría Lighthouse en producción y ajustar hasta 100/100/100/100 (objetivo declarado en la landing; hay que poder demostrarlo).
- [x] ✅ 2026-07-19 — Test E2E del flujo de compra simulado: `pnpm test:e2e` (`scripts/e2e.mjs`, sin dependencias) contra wrangler dev — 18 comprobaciones: reset, quote en servidor, checkout con NIF, stock decrementado, guardas de auth, login, CSV, enviado+tracking y ambos emails en la bandeja.

**Comercial (explorar, no implementar sin OK)**
- [ ] ⬜ Versión «Lite» del kit (Astro estático + Stripe Payment Links, sin panel): producto de entrada para negocios de <10 productos, con upgrade al kit completo. Decidir si se ofrece.
- [ ] ⬜ Pagos reales en la demo con claves test de Stripe (tarjeta 4242): más impactante que la simulación. Requiere claves de Andreu + webhook.

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

- 2026-07-18 (Fase 6):
  - **Pages → Workers con assets estáticos**: Cloudflare Pages no soporta Cron Triggers, así que `wrangler.jsonc` pasa a `main: dist/_worker.js/index.js` + `assets` (binding ASSETS) + `triggers.crons: ["0 */6 * * *"]`. Sigue siendo plan gratuito; es además la vía que Cloudflare recomienda hoy. `public/.assetsignore` excluye `_worker.js`/`_routes.json` del upload de assets.
  - Entry point propio `src/worker.ts` (opción `workerEntryPoint` del adaptador): reexporta el `fetch` de Astro via `@astrojs/cloudflare/handler` y añade `scheduled`, que reutiliza `seedStatements()` directamente contra `env.DB` (sin HTTP ni token). Guard `DEMO_MODE === 'true'` igual que `/api/demo/reset`.
  - **Cron verificado en local**: `wrangler dev --test-scheduled` + `curl /__scheduled` → producto modificado restaurado, 60 productos y 4 tarifas re-sembrados.
  - `pnpm deploy` = `astro build && wrangler deploy`. README con el runbook completo de despliegue (D1 remota, migraciones+seed, secretos, dominio, webhook Stripe). `docs/CLIENTE.md` escrito (3 pasos + FAQ).
  - **El deploy real queda para Andreu**: necesita `wrangler login`, crear la D1 remota (y pegar su `database_id` en `wrangler.jsonc`), secretos y custom domain. Los comandos exactos están en el README.

- 2026-07-18 (Fase 7):
  - `scripts/bootstrap.sh`: modo local (deps, `.dev.vars` con prompts de claves Stripe y `ADMIN_COOKIE_SECRET` aleatorio, `db:reset`, tests) y modo `--remote` (login wrangler, `d1 create` fijando el `database_id` real en `wrangler.jsonc` vía `d1 info --json`, migraciones+seed remotos, deploy, `secret put` de los 3 secretos). Idempotente. **Probado end-to-end el modo local desde estado limpio; el `--remote` no se puede probar sin cuenta Cloudflare.**
  - `docs/PRODUCCION.md`: checklist demo→cliente real en 8 bloques. Honesta con el estado real del código: `DEMO_MODE` solo protege reset (API+cron), el banner/noindex viven en `Shop.astro`, la tienda hay que moverla fuera de `/demo/*`, y **el envío real de emails (Resend) es desarrollo pendiente** marcado ⚠️ — hoy solo se escriben en `emails_outbox`.
  - README enlazado con bootstrap y PRODUCCION.md.

- 2026-07-18 (post-Fase 7 — emails reales):
  - Implementado el envío por Resend (`src/lib/send-email.ts`), sin dependencia nueva (fetch directo a api.resend.com). La outbox sigue siendo la fuente de verdad: `deliverPendingEmails()` entrega los `sent = 0` y los marca `sent = 1` **solo** con `DEMO_MODE` off + `RESEND_API_KEY` presente; fallos quedan pendientes y se reintentan en el siguiente disparo. Se invoca via `ctx.waitUntil` tras el webhook de pago y tras "marcar enviado" (no bloquea la respuesta).
  - Nuevo email interno al comercio al entrar un pedido pagado (`merchantNewOrderEmail`) — cumple el paso 1 de `docs/CLIENTE.md`, que lo prometía. `PaidMutation.email` → `emails[]`.
  - Verificado en runtime (wrangler dev): pedido paid → shipped inserta el email en la outbox con `sent = 0` y en demo no se entrega nada. 38 tests.
  - `docs/PRODUCCION.md` §6 pasa de "⚠️ desarrollo pendiente" a pura configuración (dominio verificado en Resend + secreto).

- 2026-07-18 (Deploy real + pago simulado):
  - **Modo de pago simulado** (`src/lib/payment-mode.ts` → `isSimulatedPayment`): sin `STRIPE_SECRET_KEY` configurada, `/api/checkout/session` registra el pedido, lo marca `paid` al instante reutilizando `buildPaidMutation` (mismo camino que el webhook real: stock, evento, emails a outbox) y redirige a `/demo/gracias`. En cuanto se añada la clave real, vuelve a Stripe Checkout sin tocar código. `buildPaidMutation` acepta ahora una `note` opcional. Webhook devuelve 503 si faltan claves. Copys de `/demo/checkout` adaptados. 42 tests.
  - **Desplegado en Cloudflare** (cuenta marinerandreu@gmail.com, id `aae490dbbef82853249e6d50951427b3`): D1 remota `ecom-demo` (`7ae9b06d-3664-4790-a87c-04bb4c67e97a`) creada, migrada y sembrada (60 productos, 4 tarifas); secreto `ADMIN_COOKIE_SECRET` puesto; `routes` con custom domain `ecom.logic2b.com` (zona ya en la cuenta) → DNS + cert automáticos; cron reset cada 6 h activo. Verificado en vivo: landing, tienda, admin y checkout simulado responden 200.

- 2026-07-18 (Rediseño estética Shopify + imágenes reales):
  - **Rediseño visual completo** pedido por Andreu: estética tipo Shopify — blanco, tinta `#1a1a1a`, verde profundo `#008060` (sustituye al teja en `shop.config.ts` y tokens), sans-serif del sistema con tracking apretado, botones pill (`rounded-full`), cards `rounded-2xl`, header sticky con blur. Mobile-first (categorías con scroll horizontal en móvil, CTAs full-width).
  - **Imágenes generadas con Higgsfield** (Marketing Studio, estilo consistente: producto sobre fondo crema, luz suave editorial): 6 fotos de categoría en `public/images/products/*.webp` (9–27 KB, optimizadas con sharp 800×800) + `public/images/hero.webp` (flat-lay 16:9 para el héroe de la landing). Los SVG placeholder eliminados; `seed/seed.ts` apunta a `.webp`.
  - Rediseñados: landing `/`, `Shop.astro` (banner demo negro discreto), catálogo, ficha, carrito, checkout, gracias. Cero JS en la landing se mantiene. Verificado con preview en móvil y escritorio. Deploy + re-seed remoto hechos.

- 2026-07-18 (arquitectura del backend — conversación con Andreu):
  - **No Payload CMS** (ni headless CMS): rompería coste 0 €/mes (necesita servidor Node + Postgres), el minimalismo y el stack edge. Se reserva para proyectos Logic2B de contenido editorial donde sí encaja (Astro + Payload headless).
  - **Reparto de responsabilidades**: Stripe = solo cobros; nuestro panel D1 = gestión de pedidos (estados, tracking, stock, CSV) — Stripe no cubre nada de eso; facturación legal = **fuera del kit** (herramienta del comercio o gestoría, alimentada por nuestro export). Motivo clave: emitir facturas nos metería en el ámbito de VeriFactu/ley antifraude como software de facturación. Stripe Invoicing descartado también por su 0,4 % por factura (contra el argumento "sin comisiones").

- 2026-07-18 (Fase 8, sesión cloud — 4 primeros ítems del backlog):
  - `/arquitectura` alineada con la estética Shopify; eliminados los tokens `walnut` de `global.css`.
  - Favicon/apple-touch-icon/og:image generados en la propia sesión (HTML renderizado con Chromium headless + Pillow; sin dependencias nuevas en el repo). `og.jpg` con URL absoluta desde `Astro.site`.
  - 404: además de `src/pages/404.astro` (el Worker la sirve para toda ruta no reconocida), las fichas con slug inexistente responden 404 con la misma página via binding `ASSETS` (`src/lib/not-found.ts`).
  - Búsqueda de catálogo en servidor (`getActiveProducts` acepta `search`; `%`/`_`/`\` escapados en el LIKE). Formulario GET puro, sin JS.
  - Auth admin: token sin estado `expiry.firma` (HMAC-SHA256, `crypto.subtle`, verificación en tiempo constante), cookie HttpOnly/SameSite=Lax 24 h via `Astro.cookies`, middleware nuevo `src/middleware.ts`. **Decisión**: con `DEMO_MODE` off el middleware deja pasar y la protección real es Cloudflare Access (si no, un panel real sin contraseña demo válida quedaría inaccesible); reflejado en `docs/PRODUCCION.md` §5. Fallback de secreto solo en demo sin `.dev.vars`.
  - Nota curiosa del tooling: el TSX que `astro check` genera elimina las expresiones `return` del frontmatter — cualquier variable/import usado solo dentro de un `return` da falso ts(6133); se resuelve referenciándolo fuera del `return`.
  - 48 tests en verde. Verificado en runtime (wrangler dev + curl + capturas headless): búsqueda, estados vacíos, 404, flujo login/logout completo, CSV con sesión, cookie manipulada rechazada y open redirect bloqueado.

- 2026-07-19 (Fase 8, sesión cloud — segunda tanda):
  - **Fotos por producto**: 18 imágenes generadas con Higgsfield Marketing Studio (36 créditos; mismo estilo crema/editorial). El egress de la sesión cloud deniega el CDN (`cloudfront.net`, 403 de política; verificado también via WebFetch) → las URLs quedan fijadas en `scripts/fetch-product-images.mjs`, que Andreu ejecuta en local (`pnpm add -D sharp` temporal). El seed ya reparte variantes por categoría desde `seed/image-variants.ts` (seguro para el worker: sin fs) con test que impide declarar variantes sin usar o usar no declaradas.
  - Micro-guía en catálogo y gracias; campo NIF/razón social opcional (desplegable `<details>`, cero JS añadido); E2E `pnpm test:e2e` con 18 checks en verde.
  - Nota CSRF: el `checkOrigin` de Astro 5 exige cabecera `Origin` en los POST de formulario (login, reset) — curl/fetch de scripts deben mandarla; los POST JSON no la necesitan.
  - Bloqueados en cloud (para local): rate limiting (wrangler.jsonc/dashboard), backup D1→R2 (binding), Web Analytics (decisión por la regla cero-JS de la landing), Lighthouse en producción (pendiente).

## Decisiones pendientes

- Confirmar precios de la landing (1.900 € setup / 29 €/mes) — hoy publicados provisionalmente en la demo en vivo.
- Cuando se quieran pagos reales: añadir claves TEST de Stripe (`wrangler secret put STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`) y configurar el webhook en el dashboard de Stripe apuntando a `https://ecom.logic2b.com/api/webhooks/stripe`.
- Decidir si se ofrece la versión «Lite» (Payment Links) como producto de entrada — ver Fase 8, bloque comercial.

## Cómo retomar una sesión

1. `cd /Users/es00500546/Desktop/Proyectos/ecom.logic2b.com`
2. Leer `CLAUDE.md` y este ROADMAP.
3. Continuar la primera fase en ⬜, respetando: una fase por sesión, commit al final, actualizar esta tabla, esperar OK antes de la siguiente.

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
| 8 | Pulido de la demo (backlog abajo) | 🟡 En curso | 2026-07-19 | Backlog técnico agotado; solo quedan decisiones y pasos locales de Andreu (ver «Decisiones pendientes» y `docs/PROMPT_CLOUD.md`). Última tanda: auditoría propia que encontró y corrigió un bug real de checkout — ver sección «Fase 8» |

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
- [x] 🟡 2026-07-19 — Rate limiting en APIs públicas, **capa de aplicación**: `src/lib/rate-limit.ts` (ventana fija en memoria por isolate, techo de claves, 6 tests) aplicado en el middleware a `POST /api/cart/quote` (60/min por IP) y `POST /api/checkout/session` (10/min por IP) → 429 + `Retry-After`. Best-effort consciente: el estado es por isolate/PoP. La regla de plataforma (WAF/Rate Limiting de Cloudflare, dashboard) sigue pendiente para Andreu como refuerzo opcional.
- [x] 🟡 2026-07-19 — Backup de la D1, **v1 manual**: botón «Copia de seguridad» en el panel → `GET /api/admin/backup.sql` (volcado completo restaurable con `wrangler d1 execute --file`; `src/lib/backup.ts` puro con tests, protegido por la auth del panel). La variante **periódica a R2** sigue pendiente de Andreu (bucket + binding en `wrangler.jsonc`); el cron actual de la demo la haría trivial de añadir.
- [x] ✅ 2026-07-19 — Campo NIF/razón social opcional en checkout (desplegable «¿Necesitas factura?»), validado en la API, guardado en `address_json` y visible en el detalle del pedido del admin.

**Medición y calidad**
- [x] 🟡 2026-07-19 — Cloudflare Web Analytics, **decidido y cableado**: beacon solo en tienda y panel (la landing conserva cero JS; sus visitas ya salen en las métricas de requests del Worker). Se activa rellenando `analytics.cfBeaconToken` en `shop.config.ts` con el token del dashboard (→ Analytics → Web Analytics) — **falta ese token de Andreu**; con el campo vacío no se inyecta nada.
- [x] 🟡 2026-07-19 — Auditoría Lighthouse **en local** (wrangler dev, Lighthouse 13): landing, `/arquitectura`, catálogo, ficha y carrito en **100/100/100** de performance/accesibilidad/best-practices tras corregir contrastes, landmark `<main>` y cabeceras de la tabla comparativa (el SEO de `/demo/*` queda bajo a propósito por el `noindex`; landing y arquitectura, 100 también en SEO). Falta repetirla contra producción tras el próximo deploy para poder citarla.
- [x] ✅ 2026-07-19 — Test E2E del flujo de compra simulado: `pnpm test:e2e` (`scripts/e2e.mjs`, sin dependencias) contra wrangler dev — 18 comprobaciones: reset, quote en servidor, checkout con NIF, stock decrementado, guardas de auth, login, CSV, enviado+tracking y ambos emails en la bandeja.

**Demo como pieza de venta (pedido por Andreu, sesión 2026-07-19)**
- [x] ✅ 2026-07-19 — Selector de temas en la tienda demo: 4 presets (color + tipografía de titulares + radio de botones) en `src/lib/demo-themes.ts`, widget flotante «Tema» en `Shop.astro`, aplicado via variables CSS con persistencia en localStorage y sin flash (script inline pre-pintado). Dos webfonts variables self-hosted (`public/fonts/`: Fraunces 66 KB, Space Grotesk 22 KB, subsets latinos de Google Fonts) que solo se descargan si el tema activo las usa. Nuevo token `--radius-btn` (utilidad `rounded-btn`) en los controles de la tienda. 4 tests (vars completas, contraste AA de todos los presets).
- [x] ✅ 2026-07-19 — Pulido de diseño: foco visible de marca global (`:focus-visible`), `active:scale` en CTAs principales, radios de controles unificados bajo el token de tema.
- [x] ✅ 2026-07-19 — Dossier comercial imprimible en `/dossier` (indexable, cero JS, en sitemap, enlazado desde precios y footer de la landing): para quién es/no es, qué incluye al detalle, proceso en 4 pasos (3–4 semanas orientativo), qué necesitamos del cliente, precios con comparativa a 3 años, FAQ ampliada (incl. facturación/VeriFactu fuera del kit) y CSS de impresión (pensado para enviarlo en PDF a prospectos).

**Correcciones (auditoría propia, sesión 2026-07-19)**
- [x] ✅ 2026-07-19 — Bug de checkout: `pattern="\d{5}"` del CP llegaba al HTML como `pattern="d{5}"` (Astro consume la barra invertida en atributos de texto plano), bloqueando el checkout real para cualquier CP válido. El E2E no lo veía por llamar a la API directamente. Arreglado (`pattern="\\d{5}"`) y verificado con un flujo de compra completo en navegador.
- [x] ✅ 2026-07-19 — Cabecera del panel admin no responsive a 375px (título partido en 5 líneas). Reestructurada a 2 filas con nav en pills de scroll horizontal.
- [x] ✅ 2026-07-19 — Enlace "Tramitar pedido" del carrito: `pointer-events-none` no bloqueaba el teclado. Añadidos `aria-disabled`/`tabindex` sincronizados.

**Comercial (explorar, no implementar sin OK)**
- [ ] 🟡 Versión «Lite» del kit — **explorada, decisión pendiente**: análisis completo en `docs/LITE.md` (2026-07-19). Recomendación: ofrecerla en la landing para medir demanda, no construirla hasta el primer cliente. Decidir: Andreu.
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

- 2026-07-19 (Fase 8, sesión cloud — tercera tanda, post-merge del PR #1):
  - PR #1 mergeado a `main` por orden de Andreu; la rama de trabajo se reinició desde `main` (regla del entorno cloud: un PR mergeado no se reutiliza).
  - Lighthouse local en verde (ver arriba). Truco de entorno: el Chrome de Lighthouse resuelve `localhost` a IPv4 y `wrangler dev` escuchaba solo en IPv6 → lanzar `wrangler dev --ip 127.0.0.1` para auditar.
  - README: documentados `pnpm test:e2e`, la contraseña del panel demo y el paso local de las fotos de producto.
  - Rate limiting de aplicación en el middleware (ver bloque Robustez): verificado en runtime — 60 POST a quote → 200, del 61 en adelante 429 con `Retry-After`; E2E completo sigue en verde con el limiter activo. PR #2 mergeado (Lighthouse + docs); la landing pasa a 100/100/100/100 real.

- 2026-07-19 (Fase 8, sesión cloud — cuarta tanda, con delegación explícita de Andreu para decidir y avanzar):
  - **Backup manual v1** desde el panel (endpoint SQL restaurable) en lugar de esperar al binding R2; la periódica queda como mejora local.
  - **Web Analytics**: decidido beacon solo en `/demo/*` y panel via `shop.config.analytics.cfBeaconToken` (vacío = nada); la landing mantiene cero JS.
  - **Lite**: `docs/LITE.md` con análisis y recomendación (medir demanda antes de construir).
  - E2E ampliado a 19 comprobaciones (backup incluido). 58 tests unitarios. Producción no es alcanzable desde el proxy de la sesión → el Lighthouse contra ecom.logic2b.com queda necesariamente para después del deploy de Andreu.

- 2026-07-19 (Fase 8, sesión cloud — quinta tanda: interfaz y documentación):
  - **Checkout con resumen del pedido**: card «Tu pedido» (líneas, subtotal, envío con etiqueta de tarifa y total) recalculada contra `/api/cart/quote` al cargar y al completar el CP — el comprador ya ve lo que paga antes de confirmar. Verificado con captura CDP (carrito sembrado): 2×8,90 + 7,50 + 4,90 = 30,20 € ✓.
  - **Ficha con venta cruzada**: sección «Más {categoría}» con hasta 4 productos relacionados (consulta en servidor, `loading="lazy"`) + enlace a la categoría. Lighthouse de la ficha sigue en 100/100/100.
  - README: descripción del pago simulado (ya no dice «Stripe en modo test»), fila de tests actualizada (58 + E2E 19). Botón de `/demo/reset` alineado a la estética (pill).
  - Nota tooling: dentro de los `<script>` de `.astro`, `El.append(a, b)` resuelve mal los tipos (falso ts(2345)); usar `appendChild` dos veces.

- 2026-07-19 (Fase 8, sesión cloud — sexta tanda: admin accesible y docs de continuidad):
  - **Lighthouse del admin con sesión** (`--extra-headers` con la cookie): pedidos 94→100, productos 80→100, envíos 84→100, emails 90→100. Fixes: contrastes `stone-400/500` según fondo (blanco vs `stone-100`) y `aria-label` en todos los inputs de edición inline (nombre/precio/stock/activo de productos; precio/gratis-desde/activa de tarifas). **Todas las páginas del proyecto están ya en 100 de accesibilidad.**
  - Ruta alternativa para las fotos descartada definitivamente: todos los dominios de Higgsfield bloqueados por el proxy (000). Queda solo el paso local.
  - `docs/PROMPT_CLOUD.md` reescrito al estado actual: próxima sesión arranca del ROADMAP, con la lista de pendientes solo-local y los trucos de entorno (IPv4 de wrangler, checkOrigin, falsos errores del TSX, dominios bloqueados).

- 2026-07-19 (Fase 8, sesión cloud paralela — selector de temas y dossier, pedida por Andreu; mergeada tras la sexta tanda):
  - **Selector de temas** como argumento de venta (no feature de tienda): presets cerrados en vez de pickers libres para evitar combinaciones feas; solo en `/demo/*` (el panel se mantiene sobrio y la landing con cero JS). El preset por defecto «La Botiga» limpia los overrides, y un test lo mantiene en sintonía con los tokens de `global.css`.
  - **Webfonts self-hosted** (sin Google Fonts en runtime): los `@font-face` declarados solo descargan la fuente si el tema activo la referencia, así el peso extra es 0 en el tema por defecto.
  - **Dossier `/dossier`**: los precios y claims reutilizan los de la landing (1.900 €/29 €/mes provisionales, «vendiendo en 3–4 semanas» marcado como orientativo). FAQ nueva de facturación alineada con la decisión VeriFactu del 2026-07-18. Verificado con captura en pantalla, móvil y emulación de impresión.
  - Lighthouse local tras la tanda: `/` y `/dossier` en 100/100/100/100; catálogo (con el widget de temas cargado) en 100/100/100 de performance/a11y/best-practices. El peso de las webfonts no computa en el tema por defecto (no se descargan).
  - Pendiente de Andreu tras esta tanda: nada nuevo — deploy (`pnpm deploy`) para publicar selector y dossier.

- 2026-07-19 (Fase 8, sesión cloud — séptima tanda: auditoría propia sin backlog nuevo pendiente, con delegación explícita de Andreu para revisar y cerrar temas por criterio propio):
  - **Bug real encontrado y corregido**: el `pattern="\d{5}"` del código postal en `/demo/checkout` llegaba al HTML como `pattern="d{5}"` — Astro trata el valor de un atributo de texto plano como literal JS, y `\d` no es un escape reconocido ahí, así que la barra invertida se comía (comportamiento estándar de los string literals de JS, no un bug de Astro). Resultado: la validación nativa del navegador rechazaba **cualquier** CP válido de 5 dígitos y bloqueaba el checkout entero desde la UI real. El E2E (`scripts/e2e.mjs`) no lo detectaba porque llama a `/api/checkout/session` directamente, sin pasar por la validación HTML del formulario. Arreglado escapando a `pattern="\\d{5}"`. Verificado con un flujo de compra completo en navegador (Playwright + Chromium headless): ficha → checkout con CP real → gracias → pedido en el panel → ambos emails en la bandeja.
  - **Cabecera del admin no responsive a 375px**: el nombre de la tienda y la nav competían por el mismo ancho sin wrap, partiendo el título en hasta 5 líneas en móvil. Reestructurada a 2 filas (título+acciones arriba, nav en pills con scroll horizontal debajo), verificado en las 4 páginas del panel.
  - **Enlace "Tramitar pedido" del carrito**: cuando el carrito no es comprable, `pointer-events-none` bloquea el ratón pero no el teclado (un `<a>` enfocado sigue activándose con Enter). Añadido `aria-disabled`/`tabindex` sincronizados con el estado real, más un guard en el click.
  - Auditoría de diseño con capturas Playwright a 375/1440 px de las 12 páginas navegables (landing, arquitectura, dossier, tienda, ficha, carrito, checkout, gracias y las 4 del panel): sin más hallazgos — el resto ya estaba pulido de tandas anteriores.
  - Docs: `README.md` y `docs/PRODUCCION.md` tenían el recuento de tests desactualizado (58→62 unitarios, 18→19 E2E) y una referencia obsoleta a placeholders SVG en el checklist de imágenes; corregidos.
  - Re-confirmado (no reintentado más allá de una comprobación): el CDN de Higgsfield sigue devolviendo 403 a través del proxy de la sesión — sigue siendo un paso solo-local para Andreu, sin cambios.
  - `pnpm check` (62 tests) y `pnpm test:e2e` (19 pasos, contra `pnpm preview --ip 127.0.0.1`) en verde tras los cambios.

- 2026-07-19 (Fase 8, sesión cloud — octava tanda: seguridad, misma delegación):
  - **XSS almacenado real, explotable en la demo pública**: el nombre de producto (editable desde el admin, y la contraseña del admin de la demo es **pública a propósito**, «demo») se interpolaba sin escapar en dos sitios: (1) `carrito.astro` construía cada línea del carrito con una plantilla asignada a `innerHTML` — un nombre con HTML/script se ejecutaba en el navegador de cualquier visitante que abriera su carrito; (2) los dos bloques JSON-LD independientes (`Base.astro` vía la prop `jsonLd`, y el `<script>` propio de la ficha de producto) hacían `set:html={JSON.stringify(...)}` sin escapar `</script>` dentro de los valores, así que un nombre que contuviera esa secuencia cerraba la etiqueta `<script>` e inyectaba HTML arbitrario en la página. Confirmado explotable en vivo antes del arreglo (Playwright: el payload rompía la etiqueta / aparecía como HTML crudo) y neutralizado después (renderiza como texto inerte, sin diálogo, sin `<script>` literal en el DOM). Arreglo: construcción seguro del DOM (`createElement`/`textContent`) en el carrito, y un helper compartido y testeado `src/lib/format.ts#jsonLdScript()` (escapa `<` a su forma unicode) usado en ambos sitios de `set:html`. `tests/format.test.ts` nuevo.
  - `pnpm check` (64 tests) y `pnpm test:e2e` (19 pasos) en verde.

## Decisiones pendientes

- Confirmar precios de la landing (1.900 € setup / 29 €/mes) — hoy publicados provisionalmente en la demo en vivo.
- Cuando se quieran pagos reales: añadir claves TEST de Stripe (`wrangler secret put STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`) y configurar el webhook en el dashboard de Stripe apuntando a `https://ecom.logic2b.com/api/webhooks/stripe`.
- Decidir si se ofrece la versión «Lite» (Payment Links) como producto de entrada — ver Fase 8, bloque comercial.

## Cómo retomar una sesión

1. `cd /Users/es00500546/Desktop/Proyectos/ecom.logic2b.com`
2. Leer `CLAUDE.md` y este ROADMAP.
3. Continuar la primera fase en ⬜, respetando: una fase por sesión, commit al final, actualizar esta tabla, esperar OK antes de la siguiente.

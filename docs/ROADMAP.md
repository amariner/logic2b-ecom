# ROADMAP — Logic2B Ecommerce (ecom.logic2b.com)

> **Renombrado 2026-07-20:** el producto pasa a llamarse **LogicEcom**
> (antes «Logic2B Commerce Kit»). **Logic2B** sigue siendo la agencia: aparece
> como proveedor, en el copyright y en la firma. El isotipo se retira de la
> cabecera — el producto se presenta como wordmark tipográfico.

> **Renombrado 2026-07-28 — EJECUTADO en F12.1:** el producto se llama
> **Logic2B Ecommerce**; el nombre hace visible el paraguas de la agencia
> (mandato de Andreu, ver Fase 12). Código, UI, metas, JSON-LD y OG ya lo
> dicen. Las entradas históricas de este ROADMAP y los prompts de fases
> pasadas conservan el nombre viejo a propósito: son historia.

> **Documento de continuidad.** Cada sesión de trabajo con Claude Code debe:
> 1. Leer este fichero al empezar (junto con `CLAUDE.md`).
> 2. Actualizar el estado de la fase al terminar, con fecha y resumen de lo hecho.
> 3. Anotar decisiones tomadas y pendientes en las secciones de abajo.

## Objetivo

Demo pública + plantilla clonable de ecommerce ultraligero (Astro 5 + Cloudflare D1/Workers + Stripe Checkout) desplegada en `ecom.logic2b.com`. Especificación completa en `CLAUDE.md`.

## ✅ RECONCILIACIÓN RESUELTA (2026-07-20)

`logic2b-ui-base` y `origin/main` están **al día** (0 ahead / 0 behind tras el
merge `7483d4d`). Sigue vigente la regla de **hacer `git fetch` siempre al
empezar**: hay sesiones cloud empujando a `origin/main`. El historial de la
reconciliación se conserva abajo por contexto.

<details>
<summary>Historial de la reconciliación (resuelto)</summary>

### ⚠️ RECONCILIACIÓN EN CURSO (2026-07-20) — leer antes de trabajar

**Hacer `git fetch` SIEMPRE al empezar**: hay sesiones cloud empujando a `origin/main`. El 2026-07-19/20 se descubrió que `origin/main` iba ~62 commits por delante (Fase 8: seguridad, auth admin, búsqueda, `/dossier`, selector de temas, 97 tests) mientras una sesión local hacía la Fase 9 (rediseño Logic2B UI). Se restauró producción a `origin/main` (Version `f18fce30`, segura).

**Estado del port Logic2B UI** (rama `logic2b-ui-base`, NO desplegada; producción sigue en `origin/main`):
- ✅ **Base + temas**: `global.css` reescrito como base Logic2B UI (Inter, tokens neutros oklch, dark, radios). Los 4 temas de la demo (`src/lib/demo-themes.ts`) se **acoplan encima** sobreescribiendo `--color-brand`/`--font-display`/`--radius-btn`. Verificado (el tema Atlàntic pinta el acento azul sobre la base). Decisión del usuario: "la UI de Logic es la base, los temas dan diversos estilos".
- ✅ **Landing** (`index.astro`): migrada a `SiteHeader` (isotipo) + tokens semánticos + acento verde. Conserva dossier/Kit Lite/a11y del remoto.
- ⬜ **Pendiente**: tienda (`Shop.astro` + catálogo/ficha/carrito/checkout/gracias), admin (`Admin.astro` + 5 páginas + login), `arquitectura`, `404`, `dossier`, restyle del **widget selector de temas** (en `Shop.astro`), quitar alias de compat (`--color-ink/paper/cream` en `global.css`), Lighthouse, y **desplegar**.
- Componentes listos: `src/components/{Logo,SiteHeader}.astro`. Isotipo en `public/brand/logo-mark.svg`. Fuentes Inter en `public/fonts/`. Referencia estética: `ui.logic2b.com` (memoria `logic2b-ui-design-system`).
- Patrón de migración por superficie: `SiteHeader` en el layout + perl de tokens (ink→foreground, cream→muted, paper→background, bg-white→bg-card, stone→muted-foreground/border, border-black/5→border-border) **preservando `brand`**; bandas oscuras `bg-foreground text-background`. Verificar en claro y con ≥1 tema; `pnpm check` (97 tests) verde antes de commitear.
- La rama `fase9-logic2b-ui` guarda el rediseño original (9 commits) por si se necesita rescatar algo.

</details>

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
| 9 | Catálogo de estilos (8 temas) | 🟡 En curso | 2026-07-21 | Arquitectura + `/estilos` + **temas 06 Minimal, 01 Editorial, 07 Launch y 04 Guide desarrollados** (5 listos con Base; registro de catálogo por tema generalizado). **Replanteada como Fase 9B** (ver abajo): de «una tienda, 8 pieles» a «8 tiendas, un motor» |
| 9B/C14 | Tiendas distintas sobre un solo motor | 🟡 En curso | 2026-08-04 | **C14.1–C14.2 cerrados:** contrato tipado y Forma migrada verticalmente a D1, quote, checkout, pedido y gracias compartidos. Quedan tres excepciones cerradas (NODDO, Sitēga y STRETCH); C14.3 las migra. No declarar completa hasta C14.3. |
| 10 | Documentación para el cliente | 🟡 Casi completa | 2026-07-24 | **Ejecutada como F11.7** (ver Fase 11): `/ayuda` (noindex) con manual de 3 pasos + guías + runbook, acta de entrega e inventario de accesos en `docs/plantillas/`, dossier con «qué pasa si nos vamos», guion del vídeo. Pendiente: grabar el vídeo (Andreu) y confirmar las decisiones a/b/c asumidas |
| 11 | Landing V2 «nivel Awwwards» + negocio + funnel + docs | 🟡 En curso | 2026-07-24 | **F11.1, F11.3 (2 sesiones), F11.4, F11.5, F11.6, F11.7 y F11.8 (primera pasada + pase a11y/contenido desde cloud 2026-07-24) hechos**, más F11.8b (auditor de a11y, cloud), F11.2a-1 (tienda ASFALTO / tema Street), F11.2a-2 (tienda METRIA / tema Industrial) F11.2a-3 (tienda ROMER / tema Natural) y **F11.2a-4 (tienda KALIBRE / tema Specs, local 2026-07-25) — con la que F11.2a queda CERRADA (10/10 tiendas)**; y **F11.8c (Lighthouse citable + OG de WhatsApp + URLs sin redirección, local 2026-07-26)**; y **F11.8d–e (tabla de Lighthouse cerrada y desplegada: 7 de 8 superficies a 100×4, la landing entre ellas en móvil y escritorio, local 2026-07-27)**; de la cola de F11.8 solo queda la submission a Awwwards (decisión de pago: Andreu). Detalle por bloque abajo. (ver «Fase 11» abajo). **Plan maestro completo en [`docs/PLAN_FASE11_LANDING_V2.md`](PLAN_FASE11_LANDING_V2.md)**: bloques F11.0–F11.8 ejecutables por sesiones independientes. **Decisiones D1–D6 APROBADAS por Andreu (2026-07-23)**: JS propio ≤15 KB sin deps, capturas con browser tools en local, dirección C «Ocho tiendas, un motor», escalera de precios (Lite 590 / Kit 1.900+39 / A medida 3.400+59), WhatsApp+email, Lite publicado sin construir. Prompt de arranque: [`docs/PROMPT_FASE11.md`](PROMPT_FASE11.md). Integra 9B.5/9B.6 (imaginería y temas restantes) como prerequisito del hero |
| 8 | Pulido de la demo (backlog abajo) | 🟡 En curso | 2026-07-19 | Backlog técnico agotado; solo quedan decisiones y pasos locales de Andreu (ver «Decisiones pendientes» y `docs/PROMPT_CLOUD.md`). Últimas tandas: novena (race de idempotencia en el pago, PII enumerable en `/demo/gracias`, cancelación de pedido pagado sin devolver stock), décima (la misma race en el PATCH de admin, campos vacíos guardados como 0, login sin rate limit), undécima (diagrama móvil de `/arquitectura`, hedge del plazo de entrega, tokens de tema en `/demo/reset`, terminología «envío»), duodécima (aviso de corte en pedidos del admin, cabeceras sin wrap a 375px, leftover «portes», token de radio del carrito, contraste del botón eliminar, H1 en valenciano, checklist de producción) y decimotercera (misma race de idempotencia en `checkout.session.expired`, divisa hardcodeada a EUR fuera de Stripe, cobertura de test de `quoteCart`/PATCH admin/emails) y decimocuarta (config parcial de Stripe → cobro sin cumplimiento, emails duplicados bajo concurrencia, `payment_status` del webhook, color de marca centralizado en `shop.config.ts`, contraste/tema en carrito y checkout) — ver sección «Fase 8» |
| 12 | Logic2B Ecommerce: renombrado, reposicionamiento y docs de dos visiones | 🟡 En curso | 2026-08-06 | **F12.0–F12.5 cerrados:** renombrado, nuevo argumento en landing/dossier, canal agencias en marca blanca y manual ampliado del gestor. Solo queda F12.6 (consolidación). **Plan maestro en [`docs/PLAN_FASE12_LOGIC2B_ECOMMERCE.md`](PLAN_FASE12_LOGIC2B_ECOMMERCE.md)**. |
| 13 | Plataforma modular: del gestor mínimo a paridad extrema de capacidad | 🟡 En curso | 2026-08-06 | **R0 y R1.1–R1.7 cerrados:** manifest/registro, eventos versionados y outbox transaccional con lease, retry/dead-letter y dispatcher idempotente. Siguiente: R1.8, audit log transversal. Fuente de verdad en [`docs/plataforma/`](plataforma/README.md). |

## Repo y entornos

- GitHub: `https://github.com/amariner/logic2b-ecom` (rama `main`).
- Cloudflare: **en producción** — Worker `ecom-logic2b` en https://ecom.logic2b.com, D1 remota `ecom-demo` (`7ae9b06d-3664-4790-a87c-04bb4c67e97a`), cron reset cada 6 h, cuenta marinerandreu@gmail.com.

## Fase 13 — Plataforma modular y paridad de capacidad

> Fuentes de verdad nuevas:
> [`docs/plataforma/README.md`](plataforma/README.md) ·
> [`INVESTIGACION_EDICIONES_2022_2026.md`](plataforma/INVESTIGACION_EDICIONES_2022_2026.md) ·
> [`MATRIZ_CAPACIDADES.md`](plataforma/MATRIZ_CAPACIDADES.md) ·
> [`ROADMAP.md`](plataforma/ROADMAP.md) ·
> [`WIKI_SEO.md`](plataforma/WIKI_SEO.md) ·
> [`PROMPT_FASE13.md`](PROMPT_FASE13.md).

**Mandato de Andreu (2026-08-06):** conservar el backend mínimo como ventaja
para cada comercio, pero escalar el motor hasta poder resolver con solvencia los
mismos resultados de negocio que una plataforma de referencia: núcleo nativo,
módulos activables, conectores o servicio gestionado. No se convierte en SaaS
multiinquilino; cada cliente mantiene despliegue y datos aislados.

La investigación recorrió las nueve ediciones públicas indicadas, normalizó
aproximadamente 1.300 entradas de lanzamiento en 18 dominios y separó
capacidades reales de anuncios regionales, iteraciones, hardware, financiación
y servicios de terceros. La matriz resultante impide confundir «identificado»
con «disponible» y la wiki solo podrá publicar una promesa respaldada por tests,
una integración operativa o un alcance a medida explícito.

El plan anterior permanece como historia y mantenimiento de la demo. **F12.6
ya no bloquea el desarrollo del motor**: se conserva en el carril comercial y se
cerrará cuando una sesión local ejecute sus auditorías de producción. El orden
de producto pasa a la Fase 13 y se ejecuta un bloque R por sesión.

### Estado F13

| Bloque | Resultado | Estado |
|---|---|---|
| R0 | Investigación, taxonomía, matriz, roadmap y wiki SEO | ✅ 2026-08-06 |
| R1.1 | ADR de arquitectura modular: dominios, dependencias, puertos/adaptadores y lifecycle de capacidades | ✅ 2026-08-06 — 5 ADRs + mapa + allowlist/check Vitest |
| R1.2 | Capability manifest tipado, dependencias y presets sin UI | ✅ 2026-08-06 — 14 tests + config por despliegue + composition root puro |
| R1.3 | Navegación y rutas por capacidad | ✅ 2026-08-06 — política común, 12 tests de acceso y SQL de presentación 13→4 |
| R1.4 | Registro de módulos | ✅ 2026-08-06 — 16 descriptores, validación de ciclos/propiedad y composición por preset |
| R1.5 | Sobre de eventos | ✅ 2026-08-06 — sobre versionado sin PII, 5 hechos de pedido, consumidor de notificaciones desacoplado, 244 tests |
| R1.6 | Diseño y aprobación del outbox | ✅ 2026-08-06 — ADR-0007 y esquema aprobados |
| R1.7 | Outbox transaccional | ✅ 2026-08-06 — migración, escritura atómica, dispatcher y recuperación |
| R1.8+ | Audit log, observabilidad y resto de olas | ⬜ ver plan maestro |

## Fase 12 — Logic2B Ecommerce: renombrado, reposicionamiento y las dos visiones

> Plan maestro: [`docs/PLAN_FASE12_LOGIC2B_ECOMMERCE.md`](PLAN_FASE12_LOGIC2B_ECOMMERCE.md).
> Mandato de Andreu (2026-07-28). El motor NO se toca en esta fase.

**El mandato, en corto:** (1) el producto pasa a llamarse **Logic2B
Ecommerce** — el nombre hace visible que detrás hay una agencia, no un SaaS
suelto; (2) el argumento de venta deja de liderarlo el precio: ahora es
**«nunca había sido tan fácil ni tan asequible un ecommerce a medida»**, la
**escalabilidad** (se empieza por un MVP básico y funcional y se le añaden
funcionalidades y servicios a medida que el proyecto crece) y que **la cuota
paga a un equipo que asiste continuamente —desarrollo y marketing con los
servicios de Logic2B—, no a una plataforma que te apaña**; (3) la
documentación crece hasta servir a **dos visiones**: la de negocio (un CEO de
ecommerce que decide, una agencia que nos subcontrata) y la de operación (el
gestor de la tienda).

El argumentario canónico (pilares P1–P4, fuente de verdad de todo el copy) y el
mapa audiencia→documento están en el plan. **D7 y D8 se decidieron en concepto
el mismo 2026-07-28**: la mensualidad es **una sola cuota personalizada**
(mantenimiento + asistencia + seguimiento, que se sustituye al subir de tramo,
nunca se apila) — cifras pendientes de Andreu, con benchmark y escalera
propuesta (Base 39 · Crece 279 · Acelera 590) en
[`docs/ANALISIS_MENSUALIDAD.md`](ANALISIS_MENSUALIDAD.md) —; y `/agencias` es
un GO **con marca blanca** (nosotros el desarrollo, la agencia lo demás;
captar todo cliente de ecommerce, directo o de otra agencia).

**Mandato añadido (2026-07-28, misma sesión):** entra en el argumentario la
**doctrina del backend mínimo** — tu panel: pedidos, envíos y productos, nada
más; las mil configuraciones (mercados, divisas, impuestos) y las
integraciones corren de nuestro lado; lo fuera de lo común se pide y se
resuelve, mucho mejor que plugins y suscripciones que no aportan. El sistema
se presenta como **integrable** (feeds Google Merchant/Meta, mailing para
campañas, transportistas, facturación) pero en v1 se queda minimalista como
muestra. Y quedan en la **cola del motor** (post-F12, espec en el plan):
**feeds de catálogo Google Merchant + Meta** (un solo feed en formato Google
sirve a ambos; prerequisito técnico del tramo Acelera) y la pantalla
«Integraciones» del panel demo.

**Mandato añadido (2026-07-30, sesión local):** la escalabilidad se cuenta con
una **frase estrella decidida por Andreu** — techo de **un millón** de
referencias y forma «los dos extremos como iguales»: **«10 productos o un
millón: tu tienda nunca se queda pequeña»**. El suelo (10) protege a los
minoristas; el techo vende la escala. El claim se respalda con una sección
técnica en `/arquitectura` (una referencia ≈ 1–2 KB, D1 admite 10 GB; los
catálogos industriales entran por el tramo «A medida», raíl de honestidad §5
del plan intacto). Además la imagen corporativa se alinea con logic2b.com:
header al carril de `logic2b-norte` (1440px, gutter `clamp(24px,4vw,32px)`) y
botones comerciales al canto 10px (`--r-btn` de la agencia); los temas de
tienda conservan su radio propio. Bloques, un bloque por sesión:

| Bloque | Qué es | Estado |
|---|---|---|
| F12.0 | Red de seguridad: el auditor a11y entra en las páginas comerciales + ojo a Street | ✅ 2026-07-28 — 19 superficies nuevas, 20 fantasma retiradas → **123 en verde**; desplegado (entrada abajo) |
| F12.1 | Renombrado LogicEcom → Logic2B Ecommerce (22 ficheros, wordmark, OG, JSON-LD, docs) | ✅ 2026-07-28 — desplegado (entrada abajo) |
| F12.2 | La landing cuenta el argumento nuevo (hero P1 + frase estrella, sección nueva «crece sin migrar» P2, precios reencuadrados P3/D7, franja P4, FAQ+JSON-LD) | ✅ 2026-07-30 — en el repo; **deploy pendiente del OK de Andreu al copy** (entrada abajo) |
| F12.3 | Dossier V2: business case para el decisor (camino MVP→escala, qué compra la mensualidad) | ✅ 2026-07-30 — en el repo; **deploy pendiente del OK de Andreu al copy** (entrada abajo) |
| F12.4 | La visión de la agencia: `docs/AGENCIAS.md` + página `/agencias` (D8: GO, con marca blanca) | ✅ 2026-08-06 — documento, página indexable, OG propia y conversión; desplegado (entrada abajo) |
| F12.5 | La visión del gestor ampliada: `/ayuda` con escenarios reales y «tu primer mes» | ✅ 2026-08-06 — backend mínimo, 10 escenarios y rutina del primer mes; entrada abajo |
| F12.6 | Consolidación: barridos completos, Lighthouse en producción, OG, índice `docs/README.md` por audiencia | ⬜ |

## Fase 11 — Landing V2, negocio, funnel y docs

> Plan maestro: [`docs/PLAN_FASE11_LANDING_V2.md`](PLAN_FASE11_LANDING_V2.md).
> Decisiones D1–D6 aprobadas (2026-07-23). El motor NO se toca en esta fase.

### F11.1 — Capturas reales de tiendas, panel y flujo (2026-07-23)

Assets de la landing V2 (dirección C «Ocho tiendas, un motor»). **Sesión local**
(wrangler dev + D1 sembrada + Chrome). Ninguna dependencia npm nueva.

- **Motor de captura reproducible** — `scripts/capture-screens.mjs`: conduce el
  Chrome del sistema por CDP con el `WebSocket` global de Node (≥21) y convierte
  a WebP con `cwebp` (binario de sistema). Data-driven: un array de `SHOTS`
  declara URL, viewport, auth, siembra de carrito y recorte. El **banner de demo**
  (tienda y panel) y el **conmutador flotante** se ocultan por CSS inyectado antes
  de capturar (cero cambios en el código de la app). Admin con cookie de sesión
  (login `demo`); carritos sembrando `localStorage` y revalidados por el server;
  checkout con portes disparando `/api/cart/quote` (CP 12001 → 4,90 €). Ejecutable
  con `node scripts/capture-screens.mjs [--only=<substr>]`.
- **30 capturas WebP + 1 clip de vídeo**, en `public/images/screens/`:
  - 6 tiendas (launch·minimal·editorial·guide·iris·demo): escaparate (escritorio
    página completa / móvil viewport), ficha del producto firma, y carrito con
    líneas reales (launch, demo). **Iris** es tienda de vídeo-scrub → captura
    estática solo como póster del hero.
  - Panel: pedidos (5 estados), detalle con timeline+tracking, productos, envíos,
    **bandeja de emails** (pieza estrella) y email de confirmación abierto y
    renderizado.
  - Flujo: checkout con portes calculados (+ móvil) y `/demo/gracias`.
  - **Vídeo de Iris**: `iris-scrub.mp4` (720p H.264 sin audio, 6 s, 593 KB,
    derivado de `collections/iris/hero.mp4` con ffmpeg) + `iris-scrub-poster.webp`.
- **Pesos**: escritorio ≤150 KB y móvil ≤60 KB salvo `panel-emails-m` (~61 KB,
  bandeja larga de texto, lazy — irrelevante). Toda la biblioteca ~1,9 MB (el
  vídeo son 593 KB); la landing hará lazy, no carga las 30 a la vez.
- **Receta de re-captura** documentada en
  [`public/images/screens/README.md`](../public/images/screens/README.md) (las
  capturas caducan con cada rediseño de tema).
- **Verificado**: `pnpm check` en verde (148 tests, 0 errores, build OK). No se
  tocó `src/` ni el motor: solo `scripts/` y `public/images/screens/`.

### F11.3 — Landing V2, sesión 1: esqueleto + hero galería (2026-07-23)

Reescritura de `src/pages/index.astro` a la dirección C «Ocho tiendas, un motor».
**Cero JS nuevo, cero dependencias.** Motor intacto.

- **El hero ES la galería**: tira horizontal (scroll-snap nativo, accesible por
  teclado) de las 6 tiendas reales, cada tarjeta con chrome de navegador, su
  captura de F11.1 (Iris en vídeo con póster) y **el acento de SU tienda**
  (punto + hover + borde). La galería se **deriva del registro de colecciones**
  (`collections` + `getTheme` + `storePaths`): añadir una tienda no toca la
  landing. El acento que muta con el scroll es el pase de motion (sesión 2); de
  momento estático por tarjeta, que es el fallback previsto.
- **Esqueleto §5 completo**: hero+galería · barra de prueba (0 €/mes · <0,5 s ·
  100/100 · Stripe) · «lo que te cuesta» · **flujo del pedido en 4 pasos con las
  capturas reales** (checkout→email→panel→envío) · comparativa + aside «Cuándo
  NO somos tu opción» · **precios D4** (Kit 1.900 € + 39 €/mes destacado · Kit a
  medida desde 3.400 € + 59 €/mes · Lite desde 590 € como tira secundaria) ·
  «míralo por dentro» (panel + bandeja de emails + CTA a `/estilos`) · FAQ (con
  «¿y si dejamos de trabajar juntos?») · **CTA WhatsApp + email** (D5).
- **JSON-LD** `Service` con `offers` de los tres tiers (sincronizado con D4) +
  `FAQPage` actualizado.
- **Iris en vídeo**: elemento `<video poster preload="none">` inerte (cero bytes
  de vídeo en la carga inicial, reduce-motion-safe); autoplay-on-scroll queda
  para la sesión 2 (`data-store-video`).
- **Verificado** con `wrangler dev` (Chrome headless, la pane in-app falló al
  paint): full-page claro a 1440 y móvil a 390, y modo oscuro coherente
  (secciones dark-ready por tokens semánticos). Imágenes con width/height
  (CLS-safe). `pnpm check` en verde (148 tests, 0 errores, build OK).
- **⚠ Pendientes de esta pieza** (sesión 2 / decisiones de Andreu):
  - **Número de WhatsApp** (D5): constante `WHATSAPP` vacía en `index.astro` →
    ahora el CTA usa solo email. Rellenarla activa el botón de WhatsApp.
  - **Sin conmutador de modo oscuro en todo el sitio**: el `<body>` de Base es
    `bg-white text-gray-900` fijo y ninguna página de marketing añade `.dark`.
    El sitio renderiza en claro; la landing es dark-ready pero el oscuro no se
    activa para el visitante. Decisión de producto/UX aparte (afecta a todo el
    sitio, no solo a la landing).
  - ~~Sesión 2 (motion + pulido)~~ → **hecha el 2026-07-24**, ver F11.3 sesión 2.

### F11.3 — Landing V2, sesión 2: motion y pulido (2026-07-24)

Motion nivel premio sin dependencias (D1: un único script vanilla inline ~2 KB
gzip + CSS scroll-driven). Motor intacto; solo `index.astro`, `Base.astro`,
`SiteHeader.astro` y `global.css` (fuentes/selection, presentación compartida).

- **Acento mutante**: el acento de la landing muta al de la tienda activa de la
  galería (la tarjeta más cercana al centro de la tira; listener de scroll +
  rAF). Los pares AA se **precalculan en build** por tienda: texto sobre blanco
  ≥ 4,5:1 con cadena acento → acento oscuro → tinta, e invertida para fondo
  oscuro (dark-ready). Guide muta a tinta como texto — el mismo criterio que ya
  aplica su tienda. Remaps con scope `[data-landing]` fuera de `@layer`; los
  botones `bg-brand` pasan a `text-brand-fg`. Sin JS: acento estático por
  tarjeta (el fallback previsto).
- **Iris**: la tarjeta se sirve como `<img>` lazy del póster y el script la
  asciende a `<video preload="none">` con IntersectionObserver (play al 40 %
  visible, pause al salir). Con reduced-motion o Save-Data se queda la imagen.
  El clip (593 KB) no baja ni un byte hasta que la tarjeta se ve.
- **Cifras count-up en CSS puro**: `@property <integer>` + `animation-timeline:
  view()` + `counter()`; el texto real queda en el DOM como fallback (Firefox,
  reduced-motion, impresión) y es lo que leen los lectores. Tarjetas con entrada
  `rise` solo-transform (sin opacity: axe audita el estado inicial y el texto
  perdería contraste).
- **Mini-calculadora a 3 años** (D4): slider 1.000–10.000 €/mes → Shopify Basic
  (36 €/mes + 2 % sin su pasarela) vs Kit (3.304 €), con veredicto honesto (a
  poco volumen dice que Shopify sale más barata). Fallback sin JS: tabla de 3
  escenarios con las mismas cuentas. ⚠ El dossier aún cita 2.944 €/3 años
  (29 €/mes antiguos) — se actualiza en F11.5.
- **View Transitions cross-document CSS puras** (`@view-transition`, sin router
  de cliente): / ↔ /estilos ↔ demos con crossfade y header persistente
  (`view-transition-name` en `SiteHeader`); guardadas por reduced-motion.
  `::selection` con el acento activo y scrollbar de la galería acentuada.
- **Fuentes**: fallback métrico de Inter (`size-adjust` sobre Arial/Roboto) +
  preload del woff2 latino → **CLS 0** (antes 0,05 por el swap).
- **Lighthouse local (wrangler dev, preset móvil): 98 / 100 / 100 / 100** con
  TBT 0 ms, CLS 0, FCP 0,8 s. El LCP *simulado* queda en 2,3 s (lantern encadena
  el TTFB de 468 ms de miniflare y las capturas del hero pre-LCP al H1) pero el
  **LCP observado es 0,26 s**. Hallazgo clave: animar `font-weight` de la Inter
  variable en el H1 costaba **2,1 s de TBT** (re-shaping por frame) → eliminado;
  la entrada del hero es solo-transform. El gate 100×4 se cierra contra
  producción en F11.8 (TTFB real de CDN + HTTP/2); si allí no llega, la palanca
  documentada es adelgazar las 3 capturas pre-LCP de la galería (decisión de
  Andreu: calidad del escaparate vs el punto de perf).
- **Verificado**: `pnpm check` (148 tests, 0 errores) + **E2E 27 pasos** en
  verde (se tocó CSS/layout compartido); CDP a 1440 y 375, claro y oscuro
  (dark-ready con acentos invertidos comprobados), reduced-motion (página
  completa y estática, Iris como imagen), teclado (galería = enlaces nativos,
  foco visible). Receta de verificación en el scratchpad de la sesión
  (`verify-landing.mjs`, patrón de `scripts/capture-screens.mjs`).

### F11.5 — Precios D4 en dossier + unit economics + WhatsApp D5 (2026-07-24)

- **CTA de WhatsApp activado** (D5): número de negocio 626 434 316 en la
  constante `WHATSAPP` de `index.astro` (botón primario del CTA final) y en el
  contacto del dossier (imprimible, con el número visible).
- **`/dossier` a la escalera D4**: Kit 1.900 € + 39 €/mes (destacado, con las
  «hasta 2 h de cambios al mes» explícitas — el anti-scope-creep de § 6.2), Kit
  a medida desde 3.400 € + 59 €/mes, Kit Lite desde 590 € como tira secundaria.
  Comparativa recalculada: **3.304 € a 3 años** (antes citaba 2.944 € con los
  29 €/mes antiguos). JSON-LD del dossier con `offers` de los tres tiers,
  sincronizado con la landing.
- **Unit economics escritos** (interno) en `PLAN_FASE11_LANDING_V2.md` § 11:
  ingresos por tier, costes (infra 0, imaginería ~50 créd., dominio),
  mantenimiento a 19,5 €/h efectivos si se consume entero (validar consumo real
  con los 3 primeros clientes) y escenario año 1 conservador. ⚠ La casilla de
  **horas de producción por tema sigue vacía** (`docs/temas/*.md` § «Coste del
  tema» sin rellenar): es el único coste que puede romper el modelo y se cierra
  rellenando la ficha de cada tema al construirlo (9B.6).

### F11.4 — `/estilos` y `/arquitectura` al nivel de la landing (2026-07-24)

- **`/estilos` demuestra en vez de describir** (cierra 9B.7): cada tema con
  tienda viva enseña su **captura real** de F11.1 (enlazable, con zoom suave al
  hover) y un CTA con su acento («Entra en Vector →», par acento/texto del
  propio tema). El mapeo tema→tienda se deriva del registro de colecciones:
  un tema nuevo aparece solo. Vector lleva encuadre propio (`object-[center_18%]`:
  su cabecera es texto sobre blanco y recortada parecía una tarjeta vacía).
- **Guía para elegir estilo** (pieza 10.1): tres preguntas sin jerga (¿foto o
  datos? ¿cuántas referencias? ¿qué tono?) con respuestas enlazadas por ancla a
  cada ficha (`#estilo-<id>`, `scroll-mt` para el header pegajoso).
- **`/arquitectura`**: el diagrama SVG se **dibuja al entrar en viewport**
  (`stroke-dashoffset` + `pathLength` normalizado, CSS scroll-driven, cero JS;
  la curva discontinua del webhook se funde para no perder el punteado;
  fallback = dibujado). Dos capturas reales con pie: la **bandeja de emails**
  tras el flujo del webhook y el **listado de pedidos con exportación CSV** en
  la sección de envíos.
- Verificado en navegador (1440 full-page ambas páginas) y `pnpm check` verde.

### F11.6 — Funnel de venta (2026-07-24)

- **Recorrido guiado ascendido a pieza central**: el CTA primario del hero es
  ahora «Haz la demo en 3 minutos» → `/demo/tienda?tour=1`. La cadena ya
  existía sin JS (tira «Recorrido de la demo» del catálogo genérico → compra →
  pasos numerados en `/demo/gracias` → panel → bandeja); lo nuevo es la entrada
  medible y el **cierre**: la bandeja de emails (fin del recorrido) termina con
  un CTA sobrio «Fin del recorrido… ¿hablamos?» (WhatsApp · email · precios),
  **solo con `DEMO_MODE=true`** — en la tienda de un cliente ese panel es suyo.
- **CTAs por temperatura** en la landing: frío = galería de tiendas; templado =
  recorrido de 3 min; caliente = WhatsApp/email al final. Sin mailto único.
- **Medición (4 señales, CF Web Analytics es de pageviews — sin JS de eventos):**
  1. *entra-demo* → pageview de `/demo/tienda?tour=1` (el query lo distingue).
  2. *completa-compra-demo* → pageview de `/demo/gracias`.
  3. *abre-dossier* → pageview de `/dossier`.
  4. *contacto* → **no medible sin JS** (clic a `wa.me`/`mailto`); si se quiere,
     es un `onclick` de 3 líneas + endpoint o el paso a un formulario→D1
     (F11.6 opcional del plan, requiere OK aparte). Documentado, no implementado.
  Falta el token del beacon (`analytics.cfBeaconToken`, paso local de Andreu).
- **Plantilla interna de respuesta al prospecto** en
  `docs/plantillas/respuesta-prospecto.md` (email + WhatsApp, las «2-3
  preguntas en 24 h» que promete la landing, regla de encaje honesto y registro
  de demanda del Lite para D6).

### F11.7 — Documentación de cliente (ejecuta la Fase 10) (2026-07-24)

> ⚠ Decisiones (a)(b)(c) del plan § 8 **asumidas con la recomendación escrita**
> (a: `/ayuda` noindex en la propia tienda · b: castellano solo · c: manual
> genérico sin apéndices por estilo de momento). Confirmar con Andreu.

- **`/ayuda`** (noindex, fuera del sitemap —es allowlist—, registro sobrio del
  panel, parametrizada por `shop.config` → clonable): manual del pedido en
  **3 pasos con las capturas reales** de F11.1, guía de producto (la foto que
  vende, nombre/precio/stock), guía de envíos (tarifas, umbral gratis como
  promoción), runbook **«Qué hacer cuando…»** (6 situaciones: pedido que no
  llega, reembolso, pendiente eterno, tracking equivocado, cancelar pagado,
  agotado) y **«Qué puedes tocar sin miedo (y qué no)»**. Cero jerga (el listón:
  nada de webhooks). Enlace «Ayuda» en la cabecera del panel.
- **Plantillas de entrega** en `docs/plantillas/`: **acta de entrega**
  (checklist de lo entregado, formación, propiedad y mantenimiento, firmas) e
  **inventario de accesos** (tabla titular/cuenta/acceso, sin contraseñas,
  reglas de la casa y baja con retirada de accesos). Markdown imprimible.
- **Dossier v2**: sección «**Qué pasa si un día nos vamos**» (todo a nombre del
  cliente + acta/inventario + sin permanencia) — el anti-secuestro como
  argumento de venta (Fase 10.3).
- **Guion del vídeo de 3 min** (`docs/plantillas/guion-video-panel.md`): 10
  líneas con plano y frase; la grabación es de Andreu (paso local).

### F11.8 — QA + deploy a producción (2026-07-24, primera pasada)

Sesión local. Ejecutado el núcleo del cierre; queda la cola «de premio».

- **Verificación completa antes de desplegar**: `pnpm check` en verde (148
  tests, tipos, build) y `pnpm test:e2e` contra `wrangler dev` con los 27
  checks en verde (compra→email→panel→envío, validaciones PATCH, rate limit).
- **Deploy a https://ecom.logic2b.com** (`pnpm deploy`): versión
  `e14f4eb2`, 41 assets nuevos (capturas F11.1 + landing V2 + `/ayuda` ya en
  vivo), cron reset y dominio intactos.
- **E2E contra producción**: 26/27 en verde. El único fallo es el check de
  rate-limit del login — limitación **conocida y documentada** (contador por
  isolate/PoP; solo es determinista en local). Demo reseteada al terminar
  (`POST /api/demo/reset` → 200).
- **Sanidad en producción**: `/` 200 (HTML ~10 KB comprimido, ~0,3 s),
  `/arquitectura`, `/estilos` y `/dossier` sirven tras la redirección normal a
  barra final; `/demo/*` mantiene `noindex,follow`; OG presente en `/`.
- **Metodología de sesiones**: nuevo [`docs/CONTINUAR.md`](CONTINUAR.md) —
  protocolo de 8 pasos para que cualquier chat (local o cloud) que reciba solo
  «continúa con el desarrollo» sincronice, planifique UN bloque con el equipo,
  ejecute, testee, documente, actualice «Próxima sesión» y suba a main.
- **Pendiente de F11.8** (cola): Lighthouse 100×4 citable contra producción,
  verificación del OG en WhatsApp, submission Awwwards (decisión de pago:
  Andreu). El pase formal de teclado/lector y reduced-motion de las páginas
  comerciales se cerró el 2026-07-24 desde cloud (siguiente entrada).

### F11.8 — cola: pase a11y formal + auditoría de contenido de las páginas comerciales (2026-07-24, sesión cloud)

Sesión cloud que intentó F11.2a y confirmó su bloqueo real: la política de red
del entorno deniega el CDN de Higgsfield (CONNECT 403 verificado) y también
`ecom.logic2b.com`, así que ni imaginería ni auditoría en vivo. Se ejecutó la
alternativa prevista: el tramo de la cola de F11.8 revisable en código, sobre
`/`, `/estilos`, `/arquitectura` y `/dossier`, con verificación funcional en
Chromium headless por CDP (14 checks) contra `dist/` servido en local.

- **El vídeo de Iris en la galería del hero no tenía control de pausa** (WCAG
  2.2.2, nivel A: lo que se mueve >5 s en paralelo con otro contenido necesita
  pausa; salir del viewport no cuenta). Añadido un botón pausa/reproducir como
  chip discreto sobre la esquina de la tarjeta: vive en el template **fuera del
  enlace** (interactivos no se anidan) y nace `hidden` — el script solo lo
  activa cuando asciende la imagen a vídeo, así que sin JS, con
  `prefers-reduced-motion` o con ahorro de datos no hay ni vídeo ni botón. La
  pausa del visitante manda sobre el autoplay del IntersectionObserver (no
  re-arranca al re-entrar en viewport). Gotcha cazado por el camino: las clases
  Tailwind que solo existían como literal dentro del `<script>` no salían en el
  CSS del bundle de la página — otro motivo para que el botón viva en el
  template. Área táctil 32px (≥24, WCAG 2.5.8), `aria-pressed` + `aria-label`
  conmutados, glifos SVG con la clase `hidden` (el atributo `hidden` es HTML y
  en SVG no es fiable).
- **El `<video>` creado por el script perdía el `alt`** de la imagen a la que
  sustituye → se copia como `aria-label` del vídeo.
- **Decorativos que los lectores leían en voz alta**: el «+» del acordeón del
  FAQ de la landing y los ✓/—/· de las listas del dossier y de los tiers de
  precios (la landing ya ocultaba sus guiones; ahora todos consistentes con
  `aria-hidden="true"`).
- **Contenido desincronizado con el registro de temas**: la landing decía «Ocho
  direcciones visuales» pero `/estilos` ya enseña **9** (Iris entró después del
  copy). Ahora la landing deriva el recuento de `demoThemes` igual que hace
  `/estilos` — un tema nuevo actualiza el copy solo.
- **Recuento erróneo en `/estilos`**: la píldora del hero decía «6
  desarrolladas» porque contaba el tema Base, que no aparece en la lista de la
  página; de los 9 estilos mostrados hay 5 desarrollados. El recuento ahora se
  hace sobre la lista visible.
- **Auditoría sin más hallazgos**: foco visible global (`:focus-visible` con el
  acento), toda animación de landing/arquitectura tras
  `prefers-reduced-motion: no-preference` (count-up, rise, hero, dibujo del
  diagrama SVG, `@view-transition`), fallbacks estáticos completos en el DOM,
  `aria-current` en nav, jerarquía de headings correcta, sitemap/robots/canonical
  coherentes, JSON-LD sincronizado con los precios D4 visibles (Service+offers
  590/1900/3400 y FAQPage = copy), OG 1200×630 real, capturas y fuentes
  referenciadas todas presentes.
- Verificado: `pnpm check` (148 tests, 0 errores/hints) + 14 checks headless
  (botón, ARIA, observer vs pausa, reduced-motion sin vídeo ni botón,
  recuentos en el HTML servido) + captura visual de la tarjeta a 1440px.

**Pendiente Fase 11** (siguientes bloques): F11.2a (imaginería Higgsfield + 4
temas restantes; LOCAL — confirmado que cloud no puede: CDN de Higgsfield
bloqueado por la política de red), cola de F11.8 (Lighthouse citable + OG
WhatsApp; LOCAL). El resto de bloques ejecutables desde cloud están completos.

## Fase 9B — Ocho tiendas distintas sobre un solo motor

> **Esto es un REPLANTEAMIENTO de la Fase 9, no una continuación.** La Fase 9
> construía «una tienda con 8 pieles»: un catálogo compartido (aceite del
> Maestrat) y un selector con cookie que cambiaba la presentación. La Fase 9B
> construye **8 tiendas**, cada una con su URL, su catálogo, su identidad y su
> imaginería, sobre **un solo motor que no se bifurca**.
>
> La tesis comercial que manda sobre todo lo técnico: *«diseñamos tiendas
> radicalmente distintas y las entregamos rápido»*. Lo que hace eso posible es
> que cada encargo nuevo toque **solo diseño y productos**. Un tema espectacular
> que haya exigido tocar el motor es un fracaso de arquitectura disfrazado de
> éxito de diseño.

### 9B.0 — Decisiones cerradas (2026-07-21)

1. **Fidelidad: réplica del screenshot.** Cada tema se construye mirando su
   `.webp` de `public/images/referencias/` y clavando la composición: rejilla,
   gaps, filetes, escala tipográfica, colores exactos, orden de los elementos.
   La imaginería de Higgsfield reproduce la receta visual de la captura (mismo
   objeto, fondo, luz y encuadre). **Lo único que no cruza:** nombre de marca,
   logotipo, textos literales y fuentes propietarias — `/estilos` es una página
   comercial indexable. Deroga el «todo se reconstruye en Inter + neutros» de
   `docs/TEMAS.md § 4`.
2. **Migración de D1 aprobada** (ver 9B.1).
3. **74 productos**, repartidos por lo que llena la rejilla de cada tema:
   Natural y Street 12, Editorial e Industrial 10, Specs 9, Guide y Minimal 8,
   Launch 5.
4. **Guide cambia de catálogo, no de tema.** Su referencia (*Pour over*) es una
   tienda de café: su colección pasa a ser **café de especialidad y equipo de
   cafetería**. Con 8 objetos simples y bien definidos, la ilustración de línea
   deja de ser «un sistema gráfico a medida» y son 8 generaciones. **Entra.**
5. **`shop.config` partido** en motor + colección (ver 9B.1).
6. **El selector con cookie se elimina** — cada tienda es su URL (9B.4).
7. **Carrito, checkout y gracias siguen siendo UNA implementación**, servida bajo
   la ruta de la colección para heredar sus tokens. Funcionalidad idéntica,
   estilo distinto, cero duplicación de lógica.

**Colecciones propuestas** (pendiente de veto de Andreu; los nombres de tienda se
proponen en 9B.4): Editorial → audio y objeto de diseño · Industrial →
instrumentación técnica · Natural → cosmética natural · Guide → café de
especialidad · Specs → componentes de precisión · Minimal → mobiliario e interior
· Launch → producto estrella · Street → streetwear y calzado.

### 9B.1 — Motor: colecciones y capacidades opcionales (2026-07-21)

Es el cimiento: a partir de aquí el motor **no se vuelve a tocar** al desarrollar
un tema.

- **Migración `0002_collections_and_product_capabilities.sql`**, una sola:
  - `collection TEXT NOT NULL DEFAULT 'demo'` — el DEFAULT retro-llena las 60
    filas existentes en el mismo `ALTER`, así que el catálogo actual queda íntegro
    en la colección `demo`.
  - `subtitle`, `compare_at_price_cents`, `specs_json` — nullable e ignorables.
    Resuelven de una vez lo que Industrial, Natural y Specs pedían, en vez de con
    tres apaños derivados del seed. Un cliente real hereda descuentos y ficha
    técnica de serie.
  - Índice `(collection, active, category)`.
  - **`slug` sigue UNIQUE global, deliberadamente:** es la clave del carrito y del
    checkout. Hacerlo único-por-colección obligaría a propagar la colección a
    `cart-client.ts`, `/api/cart/quote` y `/api/checkout/session` — o sea, a
    bifurcar la ruta de cobro. Los slugs se namespacean en el seed.
  - SQLite no admite `CHECK` en `ALTER TABLE ADD COLUMN`: la invariante
    `compare_at_price_cents > price_cents` se valida en el seed (`assertCompareAtPrice`).
- **⚠️ Guardarraíl del precio de oferta** (`tests/pricing-guard.test.ts`, 10 tests).
  `compare_at_price_cents` es EXCLUSIVAMENTE presentación. Cuatro capas: el
  subtotal lo ignora; el umbral de envío gratis se evalúa contra el precio real
  (el test que de verdad detecta el bug de dinero); `QuoteLine` no lo expone; y
  una **guardia estática** que falla si la cadena `compare_at_price` aparece en
  `pricing`, `shipping`, `quote`, checkout, quote-API o webhook. Verificado que
  muerde: introducido el campo en `pricing.ts` a propósito, el test falla.
- **`shop.config.ts` partido en dos capas.** Se queda lo que influye en lo que se
  COBRA, se ENVÍA o dice un EMAIL (divisa, zonas, tarifas, numeración, legal,
  identidad del operador). Las **categorías salen de ahí** y pasan a
  `src/collections/<id>.ts` junto con nombre, tagline y descripción. Ocho
  `shop.config` habrían sido ocho motores.
- **`src/collections/index.ts`** — registro. La colección activa sale SIEMPRE del
  segmento de URL validado contra el registro: un id desconocido es `null` (→ 404),
  nunca un fallback a otra tienda. `resolveCategory` valida la categoría contra su
  propia colección.
- **`lib/db.ts`**: `collection` es parámetro **obligatorio** de `getActiveProducts`
  y `getProductBySlug` — el compilador obliga a cada punto de lectura a declarar de
  qué tienda tira, y ningún tema puede leer la tabla entera por olvido.
  `getProductsBySlugs` (carrito) queda agnóstico a propósito. Añadido `parseSpecs`,
  que valida `specs_json` de forma defensiva.
- **Los 4 temas hechos reciben `collection` como prop** en vez de leer
  `shopConfig.categories`. Es el acoplamiento correcto y hace 9B.4 barato.
- **Verificado**: `pnpm check` en verde (**128 tests**, 0 errores de tipos, build
  OK). `pnpm db:reset` aplica las dos migraciones y deja los 60 productos en
  `collection='demo'` con las columnas nuevas a NULL. En `wrangler dev`: catálogo,
  filtro por categoría, ficha (200), slug inexistente (404) y `/api/cart/quote`
  devolviendo precios y portes correctos. Sin dependencias nuevas.
- **No se tocó** ni una línea de `lib/pricing.ts`, `lib/shipping.ts`,
  `cart-client.ts`, el webhook ni los emails.

### 9B.2 — Demo genérica: fixtures del backoffice (2026-07-21)

El backend de demo ya deja sembrado un panel realista con **todas** las variantes,
para poder enseñarlo en una llamada de venta sin fabricar el estado a mano.

- **`seed/demo-orders.ts`** (nuevo, SOLO demo, separable para cliente real): 8
  pedidos que cubren los **cinco estados** (pending, paid, shipped con tracking,
  delivered, cancelled), formas distintas (una línea / varias, envío gratis por
  umbral y sin alcanzarlo) y las **cuatro zonas** (península, Baleares, Canarias,
  Ceuta/Melilla). `order_events` con **timeline real** (hasta 4 hitos) y
  `emails_outbox` con los emails **reales** del flujo (6 confirmación + 6 aviso
  al comercio + 4 aviso de envío), generados por `lib/emails` — nada de HTML a
  mano. Totales calculados con `lib/pricing`. **Timestamps relativos**
  (`datetime('now', …)`) para que el reset por cron no envejezca la demo.
- **Estados de producto** en el seed: agotado, stock bajo, inactivo, y las
  capacidades de 9B.1 hechas **visibles** — oferta (`compare_at`, solo
  presentación), subtítulo y ficha técnica. La ficha Base y la tarjeta del
  catálogo los pintan ahora.
- **Estados vacíos alcanzables**: categoría de temporada vacía («Cestas de
  Navidad») en `demo.ts` + búsqueda sin resultados (ya lo era).
- **Blindaje**: `tests/demo-seed.test.ts` (16 tests) fija la cobertura y la
  **integridad referencial** (un slug inexistente → `product_id` NULL rompería el
  reset en vivo en silencio; el gotcha del seed). `seed.test.ts` actualizado.
- **Coste / frontera**: trabajo de demo, no de tema. Tocó `seed/*`,
  `src/collections/demo.ts` (presentación de la colección demo) y la **ficha Base**
  (presentación genérica, se hereda para todos). Único roce con el MOTOR:
  `lib/emails.ts` y `lib/format.ts` reciben extensiones `.ts` explícitas en sus
  imports para que el seed corriendo con `node` los resuelva — **cambio de
  especificador, cero lógica**. No se bifurcó nada.
- **Verificado**: `pnpm check` en verde (**144 tests**, 0 errores, build OK).
  `pnpm db:reset` + `/api/demo/reset` idempotente sobre D1 local (8 pedidos, 16
  emails, 21 eventos, 0 `product_id` nulos). Navegador con `wrangler dev` a 1440px
  y 375px: panel (5 estados, tracking, factura, timeline), bandeja de emails,
  ficha con subtítulo/oferta/specs, agotado, categoría vacía y búsqueda vacía.
  Sin dependencias nuevas.
- **Desplegado el 2026-07-22**: Andreu mergeó la rama a `main`; `pnpm deploy` +
  reset disparado en producción. Las fixtures del backoffice ya están en vivo en
  ecom.logic2b.com (verificado: `/api/demo/reset` → ok, tienda 200).

### 9B.3 — Scaffold y checklist de tema (2026-07-22)

Hacer barato repetir 8 veces, sin que el scaffold pueda tocar el motor.

- **`pnpm new:theme <id>`** (`scripts/new-theme.mjs`, sin dependencias): genera
  `src/components/themes/<id>/{Catalog,ProductGrid,Filters,ProductDetail}.astro`,
  `src/collections/<id>.ts`, `seed/collections/<id>.ts` (stub de 3 productos con
  slugs namespaceados por prefijo), `public/images/collections/<id>/.gitkeep` y
  `docs/temas/<id>.md` (ficha de entrega con la serie de coste). **Idempotente**:
  re-ejecutarlo no pisa nada (verificado con doble ejecución).
- **Parches por marcador** (`// new-theme:*`): registra la colección en
  `src/collections/index.ts`, el seed en `seed/collections/index.ts` (agregador
  nuevo) y, **solo si falta**, la entrada del tema en `demo-themes.ts` con los 14
  tokens de Base y `status: 'planned'`. Los marcadores los fija
  `tests/new-theme-scaffold.test.ts` para que un refactor no los borre en silencio.
- **Guardarraíl del propio scaffold**: lista blanca de rutas — se niega a escribir
  fuera del kit de tema (nada de `src/lib/` salvo la línea de registro, ni
  `src/pages/api/`, ni `migrations/`). El test también fija que el guardarraíl siga.
- **Cableado del seed por colección (motor, una vez):** `seed/seed.ts` consume
  `seed/collections/index.ts`; `SeedProduct` gana `image?` opcional y los
  productos de colección resuelven su imagen a
  `/images/collections/<id>/<slug>.webp` (la genérica sigue con placeholders por
  categoría). Una sesión de tema ya no toca `seed.ts` ni los tests del seed.
- **Tests del motor ajustados a colecciones** (una vez, para siempre): el test de
  variantes de imagen ignora las imágenes por-slug de colección, el recuento de
  sentencias suma `collectionSeedProducts`, y la referencia visual solo se exige a
  temas `ready` (un tema recién scaffoldeado nace `planned` sin referencia).
- **`docs/CHECKLIST_TEMA.md`**: checklist real de sesión de tema, derivado de las
  4 hechas — fidelidad de réplica, namespacing de slugs, tokens sin hardcodear,
  gotchas (body de Base, acento claro, `pnpm build` con wrangler dev, reseed), y
  cierre con ficha de coste y parada para OK.
- **Verificado**: scaffold de un tema de prueba (`probeta`) → `pnpm check` en
  verde CON el stub montado (**149 tests**, 0 errores, build OK) → retirado. El
  generador de seed compila con el agregador vacío. Sin dependencias nuevas.

### 9B.4 — Rutas por colección + 4 tiendas con catálogo y fotos (2026-07-22)

**Cada tienda es su URL.** El modelo de cookie desaparece del todo.

- **Rutas nuevas** `/demo/tiendas/[collection]/{,[slug],carrito,checkout,gracias}`
  — colección SIEMPRE del segmento de URL validado contra el registro (404 si no
  existe). `/demo/tienda…` se queda como tienda genérica con la MISMA
  implementación: las 5 páginas se extraen a `src/components/store/*Page.astro`
  compartidas, y las rutas son wrappers finos.
- **Borrado**: `src/lib/active-theme.ts`, la cookie `ecom-demo-theme-id`, el
  widget selector y el script anti-flash de `Shop.astro` (y su test), el registro
  `catalogViews` de la página (vive ahora en `CatalogPage`). Los tokens del tema
  se aplican **en SSR** como estilo inline del wrapper — sin localStorage.
- **Carrito namespaceado por colección** (`ecom-cart:<id>`; la genérica conserva
  su clave histórica). `cart-client` lee la colección del atributo
  `data-store-collection` que pinta el layout. Verificado: añadir en Vector no
  contamina el carrito de la Botiga.
- **Checkout por tienda**: `/api/checkout/session` acepta `collection` opcional,
  validada contra el registro, y construye success/cancel/redirect hacia el
  gracias/carrito de ESA tienda (id desconocido → tienda genérica, nunca URL del
  input).
- **Temas parametrizados por `paths`** (los 14 componentes): ni un
  `/demo/tienda` hardcodeado queda en `src/components/themes/`. Copy de los
  temas pasado a datos de colección (hero de Guide, header de Editorial, hero de
  Launch); estados vacíos genéricos.
- **4 tiendas REALES con identidad, catálogo y fotos** (nombres provisionales,
  Andreu puede vetar): **Forma Interior** (minimal · mobiliario, 8),
  **Módulo Audio** (editorial · audio y objeto, 10), **Cafetal** (guide · café,
  8 — ilustración de línea), **Vector** (launch · patinete + accesorios, 5, con
  specs y oferta en el cargador). Launch reordena la landing por el orden de
  categorías de la colección (la estrella primero) — presentación, no motor.
- **Imaginería**: 31 piezas de producto generadas con Higgsfield en esta sesión
  local (~70 créditos; quedaban 716 al empezar), optimizadas a WebP 800×800 en
  `public/images/collections/<id>/<slug>.webp`. Falta: heroes/editorial y las 4
  tiendas restantes.
- **Verificado**: `pnpm check` en verde (**148 tests**, 0 errores). En navegador:
  las 4 tiendas en su URL con su tema, catálogo, fotos, carrito con quote real y
  namespacing. Sin dependencias nuevas.

### 9B.4b — Conmutador de tiendas, Vector como demo destacada y tema Iris (2026-07-22)

- **Conmutador «Tiendas»** en `Shop.astro`: `<details>` flotante sin JS que
  navega POR URL entre las tiendas del registro (sin cookie — la decisión 6 de
  9B.0 sigue intacta). Vector abre la lista; la genérica va la última como
  «demo completa · panel».
- **Vector es la demo destacada**: el CTA principal de la landing («Entra en la
  tienda demo») apunta a `/demo/tiendas/launch`. La tienda genérica sigue
  siendo la colección por defecto del MOTOR (admin, APIs, recorrido) — solo
  cambia el escaparate de entrada.
- **Tema 09 · Iris importado de `logic2b-norte`** (spec propio «Orven»):
  tienda inmersiva de eyewear con **vídeo escrutado fotograma a fotograma con
  el scroll** (blob + lerp + un seek en vuelo), hero editorial con ficha en
  cristal esmerilado y slider de catálogo con revelado por parallax. Adaptado
  al contrato del kit: 6 productos reales en D1 (colección `iris`, insignia =
  `subtitle`), carrito real (`data-iris-add`, namespaceado), enlaces por
  `paths`, `prefers-reduced-motion`, y assets autoalojados
  (`/images/collections/iris/`, vídeo H.264 2 MB + 6 webp).
- **Motor (una vez):** `ThemeLayout.nav` gana el valor `'immersive'` — el tema
  pinta su propio header y el layout no monta SiteHeader ni footer; el banner
  de demo pasa a `z-30` para que ningún vídeo fijo lo tape. Etiqueta nueva en
  `/estilos`.
- **Verificado en navegador**: scrub del vídeo con el scroll, catálogo con
  productos reales, añadir al carrito (`ecom-cart:iris` aislado), conmutador
  con las 6 tiendas y banner de demo visible. `pnpm check` en verde (148).

### Pendiente en la Fase 9B

- **Pasada de fidelidad fina** de los 4 temas contra su captura (se re-hospedaron
  en 9B.4; quedan detalles de composición por clavar) + fichas de entrega
  (`docs/temas/*.md`) al cerrar cada uno.
- **9B.5** — Resto de imaginería en sesión LOCAL: heroes/editorial de las 4
  tiendas hechas + catálogo y fotos de las 4 restantes.
- **9B.6** — Un tema por sesión, con su catálogo y sus fotos.
- **9B.7** — ✅ (2026-07-24, F11.4) `/estilos` enlaza a las 6 tiendas vivas con
  captura real y CTA por tema; los 4 temas «planned» entrarán solos al
  registrarse su colección (el mapeo tema→tienda se deriva del registro).
- **9B.8** — Reescribir `docs/TEMAS.md` con el contrato nuevo (hoy describe el
  modelo de «una tienda, 8 pieles» y está desfasado).

---

## Fase 9 — Catálogo de estilos (7 temas)

> **Documentación completa: [`docs/TEMAS.md`](TEMAS.md).** Leerlo entero antes de
> desarrollar cualquier tema. Aquí solo va el estado y el orden.

### Qué se hizo el 2026-07-20 (base de la fase)

- **Arquitectura de temas reescrita.** `THEME_VARS` pasa de 4 variables a 14
  (acento + `--color-brand-fg`, tipografía, forma, superficie, ritmo) y cada tema
  añade un descriptor estructural `layout` (rejilla, nav, tarjeta, filtros,
  densidad, anotaciones, footer) y metadatos de venta (`reference`, `bestFor`,
  `status`).
- **Contrato:** un tema = tokens + layout + componentes en
  `src/components/themes/<id>/`. **El backend es UNO para todos.**
- **`/estilos`**: catálogo público con ficha por tema. Indexable, en el sitemap y
  en la nav de la landing.
- **Tests:** contraste WCAG AA acento/texto en los 8 temas, integridad de
  `THEME_VARS`, y guardia de sincronía del script anti-flash de `Shop.astro`.
- **Selector de la tienda** limitado a `readyThemes`: un tema `planned` cambiaría
  tokens pero no estructura, y daría una idea falsa del estilo.

### 2026-07-21 — Tema 06 · Minimal (primer tema con componentes)

Primer tema que redefine **estructura**, no solo tokens. Reproduce la referencia
*propro* (`06-minimal.webp`): nav lateral izquierdo con bullet en el activo y
**CART dentro del sidebar**, rejilla de 2 columnas con imágenes grandes sobre
gris, **sin filetes** (`--border-width: 0`), footer oscuro a sangre y mucho aire.

- **Decisión de arquitectura (fija el patrón para los 7 restantes):** la marca
  (color/tipografía) se sigue aplicando en **cliente** (selector + script
  anti-flash), pero la **estructura se resuelve en SERVIDOR**. El selector
  escribe además una **cookie de presentación** (`ecom-demo-theme-id`); Shop.astro
  (ya SSR) la lee con `src/lib/active-theme.ts` (`resolveActiveTheme`) y monta los
  componentes del tema con **fallback a Base**. Un cambio estructural recarga; los
  tokens cambian en vivo. **No toca D1, precios, envíos, checkout, webhook ni
  emails** — es solo capa de presentación.
- **Componentes** en `src/components/themes/minimal/`: `Header` (sidebar+CART),
  `Footer` (banda oscura `bg-foreground text-background`, sin color hardcodeado),
  `ProductGrid` (2 col, lee `--surface-product`/`--grid-gap`/`--radius-card`) y
  `Filters` (toolbar `Catalog (N) · Ordenar · categorías`; la línea inferior LEE
  `--border-width`). El resto de superficies (ficha, carrito, checkout) caen a
  Base con el chrome del tema; un CSS con scope `[data-store-theme="minimal"]` en
  `global.css` neutraliza los filetes heredados.
- `carrito.astro` y `checkout.astro` pasan a `prerender = false` para resolver el
  tema por cookie como el resto de la tienda.
- **Verificado** con `wrangler dev`: catálogo, ficha, carrito y checkout con el
  tema activo, a 1280px y 375px, y en modo oscuro (tokens semánticos). `pnpm
  check` en verde (108 tests, 0 errores de tipos). Sin dependencias nuevas.

### 2026-07-21 — Tema 01 · Editorial (rejilla suiza irregular)

Segundo tema con componentes. Reproduce la referencia *Teenage Engineering*
(`01-editorial.webp`): **rejilla suiza densa e IRREGULAR**, filete hairline,
anotaciones monoespaciadas y naranja señal (`#d42f08`). Nav `top` → header/footer
caen a **Base** (no se duplican): el carácter vive en el catálogo.

- **Generalización del catálogo por tema (hereda todo el catálogo restante).** El
  catálogo (`src/pages/demo/tienda/index.astro`) bifurcaba con el booleano
  `isMinimal = layout.nav === 'sidebar'`, que dejaba fuera cualquier tema de nav
  superior. Ahora hay un **registro `catalogViews` (id → `Catalog.astro`)**: un
  tema que redefine el catálogo expone UN `Catalog.astro`; los que no están en el
  registro caen a la vista Base. Añadir un tema = un import + una entrada. Minimal
  se migró a `minimal/Catalog.astro` para encajar en el mismo patrón (sin cambios
  de comportamiento).
- **Componentes** en `src/components/themes/editorial/`:
  - `ProductGrid` — rejilla irregular por **composición explícita** (patrón de 8
    celdas con `col/row-span` que tesela 4×4 sin huecos y **preserva el orden** de
    catálogo; NO `grid-auto-flow: dense`). Filete hairline que **lee
    `--border-width`**, imagen sobre `--surface-product`, y el **`+` de la esquina
    = añadir al carrito real** (usa `data-editorial-add` para no colisionar con el
    handler genérico de Base). A 375px cae a 2 columnas uniformes.
  - `Filters` — filtros en **chips** (rectángulos hairline, activa en naranja),
    contra los mismos `categoria`/`orden`/`q` de la tienda Base.
  - `CatalogHeader` — **numeración de sección** (`Tienda⁽⁰¹⁾`), palabras sueltas
    flotando y tira mono del recorrido de la demo.
  - `Catalog` — orquesta los tres + texto vertical rotado en naranja como textura
    (`aria-hidden`, un solo eje, moderado — nota de `docs/TEMAS.md`).
- Ficha/carrito/checkout caen a Base y **heredan los tokens** (acento naranja,
  radio de botón, mono) por CSS vars, como en Minimal.
- **Verificado** con `wrangler dev` (catálogo, ficha, carrito, checkout) a 1280px
  y 375px y en modo oscuro (`.dark`; tokens semánticos). `pnpm check` en verde
  (108 tests, 0 errores). Sin dependencias nuevas. `status` a `'ready'` → entra en
  el selector de la tienda y en `/estilos`.

### 2026-07-21 — Tema 07 · Launch (landing de lanzamiento)

Tercer tema con componentes. Reproduce la referencia *P1* (`07-launch.webp`):
planteamiento de **landing de lanzamiento**, titulares muy grandes de peso
ligero (`--weight-display: 400`), acento verde, tarjetas hairline y footer
claro. Nav `top` → header/footer caen a Base, como Editorial.

- **El "encaja mal con 60 productos" de la ficha se resuelve por composición**,
  sin datos nuevos: en la vista prístina del catálogo (sin categoría, búsqueda
  ni orden) se montan las bandas de landing — hero con titular + fila de
  LANZAMIENTO con scroll horizontal (los 4 primeros productos del orden de
  catálogo, imágenes cortadas en los bordes, `overflow-x` + `scroll-snap`
  accesible por teclado, sin JS) — y el resto va en rejilla normal de 3. Con
  filtros/búsqueda activos: catálogo funcional directo, sin bandas.
- **Barra sticky inferior con ESTADO REAL DE STOCK desde D1** (la gracia
  comercial): miniatura + punto verde + `Disponible · N en stock · precio` del
  primer producto con stock del listado, y CTA a la ficha. `position: sticky;
  bottom: 0` como último elemento del catálogo (acompaña el scroll y atraca
  antes del footer, sin JS). `pl-28` despeja el widget «Tema» (fixed
  bottom-left) hasta que el margen del contenedor lo deja fuera (≥1450px).
- **Banda "Safety & Security" traducida al negocio real**: dos tarjetas
  hairline (Envío / Garantías) cuyo contenido sale de `shop.config.ts` (zonas y
  tarifas del seed, notas legales) — nada inventado. Con el detalle de la
  referencia: filetes de la lista SOLO en la columna derecha.
- **Componentes** en `src/components/themes/launch/`: `Catalog` (orquestador +
  entrada en el registro `catalogViews`), `FeatureScroller`, `Filters` (chips
  verdes), `ProductGrid` (3 col hairline, `data-launch-add`) y `StickyBar`.
- **Gotcha de modo oscuro documentado al verificar**: el `<body>` de Base.astro
  aún lleva `bg-white text-gray-900` fijos (compat pre-Logic2B UI), así que un
  titular sin clase de color hereda gris oscuro también en `.dark`. Convención
  para temas: color explícito semántico (`text-foreground`) en todo texto y
  superficie propia dark-aware (el wrapper del catálogo lleva `bg-background`).
- **Verificado** con `wrangler dev` (catálogo prístino y filtrado, ficha,
  carrito, checkout) a 1280px y 375px y en modo oscuro (`.dark` forzada).
  `pnpm check` en verde (108 tests, 0 errores). Sin dependencias nuevas.
  `status` a `'ready'` → 4 temas en el selector.

### 2026-07-21 — Tema 04 · Guide (editorial amable, primer acento claro)

Cuarto tema con componentes. Reproduce la referencia *Pour over*
(`04-guide.webp`): **editorial AMABLE**. Fondo de página gris claro y TODO en
tarjetas muy redondeadas (`--radius-card: 1rem`, `card: 'elevated'`,
`density: 'airy'`, 4 columnas). Nav `top` → header/footer caen a Base.

- **Primer tema que valida el acento CLARO.** Amarillo `#f5c518` con
  `--color-brand-fg: #1a1a1a` — el token existe precisamente por este tema.
  Nunca blanco sobre el amarillo.
- **Hallazgo de accesibilidad (aplica a cualquier tema de acento claro):** el
  par relleno acento/texto pasa AA (es lo que mide el test), pero Base usa
  además el acento como **color de TEXTO** (`.text-brand`: categoría de la
  ficha, enlaces de `/demo/gracias`…). Amarillo sobre blanco es ~1,7:1:
  ilegible. Se resuelve con una regla con scope `[data-store-theme='guide']` en
  `global.css` que pasa ese texto a tinta; el subrayado conserva la afordancia
  del enlace y las superficies rellenas no se tocan. **Va SIN capa a
  propósito**: dentro de `@layer base` perdería contra la capa de utilidades de
  Tailwind, que es la que pinta `.text-brand`. Street (verde neón) necesitará lo
  mismo.
- **Componentes** en `src/components/themes/guide/`: `Catalog` (orquestador +
  entrada en el registro `catalogViews`), `Hero` (tarjeta grande con el **vacío
  central deliberado**, sin rellenar), `Filters` (la nav de categorías como
  **radio buttons en 2 columnas** — enlaces reales con `aria-current` contra
  `?categoria=`, no inputs falsos), `Toolbar` (recuento/búsqueda/orden) y
  `ProductGrid`.
- **Tarjeta de producto**: fila superior con nombre en **mono mayúsculas con
  tracking** + numeración `# 060` en mono (descendente sobre el orden de
  catálogo, como la referencia); centro con aire sobre `--surface-product`; y
  fila inferior con pastilla amarilla **NUEVO** + precio y el botón de compra
  (`data-guide-add`, para no colisionar con el handler genérico de Base).
- **La pastilla NUEVO sale de datos reales, sin tocar el esquema**: las altas
  más recientes por `created_at`, **desempatadas por `id`**. El desempate no es
  cosmético: el seed escribe los 60 productos en la misma transacción y todos
  comparten timestamp, así que sin él la pastilla caía siempre en los primeros
  del orden de catálogo, que no significa nada. Con datos reales de cliente los
  `created_at` sí varían y manda el primer criterio.
- **Compromiso de recursos pendiente (decisión consciente):** la referencia usa
  **ilustración de línea** en lugar de fotografía, y es lo que más define el
  tema. La demo monta la estructura completa con las **fotos reales** sobre
  `--surface-product`. La ilustración de línea queda como **asset por cliente**,
  ya presupuestado así en `/estilos` — no se ha generado un sistema de
  ilustraciones sin consultarlo.
- **Verificado** con `wrangler dev` (catálogo prístino, filtrado por categoría +
  orden, búsqueda sin resultados, ficha, carrito con cálculo de portes real y
  checkout) a 1440px y 375px y en modo oscuro (`.dark` forzada; el gotcha del
  `<body>` se evita con color semántico explícito y `bg-muted` en el wrapper).
  `pnpm check` en verde (108 tests, 0 errores). Sin dependencias nuevas.
  `status` a `'ready'` → 5 temas en el selector.

### Estado de los temas

| # | Tema | Referencia | Estado |
|---|------|-----------|--------|
| — | Base | — | ✅ listo |
| 01 | Editorial | Teenage Engineering | ✅ listo (2026-07-21) |
| 02 | Industrial | TAGARNO | ✅ **METRIA** (2026-07-25) |
| 03 | Natural | All Natural / AFF | ⬜ pendiente |
| 04 | Guide | Pour over | ✅ listo (2026-07-21) |
| 05 | Specs | ACF-01 | ⬜ pendiente |
| 06 | Minimal | propro | ✅ listo (2026-07-21) |
| 07 | Launch | P1 | ✅ listo (2026-07-21) |

### Orden sugerido de desarrollo

Ordenado por **riesgo creciente**, para que los primeros temas validen la
arquitectura antes de meterse en los que tocan datos:

1. **Minimal** — el más lejano a Base estructuralmente (nav lateral, 2 columnas,
   sin filetes) pero **sin necesidades de datos nuevas**. Es la mejor prueba de
   que el descriptor `layout` aguanta.
2. **Editorial** — valida densidad compacta y anotaciones.
3. **Launch** — valida composición de landing y estado de stock en vivo.
4. **Guide** — valida acento claro (`--color-brand-fg` en tinta) y pide
   ilustración de línea: primer compromiso serio de recursos.
5. **Industrial** — primer tema que quiere un campo nuevo (subtítulo técnico).
6. **Natural** — quiere precio de oferta (`compare_at_price`).
7. **Specs** — el que más datos nuevos pide (filas de especificación).

### Bloqueantes conocidos

- ⚠️ **Capturas de referencia sin subir.** `public/images/referencias/` está vacía
  (los ficheros se aportaron por chat). `/estilos` pinta «Referencia pendiente» en
  su lugar. Nombres exactos esperados en el README de esa carpeta.
- ✅ **RESUELTO** — *Tres temas piden datos que el modelo no tiene* (Industrial,
  Natural, Specs). La migración 0002 dejó puestas las tres capacidades
  (`subtitle`, `compare_at_price_cents`, `specs_json`), así que ya no hay
  migración por delante: Industrial consumió `subtitle` el 2026-07-25 sin tocar
  el esquema, y a Natural y Specs les esperan las otras dos.
- ⚠️ **Deriva de componentes.** 8 temas × 6 componentes = 48 ficheros si se
  implementa todo. Industrial cerró con 4 (y borró su `ProductDetail` stub: la
  ficha de Base + tokens bastaba). Mitigación: herencia de Base, implementar solo lo que el tema
  redefine de verdad. Revisar en cada sesión.

---

## Fase 10 — Documentación para el cliente

> **Qué es:** el material que lee un **comercio**, no un desarrollador. Se divide
> en dos momentos con públicos distintos: quien todavía **no ha contratado**
> (venta) y quien **ya tiene la tienda** (operación).
>
> **Qué no es:** documentación técnica. `README.md`, `docs/PRODUCCION.md` y
> `docs/TEMAS.md` ya cubren eso y siguen siendo para nosotros.

### Principio rector

El cliente objetivo es un comercio pequeño de 50–100 productos, sin equipo
técnico. **Si un documento necesita que expliquemos qué es un webhook, está mal
escrito.** El listón: que el dueño de la tienda pueda operar sin llamarnos, y que
un cliente potencial entienda qué compra sin que le traduzcamos nada.

### 10.1 · Antes de contratar (material de venta)

| Pieza | Formato | Estado | Contenido |
|---|---|---|---|
| **Dossier de servicio** | `/dossier` (existe) | 🟡 revisar | Ya existe. Falta: actualizarlo al nombre LogicEcom y enlazar el catálogo de estilos |
| **Catálogo de estilos** | `/estilos` (existe) | ✅ hecho | Las 7 direcciones visuales con su ficha |
| **Guía «cómo elegir tu estilo»** | Sección en `/estilos` | ⬜ | Árbol de decisión corto: nº de productos, si el producto entra por la foto o por los datos, sector. Convierte 7 opciones en 1-2 recomendadas |
| **Comparativa honesta** | Sección en `/` (existe parcial) | 🟡 | Ya hay tabla vs Shopify/Woo. Falta la parte incómoda: **cuándo NO somos la opción** (necesitas multiidioma, +500 SKUs, marketplace, suscripciones) |
| **Qué necesitamos de ti** | `/dossier` | ⬜ | Checklist previa: fotos, textos, logo, datos fiscales, cuenta de Stripe, dominio. Es la causa nº 1 de que un proyecto se alargue |
| **Precio y qué incluye** | `/` (existe) | 🟡 | Revisar que separe con claridad setup vs mantenimiento vs lo que paga a terceros (Stripe, dominio) |

### 10.2 · Después de contratar (material de operación)

| Pieza | Formato | Estado | Contenido |
|---|---|---|---|
| **Manual de 1 página** | `docs/CLIENTE.md` (existe) | 🟡 revisar | Los 3 pasos: llega el pedido → exportas a Packlink → marcas enviado con tracking. **Mantenerlo en 1 página; si crece, es que algo del producto no es obvio** |
| **Guía de producto** | Nuevo | ⬜ | Cómo dar de alta un producto que venda: foto (formato, fondo, peso), nombre, descripción, precio, stock. Con ejemplos buenos y malos |
| **Guía de envíos** | Nuevo | ⬜ | Cómo configurar zonas, tarifas y umbral de envío gratis. Qué implica cambiarlas |
| **Qué hacer cuando…** | Nuevo | ⬜ | Runbook de incidencias reales del comercio: un pedido no llega, el cliente quiere devolver, un pago queda pendiente, me equivoqué de tracking, hay que cancelar. **La pieza que más llamadas ahorra** |
| **Vídeo de 3 minutos** | Externo | ⬜ | Recorrido por el panel. Para muchos comercios sustituye a todo lo anterior |
| **Qué NO puedes romper** | Nuevo | ⬜ | Límites claros: qué puede tocar el cliente sin miedo y qué nos tiene que pedir |

### 10.3 · Entrega y traspaso

| Pieza | Formato | Estado | Contenido |
|---|---|---|---|
| **Acta de entrega** | Plantilla | ⬜ | Qué se entrega: repo, dominio, accesos Cloudflare/Stripe, documentación. Firmado, cierra el proyecto |
| **Inventario de accesos** | Plantilla | ⬜ | Dónde vive cada cosa y a nombre de quién. **Las cuentas de Stripe y dominio van a nombre del cliente, no nuestro** — evita el secuestro de infraestructura y es argumento de venta |
| **Qué pasa si nos vamos** | Sección en dossier | ⬜ | El código es suyo, la infraestructura está a su nombre, cualquier desarrollador puede continuar. Es de las objeciones más frecuentes al «a medida» |

### Decisiones pendientes de esta fase

- **¿Dónde vive la documentación de operación?** Opciones: (a) Markdown en el
  repo del cliente, (b) página `/ayuda` con `noindex` en su propia tienda,
  (c) PDF entregado. La (b) tiene la ventaja de estar donde el cliente ya mira.
- **¿Se traduce al valenciano?** El público objetivo es Castellón. Puede ser
  diferenciador, pero duplica el mantenimiento.
- **¿Documentación por estilo?** Si un cliente elige *Specs*, su manual habla de
  fichas técnicas. ¿Se generan variantes o se mantiene uno genérico?

---

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

- 2026-07-23: **Equipo de 7 roles documentado** en `.claude/skills/equipo/` (arquitecto, fullstack, backend, product, frontend, ux-ui, seo) y mandato permanente en `CLAUDE.md` §16: toda tarea sustantiva aplica los roles afectados y cierra con sign-off del consejo. Pedido por Andreu antes de arrancar la Fase 11.

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
  - **Segundo hallazgo en la misma revisión**: el mismo nombre de cliente que teclea cualquier comprador en el checkout (sin restricción de HTML en el schema zod) se interpolaba sin escapar en el HTML de los tres emails transaccionales (`src/lib/emails.ts`) — incluido el aviso interno **al propio comercio** que sí sale de verdad por Resend en un despliegue real (en la demo el visor `/demo/admin/emails` ya iba en un iframe `sandbox=""` sin permisos, así que ahí el impacto era solo visual). Añadido `escapeHtml()` a `src/lib/format.ts` y aplicado a nombre, nº de pedido, líneas de producto, transportista/tracking y email en los tres emails (los asuntos, en texto plano, se dejan sin escapar a propósito). Tests nuevos en `format.test.ts` y una regresión en `webhook.test.ts` con un nombre malicioso. `pnpm check` (67 tests) y `pnpm test:e2e` (19 pasos) en verde.
  - **Tercer hallazgo, misma familia**: inyección de fórmulas en el CSV de envíos (`GET /api/admin/orders/export.csv`). El mismo nombre de cliente sin restricción llega también a esa exportación, que `docs/CLIENTE.md` pide abrir en Excel/Sheets para importar a Packlink/SendCloud — un nombre que empiece por `=`, `+`, `-` o `@` se interpreta como fórmula al abrirlo (ej. `=cmd|'/c calc'!A1`). Verificado explotable en vivo (pedido real vía checkout con ese nombre → CSV con la fórmula cruda) y neutralizado tras el arreglo (antepone un apóstrofe, fuerza texto literal). `csvField` extraída a `src/lib/csv.ts` (antes vivía inline en la ruta) con `tests/csv.test.ts` nuevo. `pnpm check` (70 tests) y `pnpm test:e2e` (19 pasos) en verde.

- 2026-07-19 (Fase 8, sesión cloud — novena tanda: auditoría propia con delegación explícita de Andreu para decidir, cerrar y **mergear directamente a `main`** en esta sesión):
  - **Race de idempotencia real en `applyPaidMutation`**: el pedido se leía como `pending` en una consulta separada, y solo el `UPDATE` final llevaba la guarda `WHERE status = 'pending'` — pero iba dentro de la misma `batch` que el decremento de stock y los emails, que se ejecutan siempre pase lo que pase. Dos entregas concurrentes del mismo evento de Stripe (reintento solapado, o webhook + confirmación simulada corriendo a la vez) podían construir ambas la mutación a partir de la misma foto `pending` y aplicar el decremento de stock y los dos emails **por duplicado**, aunque el estado del pedido solo cambiara una vez. Arreglo: `applyPaidMutation` ahora ejecuta el `UPDATE` guardado **primero y en solitario**, comprueba `meta.changes` (el recuento de filas afectadas de D1) y solo si es `1` aplica el resto en una `batch`; devuelve `boolean` y los dos llamantes (webhook y checkout simulado) solo entregan el email si devuelve `true`. Regresión con un doble de D1 mínimo hecho a mano en `tests/orders.test.ts` (no hay wrangler/D1 real en unit tests): dos mutaciones construidas desde el mismo pedido `pending` → la segunda ve `changes = 0` y no re-decrementa ni duplica emails.
  - **PII enumerable en `/demo/gracias`**: en pago simulado (el modo activo hoy en `ecom.logic2b.com`, sin claves de Stripe) el `session_id` de búsqueda era `sim_${orderNumber}`, y el nº de pedido solo tiene 4 caracteres aleatorios de un alfabeto de 32 (~20 bits) más la fecha en claro — enumerable con del orden de un millón de peticiones por día, sin ningún rate limit en esa ruta (a diferencia de `/api/cart/quote` y `/api/checkout/session`). Cualquiera podía guionizar la búsqueda y extraer nombre, email y total de pedidos reales de la demo pública. Arreglo: nuevo `generateSimulatedSessionToken()` (24 caracteres aleatorios, alfabeto alfanumérico, ~124 bits) independiente del nº de pedido — este último sigue siendo corto y legible a propósito (es lo que ve el comercio y lo que va en Packlink), pero ya no sirve como clave de búsqueda pública. Un `session_id` real de Stripe no tenía este problema (trae su propia entropía alta); el hueco era solo del modo simulado.
  - **Cancelar un pedido pagado no devolvía el stock, y el panel no tenía botón para hacerlo**: `docs/CLIENTE.md` («¿Cómo devuelvo un pago?») le dice al comercio que reembolse en Stripe y luego «cancela el pedido en tu panel», pero (1) la API sí permitía `paid → cancelled` mas nunca tocaba `products.stock` (que el webhook había decrementado al cobrar), y (2) ni la ficha de pedido ni el listado tenían ningún control para llegar a ese estado — solo existía "marcar enviado"/"marcar entregado". Resultado real: un producto vendido y cancelado quedaba con menos stock del que debería, para siempre. Arreglo: `decideTransition` (`src/lib/order-transitions.ts`) añade un flag `restoreStock` (true solo en `paid → cancelled`, ya que `pending → cancelled` nunca decrementó nada), el endpoint `PATCH /api/admin/orders/:id` suma `qty` de vuelta al stock de cada línea cuando aplica, y la ficha de pedido (`/demo/admin/pedidos/[id]`) añade un botón «Cancelar y devolver stock» (con confirmación) visible solo en pedidos `paid`. Verificado en runtime (`wrangler dev` + curl): stock 25 → 24 al pagar → 25 al cancelar; doble cancelación rechazada con 422 por `decideTransition` (no hay mutación que aplicar dos veces).
  - **Dos hallazgos menores, arreglados por consistencia**: (a) `quoteCart` sumaba cantidades de líneas duplicadas del mismo slug sin volver a comprobar el tope de 99 uds tras la suma — una petición fabricada a mano con el mismo slug repetido podía acumular muy por encima de 99 para un producto (el stock real seguía limitando el daño, pero el tope de cordura quedaba sin efecto); ahora `aggregateLineQuantities` (nueva, exportada y testeada) topa la suma igual que ya hace `cart-client.ts` en el navegador. (b) Escribir una cantidad no entera (p. ej. `2.5`) en el selector de la ficha o del carrito se guardaba tal cual en `localStorage` y `readCart()` la descartaba en silencio — el botón decía «Añadido ✓» pero el artículo nunca llegaba al carrito; ahora ambos sitios redondean hacia abajo antes de guardar (`step="1"` añadido también a los inputs).
  - **Clonabilidad**: el prefijo `BM` del nº de pedido (`generateOrderNumber`) estaba hardcodeado en `src/lib/orders.ts` pese a que CLAUDE.md §2/§11 exige que todo lo específico de una tienda viva en `shop.config.ts` — un cliente clonado habría visto `BM-…` en todos sus pedidos y emails sin que nada en `docs/PRODUCCION.md` lo avisara. Ahora es `shopConfig.orderNumberPrefix` (por defecto `BM`, el de la demo); `PRODUCCION.md` §1 lo menciona en el checklist.
  - `pnpm check` (78 tests) y `pnpm test:e2e` (19 pasos) en verde; verificación manual adicional en runtime del flujo de cancelación/restock y del rate limit del reset.
  - **Nuevo, con el mismo criterio de «no dejar la demo pública sin freno»**: `POST /api/demo/reset` no tenía rate limit (a diferencia de quote/checkout) pese a ser destructivo (borra pedidos, emails y catálogo de todos los visitantes) y no requerir autenticación por diseño (es un botón público de la demo) — añadido al mismo middleware con un tope bajo (3/min por IP). Verificado: 4ª petición en el mismo minuto → 429.
  - **Delegación de Andreu para esta sesión**: a diferencia de las tandas anteriores (que abrían PR y esperaban revisión), esta se mergeó directamente a `main` por instrucción explícita.

- 2026-07-19 (Fase 8, sesión cloud — décima tanda: segunda pasada de auditoría sobre lo que la novena no había mirado en profundidad — admin de productos/envíos, mismo criterio de mergear directo a `main`):
  - **La misma clase de race que se acababa de arreglar en el webhook seguía viva en `PATCH /api/admin/orders/:id`**: leía `order.status` en un `SELECT` aparte y hacía el `UPDATE orders SET status = ?` sin ningún `WHERE status = ?` de guarda ni comprobación de filas afectadas. Dos clics casi simultáneos sobre «Cancelar y devolver stock» o «Marcar enviado» (doble clic, o un reintento del navegador con conexión lenta) podían restockear el mismo pedido dos veces o mandar dos emails de aviso de envío duplicados al cliente. Arreglo: el mismo patrón que `applyPaidMutation` — el `UPDATE` va guardado por el `status` leído (`WHERE id = ? AND status = ?`) y se ejecuta en solitario primero; si `meta.changes` da `0` (alguien ya lo cambió), responde `409` en vez de seguir con el resto de la mutación. Verificado en runtime: 5 `PATCH` a `/cancelled` disparados a la vez sobre el mismo pedido pagado → solo uno con `200`, el resto `422`/`409`, y el stock queda exactamente en +1 (nunca +5). Los tres botones del detalle de pedido (cancelar/enviar/entregar) también se deshabilitan mientras la petición está en vuelo, como refuerzo en la UI.
  - **Vaciar un campo de precio/stock en el admin lo guardaba como 0 sin avisar**: `Number('') === 0` en JS, así que seleccionar-todo-y-borrar en una celda de precio o stock de `productos.astro`/`envios.astro` y hacer clic fuera pasaba la validación (`0 ≥ 0`) y disparaba el `PATCH` — un producto quedaba gratis o una tarifa de envío a coste cero sin ninguna confirmación, solo el «Guardado ✓» genérico. Arreglo: un valor vacío se trata como inválido (no como `0`) en ambas páginas. Verificado con un script Playwright headless contra `wrangler dev`: vaciar el precio → «Precio inválido», el input recupera el valor original.
  - **Las ediciones inline rechazadas por el servidor dejaban el input con el valor incorrecto indefinidamente**: si el servidor rechazaba un nombre/precio/stock (p. ej. nombre de 1 carácter, por debajo del `min(2)` de zod), el mensaje de error aparecía pero el campo seguía mostrando el valor nunca guardado — sin recargar la página no había forma de saber que no se había aplicado. Ahora `productos.astro`/`envios.astro` recuerdan el último valor guardado con éxito (`input.defaultValue`/`defaultChecked`) y revierten a él tanto en el rechazo cliente (vacío, formato) como en el servidor (`400`/`404`).
  - **`/demo/admin/login` era el único POST público sin rate limit**: la misma tanda anterior había añadido el límite a quote/checkout/reset pero no tocó el login — con la contraseña pública de la demo el impacto ahí es bajo, pero el código es el mismo que correría en una tienda real con `DEMO_MODE` activo. Añadido al mismo límite de aplicación (10/min por IP); como es una página de formulario y no una API, el middleware redirige a `?limited=1` en vez de servir JSON crudo, y el login muestra un aviso legible («Demasiados intentos seguidos…»). Verificado: a partir del intento 11 en la misma ventana, redirección con el aviso.
  - **Bandeja de emails sin indicación de corte**: `SELECT ... LIMIT 100` sin paginación ni aviso — pasado ese número de emails (unos 33 pedidos), los más antiguos desaparecían del panel sin ninguna señal de que faltaban. Añadido un aviso («Mostrando los 100 más recientes de N») que solo aparece cuando el total supera el límite.
  - `pnpm check` (78 tests) y `pnpm test:e2e` (19 pasos) en verde; verificación adicional en runtime de la carrera concurrente, el rate limit del login y el guard de campo vacío (Playwright headless).

- 2026-07-19 (Fase 8, sesión cloud — duodécima tanda: tercera auditoría propia con tres agentes en paralelo (correctness/seguridad, diseño/mobile, docs/contenido), delegación explícita de Andreu para decidir, cerrar y mergear directo a `main`):
  - **Pedidos del admin sin aviso de corte a 200**: la misma clase de bug ya arreglada en la bandeja de emails (`LIMIT 100` sin indicación) seguía viva en `/demo/admin` (`LIMIT 200`) — las pastillas de filtro por estado muestran el recuento real (consulta `GROUP BY` sin límite) mientras la tabla de abajo silenciosamente enseña solo los 200 pedidos más recientes de ese estado, sin ninguna señal de que faltan los más antiguos. Añadido el mismo aviso ámbar que ya lleva la bandeja de emails («Mostrando los 200 más recientes de N»).
  - **Cabeceras sin `flex-wrap` en `/demo/admin` (pedidos), `/demo/admin/envios` y el detalle de pedido**: título + botones de acción (`Copia de seguridad`, `Exportar CSV para Packlink/SendCloud`) en una fila `justify-between` sin `flex-wrap` — el mismo patrón de overflow a 375px que el sexto/séptimo arreglo ya había corregido en `Admin.astro` y en la cabecera general, pero que no se había tocado en estas cabeceras de página. Arreglado con `flex-wrap` + `gap-2` en los tres sitios; verificado sin overflow horizontal a 375px con Playwright.
  - **Leftover «Portes según zona.»**: la unificación de terminología de la undécima tanda tocó las plantillas pero no `shop.config.ts#legal.shippingNote`, que sigue apareciendo tal cual en la ficha de producto y en el footer de toda `/demo/*`. Cambiado a «Coste según zona.».
  - **Input de cantidad del carrito sin el token de tema**: usaba `rounded` a secas en vez de `rounded-btn` (que sí usa el mismo control en la ficha de producto) — con un tema no-default era el único control de cantidad que no seguía el radio elegido, justo lo contrario del argumento de venta del selector de temas. Arreglado.
  - **Contraste insuficiente en el botón «Eliminar» del carrito**: `text-stone-400` (~2.5:1 sobre blanco) en un control interactivo de solo icono, por debajo del 3:1 de WCAG AA (SC 1.4.11). Oscurecido a `stone-500`.
  - **H1 del catálogo en valenciano** («Productes de la terra») en un sitio por lo demás enteramente en castellano (CLAUDE.md §14 exige UI en español) — corregido a «Productos de la tierra».
  - **`docs/PRODUCCION.md`**: añadida al checklist §2 la retirada de los widgets pensados como pieza de venta de la demo (selector de temas + franja/tarjeta «Recorrido de la demo»), que no estaban mencionados y un cliente real los heredaría sin darse cuenta; corregida la misma terminología «portes» → «envío» en el smoke test de §7.
  - `pnpm check` (78 tests, 0 errores/hints) y `pnpm test:e2e` (19 pasos) en verde; verificación visual con Playwright headless a 375px de las tres cabeceras de admin corregidas y de los controles del carrito.
  - Auditoría de correctness/seguridad sin más hallazgos nuevos tras once tandas previas (idempotencia, escapado, rate limiting, auth, aritmética de precios/envíos, todo revisado de nuevo sin regresiones).

- 2026-07-19 (Fase 8, sesión cloud — decimotercera tanda: dos auditorías más en paralelo, cobertura de tests y coherencia spec-vs-implementación, misma delegación para decidir y mergear directo a `main`):
  - **Misma race de idempotencia que ya se había corregido dos veces (webhook de pago, PATCH de admin) seguía viva en `checkout.session.expired`**: el handler leía `order.status` aparte y metía el `UPDATE ... WHERE status='pending'` en la misma `batch` que un `INSERT INTO order_events` incondicional. Dos entregas solapadas del mismo evento de expiración (reintento de Stripe + una redelivery manual, por ejemplo) podían dejar dos filas de evento «Sesión de pago caducada» aunque el pedido solo cambiara de estado una vez — sin impacto en stock/dinero (nunca se decrementó nada en `pending`), pero sí un registro de auditoría duplicado. Extraído a `applyExpiredMutation` en `src/lib/orders.ts` (mismo patrón que `applyPaidMutation`: el `UPDATE` guardado va primero y en solitario, y el evento solo se inserta si `meta.changes === 1`), con 3 tests nuevos en `tests/orders.test.ts` que reproducen la carrera con un `FakeD1`.
  - **Divisa hardcodeada a `'EUR'` en cuatro sitios pese a existir `shop.config.ts#currency`**: `formatEurCents` (usado en todo el sitio), los dos formateadores duplicados en los `&lt;script&gt;` de `carrito.astro`/`checkout.astro`, y el `priceCurrency` del JSON-LD `Offer` de la ficha de producto. CLAUDE.md §11 promete que la divisa se centraliza en `shop.config.ts`; en la práctica, clonar el kit para un cliente fuera de la eurozona habría cambiado lo que cobra Stripe pero dejado toda la UI y el schema SEO diciendo EUR. `formatEurCents` ahora deriva `currency` de `shopConfig.currency`; los dos scripts del carrito/checkout importan el helper en vez de duplicarlo (elimina también la duplicación); el JSON-LD usa `shopConfig.currency.toUpperCase()`. 2 tests nuevos en `tests/format.test.ts`.
  - **Huecos de cobertura de test señalados por la auditoría, cerrados**: `quoteCart` (la pieza central de «nunca confíes en el precio del cliente») no tenía ningún test propio más allá de su helper interno — 6 tests nuevos con un `FakeD1` cubriendo slug inexistente, stock 0, stock insuficiente, el límite exacto stock=qty, y CP con zona pero sin tarifa activa (envío/total deben quedar `null` aunque el pedido sea servible). El fix de idempotencia del PATCH de admin (novena/décima tanda) se había mergeado sin test de regresión — añadido `tests/admin-orders-patch.test.ts` (3 tests, incluida la carrera con dos `PATCH` concurrentes vía `Promise.all`, igual que ya se hacía para el webhook). `orderShippedEmail` (transportista/tracking, editables por el comercio) no tenía test de escapado a diferencia de sus dos hermanos — `tests/emails.test.ts` nuevo.
  - **Comprobación spec-vs-implementación** (CLAUDE.md §4-§11 contra el código real): sin drift en el modelo de datos, el catálogo semilla, ni el resto de la API — el único hueco real era la divisa (ya arreglado arriba). La ausencia de un `GET /api/admin/orders[/:id]` como endpoint JSON (el panel lee D1 directamente desde el frontmatter de Astro) se deja tal cual: añadir una API sin ningún consumidor sería alcance no pedido (CLAUDE.md §14).
  - **Resto de huecos de cobertura medios, cerrados en la misma tanda**: el escapado del LIKE de búsqueda (`src/lib/db.ts`) solo estaba verificado a mano — extraído a `escapeLikePattern()` con 3 tests (`tests/db.test.ts`). `PATCH /api/admin/products/:id` no tenía ninguna cobertura — 5 pasos nuevos en `scripts/e2e.mjs` (patch vacío → 400, precio negativo → 400, id inexistente → 404, stock a 0 → 200 y reflejado en la siguiente quote). El rate limit del login (10/min, arreglado en la décima tanda) tampoco estaba en el E2E — 2 pasos nuevos que agotan la ventana y confirman el `?limited=1`. E2E pasa de 19 a 27 pasos; recuentos de tests actualizados en README/PRODUCCION.md/PROMPT_CLOUD.md (94→97).
  - `pnpm check` (97 tests, 0 errores/hints) y `pnpm test:e2e` (27 pasos) en verde; verificación manual de que el precio y el `priceCurrency` siguen mostrando EUR correctamente tras centralizar la divisa.

- 2026-07-20 (Fase 8, sesión cloud — decimocuarta tanda: tres auditorías en paralelo (correctness/seguridad, diseño/mobile/a11y, docs/contenido/spec), delegación explícita de Andreu para aplicar criterio y avanzar; trabajo en la rama `claude/project-progress-377ef4`):
  - **Config de Stripe a medias → cobro real sin cumplimiento (camino de clonado)**: `isSimulatedPayment` decidía el modo mirando **solo** `STRIPE_SECRET_KEY`, pero el webhook exige **ambas** claves (responde 503 sin `STRIPE_WEBHOOK_SECRET`). Un operador que clonara el kit y pusiera la secret key pero aún no el webhook secret (o con typo) haría que el checkout creara una Stripe Checkout Session real y **cobrara con tarjeta**, mientras el webhook devolvía 503 en cada reintento → el pedido quedaba `pending` para siempre, sin decrementar stock ni enviar confirmación: cliente cobrado, comercio sin ver el pedido. Arreglo: el modo real ahora exige las dos claves; falta cualquiera → sigue simulado (no hay cobro real sin webhook que lo cumpla). Test de `payment-mode.test.ts` ampliado con el caso config-a-medias.
  - **Emails transaccionales duplicados bajo concurrencia (solo producción, `DEMO_MODE` off + Resend)**: `deliverPendingEmails` hacía `SELECT ... WHERE sent = 0`, luego `fetch` a Resend y solo después `UPDATE sent = 1`, sin reclamo atómico previo. Dos pedidos pagados casi a la vez → dos `waitUntil(deliverPendingEmails)` → ambas leían los mismos pendientes antes de que ninguna escribiera, y el cliente recibía la confirmación **por duplicado**. Es una race distinta de las de idempotencia de estado ya cerradas (el estado del pedido era correcto; lo que se duplicaba era la entrega externa). Arreglo: reclamo atómico `UPDATE ... SET sent = 1 WHERE id = ? AND sent = 0` **antes** del `fetch`; solo la invocación que ve `changes === 1` envía, y si Resend falla libera el reclamo (`sent = 0`) para reintentar en el próximo disparo — mantiene la semántica de reintento previa sin duplicar. `tests/send-email.test.ts` nuevo con un `FakeD1` que reproduce la carrera (dos entregas a la vez → cada email una sola vez) + liberación en fallo.
  - **El webhook marcaba `paid` sin comprobar `payment_status`**: `checkout.session.completed` pasaba directo a `applyPaidMutation`. `sessions.create` no fija `payment_method_types`, así que con métodos de pago diferido (SEPA, iDEAL async) `completed` puede llegar con `payment_status !== 'paid'` y confirmarse (o fallar) más tarde — el sistema habría cumplido y decrementado stock por un cobro aún sin cerrar. Añadido guard `if (session.payment_status !== 'paid') return 200` antes de mutar (el kit asume cobro inmediato; hoy solo hay tarjeta/simulado, así que es una red de seguridad para clientes reales).
  - **Color de marca = config muerta (misma clase que la divisa de la 13ª tanda)**: `shopConfig.brand.color/colorDark` no lo leía nadie — los valores estaban hardcodeados en `global.css` (`@theme`) y duplicados en el preset `botiga` de `demo-themes.ts`, pese a que CLAUDE.md §11 y `PRODUCCION.md` prometen que el color de marca se edita en `shop.config.ts`. Un cliente clonado que cambiara `brand.color` y re-sembrara **no vería ningún cambio**. Cableado: `Base.astro` inyecta `html:root{--color-brand:…}` desde `shopConfig.brand` (CSS, no JS → la landing sigue cero-JS; `html:root` gana en especificidad al `:root` del `@theme`, que queda como fallback); el preset `botiga` toma el color de `shopConfig` (no puede desincronizarse) y su test compara contra `shopConfig.brand`. Verificado en runtime: la landing y el CTA renderizan el verde inyectado; cambiar `shop.config.ts` propaga a todas las utilidades `*-brand`.
  - **Diseño/a11y (tienda demo)**: la etiqueta de zona de envío del carrito (`text-stone-400` ≈ 2.4:1 sobre `bg-cream`) y el texto «Calculando precios…» quedaron por debajo de WCAG 1.4.3 y desincronizados de checkout (que ya usaba `stone-500`) → subidos a `stone-500`. Los `<input>` de `/demo/checkout` usaban `rounded-xl` fijo mientras el resto de controles de la tienda usan `rounded-btn` (token del tema) — con un tema no-pill (Celler/Atlàntic) eran los únicos que no seguían el radio elegido; unificados a `rounded-btn`. El botón «✕» de eliminar del carrito tenía área táctil < 24px (WCAG 2.5.8) → `-m-2 p-2` para agrandarla sin mover el layout.
  - **Docs/clonabilidad**: la description del catálogo demo hardcodeaba «La Botiga del Maestrat» → ahora `shopConfig.name`. `docs/CLIENTE.md` entregaba al comercio real una URL con `/demo/admin` → reformulado a «la dirección que te hemos dado (algo como `tutienda.com/admin`)». Comentarios de `shop.config.ts` y `global.css` corregidos para reflejar que el color de marca es fuente única (ya no dicen que «alimenta» tokens que no leía nadie).
  - **Descartado por criterio**: (a) la asimetría decremento/reposición de stock (el `MAX(stock-qty,0)` clampa a 0 pero la reposición al cancelar suma `qty` a ciegas → inventario fantasma si dos checkouts del último bote se pagan a la vez y luego se cancelan ambos) cae dentro de la «ventana de sobreventa aceptada en v1» documentada el 2026-07-17 y su arreglo correcto exige registrar la cantidad realmente descontada — se deja anotado como limitación conocida. (b) Ediciones a `CLAUDE.md` (dice `hybrid` donde el código usa `static`; lista de categorías de ejemplo sin «quesos») — la spec maestra se deja intacta, el ROADMAP ya registra la desviación de `hybrid→static`.
  - `pnpm check` (**101 tests**, 0 errores/hints) y `pnpm test:e2e` (27 pasos) en verde; verificación visual headless a 375px de la landing (verde de marca inyectado OK) y del HTML servido de carrito/checkout. Recuentos de tests actualizados en README/PRODUCCION.md/PROMPT_CLOUD.md (97→101).

- 2026-07-19 (Fase 8, sesión cloud — undécima tanda: pasada de diseño y contenido, pedida explícitamente por Andreu tras las dos de correctness/seguridad; mismo criterio de mergear directo a `main`):
  - **Diagrama de `/arquitectura` ilegible en móvil**: el SVG del flujo de compra usa un `viewBox` fijo de 640×300 con texto en tamaños absolutos (13px/11px) dentro de un contenedor `w-full` — al encogerse a los ~335px útiles de un móvil, todo el diagrama escala junto con las etiquetas, dejándolas en ~7px. Es la página más orientada a generar confianza técnica y la única pieza que no aguantaba el resto del contrato mobile-first del sitio. Arreglo: el contenedor pasa a `overflow-x-auto` y el SVG lleva `min-w-[520px]`, así el texto nunca se encoge por debajo de lo legible — en móvil se desplaza horizontalmente en vez de encogerse. Verificado con Playwright a 375px: las cuatro cajas se leen con claridad, «Base de datos D1» queda alcanzable con scroll horizontal.
  - **La landing prometía «Vendiendo en 3–4 semanas» sin matiz, mientras el dossier (que reutiliza a propósito los mismos números y claims) sí lo marca como «orientativo»**: un visitante que solo lea la landing indexable ve un plazo de entrega sin condicionar. Sincronizado: la landing añade «(orientativo)» al mismo punto, igual que el dossier.
  - **`/demo/reset` era la única página de la tienda que ignoraba el tema activo del selector**: el resto de `/demo/*` usa `rounded-btn`/`font-display` (tokens del tema); esta página tenía `rounded-full` y `font-bold` hardcodeados. Con un tema no-default (p. ej. esquinas cuadradas o titulares serif) esta era la única pantalla donde «se revertía» a la estética por defecto — justo lo contrario de lo que el selector de temas quiere demostrar. Arreglo: mismos tokens que el resto de la tienda.
  - **Terminología inconsistente «portes» vs «envío»**: el botón del carrito decía «Calcular portes» y una viñeta del dossier «Cálculo de portes por zona…», mientras el resto del sitio (FAQ, checkout, footer legal, `docs/CLIENTE.md`) usa siempre «envío». Unificado a «envío» en ambos sitios.
  - Auditoría independiente confirmó sin hallazgos: enlaces internos de `/`, `/arquitectura` y `/dossier` resuelven todos a páginas reales; `sitemap.xml`/`robots.txt` coherentes entre sí y con el `noindex` real; títulos/descripciones únicos; cifras de precio consistentes entre landing y dossier; sin texto de relleno ni referencias a bugs ya corregidos.
  - `pnpm check` (78 tests) en verde; verificación visual con Playwright headless del arreglo del diagrama a 375px.

## Decisiones pendientes

- Confirmar precios de la landing (1.900 € setup / 29 €/mes) — hoy publicados provisionalmente en la demo en vivo.
- Cuando se quieran pagos reales: añadir claves TEST de Stripe (`wrangler secret put STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`) y configurar el webhook en el dashboard de Stripe apuntando a `https://ecom.logic2b.com/api/webhooks/stripe`.
- Decidir si se ofrece la versión «Lite» (Payment Links) como producto de entrada — ver Fase 8, bloque comercial.

## C14 — restaurar «tiendas distintas, un motor»

### C14.1 — contrato de unificación (2026-08-04)

- `src/lib/storefront-contract.ts` fija por tipos las superficies `product`,
  `cart`, `checkout` y `thanks`, sus partes/slots de presentación y las fuentes
  inmutables: seed→D1, `price_cents`, `cart-client`, quote, checkout y pedido
  por sesión.
- Los cuatro componentes compartidos exponen hooks `data-commerce-*`; la ficha
  admite un slot visual completo sin ceder el handler compartido de carrito.
- `tests/storefront-contract.test.ts` protege rutas, endpoints y selectores. La
  excepción temporal está cerrada a Forma, NODDO, Sitēga y STRETCH con cinco
  señales exactas; una tienda nueva no puede copiar ese patrón sin romper CI.
- `docs/TEMAS.md` y `docs/CHECKLIST_TEMA.md` ya exigen un recorrido funcional y
  una sola fuente D1. La próxima migración es Forma (C14.2).
- Verificado: `pnpm check` (172 tests, tipos y build), E2E de 27 pasos contra
  `wrangler dev` y reset final de la demo local.

### C14.2 — Forma migra verticalmente (2026-08-04)

- Los seis productos Forma viven en `seed/collections/forma.ts`: D1 es la única
  fuente de nombre, precio en céntimos, stock, imagen y especificaciones.
- Catálogo y ficha conservan la dirección editorial mediante la presentación
  del tema, mientras `ProductPage`, `CartPage`, `CheckoutPage` y `ThanksPage`
  mantienen toda la lógica común. Se eliminan `forma-products.ts`,
  `forma-demo-cart`, la aritmética de strings y el checkout ficticio propio.
- La confirmación consulta el pedido por `session_id` y muestra número, total y
  destinatario reales. El contrato reduce la deuda cerrada a NODDO, Sitēga y
  STRETCH.
- Verificado: `pnpm check` (172 tests, tipos y build), E2E completo de 35 pasos
  con compra Forma y decremento de stock, auditor a11y Forma (9 superficies, 0
  errores/avisos) y capturas 1440/375 revisadas sin excesos de peso.

## Cómo retomar una sesión

Protocolo completo en [`docs/CONTINUAR.md`](CONTINUAR.md): cualquier chat que
reciba «continúa con el desarrollo» hace `git fetch`, carga la skill `equipo`,
ejecuta el bloque de «Próxima sesión» de abajo, testea, documenta, actualiza
esta sección y sube a `main`.

## Próxima sesión

### C15.1 — aislamiento seguro de todas las demos — ✅ cerrado 2026-08-04

Decisión directa de Andreu: los escaparates son ejemplos, no tiendas
funcionales. ARCE queda como demo principal; catálogo y precios demo se embeben
desde el seed, carrito/portes/confirmación se simulan en el navegador y no se
crean pedidos, no se descuenta stock ni se envían emails. En `DEMO_MODE`, quote,
checkout y reset públicos responden `410`.

El backoffice pasa a llamarse **Logic2B Getion**, enlaza a ARCE y conserva una
base de fixtures independiente. Productos, envíos y pedidos son de solo lectura;
las tres APIs de mutación rechazan con `403` incluso con sesión autenticada.

Verificación: `pnpm check` (174/174 tests, tipos y build) y E2E de aislamiento
(27/27) en verde. Auditoría global: todas las tiendas y el panel sin hallazgos;
19/19 superficies públicas en verde. La revisión del 2026-08-03 queda archivada
y C14.3 cancelado.

Desplegado en producción y repetido el E2E 27/27 contra
`https://ecom.logic2b.com`. Lighthouse de las cuatro indexables queda en
100/100/100/100 móvil y escritorio; para recuperar el 100 móvil, Inter deja de
bloquear el primer texto por debajo de 640 px (fallback métrico, LCP 1,0–1,1 s).

### C15.2 — verde global de accesibilidad de la portada — ✅ cerrado 2026-08-06

La portada pasa de 84 errores repetidos + 1 aviso a cero hallazgos en sus tres
perfiles, y el barrido global queda en **0 errores · 0 avisos · 169
superficies**.

- **Auditor corregido sin rebajar la batería:** ya no mide como texto visible
  los labels `sr-only`; compone correctamente varias capas translúcidas hasta
  el fondo opaco; y trata los SVG con `role="img"` como imágenes atómicas con
  alternativa accesible. Sus `<rect>` y `<text>` son hermanos en el orden de
  pintura, así que fingir un fondo DOM producía 19 falsos «blanco sobre blanco»
  por perfil.
- **Hallazgos reales corregidos:** foco visible del email del hero, área táctil
  del anuncio y contraste AA en la escala, las tres tarjetas de demo y la
  matriz Logic2B. El paso azul del flujo recibe una tinta más oscura.
- **Higiene global:** los seis avisos restantes eran saltos `h1 → h3` en las
  tarjetas de Street y Launch; pasan a `h2` sin cambio visual.

### F12.5 — la visión del gestor, ampliada — ✅ cerrado 2026-08-06

`/ayuda` conserva el manual de tres pasos y gana la profundidad operativa que
faltaba, sin tocar el motor ni alargar `docs/CLIENTE.md`.

- **Backend mínimo explicado como ventaja:** el gestor lleva pedidos, envíos y
  productos; dominio, impuestos, emails, diseño e integraciones corren de
  nuestro lado. Lo fuera de lo normal se pide, no se resuelve instalando
  añadidos.
- **Runbook 6 → 10 escenarios:** diferencia reembolso antes de enviar y
  devolución ya entregada (reposición manual), producto agotado que conserva
  visitas, cambio seguro de precio, vacaciones y email en spam. El copy se
  contrastó con las transiciones reales: cancelar un pedido pagado devuelve
  stock; un pedido ya enviado no se puede cancelar desde el panel.
- **«Tu primer mes»:** nada que vigilar cada día sin pedido, revisión semanal
  de diez minutos, cierre mensual con señales reales y cuatro motivos claros
  para escribirnos.
- **Verificado:** `pnpm check` (174/174 tests, 0 errores de tipos, build verde),
  `/ayuda` en escritorio y 375 sin hallazgos y barrido global 169/169 limpio.

### R1.2 — capability manifest tipado — ✅ cerrado 2026-08-06

- `platform.config.ts` declara el despliegue demo mediante el preset técnico
  `minimal`; los perfiles `standard` y `advanced` quedan como fixtures
  acumulativos, no como planes comerciales.
- El contrato ejecutable fija seis estados, flags de rutas/navegación/jobs/
  efectos, configuración sin secretos, dependencias y fallo temprano ante
  combinaciones inválidas. Una demo no puede activar jobs ni efectos
  comerciales.
- `src/composition/create-platform.ts` materializa el composition root puro,
  sin conectarlo todavía a Astro, D1, rutas, navegación o proveedores.
- PLT-002 pasa a parcial. La allowlist no crece; `format.ts` conserva su deuda
  hasta R1.12 porque retirarla ahora trasladaría el acoplamiento o exigiría un
  refactor runtime fuera de corte.
- Verificado con 14 tests específicos del manifest, 5 checks arquitectónicos y
  `pnpm check` completo (28 suites, 193 tests, tipos y build), sin migraciones,
  dependencias, UI ni deploy.

### R1.3 — navegación y rutas por capacidad — ✅ cerrado 2026-08-06

- Middleware, panel, acciones y enlaces consumen `runtimePlatform` mediante una
  política única: inactivo se oculta/404, activo sin permiso responde 403 y
  `degraded` conserva el fallback declarado.
- `minimal`, `standard` y `advanced` tienen navegación y rutas verificadas; la
  demo conserva las cuatro pantallas con una composición `custom` sin jobs,
  efectos comerciales ni mutaciones.
- Las páginas/endpoints tocados delegan en casos de uso y adaptadores D1 de
  catálogo, pedidos, fulfillment, notificaciones y marketing. La allowlist baja
  de 18 a 9 y los archivos con SQL en presentación de 13 a 4.
- Verificado con `pnpm check` (29 suites, 205 tests), E2E 27/27 y panel a 1440 /
  375: 14 superficies, 0 errores y 0 avisos de accesibilidad. Sin migraciones,
  dependencias ni cambios en dinero, stock o copy comercial.
- Desplegado en producción; E2E remoto 27/27 y webhook comercial de la demo
  cerrado con 410 antes de verificar firma o tocar D1.

### R1.4 — registro de módulos — ✅ cerrado 2026-08-06

- Registro canónico de 16 módulos con id/version semver, capacidades,
  dependencias, permisos, eventos, jobs, healthchecks, enlaces wiki,
  navegación y rutas. Cada capacidad tiene un único propietario.
- El validador rechaza descriptores incompletos, ids/dependencias desconocidos,
  módulos/capacidades/superficies duplicados y ciclos antes de componer.
- `createPlatform` selecciona solo módulos activos o degradados y comprueba sus
  dependencias. Navegación y rutas ya se derivan del registro, sin las dos
  listas manuales anteriores.
- El registro de escaparates deja la capa plana y el endpoint de backup delega
  en caso de uso/adaptador D1; la allowlist baja de 9 a 7 y quedan tres rutas
  con SQL de presentación, asignadas a R1.5.
- Nueve pruebas específicas cubren invariantes, inmutabilidad y los presets
  `minimal`, `standard` y `advanced`. Sin dependencia, migración ni activación
  de infraestructura externa; eventos/jobs/healthchecks se reservan a sus
  bloques propietarios.
- Verificado con `pnpm check` (31 suites, 218 tests), E2E 27/27 y las 14
  superficies del panel a 1440/375 sin errores ni avisos de accesibilidad.

### `/temas` — búsqueda, filtros y densidad de rejilla — ✅ 2026-08-06

- Buscador instantáneo por nombre, sector, descripción y referencia; filtro
  horizontal por cinco familias y contador accesible de resultados.
- Selector de dos o tres columnas en escritorio, estado vacío recuperable y
  mejora progresiva: sin JavaScript se mantienen visibles los 14 temas.
- Verificado en Chrome a 1440/375, incluyendo búsqueda, filtro, reset y rejilla
  de tres columnas; auditoría de accesibilidad de ambas vistas sin hallazgos.

### R1.5 — sobre de eventos — ✅ cerrado 2026-08-06

El motor pasa de coordinar por llamada directa a **coordinar por hechos**. Lo
que se ve por fuera no cambia ni un carácter: mismo historial de pedido, mismos
emails, mismas respuestas HTTP.

- **Sobre único y versionado** en `src/shared-kernel/events.ts` (primer archivo
  real del shared-kernel): identificador, tipo, versión, instante, actor,
  entidad, correlación, causación y clave de idempotencia. Reloj y fuente de ids
  se **inyectan** —el dominio no toca nada ambiental y los tests son
  deterministas—, la fábrica valida lo que produce, y el sobre **no transporta
  PII**: identifica el pedido, no a la persona. Decisión razonada en
  [`ADR-0006`](plataforma/adr/0006-sobre-de-eventos.md), tomada antes de diseñar
  el outbox porque su esquema depende de este contrato.
- **Los cinco hechos de pedido** (creado, cobrado, enviado, entregado,
  cancelado) se emiten con sobre y la fila de `order_events` pasa a ser su
  **proyección**. La redacción de las notas del timeline vive en un solo sitio,
  que ahora usa también el seed de la demo: una fixture ya no puede desviarse
  del texto real sin que se note. La correlación es el pedido
  (`order:<nº>`) y la causación apunta al hecho que lo provocó — el evento de
  Stripe en el webhook, el alta del pedido en el pago simulado.
- **Notificaciones deja de ser una llamada de pedidos y pasa a ser un
  consumidor**: reconoce tipos de evento por su nombre, lee el payload de forma
  defensiva y no importa nada del emisor. Quien los une es el composition root
  (`src/composition/order-operations.ts`), único punto que conoce ambos módulos.
  Añadir mañana un aviso por SMS o al ERP es enchufar un consumidor, no tocar el
  pedido.
- **Idempotencia intacta y probada donde importa**: el `UPDATE` guardado sigue
  yendo primero y en solitario, y solo quien gana la carrera aplica efectos —
  timeline, stock y bandeja en una única batch. Dos entregas del mismo cobro
  siguen dejando un pedido pagado, un descuento de stock y dos emails; dos clics
  de «marcar enviado», un solo aviso.
- **Se vacía la deuda arquitectónica del bloque**: el webhook recibe un evento
  de checkout ya normalizado (deja de conocer los tipos del SDK) y las tres
  rutas de escritura pierden su SQL. La allowlist baja de **7 a 2** claves y
  `presentation-sql` queda en **0 archivos**; las dos que quedan son de R1.12.
- **El registro de módulos declara emisores y suscriptores**, con emisor único
  por tipo, prefijo obligatorio del módulo y rechazo al arrancar de una
  suscripción a un hecho que nadie emite. Notificaciones se suscribe a pedidos
  **sin depender de pedidos**: esa es la prueba de que el sobre sirve para algo.
- **Verificado**: `pnpm check` en verde (35 suites, **244 tests**, tipos y
  build), E2E de aislamiento 27/27 contra `wrangler dev`, y —porque la demo es
  de solo lectura y no ejercita el motor— una prueba del **motor real con
  `DEMO_MODE=false`**: compra con pago simulado, timeline de tres entradas con
  las notas de siempre, stock decrementado, exactamente tres emails en la
  bandeja y transición repetida devolviendo 422 sin segundo aviso, comprobado
  contra D1.
- Sin migración D1, sin dependencia nueva, sin cambio de respuestas ni de
  promesa comercial. `wrangler.jsonc` vuelve a `DEMO_MODE=true` tras la prueba.

### R1.6–R1.7 — outbox transaccional — ✅ cerrado 2026-08-06

El esquema aprobado entra como migración aditiva: tabla de hechos inmutables y
entrega independiente por consumidor. Pedido, evento, timeline, stock y
entregas se confirman en una batch guardada por estado; una carrera perdedora
aplica cero efectos. El dispatcher añade claim de 25, lease de 60 s, retry con
siete backoffs, dead-letter al octavo fallo, replay interno, errores redacted y
retención de 30 días. Notificaciones inserta mensajes y ACK en la misma batch.

Verificado sobre SQLite real con carreras, rollback completo, doble despacho,
lease vencida, retry/dead-letter y replay; las cuatro migraciones también se
aplicaron con Wrangler sobre una D1 temporal aislada. Seed/reset y backup ya
incluyen las tablas. La demo no activa jobs ni efectos; las tiendas reales
despachan vía `waitUntil` y barrido cada cinco minutos.

Verificación final: `pnpm check` (35 suites, 251 tests, tipos y build),
migración `0004` aplicada a la D1 local y E2E de aislamiento 27/27 contra
`wrangler dev` con el esquema migrado. Migración remota y despliegue
`4578e360-b00d-460f-be0d-63a5a281b127` confirmados; E2E remoto 27/27.

### Siguiente bloque

**R1.8 — audit log transversal.** Actor, acción, entidad, diff redacted y
`correlation_id` para pagos, pedidos, producto y admin; export autenticado. El
contrato se diseña antes de cualquier nueva migración. Criterio completo en
[`docs/plataforma/ROADMAP.md`](plataforma/ROADMAP.md#r18--audit-log-transversal).

**F12.6 queda en el carril comercial, no bloquea R1.6.** Una sesión local de
mantenimiento creará el índice general de docs, revisará OG y ejecutará
Lighthouse contra producción en las indexables, incluidas `/precios` y
`/agencias`.

### Cola F12 conservada (retomar después de C14 o cuando el bloque lo indique)

**Mandato nuevo de Andreu (2026-07-28), y manda sobre todo lo demás:**
renombrado a **Logic2B Ecommerce**, reposicionamiento del argumento de venta
(a medida fácil · MVP que crece sin migrar · un equipo, no una plataforma ·
detrás está Logic2B) y documentación de **dos visiones** (CEO/agencia y
gestor). **Plan maestro completo en
[`docs/PLAN_FASE12_LOGIC2B_ECOMMERCE.md`](PLAN_FASE12_LOGIC2B_ECOMMERCE.md)**
— bloques F12.0–F12.6, un bloque por sesión.

- **PRIMERO: cerrar el ciclo de F12.2 (2026-07-30).** El copy nuevo de la
  landing está **en el repo y verificado, pero NO desplegado**: el gate de
  product manda — **Andreu tiene que dar el OK al copy** (promesas de
  servicio: frase estrella con techo de un millón, cuota «se sustituye, no se
  apila», FAQ de agencias). En cuanto llegue el OK, en sesión local:
  `pnpm deploy` → verificación en producción → `pnpm audit:lh --write` con
  red estable (la deuda de `docs/LIGHTHOUSE.md` viene de F12.1) → reset de la
  demo con cabecera `Origin`. Con el deploy salen también la marca partida y
  Poppins (en repo desde F12.1) y la alineación header/botones con
  logic2b.com (2026-07-30).
  **F12.3 va en el mismo deploy**: el dossier reescrito espera el mismo OK.
- **Bloque que toca después: F12.4 — la visión de la agencia que nos
  subcontrata.** Es la audiencia sin cubrir (plan §3). Primero el documento
  `docs/AGENCIAS.md` —modelo de colaboración, proceso, plazos, entregables,
  qué necesitamos de la agencia, marca blanca (D8 ya es GO)— y después la
  página `/agencias` indexable, decidiendo su sitio en el mapa de indexación
  y su enlace desde la landing. **D8c (tarifas de partner) sigue siendo de
  Andreu**: el documento se escribe sin cifras de partner hasta que las fije.
- **F12.0 está CERRADO y desplegado** (2026-07-28, entrada abajo): 123
  superficies en verde y sin avisos — 19 comerciales nuevas, las 20 `@dark`
  fantasma retiradas, pie de `/ayuda` arreglado, regla 13 sin falsos
  positivos de anclas, y Street en oscuro descartado con motivo (no existe
  modo oscuro al que temer).
- **Después, en orden:** F12.3 dossier → F12.4 agencias · F12.5 gestor
  (cualquier orden) → F12.6 consolidación.
- **Decisiones de Andreu en cola:** **D7** — concepto DECIDIDO (2026-07-28):
  una sola cuota personalizada (mantenimiento + asistencia + seguimiento) que
  se sustituye al subir de tramo, nunca se apila; **solo faltan las cifras**,
  con benchmark y escalera propuesta (Base 39 · Crece 279 · Acelera 590) en
  [`docs/ANALISIS_MENSUALIDAD.md`](ANALISIS_MENSUALIDAD.md) — no bloquea el
  reencuadre del copy, solo los números finales · **D8** — DECIDIDO: página
  `/agencias` sí y marca blanca sí (nosotros el desarrollo, la agencia lo
  demás); queda **D8c** (tarifas de partner), sin prisa · el copy con
  promesas de servicio se presenta SIEMPRE a Andreu antes de desplegar (veto
  de product) · y las anteriores siguen vivas: submission a **Awwwards** (de
  pago) y `font-display: optional` para el 98 del dossier móvil.
- **Recordatorio de red** (por si vuelve a hacer falta imaginería): el CDN de
  Higgsfield y `ecom.logic2b.com` están **denegados desde cloud** (000). En
  local, el sandbox también bloquea la red: `curl`/`git` de red necesitan
  `dangerouslyDisableSandbox` (memoria `github-bloqueado-por-sandbox`). Y el
  `astro dev` que arrancan las browser tools escucha **solo en IPv6**: a los
  scripts se les pasa `BASE_URL=http://localhost:4321` — con `127.0.0.1` da
  000 y el auditor cree que el servidor está caído.
- **No urgente, que no se pierda:**
  1. **Cola del motor apuntada por Andreu (2026-07-28)**: feeds de catálogo
     **Google Merchant + Meta** (un solo feed en formato Google sirve a los
     dos; prerequisito del tramo Acelera) y pantalla «Integraciones» del
     panel demo. Espec completa en el plan de F12, sección «la cola del
     motor». Se ejecutan después de F12, cada uno con su sesión y sus tests.
  2. El **panel lateral deslizante de producto** que pedían Natural y Specs
     sigue siendo candidato a registro nuevo del motor (hoy la ficha la sirve
     Base para los 10 temas). No entra en una sesión de tema.

### F12.4 — canal agencias y desarrollo ecommerce en marca blanca (2026-08-06, sesión local)

La tercera audiencia ya tiene una propuesta completa: agencias de diseño,
marketing, branding y comunicación que quieren vender ecommerce a medida sin
incorporar un equipo técnico permanente.

- **`docs/AGENCIAS.md`:** modelo operativo completo — reparto agencia/Logic2B,
  encaje y propuesta, construcción, lanzamiento, materiales necesarios,
  entregables, límites y condiciones comerciales. Marca blanca real: tienda,
  panel, emails y documentación pueden salir sin Logic2B; código, datos y
  cuentas críticas quedan bajo el control acordado. Sin tarifas partner ni SLA
  inventados: se fijan por proyecto.
- **`/agencias`:** página indexable orientada a «desarrollo ecommerce marca
  blanca para agencias», con H1 propio, reparto de responsabilidades, proceso,
  entregables, encaje honesto, FAQ y formulario existente de captación. Cero
  dependencias y cero cambios en el motor.
- **SEO completo desde el nacimiento:** canonical, `Service` + `FAQPage` en
  JSON-LD, navegación y sitemap compartidos, metadatos sociales y tarjeta OG
  específica de 1200×630 (120 KB), reproducible con
  `node scripts/make-og.mjs --agencias`. El layout acepta ahora tarjeta y alt
  específicos sin romper el fallback general.
- **Cobertura:** `/agencias` y la página de precios entran en el auditor; ambas
  entran también en Lighthouse. El pie normaliza las rutas `.html` de la
  prerenderización para marcar el enlace actual, y el wordmark partido alcanza
  el mínimo táctil móvil sin cambiar su aspecto.
- **Verificado:** `pnpm check` (174/174 tests, 0 errores de tipos, build verde),
  `/agencias` a 1440 y 375 sin overflow, auditor 2/2 superficies sin errores ni
  avisos y Lighthouse local 100/100/100/100 en móvil y escritorio (LCP 1,5 s y
  0,4 s; CLS/TBT 0).
- **Producción:** desplegada en `https://ecom.logic2b.com/agencias`; smoke 200,
  canonical/OG/sitemap correctos, auditor remoto 2/2 y Lighthouse remoto
  100/100/100/100 (LCP 1,1 s móvil y 0,3 s escritorio). El auditor incorpora
  `--no-proxy-server`, igual que Lighthouse: sin él Chrome heredaba un proxy del
  sistema y auditaba un documento vacío aunque Node y curl sí llegasen.
- **Deuda encontrada, no ocultada:** el barrido global de 169 superficies deja
  tiendas, panel y todas las páginas salvo la landing en verde, pero la portada
  renovada aporta 28 hallazgos repetidos en tres perfiles más un aviso táctil.
  Se convierte en C15.2 y va antes de F12.5. Dos avisos táctiles independientes
  de Iris se corrigieron en esta misma pasada.

### F12.3 — Dossier V2: la visión del decisor (2026-07-30, sesión local)

`/dossier` pasa de «ficha de servicio con precios» a **business case** para
quien decide. Misma sesión que F12.2, ejecutado tras ella.

- **Sección NUEVA «El camino: de MVP a tienda que crece» (P2):** cuatro
  etapas de un proyecto tipo — Mes 1 (el MVP completo, no una versión
  recortada) · los primeros meses (se afina con datos reales de venta) ·
  cuando el negocio lo pida (se añade, no se migra) · a cualquier escala (el
  techo no lo pone la plataforma). **Sin fechas prometidas** y con la
  aclaración de que lo que no entra el primer mes «está esperando a que tu
  tienda lo justifique», no quitado.
- **Sección NUEVA «Qué compra tu mensualidad» (P3 · concepto D7):** tres
  bloques — que siga en pie (mantenimiento) · que alguien te atienda
  (asistencia personalizada, no un ticket en una cola) · que evolucione
  contigo (seguimiento y criterio). Recuadro anti-stacking con la regla D7
  («una cuota que se sustituye, nunca se apila») y el párrafo de honestidad
  «lo que NO incluye»: funciones nuevas y campañas se presupuestan aparte,
  con el marketing de Logic2B como continuación natural (P4), no como
  incluido.
- **Doctrina del backend mínimo** en «Cómo trabajamos»: recuadro «tu panel es
  simple a propósito» — pedidos, envíos y productos; las mil configuraciones
  corren de nuestro lado; lo fuera de lo común se pide y se resuelve.
- **«Para quién es (y para quién no)» actualizado al claim nuevo:** fuera
  «entre 50 y 100 productos» y fuera «miles de referencias» como
  descalificador (contradecía el techo del millón); dentro «con 20
  referencias o con miles», la sincronización ERP diaria y el marketplace
  como los límites reales.
- «Qué incluye» → «Qué incluye **el primer mes**», precios reencuadrados a la
  cuota única, FAQ 8 → 11 (mensualidad, marketing/agencia, catálogo que
  crece), meta description y `Service` JSON-LD al argumento nuevo, CTA del
  header al canto corporativo.
- **Corrección de honestidad cazada al escribir este bloque:** el copy de
  F12.2 vendía el **buscador** como función futura, pero el catálogo YA lo
  tiene (`role="search"` con parámetro `q` en `CatalogPage.astro`). Retirado
  de la escalera y de la FAQ de la landing; en `/arquitectura` se precisa que
  a gran escala lo que hace falta es **búsqueda con índice propio y facetas**,
  no un buscador donde no hay. `/estilos` abre su guía de tamaño de catálogo
  («Completo 50–100» → «50 o más»), que dejaba huérfano al catálogo grande.
- Verificado: `pnpm check` verde (148 tests, 0 errores de tipos) · a11y
  `--only=site:` 19/19 sin hallazgos · navegador sin errores de consola ·
  barrido de claims obsoletos («50–100», «500 referencias») sin resultados en
  superficies comerciales.
- **NO desplegado:** mismo gate de product que F12.2 — el copy espera el OK
  de Andreu.

### F12.2 — la landing cuenta el argumento nuevo (2026-07-30, sesión local)

La reescritura de copy de `src/pages/index.astro` sobre el esqueleto de F11,
con el mandato comercial del día: énfasis en captación, la escalabilidad como
valor estrella y el enlace con los servicios de la casa. **Dos decisiones las
tomó Andreu en la sesión** (AskUserQuestion): techo de **un millón** y forma
«los dos extremos como iguales» → la frase estrella es **«10 productos o un
millón: tu tienda nunca se queda pequeña»**.

- **Hero:** H1 nuevo «Tu tienda online a medida. 10 productos o un millón.»
  (intención de búsqueda «tienda online a medida» conservada — seo);
  subclaim desde la frase madre de P1 + P2; el badge pasa de «50–100
  productos» (contradecía el techo nuevo) a «Un servicio de Logic2B» (P4).
- **«A dónde va el dinero de tu tienda actual»** (antes «lo que te está
  costando»): mismas cifras, cierre P3 nuevo — «la pregunta no es cuánto
  pago, es a quién le pago».
- **Sección NUEVA «10 productos o un millón» (P2):** escalera de 3 pasos
  (Hoy: el MVP que vende · Cuando lo pida: se le añade sin migrar · A
  cualquier escala) + bloque «Conectada a lo que ya usas — sin plugins» con
  la doctrina del backend mínimo (feeds Google Merchant/Meta, mailing,
  transportistas, facturación — «se activan de nuestro lado») y el cierre P4.
  Vigilancia de product respetada: «cuando el negocio la justifica», sin
  fechas y sin meterlo en la cuota.
- **Precios:** H2 «Un equipo detrás, no una plataforma»; mismas cifras D4;
  la mensualidad como mantenimiento + asistencia personalizada + seguimiento
  y la regla D7 explícita («se sustituye, nunca se apila»).
- **«Cuándo NO somos tu opción»:** fuera el techo de «500 referencias»
  (contradecía el claim nuevo); dentro «catálogo que cambia a diario con
  sincronización ERP», que sigue siendo verdad.
- **Franja NUEVA «Detrás está Logic2B» (P4):** los 4 servicios del menú de
  logic2b.com (diseño web, sistemas, marketing, automatización IA) + la
  auditoría gratuita, enlazados — cierra el círculo con norte, que ya enlaza
  a ecom desde su header.
- **FAQ 5 → 8:** nuevas «¿Y si mañana necesito algo que la tienda no hace?»,
  «¿Qué incluye exactamente la mensualidad?» (concepto D7) y «¿Trabajáis con
  agencias?» (D8, marca blanca); la de Shopify pierde el «50–100 productos».
  `FAQPage` derivado del array → sincronizado solo (8=8 verificado en DOM).
- **Meta description y `Service` JSON-LD** reescritos al argumento nuevo;
  mismas offers D4.
- **`/arquitectura`:** sección nueva «¿Hasta dónde escala? De 10 referencias
  a un millón» — las cuentas verificables (~1–2 KB/referencia, 10 GB por
  base D1) y la parte honesta: a esa escala el trabajo es buscador, facetas
  y sincronización, y eso entra por el tramo «A medida» sobre el mismo motor
  (raíl §5 del plan intacto).
- **Marca (petición directa de Andreu, misma sesión):** header al carril de
  logic2b-norte (1440px, gutter `clamp(24px,4vw,32px)`) y CTAs comerciales
  al canto corporativo 10px vía `rounded-btn`. Gotcha cazado: el tema Base
  de la tienda dependía del fallback global (pill) — ahora `Shop.astro`
  inyecta las vars de TODOS los temas, Base incluido, y cada tienda conserva
  su radio. El CTA por tema de `/estilos` pinta ahora su `--radius-btn` real.
- Verificado: `pnpm check` verde (148 tests, 0 errores de tipos, build OK) ·
  a11y `--only=site:` 19/19 superficies sin hallazgos contra `astro dev` ·
  JSON-LD = copy visible · navegador (hero, escalera, franja P4,
  `/arquitectura`) sin errores de consola.
- **NO desplegado:** el gate de product manda — el copy se presentó a Andreu
  al cierre de la sesión y el deploy espera su OK (ver «Próxima sesión»).

### F12.1 — el renombrado: LogicEcom → Logic2B Ecommerce (2026-07-28, sesión local)

El nombre nuevo **es** mensaje (P4 del argumentario): producto y agencia bajo
el mismo techo. Se ejecuta antes que la reescritura de copy (F12.2–F12.3) para
no escribir dos veces los mismos textos.

**23 superficies vivas renombradas**, en tres tandas para no romper nada:

1. **Contextos URL-encoded primero** (`mailto:` y `wa.me` de landing, dossier y
   la bandeja de emails): ahí el nombre viaja como `Logic2B%20Ecommerce`. Un
   `sed` global con espacio habría roto los enlaces de contacto, que son el
   canal de venta real.
2. **El resto del código y la UI**: wordmark por defecto de `Logo.astro` y
   `SiteHeader.astro`, footers de Shop, minimal y street, `og:image:alt`,
   `demo-themes.ts`, cabecera del dump de `backup.ts`, y los titles/metas y
   JSON-LD de `/`, `/arquitectura`, `/estilos`, `/dossier`, `/404`.
3. **Docs y meta**: `README.md`, `package.json`, `CLAUDE.md` (nota de
   renombrado, igual que la de 2026-07-20), `bootstrap.sh`, `docs/LITE.md`,
   `docs/TEMAS.md`, la plantilla del guion de vídeo y la skill del equipo.

**Lo histórico no se toca**: las entradas pasadas de este ROADMAP, los prompts
de fases cerradas y el comentario de `0001_init.sql` conservan el nombre viejo
a propósito. Los nombres de los tramos (Kit Lite · Kit · Kit a medida) tampoco
cambian: son de Andreu (D4).

Tres decisiones de la sesión, no mecánicas:

- **SEO — el title de `/arquitectura` perdía sentido.** Era «Arquitectura de
  LogicEcom … | Logic2B»; con el nombre nuevo el sufijo repetía la marca dos
  veces. Queda «Arquitectura de Logic2B Ecommerce — así funciona por dentro».
  Y el de `/` se acorta («…sin cuotas ni comisiones de plataforma» → «…sin
  cuotas de plataforma»): el nombre nuevo son 7 caracteres más y el título se
  iba a 83; la intención de búsqueda («tienda online a medida») se conserva
  intacta, que es lo que manda el rol.
- **OG regenerada** con `Logic2B <i>Ecommerce</i>` (mismo bitono verde de la
  marca) y **`?v=2` → `?v=3`** en `Base.astro`: sin subir la versión, WhatsApp
  seguiría enseñando la tarjeta vieja durante semanas. 113 KB, verificada a
  ojo — el nombre largo cabe de sobra en la banda de marca.
- **Higiene de la carta de product**: citaba «1.900 € + 29 €/mes,
  provisionales», cifras anteriores a D4. Ahora cita la escalera aprobada
  (Lite 590 · Kit 1.900 + 39/mes · A medida 3.400 + 59/mes). No es un cambio
  de precio: es sincronizar el doc con una decisión ya tomada.

**Sin cambios de URL → sin 301, sin riesgo SEO.** El dominio ya era
`ecom.logic2b.com`.

**Verificado:** `grep -ri logicecom` limpio en todo lo vivo · `pnpm check`
(148 tests, 0 errores de tipos, build OK) · **barrido a11y 123/123 en verde,
0 avisos** (el wordmark es el nombre accesible de la marca en cabecera y pies,
así que el auditor sí lo mira) · revisión en navegador del wordmark largo:
cabecera a 375 (wordmark + CTA sin apretarse) y a 1440 (con el nav completo),
columna «LOGIC2B ECOMMERCE» del pie de Street a 375, y la columna de la tabla
comparativa de la landing (envuelve a dos líneas dentro de su contenedor con
scroll; el documento no desborda). Consola limpia.

**Desplegado y comprobado en producción**: los cuatro `<title>` nuevos servidos
en `/`, `/arquitectura`, `/dossier` y `/estilos`, `og.jpg?v=3` en 200 (113 KB)
y demo reseteada (`POST /api/demo/reset` con `Origin`). El primer `pnpm deploy`
murió con «The request to Cloudflare's API timed out» —red, no credenciales—;
el reintento entró.

**Añadido después del despliegue (misma sesión, a petición de Andreu): la
marca partida y la tipografía de la casa.** El wordmark deja de ser una
palabra y pasa a ser un lockup con dos destinos: **«Logic2B» → logic2b.com**
(la agencia) y **«Ecommerce» → la home del producto**, en gris fuerte
(`neutral-600`, 7,6:1). Son **dos enlaces hermanos**, nunca uno dentro de otro
—ancla anidada es HTML inválido y error del auditor—, lo que obligó a que
`Logo.astro` acepte un slot `wordmark` en vez de recibir solo texto. Va detrás
del prop `splitBrand`, apagado por defecto: las tiendas montan la misma
cabecera pero ahí el wordmark es el nombre del comercio.

El estilo se **trae tal cual de `logic2b-norte`** para que las dos webs de la
casa lleven el mismo logo: Poppins, cuerpo 1.2rem, tracking +0.015em y el
salto **600 → 800 en el «2B»**. Con él viajan los dos subsets de logo (< 1 kB
cada uno, con `unicode-range` propio para que las dos caras no se peleen por
los mismos glifos) y **Poppins 600 latino (8 kB) como fuente de titulares** de
todo el producto: `--font-display` deja de ser Inter. Detalles que costaron
una vuelta:

- **El scoping de Astro no cruza de componente.** El `<style>` de `SiteHeader`
  generaba `.wordmark[data-astro-cid-…]`, pero la clase aterriza en el `<span>`
  que pinta `Logo`, que lleva OTRO cid. Las reglas del lockup viven ahora en
  `global.css`, junto a `.font-display`.
- **Cambiar `--font-display` es tocar un token base** (veto de ux-ui): el tema
  **Base de las tiendas no emite tokens propios** —«sus valores son los de
  global.css», dice `Shop.astro`—, así que la tienda genérica se habría
  llevado la fuente de marca. Se le fija Inter con
  `[data-store-theme='base']`: Poppins es del producto, no del cliente. Las
  otras 9 tiendas ya pisaban el token y no se enteran.
- **Sin CLS y sin peso muerto**: fallback con métricas ajustadas
  («Poppins Fallback», mismo truco que «Inter Fallback»), precarga solo en las
  cuatro comerciales vía `preloadDisplayFont` (las tiendas no la descargan —
  verificado: `document.fonts` vacío de Poppins en la Base) y **CLS 0 medido**
  en la landing. Cobertura de acentos y signos castellanos comprobada glifo a
  glifo.
- Las cabeceras propias de `/arquitectura` y `/dossier` —que seguían con el
  wordmark viejo «Logic2B.»— pasan al lockup nuevo.

Reverificado con los cambios: `pnpm check` (148 tests, 0 errores) y **123/123
del barrido a11y, 0 avisos**. **Sin desplegar todavía**: entra con el próximo
deploy.

**Lighthouse: medido, no publicado.** La tanda contra producción dio 100 en
accesibilidad, buenas prácticas y SEO en las ocho combinaciones, con LCP, CLS y
TBT iguales al baseline del 2026-07-27 (1.3 s / 0.00 / 0 ms en móvil), pero el
rendimiento osciló entre 96 y 100 entre pasadas y el propio script reintentó
tres descargas por lentitud («el documento tardó 6,4 s en llegar»). Es ruido de
la red del medidor: el renombrado solo cambia texto. `docs/LIGHTHOUSE.md`
**no** se reescribe —la tabla es citable en la landing y no se publica con
cifras de una red inestable—; la próxima tanda con `--write` va con el deploy
de F12.2.

### F12.0 — la red de seguridad llega a las páginas comerciales, y el auditor deja de contar cobertura fantasma (2026-07-28, sesión local)

Primer bloque de la Fase 12: antes de que F12.1–F12.3 reescriban marca y copy
en media web, el auditor tenía que estar mirando. Se añade el grupo
`SITE_PAGES` a `scripts/a11y-audit.mjs`: las 9 públicas (`/`, `/arquitectura`,
`/estilos`, `/dossier`, `/ayuda`, `/demo/gracias` **con pedido sembrado Y en
estado vacío**, `/demo/reset`, y el 404 real navegando a una ruta inexistente)
× 1440/375, más la landing con reduced-motion — **19 superficies nuevas, sin
login de por medio**.

**El hallazgo gordo, otra vez en el auditor y no en las páginas.** Al decidir
si las comerciales llevaban variante `@dark` se descubrió que **NADA en el
código responde a `prefers-color-scheme`**: el `.dark` de `global.css` es un
juego de tokens por clase que ningún script aplica — herencia del selector de
temas que 9B eliminó. Verificado a ojo en el navegador: emular oscuro pinta
píxel por píxel lo mismo que el claro. Las 20 superficies `@dark` de tiendas
(catálogo y ficha × 10) llevaban desde F11.8b auditando dos veces los mismos
píxeles: **cobertura fantasma** que inflaba la cifra (124) y daba una
seguridad de dark mode que no existe. Retiradas — el barrido queda en **123
superficies reales** (90 de tienda + 14 del panel + 19 comerciales), con el
comentario en el bucle para devolverles su `@dark` si algún día una tienda
estrena modo oscuro de verdad.

Lo que sí estaba roto, una vez mirado:

- **El pie de `/ayuda`** («Mantenido por Logic2B…») en `text-stone-500` sobre
  `bg-stone-100`: 4,39:1. Pasa a `text-stone-600` (~7:1).
- **Falso positivo de la regla 13 (`aria-current`)**: comparaba ruta+query,
  así que un ancla de sección («#precios» en la landing, el TOC de `/ayuda`)
  contaba como «enlace a la página actual». Marcarlas con
  `aria-current="page"` sería mentir (no son autoenlaces de página) y el
  `aria-current="location"` de un scrollspy exigiría un JS que estas páginas
  no tienen. La regla ahora excluye enlaces con hash; los casos reales (las
  navegaciones del panel que F11.9 arregló) siguen cubiertos.

**El vistazo a Street en oscuro (candidato 2 que dejó F11.9): descartado con
motivo.** No hay modo oscuro en el que `--color-surface-sunken` pueda chocar;
Street además redefine el token a su gusto (`#efefef`) y solo lo usa en el
estado vacío del catálogo — hoy inalcanzable con el seed completo: una
categoría falsa en la URL cae con elegancia al catálogo entero. Si el modo
oscuro llega algún día, la mirada vuelve con él.

**Verificado:** 123/123 en verde, 0 errores y 0 avisos (astro dev) · `pnpm
check` (148 tests, 0 errores de tipos, build OK) · `/ayuda` revisada en
navegador (consola limpia, imágenes 200). **Desplegado** (versión `48b2fb50`),
demo reseteada y fix comprobado servido en producción. `audit:lh` no tocaba:
las 4 indexables de la tabla citable no se han modificado.

**Gotcha de entorno nuevo:** el `astro dev` que arrancan las browser tools
escucha **solo en IPv6** — `BASE_URL=http://localhost:4321`; con
`http://127.0.0.1:4321` el ping da 000 y el auditor cree que el servidor está
caído.

### F11.9 — el panel entra en el auditor de a11y, y el auditor aprende a leer colores (2026-07-27, sesión local)

Bloque previsto en «Próxima sesión»: meter las pantallas del backoffice en
`scripts/a11y-audit.mjs`, que hasta ahora solo barría tiendas. Se añaden **14
superficies** (login, pedidos, detalle de pedido pagado, detalle de pedido
enviado, productos, envíos, emails × 1440/375), y el barrido pasa de 110 a
**124 superficies, todas en verde**.

Dos decisiones de diseño del auditor, las dos por no repetir errores ya pagados:

- **El panel entra con el POST real del login**, no sembrando la cookie a mano:
  así el propio login queda probado de paso. Se entra una vez por tanda.
- **Los ids de pedido se resuelven en vivo por estado**, nunca se fijan. La D1
  local acumula los pedidos que deja el E2E, así que un id hardcodeado audita
  hoy un pedido pagado y mañana uno cancelado — otra pantalla, con el ✓ igual de
  verde. Se piden por estado porque cada uno tiene su interfaz: `paid` es el que
  enseña el formulario de envío (`#carrier` + `#tracking`) y `shipped` el que
  trae tracking y timeline.

**El hallazgo gordo no estaba en el panel, estaba en el auditor.** La primera
pasada dio 14 errores, todos «ratio 1.00:1, blanco sobre blanco» — sobre un
botón que en pantalla es negro. Causa: **Chrome NO normaliza a `rgb()` en
`getComputedStyle`**. Un color escrito en `oklch()` —toda la paleta de Tailwind
v4 y los tokens de Logic2B UI— sale tal cual (`oklch(0.216 0.006 56.043)`), la
regex de `rgba?()` devolvía `null`, `effectiveBg` seguía subiendo por los
ancestros y acababa en el blanco de reserva.

Eso no era solo ruido: en un sentido daba **falsos positivos** (texto blanco
sobre fondo oscuro → «1.00:1»), y en el otro **falsos negativos** — texto
oscuro sobre fondo oscuro se medía contra blanco y **pasaba**. El auditor
llevaba desde F11.8b midiendo con ese punto ciego.

Arreglado sin dependencia nueva y sin reimplementar la matemática de OKLab: se
pinta el color en un canvas de 1×1 y se lee el píxel, que es la conversión del
propio navegador. Vale para `oklch`, `lab`, `color()` y `color-mix`. Se conserva
la vía rápida de `rgba()` para no premultiplicar alfa, y `parseColor` ahora
devuelve `null` **menos** veces que antes, así que no introduce saltos silenciosos.
Re-barridas las 110 superficies de tienda con el parser arreglado: **siguen en
verde**, ninguna escondía un fallo detrás del punto ciego.

Lo que sí estaba roto en el panel, una vez el auditor supo medir:

- **El separador «·» de la bandeja de emails** en `text-stone-400`: 2,59:1 sobre
  blanco. Pasa a `text-stone-500` (**4,79:1**) y además `aria-hidden`, que es lo
  que es — decoración entre tres enlaces, no contenido que un lector deba cantar.
- **`aria-current` ausente en las dos navegaciones del panel**: la de secciones
  (`Admin.astro`) y la de filtros por estado (`index.astro`). 10 avisos.

**Un tercer arreglo, este de robustez:** el E2E termina probando el rate limit
del login con 11 intentos fallidos, así que encadenar `pnpm test:e2e` y esta
tanda dejaba 12 rojos de «no se pudo entrar al panel» que no eran del panel. El
auditor ahora distingue el `?limited=1`, lo dice, espera los 65 s de la ventana
y reintenta una vez. Verificado a propósito disparando el límite a mano.

**Verificado:** 124/124 superficies en verde (astro dev y build de wrangler),
`pnpm check` (148 tests, 0 errores de tipos), E2E completo (27 checks) y
revisión en navegador del panel a 1440 y 375.

**Gotcha de entorno, para la próxima:** no levantar `astro dev` y `wrangler dev`
a la vez contra la misma D1 local. Se pelean por el sqlite y el segundo acaba
**colgado sirviendo 000 incluso en rutas estáticas** — parece un fallo de
código y es contención. Un servidor, y a los scripts se les pasa `BASE_URL`.

### F11.8e — desplegado: la landing, a 100×4 en los dos perfiles (2026-07-27, sesión local)

La sesión de `wrangler` volvió sola (era caída de red, no expiración), así que
se desplegó el `fetchpriority` que F11.8d dejó en el repo (versión
`3ca396be`), se reseteó la demo y se volvió a medir la tanda entera.

**Siete de ocho superficies a 100/100/100/100**, y las dos que importaban:

- **Landing móvil: 98 → 100** (LCP 1,8 → 1,3 s).
- **Landing escritorio: 99 → 100** (LCP 0,8 → 0,4 s).

El `fetchpriority="low"` de la galería no solo deshizo la regresión de
escritorio: al dejar de competir con la fuente del H1 arregló también el móvil.
**La cifra que la landing lleva escrita —«100/100 Lighthouse»— ya es verdad**, y
el ⚠ que F11.8d dejó abierto sobre el copy se cierra sin tocar el copy.

**Lo único que queda bajo 100 en todo el sitio: dossier en móvil, 98.** Y no es
ruido: 98 en las tres pasadas con la red limpia (documentos de 364–491 ms), con
Speed Index de 3,8–4,0 s clavado. Es la misma causa que tenía la landing —la
Inter en el camino crítico— pero aquí no hay forma de esquivarla: el dossier es
una página de texto puro, así que **hasta que no llega la fuente no hay nada que
pintar**. Cerrarlo sigue siendo la decisión de marca de F11.8d
(`font-display: optional`); ahora se sabe que compra exactamente dos puntos en
una página, no en cuatro.

**Dos afinados al auditor**, los dos por desconfiar de sus rojos:

- **`robots-txt` a 0 sin decir qué está mal = no lo descargó.** Costaba 8 puntos
  de SEO en escritorio con un `robots.txt` que se sirve 200 y es válido. Uno
  roto de verdad lista la línea que lo rompe; si no lista nada, es la red del
  medidor. Se descarta y se repite, igual que con el HTML lento.
- **`--write` con `--only` ya no escribe**: publicaba una tabla de dos filas
  donde hay ocho, en el fichero que se cita.

### F11.8d — la tabla de Lighthouse, cerrada (2026-07-27, sesión local)

Lo que quedaba de F11.8c: repetir la tanda con red sana y publicar medianas. Ya
está en [`docs/LIGHTHOUSE.md`](LIGHTHOUSE.md), 3 pasadas por superficie, red del
medidor limpia esta vez (documentos de 200–630 ms; el guardia del script solo
saltó dos veces, a 3,4 s, y repitió).

**Seis de las ocho superficies dan 100/100/100/100.** Las dos que no son la
landing: **98 en móvil** (osciló 97–100) y **99 en escritorio** (99–100). Las
otras tres páginas —arquitectura, estilos, dossier— dan 100 limpio en los dos
perfiles, con LCP de 1,2–1,3 s en móvil y 0,4 s en escritorio, CLS 0 y TBT 0 en
las ocho.

**Por qué la landing se queda a dos puntos, medido y no supuesto:**

- **Móvil: la webfont está en el camino crítico del LCP.** El elemento LCP es el
  H1 del héroe y su `Render Delay` es de **1050 ms clavados en las tres
  pasadas** — no es ruido. Observado, la página pinta a 1095 ms y la Inter llega
  a 1053: el texto sale justo cuando aterriza la fuente. El modelo de
  Lighthouse, que estrangula esa cadena, lo convierte en un LCP simulado de
  1,8 s. Con la animación del H1 ya en 0,35 s (F11.8c) esto es lo que queda, y
  bajarlo más significa tocar la tipografía: `font-display: optional` daría el
  100 a cambio de que la primera visita lenta se vea con la Arial de reserva
  toda la carga. **Es una decisión de marca, no técnica → Andreu.**
- **Escritorio: lo rompió el arreglo de móvil.** Poner la galería en `eager`
  (F11.8c) arregló el Speed Index móvil pero puso las nueve capturas a competir
  con la fuente del H1: 100 → 99, con el LCP subiendo de 0,5 s a 0,8 s. Arreglo
  aplicado en este commit: **`fetchpriority="low"`** en las tarjetas — bajan
  igual durante la carga, pero detrás de lo que pinta.

⚠ **El `fetchpriority` está en el repo pero NO en producción.** La sesión de
`wrangler` caducó a mitad de bloque («necesario CLOUDFLARE_API_TOKEN en un
entorno no interactivo») y `wrangler login` abre navegador, así que no se puede
desplegar desde aquí. **Andreu: `npx wrangler login` y luego `pnpm deploy`.** La
tabla publicada describe lo que hay servido ahora mismo, que es lo honesto.

### F11.8c — Lighthouse citable, OG de WhatsApp y URLs sin salto (2026-07-26, sesión local)

Cola de F11.8. Dos entregables (auditoría citable + verificación del OG) que al
ejecutarse destaparon tres defectos reales de producción.

**El sitio anunciaba URLs que redirigían.** Sitemap, `canonical`, `og:url` y los
12 enlaces internos apuntaban a `/arquitectura` (sin barra), y el Worker
respondía **307** hacia `/arquitectura/`. Un salto por visita y por rastreo, en
las cuatro páginas indexables. Arreglado por el lado que **no cambia ninguna URL
indexada**: `build.format: 'file'` en `astro.config.mjs` — Astro emite
`arquitectura.html` en vez de `arquitectura/index.html` y los assets del Worker
sirven 200 directo en la forma que ya anunciaba el sitemap. La alternativa
(añadir la barra a todo) habría cambiado la URL canónica de las cuatro páginas
y exigido plan de 301. Verificado: las 4 a 200 sin salto, `/demo/*` intacto
(son server-rendered), 404 correcto.

**La tarjeta que se comparte por WhatsApp vendía otro producto.** El OG decía
«Logic2B. Commerce Kit» sobre una foto de embutidos —la demo gourmet— cuando el
`og:title` y la landing entera ya venden **LogicEcom, un motor y diez tiendas**.
Nueva tarjeta generada por [`scripts/make-og.mjs`](../scripts/make-og.mjs)
(Chrome headless por CDP, cero dependencias, mismo patrón que
`capture-screens.mjs`): marca correcta, el H1 real de la landing y tres
catálogos de tiendas distintas apilados. 111 KB, 1200×630, legible a 400 px de
ancho, que es como llega a un chat. **Gotcha que cuesta semanas si se olvida:**
WhatsApp cachea la preview por URL de imagen, así que `Base.astro` sirve
`og.jpg?v=2` y ese número **hay que subirlo cada vez que se regenere**.

**La landing no era 100 en móvil.** Medido con el auditor nuevo
[`scripts/lighthouse.mjs`](../scripts/lighthouse.mjs) (`pnpm audit:lh`,
mediana de 3 pasadas, Lighthouse por `npx` para no meterlo en `package.json`):
7 de 8 superficies daban 100×4 y la landing en móvil **97**. Tres causas, las
tres medidas antes de tocar nada:

1. **La animación de entrada del H1 costaba ~0,5 s de LCP.** El H1 es el
   elemento LCP y Chrome no lo da por pintado hasta que se queda quieto;
   comprobado forzando `prefers-reduced-motion` (LCP 1,9 s → 1,4 s). Duración
   0,7 s → **0,35 s**: el gesto se mantiene, el LCP baja.
2. **En móvil se descargaban capturas de 900 px para pintarlas a 280.** Nuevas
   variantes `-560` (las genera ya `capture-screens.mjs`) servidas con `srcset`
   + `sizes`; la galería del héroe pasa de ~350 KB a ~150 KB y la página de
   **448 KiB a 309 KiB**.
3. **`loading="lazy"` en un carrusel horizontal salía caro.** Las tarjetas
   quedan fuera de pantalla por el lado y el navegador las bajaba tarde: una
   llegaba a los **19 s** y hundía el Speed Index. Con las variantes de 560 la
   galería entera cabe en lo que antes pesaban tres tarjetas, así que va
   `eager`.

Tras los tres: landing en móvil **100/100/100/100, LCP 1,2 s, SI 2,3 s**.

⚠ **La mediana citable quedó sin cerrar.** A mitad de la tanda final el enlace
de red de casa se degradó (documentos de 8–24 s, ping con picos de 1,4 s) y
Lighthouse achaca eso a la página: pasadas de 90 que no dicen nada del sitio. El
script aprendió a detectarlo —descarta y repite la pasada cuando el HTML tarda
más de 3 s, y **nunca descarta por nota baja**— pero con esa red no hay tabla
publicable. La landing dio 100×4 en la única pasada con red sana. Repetir la
tanda es lo que queda en «Próxima sesión».

**Verificado:** `pnpm check` (148 tests, 0 errores de tipos), E2E completo (27
checks) contra `wrangler dev`, revisión en navegador a 1440 y 375 con el
`srcset` eligiendo bien en cada uno (560 en móvil, 900 en escritorio de alta
densidad), despliegue a producción y reset de la demo.

**Deuda que este bloque destapó y no tocó:** las variantes `-900` y `-560` de
las capturas **no estaban en git** —el repo referenciaba imágenes que solo
existían en el disco de quien desplegó— y entran en este commit.

### F11.2a-4 — tienda KALIBRE, tema Specs (2026-07-25, sesión local)

**La última de las 4 tiendas que faltaban. Décima tienda viva: F11.2a CERRADA y
Fase 9B completa.** Ficha de entrega en [`docs/temas/specs.md`](temas/specs.md).

**Tienda.** KALIBRE, componentes de relojería y micromecánica (B2B): 9 productos
en 4 categorías, slugs `spe-*`, **los 9 con `specs`** — las tres filas de ficha
técnica (Peso / Material / Acabado) son el rasgo de la referencia y salen de
`specs_json`, la columna que la migración 0002 ya había dejado puesta. El
vertical se eligió por el tema: es el único del escaparate donde el DATO manda
sobre la foto, y un recambio de calibre se compra por peso y material. Uno a
`stock: 0` y dos a stock bajo. **9 no es casual: la rejilla irregular es
2 + 4 + 3 = 9**, el bloque entero de la captura sin hueco final.

**Cero motor, y eso era la noticia.** `TEMAS.md § 8` marcaba Specs como «el que
más datos nuevos pide» y el riesgo de datos más gordo de la serie. Acabó siendo
presentación pura: los 14 tokens estaban declarados desde 2026-07-20 y
`specs_json` llega solo al tema porque `getActiveProducts` hace `SELECT *`. La
migración 0002 ya había pagado la factura entera.

**La rejilla irregular es composición calculada, no `grid-auto-flow`.** Ciclo
2 → 4 → 3 sobre 12 columnas, pero el catálogo se filtra: cuando quedan 4
elementos o menos, esa es la última fila y se reparte entera. Verificado bajo
filtro — 2 productos → `6 6`; 3 → `4 4 4`; búsqueda con 2 aciertos → `6 6` —
**sin hueco en ninguna combinación**. Un resultado suelto ocupa media fila, no
las 12 columnas.

**El guion naranja de la referencia es un control DE VERDAD**: `<details open>` +
`<summary>` nativos, cero JS. Y se **dibuja** como barra con `background-color`
en vez de escribirse como carácter `—`, porque medido sobre píxeles reales
`#c2410c` da 5,18:1 sobre la hoja clara pero **3,82:1 sobre la oscura**: como
texto pequeño falla AA en modo oscuro, como elemento gráfico (umbral 3:1) pasa en
los dos. El nombre accesible lo pone el summary (`ACF-01 9 componentes`).

**Dos cosas que el auditor NO vio, cazadas a ojo** (dio 11/11 en verde a la
primera, y aun así había que mirar):

- **En oscuro la hoja quedaba negra flotando sobre fondo CLARO.** El fondo de
  página usaba `--surface-sunken`, que es un gris claro **fijo**, no dark-aware.
  El auditor mide contraste de TEXTO y todo el texto vive sobre la hoja, que sí
  invierte — el fondo de alrededor no tiene texto, así que nadie lo mira salvo el
  ojo. **Patrón:** `--surface-product`/`--surface-sunken` son fijos a propósito
  (la imaginería lleva el fondo claro incrustado); valen para una caja de
  producto y **no** para el fondo de una página. Queda anotado que Street usa
  `--color-surface-sunken` igual y merece una mirada.
- **`contain` enseñaba un recuadro más claro dentro de cada celda.** Pese a pedir
  `#e8e8e8` explícito en los 9 prompts, el generador devolvió un gris de estudio
  **distinto en cada pieza (208–229) y con degradado vertical** — medido con
  `dwebp -ppm` sobre los WebP ya escritos. Ningún valor del token podía casar, así
  que este tema va con `cover`. **Para la próxima: comprobar el píxel del fichero
  descargado, no fiarse de que el prompt pidiera el fondo.**

**Verificado:** 11/11 superficies de Specs en verde, **110/110 del barrido
completo** (las 9 tiendas anteriores no regresan), `pnpm check` (148 tests, 0
errores de tipos), E2E de compra completo, clic REAL en «Añadir» (añade sin
navegar a la ficha), y revisión a 1440, 375 y modo oscuro. Specs entra además en
el conmutador de tiendas, en la galería del hero de la landing y en
`capture-screens.mjs` (3 capturas nuevas) — con ella la galería queda completa
con las 10.

### F11.2a-3 — tienda ROMER, tema Natural (2026-07-25, sesión local)

Tercera de las 4 tiendas que faltaban. **Novena tienda viva del escaparate.**
Ficha de entrega completa en [`docs/temas/natural.md`](temas/natural.md).

**Tienda.** ROMER, cosmética natural (DTC): 12 productos en 4 categorías, slugs
`nat-*`, **cuatro con `compare_at_price_cents`** — el precio anterior tachado y
la pastilla `-30 %` son el rasgo de la referencia y salen de la columna que la
migración 0002 ya había dejado puesta. **El porcentaje se calcula de los dos
precios**, no se escribe: si el seed cambia un precio, la pastilla cambia sola y
nunca puede mentir. Uno a `stock: 0` y dos a stock bajo. 12 productos no es un
número redondo por casualidad: con 4 columnas uniformes son 3 filas exactas.

**Tema.** Réplica de *All Natural (AFF)*, el DTC clásico bien hecho —y eso es
virtud, porque convierte: hero **partido** (plancha blanca 45 % + foto de estilo
de vida a sangre 55 %), **barra lateral de filtros** con acordeón y casillas
cuadradas, `Ordenar por ⌄` alineado a la derecha, rejilla uniforme de 4 y tarjeta
con **nombre a la izquierda y precio a la derecha en la misma línea**, categoría
en versalitas debajo.

**Cero motor.** Ni un token nuevo ni una línea de lógica compartida: los 14
tokens del tema estaban declarados desde 2026-07-20 y ninguno hubo que corregirlo
mirando la captura. Es la primera tienda de la serie que no roza el motor **ni
para bien** (Industrial destapó `darkFooter` y el `self-start` de la ficha).

**La exclusión que importa** (CLAUDE.md § 14). La referencia tiene cuatro
facetas de filtro (`Collections`, `Type`, `Price`, `Size`) y el catálogo tiene
**un** eje de clasificación. Dibujarlas es trivial —son casillas— y por eso es la
tentación: cuatro acordeones llenos quedan mejor en una captura que uno. Serían
casillas que no filtran nada en la pieza que vendemos como «esto funciona de
verdad». No entran. Tampoco la pastilla `New` (no hay fecha de alta), la cabecera
de tres zonas (es del motor; replicarla obligaba a `immersive` y a dejar carrito,
checkout y ficha sin cabecera por tercera vez) ni el panel lateral deslizante
(es estructura de FICHA, o sea registro nuevo en el motor: queda anotado como
candidato).

**Lo que cazó el auditor: 48 errores de una sola causa.** La tarjeta tenía **dos
enlaces al mismo producto** —el de la foto oculto con `aria-hidden` +
`tabindex="-1"`— y el auditor tenía razón: un `<a href>` sigue siendo enfocable
por programa aunque salga del orden de tabulación, y un producto que suena dos
veces en un lector es justo lo que la regla persigue. Arreglado con **área
extendida**: la foto es un `<img>` a secas y el enlace del nombre estira un
`::after` transparente sobre toda la tarjeta. Una parada de teclado y un nombre
accesible por producto. **Gotcha que viene con el patrón y vale para los temas
que quedan:** el botón de compra necesita `z-index` por encima de ese `::after` o
el área extendida se lo come y «Añadir» acaba navegando a la ficha. Verificado
con hover y clic REALES en Chrome headless, no razonando sobre la cascada.

**Verificado:** 11/11 superficies de Natural en verde, **99/99 del barrido
completo** (las 8 tiendas anteriores no regresan), `pnpm check` (148 tests, 0
errores de tipos), E2E de compra completo, catálogo filtrado y búsqueda sin
resultados, y revisión a 1440, 375 y modo oscuro. Natural entra además en el
conmutador de tiendas, en la galería del hero de la landing y en
`capture-screens.mjs` (3 capturas nuevas), que es lo que `/estilos` necesita para
no enseñar una imagen rota.

### F11.2a-2 — tienda METRIA, tema Industrial (2026-07-25, sesión local)

Segunda de las 4 tiendas que faltaban. **Octava tienda viva del escaparate.**
Ficha de entrega completa en [`docs/temas/industrial.md`](temas/industrial.md).

**Tienda.** METRIA, instrumentación de inspección y medida (B2B): 10 productos en
4 categorías, slugs `ind-*`, **los 10 con `subtitle`** — el subtítulo técnico en
gris bajo el nombre es el rasgo de tarjeta de la referencia («330x magnification»)
y sale de la columna que la migración 0002 ya había dejado puesta, no de recortar
la descripción. Dos productos a `stock: 0` y dos a stock bajo, para que «Agotado»
y «Últimas N» salgan de D1.

**Tema.** Réplica de *TAGARNO*: barra de miga azul eléctrico a ancho completo,
rejilla **sin gap** separada solo por filete (cada celda pinta el suyo a derecha y
abajo, y la rejilla se desplaza 1 px dentro de un contenedor con `overflow: hidden`
para comerse el de la última columna: ni doble línea ni marco), **dos celdas que
ocupan 2 columnas**, tarjeta dividida y botón azul que aparece al pasar el ratón.

**Cambio de MOTOR consultado y aprobado.** El pie negro no cabía en la frontera
del tema: con `nav: 'top'` lo monta `Shop.astro`. Se paró (veto del arquitecto) y
Andreu delegó la decisión. Se eligió que **el motor lea `theme.layout.darkFooter`**
—campo declarado y documentado en el descriptor desde 2026-07-20 que el motor
**ignoraba**, o sea configuración muerta— en vez de renunciar al pie o de irse a
`immersive` y dejar carrito, checkout y ficha sin cabecera por tercera vez (Iris y
Street ya lo pagan). Son ~20 líneas, ningún token nuevo, y sirve a los 9 temas.
De paso, el color y la superficie del pie salen de utilidades de Tailwind y pasan
a CSS de componente, para que la variante oscura no tenga que pisar clases.

**Y un defecto del motor destapado por esta tienda.** MV-320 es el primer
producto del escaparate con ficha técnica en su captura, así que su columna
derecha queda más alta que la imagen — y la caja de la foto, celda de un `grid`
con `align-items: stretch`, se estiraba y dejaba un bloque gris muerto debajo. Un
`self-start` en `ProductPage.astro` lo arregla **para las 8 tiendas**: no era
requisito del tema, era un defecto latente que nadie había expuesto.

**Cuatro cosas que no se replican, a propósito** (CLAUDE.md § 14): el `Load more`
azul (no hay paginación que cargar), la hamburguesa ☰ y la hora local del comercio
(viven en la cabecera del motor), la pastilla `New` (no hay fecha de alta que la
sostenga) y las 3 columnas de enlaces del pie (no tienen destino en la demo). Las
dos piezas visuales que sí se quedan hacen algo verdadero: la **franja azul**
enlaza al catálogo completo cuando hay filtro y dice el recuento cuando no, y la
**pastilla azul** dice «Últimas N» con el stock real.

**El hover-para-comprar, resuelto** (riesgo 4 de `TEMAS.md § 8`). El botón se
oculta con **`visibility: hidden`, no con `opacity: 0`**: con opacity seguía siendo
destino de tabulación y blanco de clic invisible, y el auditor lo cazó con razón
(1,00:1 — multiplica el alfa del texto por la `opacity` del elemento). Con
`visibility` no existe hasta que se revela, y se revela por ratón (`:hover`),
teclado (`:focus-within` del contenedor: enfocas el enlace de la tarjeta y el
siguiente tabulador entra en el botón) y táctil
(`@media (hover: none), (pointer: coarse)`). El estado «agotado» nunca se esconde.

**Lo que cazó el auditor** (`--only=industrial`, primera pasada: 4 errores y 4
avisos, un patrón cada uno): el botón oculto con opacity (arriba) y el enlace
«Catálogo» de la miga apuntando a la página en la que ya estás — ahora solo es
enlace cuando hay filtro, y si no es texto plano.

**Dos gotchas nuevos, ya en el CHECKLIST:** un `<=` dentro de una expresión JSX
rompe el build de Astro (lo parsea como apertura de etiqueta), así que las
comparaciones van en el frontmatter; y **`aspect-ratio` no manda sobre un flex
item cuyo hijo lleva `height: 100%`** — el alto lo acababa fijando la imagen y la
fila de la celda doble salía del doble de alta, hasta sacar la imagen del flujo
con `position: absolute; inset: 0`.

**Imaginería.** 10 imágenes de producto 800×800 con Higgsfield
(`marketing_studio_image`) y `scripts/fetch-industrial-images.mjs` (`cwebp`, sin
dependencias). **Tres hubo que regenerarlas**: salieron con fondo #ef–#f8 y en una
rejilla sin gap el fondo de la foto tiene que ser el MISMO blanco que la celda o
se ve un recuadro gris. La caja de imagen es cuadrada (`aspect-ratio: 1`) para que
una imagen de 800×800 la llene exacta y no quede letterbox que delate nada; la
celda doble usa `aspect-ratio: 2` y así la fila sigue cuadrando.

**Verificado:** 11/11 superficies de Industrial en verde, **88/88 del barrido
completo** (las 7 tiendas anteriores no regresaron con el cambio de motor),
`pnpm check` (148 tests, 0 errores de tipos), E2E de compra y panel completo (27
comprobaciones) y revisión a 1440, 375 y modo oscuro. METRIA entra además en el
conmutador de tiendas, en la galería del hero de la landing y en
`capture-screens.mjs` (3 capturas nuevas). **Primer tema de los siete sin ninguna
superficie de texto sobre foto**: no tiene hero, así que no hay nada que el
auditor no pueda computar.

### F11.2a-1 — tienda ASFALTO, tema Street (2026-07-25, sesión local)

Primera de las 4 tiendas que faltaban. **Séptima tienda viva del escaparate.**
Ficha de entrega completa en [`docs/temas/street.md`](temas/street.md).

**Imaginería (lo que solo se puede hacer en local).** 16 imágenes generadas con
Higgsfield `marketing_studio_image` y bajadas con `scripts/fetch-street-images.mjs`
—nuevo, **sin dependencias npm**: convierte con `cwebp`, el binario de sistema que
ya usa `capture-screens.mjs`, en vez de con `sharp` como el script viejo—. 12
fotos de producto 800×800 (coral sobre gris cálido, luz editorial, sombra
definida: la receta de `TEMAS.md § 5`), 1 hero a sangre de 1920 y 3 tarjetas
editoriales de categoría en 4:5. El CDN admite 8 trabajos concurrentes; las URL
se recogen con `job_display`. **Las URL del CDN caducan**: el script las lleva
apuntadas para poder rehacer la descarga.

**Tienda.** ASFALTO, running y streetwear urbano: 12 productos en 4 categorías,
slugs `str-*`, **2 productos a `stock: 0`** para que el «Agotado» de la rejilla
salga de D1 y no de una etiqueta pintada.

**Tema.** Réplica de *Up There Athletics*: ticker verde neón en marquesina (CSS
puro, para con `prefers-reduced-motion`, y las repeticiones van `aria-hidden`
porque son textura), hero a sangre, header **debajo** del hero, 3 tarjetas
editoriales, rejilla densa de 5 (→4→3→2 por breakpoints explícitos), banda Club
House con carteles tipográficos en CSS y pie casi negro.

**Decisión de motor consultada.** El header debajo del hero choca con
`Shop.astro`, que monta el `SiteHeader` antes del slot. Se paró (veto del
arquitecto) y Andreu eligió entre tres opciones: **tema inmersivo**, la
capacidad que ya existía para Iris. El tema pinta su propio chrome y **el motor
no se toca**. Coste aceptado: carrito, checkout y ficha de esta tienda van sin
cabecera, igual que Iris.

**Tres cosas que no se replican, a propósito** (CLAUDE.md § 14): el contador
`1/3` con flechas del hero sería un carrusel falso; el `Read Full Article` de
las notas no lleva a ningún sitio porque no hay CMS; y el alta de newsletter del
pie no tiene lista detrás. Cada una se sustituye por algo que sí funciona.

**Lo que cazó el auditor** (`--only=street`, primera pasada: 8 errores):

- Las tarjetas de categoría daban **1,08:1**. No era un falso positivo evitable:
  el auditor calcula el fondo efectivo recorriendo `background-color`, y la
  plancha era un degradado (`background-image`) sobre un pseudo-elemento del
  padre — invisible para él. Se rehízo como `background-color` **sólido** del
  bloque de texto. Ahora lo que mide y lo que se ve coinciden. **Patrón, no
  caso**: cualquier tema que ponga copy sobre foto tiene que darle al auditor un
  fondo que pueda leer.
- Salto de jerarquía h1 → h3 (falta un h2 de sección; va `sr-only`).
- El pie enlaza al propio catálogo sin `aria-current`.

Y dos gotchas de CSS/Astro que valen para los temas que quedan:
`-webkit-text-stroke` con `currentColor` sobre `color: transparent` deja el
trazo invisible; y un comentario `{/* */}` como hermano dentro de
`{cond && ( … )}` rompe el build de Astro.

**Verificado:** 11/11 superficies de Street en verde, **77/77 del barrido
completo** (las 6 tiendas anteriores no regresaron), `pnpm check` (148 tests, 0
errores de tipos), E2E de compra completo, y revisión a 1440, 375 y modo oscuro.
Street entra además en el conmutador de tiendas, en la galería del hero de la
landing y en `capture-screens.mjs` (3 capturas nuevas), que era lo que `/estilos`
necesitaba para no enseñar una imagen rota.

### F11.8b — auditor de accesibilidad de las tiendas y pase de las 6 vivas (2026-07-25, sesión cloud)

Bloque cloud previsto en «Próxima sesión». Se construye `scripts/a11y-audit.mjs`
(mismo motor CDP que `capture-screens.mjs`, **cero dependencias**: axe-core sería
dependencia de cliente y aquí solo hacen falta las reglas que este repo puede
romper). Barre las 6 tiendas × catálogo/ficha/carrito/checkout × 1440/375/oscuro/
reduced-motion = **66 superficies**, con 14 reglas (contraste AA computado sobre
el fondo efectivo, nombre accesible, jerarquía, landmarks, ids, interactivos
anidados, área táctil con las excepciones *inline* y *spacing* de WCAG 2.5.8,
labels, foco visible, overflow-x, reduced-motion, `aria-current`, `aria-hidden`
enfocable). Primera pasada: **51 errores y 24 avisos**. Cierre: **66/66 en verde**.

Lo que estaba roto de verdad:

- **Iris: el botón «DESCUBRIR» del hero era invisible** (1.00:1, acento sobre
  acento). Causa: `.iris :where(a) { color: inherit }` queda en (0,3,0) tras el
  scoping de Astro y gana a `.iris-product-card__btn` (0,2,0), así que se perdía
  su `color:#fff`. Arreglado envolviendo la normalización **entera** en
  `:where(...)` → especificidad 0. Es un patrón, no un caso: cualquier tema con
  una regla general de `a`/`button` tiene la misma trampa (queda en el checklist).
- **Iris: copy pequeño en acento sin AA** — 4.12:1 el subtítulo del hero sobre
  negro y 2.92:1 el de la tarjeta. El acento se queda donde pasa (el H1, que es
  texto grande con 4.12 ≥ 3.0, y los rellenos) y el copy pequeño va en blanco.
  `#888` de la descripción de ficha → `#767676` (4.54:1, el gris más claro que
  llega a AA sobre blanco).
- **Iris: texto del hero sobre el vídeo.** Esto el auditor NO lo ve (fondo =
  imagen). Medido sobre píxeles reales con el texto oculto: media 4,93:1 pero
  **1:1 en las zonas claras del fotograma**. Velo inferior en `.iris-hero::before`
  y re-medido siguiendo el bbox vivo de la caption en cada posición de scrub:
  peor caso **5,62:1** en todos los fotogramas en los que está en pantalla.
- **Iris sin landmark `main`** (el tema es inmersivo y no monta el SiteHeader).
- **`select#orden` sin foco visible en 4 temas**: `focus:outline-none` (utilidad
  de Tailwind, capa utilities) pisaba el `:focus-visible` de marca de
  `global.css`. Retirado en las 7 superficies donde estaba — el anillo de marca
  solo sale con teclado, que es justo lo que se quería.
- **Carrito: la CTA «Tramitar pedido» era ilegible** (blanco sobre `bg-muted`,
  1.1:1) mientras el pedido no fuese tramitable — que es el estado en el que
  aterriza un carrito recién llenado, antes de meter el CP. El color de texto
  ahora se conmuta con el fondo.
- **Minimal sin H1** y **desbordamiento horizontal a 375** en Minimal y Launch
  (el formulario de orden no cabía y no envolvía).
- **`aria-current` ausente** en el nav de tienda, en las categorías de la
  genérica y en el pie de Minimal.
- **Launch: el enlace de la miniatura de la barra fija no tenía nombre**
  (su única cría es una imagen decorativa).

Dos correcciones al propio auditor, cazadas por desconfiar de sus verdes: el
sembrado de `localStorage` no cuajaba (se escribía sobre `about:blank`, origen
opaco) y **se estaba auditando el carrito vacío en las 6 tiendas**; y el área
táctil marcaba falsos positivos hasta implementar la excepción de espaciado.
Se añadió `carrito@activo`, que rellena el CP, espera la cotización y **falla si
no alcanza el estado esperado** en vez de auditar otra pantalla y cantar ✓.

Verificado: 66/66 superficies, `pnpm check` (148 tests, 0 errores), E2E de compra
completo (27 checks) y revisión visual a 1440 y 375.

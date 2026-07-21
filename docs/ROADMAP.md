# ROADMAP — LogicEcom (ecom.logic2b.com)

> **Renombrado 2026-07-20:** el producto pasa a llamarse **LogicEcom**
> (antes «Logic2B Commerce Kit»). **Logic2B** sigue siendo la agencia: aparece
> como proveedor, en el copyright y en la firma. El isotipo se retira de la
> cabecera — el producto se presenta como wordmark tipográfico.

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
| 9B | 8 tiendas distintas sobre un solo motor | 🟡 En curso | 2026-07-21 | **9B.0, 9B.1 y 9B.2 hechos.** Migración 0002 (colecciones + capacidades opcionales), `shop.config` partido en motor/colección, guardarraíl del precio de oferta, y demo genérica con fixtures de backoffice en todos los estados. 144 tests. Ver «Fase 9B» |
| 10 | Documentación para el cliente | ⬜ Pendiente | — | Ver «Fase 10». Es material de venta y de entrega, no docs técnicas |
| 8 | Pulido de la demo (backlog abajo) | 🟡 En curso | 2026-07-19 | Backlog técnico agotado; solo quedan decisiones y pasos locales de Andreu (ver «Decisiones pendientes» y `docs/PROMPT_CLOUD.md`). Últimas tandas: novena (race de idempotencia en el pago, PII enumerable en `/demo/gracias`, cancelación de pedido pagado sin devolver stock), décima (la misma race en el PATCH de admin, campos vacíos guardados como 0, login sin rate limit), undécima (diagrama móvil de `/arquitectura`, hedge del plazo de entrega, tokens de tema en `/demo/reset`, terminología «envío»), duodécima (aviso de corte en pedidos del admin, cabeceras sin wrap a 375px, leftover «portes», token de radio del carrito, contraste del botón eliminar, H1 en valenciano, checklist de producción) y decimotercera (misma race de idempotencia en `checkout.session.expired`, divisa hardcodeada a EUR fuera de Stripe, cobertura de test de `quoteCart`/PATCH admin/emails) y decimocuarta (config parcial de Stripe → cobro sin cumplimiento, emails duplicados bajo concurrencia, `payment_status` del webhook, color de marca centralizado en `shop.config.ts`, contraste/tema en carrito y checkout) — ver sección «Fase 8» |

## Repo y entornos

- GitHub: `https://github.com/amariner/logic2b-ecom` (rama `main`).
- Cloudflare: **en producción** — Worker `ecom-logic2b` en https://ecom.logic2b.com, D1 remota `ecom-demo` (`7ae9b06d-3664-4790-a87c-04bb4c67e97a`), cron reset cada 6 h, cuenta marinerandreu@gmail.com.

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
- **`src/lib/collections.ts`** — registro. La colección activa sale SIEMPRE del
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
- **Pendiente de despliegue**: el nuevo seed vive en el worker; para que el reset
  en producción (botón + cron) genere estas fixtures hace falta desplegar primero.
  Se deja para el OK de Andreu (la rama aún no está en `main`).

### Pendiente en la Fase 9B

- **9B.3** — Scaffold de tema (`pnpm new:theme <id>`) y checklist de entrega.
- **9B.4** — Rutas `/demo/tiendas/[collection]/…`, carrito/checkout/gracias
  compartidos bajo la colección, borrado del selector con cookie y de
  `active-theme.ts`, y re-hospedaje de los 4 temas existentes **con pasada de
  fidelidad contra su screenshot** (se construyeron contra la descripción, no como
  réplica).
- **9B.5** — Imaginería en sesión LOCAL (el CDN de Higgsfield está bloqueado en
  cloud). ~94 piezas finales, 140–190 generaciones con retries. **Falta cerrar
  créditos disponibles con Andreu.**
- **9B.6** — Un tema por sesión, con su catálogo y sus fotos.
- **9B.7** — `/estilos` enlazando a las 8 tiendas reales.
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
| 02 | Industrial | TAGARNO | ⬜ pendiente |
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
- ⚠️ **Tres temas piden datos que el modelo no tiene** (Industrial, Natural,
  Specs). Cualquiera es migración de D1 = backend compartido → **consultar antes
  de implementar**. Alternativa barata: derivarlos del seed sin tocar el esquema.
- ⚠️ **Deriva de componentes.** 7 temas × 6 componentes = 42 ficheros si se
  implementa todo. Mitigación: herencia de Base, implementar solo lo que el tema
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

## Cómo retomar una sesión

1. `cd /Users/es00500546/Desktop/Proyectos/ecom.logic2b.com`
2. Leer `CLAUDE.md` y este ROADMAP.
3. Continuar la primera fase en ⬜, respetando: una fase por sesión, commit al final, actualizar esta tabla, esperar OK antes de la siguiente.

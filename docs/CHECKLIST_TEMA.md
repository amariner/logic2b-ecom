# CHECKLIST DE TEMA — sesión de desarrollo de una tienda del escaparate

> Derivado de las 4 sesiones ya hechas (Minimal, Editorial, Launch, Guide).
> Corto y real: si un paso no aplica, táchalo, no lo borres.

## 0. Antes de empezar

- [ ] `git fetch` y comprobar divergencia con `origin/main` (hay sesiones cloud).
- [ ] Leer `docs/PROMPT_9B3.md` (frontera motor/tema y gotchas) y la ficha del
      tema en `docs/TEMAS.md § 5`.
- [ ] **Abrir la captura** `public/images/referencias/??-<id>.webp` y tenerla al
      lado toda la sesión. El criterio es **RÉPLICA**, no «inspirado en».
- [ ] `pnpm new:theme <id>` si el esqueleto no existe (idempotente: re-ejecutarlo
      no pisa nada).

## 1. Colección y catálogo

- [ ] `src/collections/<id>.ts`: nombre de tienda (**confirmado por Andreu**),
      tagline, description y categorías reales.
- [ ] `seed/collections/<id>.ts`: catálogo completo (reparto de
      `ROADMAP § 9B.0`), slugs **namespaceados** (`str-`, `ind-`…) — slug es
      UNIQUE GLOBAL en D1.
- [ ] `compare_at_price_cents` solo si el tema enseña ofertas, siempre
      `> price_cents` (lo valida el seed). **Jamás entra en precio/envío**: hay
      guardia estática que muerde (`tests/pricing-guard.test.ts`).
- [ ] Imágenes en `public/images/collections/<id>/<slug>.webp` (WebP optimizado;
      generación SOLO en sesión local — el CDN de Higgsfield está bloqueado en
      cloud). Receta probada: `marketing_studio_image` (tope 8 trabajos a la
      vez) → URL con `job_display` → descarga y conversión con un script tipo
      `scripts/fetch-street-images.mjs`, que usa `cwebp` y **no añade
      dependencias**. Las URL del CDN caducan: deja los ids apuntados.

## 2. Tokens y estructura

- [ ] Los 14 tokens en `src/lib/demo-themes.ts` sacados de la captura (colores
      exactos, tipografía equivalente libre si la original es propietaria).
- [ ] Descriptor `layout` fiel a la referencia.
- [ ] Componentes en `src/components/themes/<id>/` — **cero color/tamaño
      hardcodeado**: todo lee tokens. Clases Tailwind como **literales**.
- [ ] Botones de compra con data-attribute propio (`data-<id>-add`).
- [ ] Texto siempre con color semántico explícito (`text-foreground` /
      `text-muted-foreground`) y superficie dark-aware (`bg-background` /
      `bg-muted`): el `<body>` de Base lleva `bg-white text-gray-900` fijos y NO
      se «arregla» desde un tema.
- [ ] Acento claro (amarillo, neón…): regla con scope
      `[data-store-theme='<id>']` en `global.css` **sin `@layer`** para el texto
      `.text-brand` (ver Guide). El test de contraste solo mide el par de
      relleno.
- [ ] ¿Token nuevo? = `THEME_VARS` + los 9 temas + script anti-flash de
      `Shop.astro` (hay tests que lo fijan). Evitarlo si se puede.

## 3. Verificación (todas, siempre)

- [ ] `pnpm build` tras cada cambio (`wrangler dev` sirve `dist/`, no recarga).
- [ ] Si se resiembra: **parar `wrangler dev` antes** de `pnpm db:reset` (si no,
      rompe el binding de D1 y todo da 500).
- [ ] Navegador: catálogo (prístino y filtrado), búsqueda sin resultados, ficha,
      carrito con portes reales, checkout — a **1440px, 375px y modo oscuro**
      (`.dark` forzada en `<html>`).
- [ ] `node scripts/a11y-audit.mjs --only=<id>` en verde (contra `wrangler dev`).
      Barre catálogo/ficha/carrito/checkout a 1440, 375, oscuro y reduced-motion.
- [ ] `pnpm check` en verde (types + tests + build).

### Lo que el auditor NO puede ver (revisión a ojo, siempre)

- **Texto sobre foto o vídeo.** El contraste no es computable desde el DOM y el
  auditor lo salta. Si el tema pone copy encima de imaginería, necesita velo
  (`::before` con gradiente) o plancha, y hay que **medirlo sobre los píxeles
  reales**, no estimarlo: capturar con el texto oculto y mirar el peor píxel del
  recuadro, no la media (Iris daba 4,93:1 de media y 1:1 en las zonas claras).
  Si el fondo se mueve (scrub, autoplay), medir **varios fotogramas** siguiendo
  la posición viva del texto — un recuadro fijo mide otra cosa.
- **Dale al auditor un fondo que pueda leer.** Calcula el fondo efectivo
  recorriendo el `background-color` computado de los ancestros: un degradado es
  `background-image` y le resulta INVISIBLE. Si pones copy sobre una plancha, la
  plancha va como `background-color` sólido del bloque de texto — no como
  degradado en un `::before` del padre, o cantará 1:1 donde en pantalla hay 13:1
  (Street). Los degradados, para las zonas sin texto.
- **Reglas generales del tema que pisan a las de componente.** `.tema :where(a)`
  se queda en (0,3,0) tras el scoping de Astro y gana a `.tema-x__btn` (0,2,0):
  así se perdía el `color:#fff` del botón del hero de Iris y el rótulo salía
  acento sobre acento. Las normalizaciones del tema van **enteras** dentro de
  `:where(...)` para que su especificidad sea 0.

## 4. Cierre

- [ ] Ficha de entrega `docs/temas/<id>.md` rellenada — **incluido el coste**:
      ficheros tocados y si hizo falta rozar el motor (**debe ser NO**; si fue
      sí, va al ROADMAP como deuda de motor).
- [ ] Estado del tema a `'ready'` en `demo-themes.ts` solo si está completo.
- [ ] **La tienda entra en los cinco sitios donde el orden es explícito**, o
      queda a medias: `catalogViews` (`CatalogPage.astro`), `STORES` de
      `scripts/a11y-audit.mjs`, `STORES`+`FICHAS` de `capture-screens.mjs` (y
      ejecutarlo: `/estilos` enseña la captura y sin ella sale rota),
      `SWITCHER_ORDER` (`Shop.astro`) y `galleryOrder` (`index.astro`).
- [ ] Actualizar `docs/ROADMAP.md` (estado + resumen con fecha).
- [ ] Commit en inglés, resumen breve y **parar para OK de Andreu**.

## La frontera (recordatorio)

Un tema toca SOLO: tokens/`layout`, `src/components/themes/<id>/`,
`src/collections/<id>.ts`, `seed/collections/<id>.ts`, imágenes y copy.
Si algo no cabe ahí, es motor: **parar y consultar** — y si procede, arreglarlo
en el motor para todos, nunca en el tema.

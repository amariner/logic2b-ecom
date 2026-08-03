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
- [ ] **Puente hacia la demo funcional visible.** Todas las páginas del tema se
      montan con `Shop.astro` y conservan `DemoJourneyBanner`: una carcasa puede
      tener productos estáticos distintos de D1, pero siempre muestra el enlace
      `Gestor tienda` hacia `/demo/admin`. Ningún CSS del tema
      puede ocultar `[data-demo-journey]`.
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
- [ ] Recorrido comercial: desde la franja se entiende que el tema es una
      propuesta de presentación sobre el mismo motor y se puede abrir el
      `Gestor tienda`, aunque los catálogos de muestra no coincidan.
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
- **Un control que solo aparece al pasar el ratón se oculta con
  `visibility: hidden`, no con `opacity: 0`.** Con opacity sigue siendo destino
  de tabulación y blanco de clic invisible, y el auditor lo canta con razón
  (contraste 1,00:1: texto a alfa 0 sobre su propio fondo — multiplica el alfa
  del texto por la `opacity` del elemento). Con `visibility` no existe hasta que
  se revela, y el teclado sigue llegando por `:focus-within` del contenedor
  (enfocas el enlace de la tarjeta → el botón se hace visible → el siguiente
  tabulador entra). Y el equivalente táctil va con
  `@media (hover: none), (pointer: coarse)`, las dos condiciones (Industrial).
- **Una tarjeta, UN enlace.** Poner un `<a>` en la foto y otro en el nombre hace
  que cada producto suene DOS veces en un lector de pantalla, y esconder el de la
  foto con `aria-hidden` + `tabindex="-1"` no arregla nada: un `<a href>` sigue
  siendo enfocable por programa y el auditor lo canta (48 errores en Natural). Se
  resuelve con **área extendida**: la foto es un `<img>` a secas y el enlace del
  nombre estira un `::after` transparente (`position: absolute; inset: 0`) sobre
  toda la tarjeta, que va `position: relative`. **Y el botón de compra necesita
  `z-index` por encima de ese `::after`**, o el área extendida se come el clic y
  «Añadir» acaba navegando a la ficha. Eso se verifica con hover y clic REALES en
  headless (`Input.dispatchMouseEvent` + `elementFromPoint`), no razonando sobre
  la cascada — y no con las browser tools si el panel está oculto, porque
  entonces no hay hit-testing y `elementFromPoint` devuelve `null` siempre.
- **Reglas generales del tema que pisan a las de componente.** `.tema :where(a)`
  se queda en (0,3,0) tras el scoping de Astro y gana a `.tema-x__btn` (0,2,0):
  así se perdía el `color:#fff` del botón del hero de Iris y el rótulo salía
  acento sobre acento. Las normalizaciones del tema van **enteras** dentro de
  `:where(...)` para que su especificidad sea 0.

### Gotchas de Astro y CSS ya pagados (no volver a descubrirlos)

- **`<=` o `<` dentro de una expresión JSX rompe el build**: Astro lo parsea como
  apertura de etiqueta («Unable to assign attributes when using <> Fragment
  shorthand»). Cualquier comparación así va en el frontmatter, no en la
  plantilla (Industrial).
- **Un comentario `{/* */}` como hermano dentro de `{cond && ( … )}`** también
  rompe el build (Street).
- **Y un `{/* */}` DENTRO de la lista de atributos de un elemento** compila y
  despliega tan tranquilo, pero revienta `astro check` con «Unterminated string
  literal» **apuntando tres líneas más abajo**, al cierre del elemento. Los
  comentarios de un atributo van encima de la etiqueta, nunca entre atributos
  (F11.8d).
- **`aspect-ratio` no manda sobre un flex item cuyo hijo lleva `height: 100%`**:
  el alto lo acaba fijando el contenido (una imagen 800×800) y la relación de
  aspecto no llega a aplicarse. La imagen va `position: absolute; inset: 0` para
  salir del flujo (Industrial).
- **`-webkit-text-stroke` con `currentColor` sobre `color: transparent`** deja el
  trazo invisible (Street).

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
- [ ] **Las capturas de la galería del héroe van en dos anchos** (`-560` y
      `-900`): las genera `capture-screens.mjs` sola con `card: true`, pero si
      se añaden a mano hay que hacer las dos — la landing las sirve con
      `srcset` y le falta una en cuanto se olvide (F11.8c).
- [ ] `node scripts/lighthouse.mjs --runs=3 --only=home --write` si la tienda
      entra en la galería del héroe: nueve capturas más pesan, y la landing es
      la página que se cita.
- [ ] Actualizar `docs/ROADMAP.md` (estado + resumen con fecha).
- [ ] Commit en inglés, resumen breve y **parar para OK de Andreu**.

## La frontera (recordatorio)

Un tema toca SOLO: tokens/`layout`, `src/components/themes/<id>/`,
`src/collections/<id>.ts`, `seed/collections/<id>.ts`, imágenes y copy.
Si algo no cabe ahí, es motor: **parar y consultar** — y si procede, arreglarlo
en el motor para todos, nunca en el tema.

# Tema street — ficha de entrega

Tienda **ASFALTO** (running y streetwear urbano). Entregado el 2026-07-25 en
sesión local. Réplica de la referencia *Up There Athletics*.

- **Referencia:** `public/images/referencias/08-street.webp`
- **Colección:** `src/collections/street.ts` — nombre de tienda: **ASFALTO** ☑
- **Catálogo:** 12 productos (reparto de ROADMAP § 9B.0) · slugs `str-*` ·
  4 categorías (calzado, prendas, mallas y shorts, complementos)
- **Imaginería:** ☑ generada con Higgsfield (`marketing_studio_image`, sesión
  LOCAL) · ☑ optimizada a WebP con `cwebp` (sin dependencias npm nuevas)

## Qué se replicó y qué no

| Elemento de la referencia | Estado |
|---|---|
| Ticker verde neón en marquesina | ✅ CSS puro, para con `prefers-reduced-motion` |
| Hero a sangre con copy superpuesto | ✅ con velo medido (ver abajo) |
| **Header DEBAJO del hero** | ✅ vía `nav: 'immersive'` |
| 3 tarjetas editoriales de categoría | ✅ enlazan a categorías reales |
| Cabecera de sección centrada con glifo | ✅ `⚡ Lo último`, `❋ Club House` |
| Rejilla densa de 5 columnas | ✅ 5 → 4 → 3 → 2 por breakpoints explícitos |
| `Sold Out` | ✅ stock del fixture embebido (2 productos a 0 en el seed) |
| Sección Club House tipo revista | ✅ carteles tipográficos en CSS + notas |
| Footer casi negro con columnas mono | ✅ |
| Contador `1/3` + flechas del hero | ❌ **no se replica**: sería un carrusel falso |
| `Read Full Article` de las notas | ❌ **no se replica**: no hay CMS ni artículos |
| Alta de newsletter del pie | ❌ **no se replica**: no hay lista de correo |

Las tres exclusiones son la misma decisión: la demo no finge funcionalidad
(CLAUDE.md § 14). Cada una se sustituye por algo que sí funciona — el hero lleva
un CTA al catálogo, las notas enlazan a una categoría real y el pie dice la
verdad sobre el modo demo.

## Decisión de motor consultada (§ 14 / veto del arquitecto)

La referencia pone el header **debajo** del hero, y `Shop.astro` monta el
`SiteHeader` **antes** del slot. Se paró y se consultó con Andreu (2026-07-25).
De tres opciones —tema inmersivo, header estándar arriba, o extender el motor
con un registro de chrome por tema— **eligió la inmersiva**: `nav: 'immersive'`,
que ya existía para Iris, y el tema pinta su propio chrome. **Coste conocido y
aceptado:** carrito, checkout, ficha y gracias de esta tienda se sirven con la
vista Base sin cabecera, igual que ya le pasa a Iris. El motor no se tocó.

## Contraste sobre imagen (lo que el auditor NO puede ver)

Dos superficies llevan texto sobre foto. Resueltas con velo, no estimadas:

1. **Hero.** El copy va en tinta (`#111`) sobre la columna izquierda. Sin velo,
   el indicador de scroll caía sobre el pavimento medio de la foto. Se añadió un
   velo blanco en degradado desde el borde izquierdo (`.street-hero::before`),
   que a 375 pasa a ser vertical porque ahí el copy ocupa el ancho entero.
2. **Tarjetas de categoría.** La plancha oscura va como `background-color`
   **sólido** del bloque de texto, no como degradado en un pseudo-elemento del
   padre. El motivo es de auditoría: `a11y-audit.mjs` calcula el fondo efectivo
   recorriendo `background-color`, y un degradado es `background-image`, así que
   le resultaba invisible y cantaba 1,08:1 donde en pantalla hay ~13:1. Con la
   plancha sólida, lo que mide el auditor y lo que ve el ojo coinciden — que es
   justo lo que se le pide a un auditor.

## Gotchas cazados

- **`-webkit-text-stroke: 2px currentColor` con `color: transparent`** deja el
  trazo invisible: `currentColor` resuelve al `color` computado, que es
  transparente. Va el token de tinta explícito (cartel del Club House).
- **Anclajes bajo header sticky**: `#club` y `#llegadas` necesitan
  `scroll-margin-top`, o el titular queda debajo de la barra.
- **Comentario `{/* */}` como hermano dentro de `{cond && ( … )}`** rompe el
  build de Astro (`Expected ")" but found "$$render"`). Va fuera de la expresión.
- El acento claro repite el patrón de Guide: regla `[data-store-theme='street']`
  en `global.css` **sin `@layer`** para que `.text-brand` pase a tinta en las
  superficies que sirve Base.

## Coste del tema

- **Kit de tema:** `src/collections/street.ts`, `seed/collections/street.ts`,
  `src/components/themes/street/` (9 componentes: Catalog, Ticker, Hero, Header,
  Footer, CategoryCards, ClubHouse, Filters, ProductGrid) y 16 imágenes en
  `public/images/collections/street/`.
- **Registros (los parchea `pnpm new:theme`):** `src/lib/collections.ts`,
  `seed/collections/index.ts`.
- **¿Hizo falta rozar el motor? NO.** Lo tocado fuera del kit son registros y
  utillaje, no lógica de negocio:
  - `src/components/store/CatalogPage.astro` — una línea en `catalogViews`
    (es el registro de vistas por tema, la vía prevista).
  - `src/lib/demo-themes.ts` — `status: 'ready'` y `nav: 'immersive'`.
  - `src/styles/global.css` — regla de acento claro (prevista en el checklist).
  - `src/layouts/Shop.astro` e `src/pages/index.astro` — Street entra en el
    orden del conmutador y de la galería del hero.
  - `scripts/a11y-audit.mjs` y `scripts/capture-screens.mjs` — la tienda entra
    en el barrido; `scripts/fetch-street-images.mjs` es nuevo.
- **`ProductDetail.astro` del scaffold: borrado.** Con la vista Base + tokens
  basta; mantener un stub vacío solo confunde.

## Verificación (docs/CHECKLIST_TEMA.md)

- ☑ `pnpm check` en verde (0 errores de tipos, 148 tests)
- ☑ `node scripts/a11y-audit.mjs --only=street` → **11/11 superficies en verde**
- ☑ Barrido completo de las 7 tiendas → **77/77 en verde** (sin regresión)
- ☑ `pnpm test:e2e` → aislamiento y recorrido local verificados
- ☑ 1440 px · 375 px (sin desbordamiento horizontal) · modo oscuro
- ☑ Catálogo prístino, filtrado, búsqueda sin resultados, ficha, carrito con
  portes simulados y checkout

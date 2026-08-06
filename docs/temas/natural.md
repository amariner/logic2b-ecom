# Tema natural — ficha de entrega

Tienda **ROMER** (cosmética natural, DTC). Entregada el 2026-07-25 en sesión
local. Réplica de la referencia *All Natural / AFF*. **Novena tienda viva del
escaparate.**

- **Referencia:** `public/images/referencias/03-natural.webp`
- **Colección:** `src/collections/natural.ts` — nombre de tienda: **Romer** ☑
- **Catálogo:** 12 productos (reparto de ROADMAP § 9B.0) · slugs `nat-*` ·
  4 categorías (rostro, cuerpo, cabello, kits). **Cuatro llevan
  `compare_at_price_cents`**: era la capacidad que este tema pedía y que la
  migración 0002 ya había dejado puesta. 12 no es casual: con 4 columnas
  uniformes son **3 filas exactas**, el bloque compacto de la referencia.
- **Imaginería:** ☑ 13 imágenes generadas con Higgsfield
  (`marketing_studio_image`, sesión LOCAL: 12 de producto 800×800 + 1 hero
  1376×768) · ☑ optimizadas a WebP con `cwebp`
  (`scripts/fetch-natural-images.mjs`, sin dependencias npm nuevas)

## Qué se replicó y qué no

| Elemento de la referencia | Estado |
|---|---|
| Hero **partido**: plancha blanca 45 % + foto a sangre 55 % | ✅ |
| Barra lateral de filtros con acordeón y casillas cuadradas | ✅ las casillas son enlaces que filtran de verdad |
| `Sort by Relevance ⌄` alineado a la derecha bajo el hero | ✅ `<select>` con submit nativo |
| Rejilla **uniforme** de 4 columnas | ✅ 12 productos = 3 filas exactas |
| Imagen de producto sobre gris cálido | ✅ `--surface-product: #f0f0ee` |
| Producto = **bote + su caja** en la misma foto | ✅ receta de TEMAS.md § 5 |
| Nombre a la izquierda y precio a la derecha, **misma línea** | ✅ |
| Categoría en versalitas gris bajo el nombre | ✅ sale de `collection.categories` |
| Precio anterior **tachado** + rebajado en tinta | ✅ `compare_at_price_cents` de D1 |
| Pastilla blanca con **texto rojo** `-30%` | ✅ el % se **calcula** de los dos precios |
| Botón negro a ancho completo `Add to cart` | ✅ revelado sobre la foto (ver abajo) |
| Pastilla `New` | ❌ **no se replica**: no hay fecha de alta que la sostenga |
| Facetas `Collections`, `Type`, `Price`, `Size` | ❌ **no se replican**: el catálogo tiene UN eje |
| Cabecera de tres zonas con wordmark centrado | ❌ **no se replica**: la cabecera es del motor |
| Panel lateral deslizante de producto/carrito | ❌ **no se replica**: es estructura de ficha (ver abajo) |

Las cuatro exclusiones son la misma decisión: la demo no finge funcionalidad
(CLAUDE.md § 14).

- **Las tres facetas de más son la exclusión que importa.** Dibujarlas es
  trivial —son casillas— y por eso mismo es la tentación: cuatro acordeones
  llenos quedan mejor en una captura que uno. Pero `products` tiene UN eje de
  clasificación, así que `Type` o `Size` serían casillas que no filtran nada, en
  la pieza que vendemos precisamente como «esto funciona de verdad». Añadirlas
  en serio es esquema y motor: se para y se pregunta, no se simula.
- **La pastilla `New`** necesitaría una fecha de alta que el modelo no tiene
  (mismo criterio que Industrial). La de oferta sí se queda porque sale de dos
  precios reales, y el porcentaje se calcula: si el seed cambia un precio, la
  pastilla cambia sola y **nunca puede mentir**.
- **La cabecera de tres zonas** habría obligado a irse a `nav: 'immersive'` y
  dejar carrito, checkout y ficha sin cabecera, como Iris y Street. No se paga
  ese peaje una tercera vez por un detalle de marca.
- **El panel lateral** es estructura de FICHA, y hoy la ficha la sirve Base para
  los nueve temas. Un panel propio es un registro nuevo en el motor: queda
  anotado como candidato, no se cuela en una sesión de tema.

### Comprar desde la rejilla, resuelto

En la referencia la tarjeta **no tiene botón**: se compra desde el panel
lateral, que es justo lo que no se replica. Para no dejar la rejilla sin acción
se toma el botón negro a ancho completo de ese panel y se revela sobre la foto.
Se oculta con **`visibility: hidden`, no solo con `opacity: 0`** (la lección que
pagó Industrial: con opacity sigue siendo destino de tabulación y blanco de clic
invisible, y el auditor lo canta con 1,00:1). Se revela por ratón
(`.nat-card:hover`), teclado (`:focus-within`) y táctil
(`@media (hover: none), (pointer: coarse)`). **«Agotado» nunca se esconde.**

### Un enlace por tarjeta, no dos (48 errores del auditor)

La primera versión de la tarjeta tenía **dos** `<a>` al mismo producto: el de la
foto, oculto con `aria-hidden="true"` + `tabindex="-1"`, y el del bloque de
texto. El auditor cantó **48 errores** de `aria-hidden-focusable` y tenía razón:
un `<a href>` sigue siendo enfocable por programa aunque salga del orden de
tabulación, y un producto que suena dos veces en un lector de pantalla es
exactamente lo que la regla persigue.

Arreglado con **área extendida**: la foto es un `<img>` a secas y el enlace del
nombre estira un `::after` transparente (`position: absolute; inset: 0`) sobre
toda la tarjeta. Una parada de teclado y un nombre accesible por producto, y la
foto se sigue clicando. **Gotcha que viene con el patrón:** el botón necesita
`z-index` por encima de ese `::after` o el área extendida se lo come y «Añadir»
acabaría navegando a la ficha. Verificado con hover y clic reales en Chrome
headless: `elementFromPoint` devuelve el botón, el carrito recibe la línea y la
URL no cambia.

## El dato que el tema pedía: `compare_at_price_cents`

Es **SOLO presentación**. No se cobra, no cuenta para el umbral de envío gratis
y no entra en ningún email. La guardia estática de `tests/pricing-guard.test.ts`
muerde si se cuela en la ruta de cobro. El seed además valida que sea un entero
**mayor** que `price_cents`, así que un descuento negativo no puede sembrarse.

Cuatro productos en oferta (-20 %, -21 %, -30 % y -30 %), uno a `stock: 0` y dos
a stock bajo: «Agotado» y el aviso de últimas unidades salen de D1, no de una
etiqueta decorativa.

## Coste del tema

- **Ficheros nuevos:** `src/collections/natural.ts`, `seed/collections/natural.ts`,
  `src/components/themes/natural/{Catalog,Hero,Filters,ProductGrid}.astro`,
  `scripts/fetch-natural-images.mjs`, 13 imágenes.
- **Ficheros tocados (registro, orden explícito):** `demo-themes.ts`
  (`status: 'ready'`), `CatalogPage.astro` (`catalogViews`), `Shop.astro`
  (`SWITCHER_ORDER`), `index.astro` (`galleryOrder`), `a11y-audit.mjs` y
  `capture-screens.mjs` (`STORES`/`FICHAS`), `seed/collections/index.ts`,
  `src/collections/index.ts`.
- **¿Hizo falta rozar el motor?** **NO.** Ni un token nuevo, ni una línea de
  lógica compartida. Los tokens del tema ya estaban declarados desde 2026-07-20
  y no hubo que corregir ninguno mirando la captura.
- El stub `ProductDetail.astro` que genera `pnpm new:theme` se **borra**: con la
  ficha Base + tokens basta (misma decisión que Industrial y Street).

## Verificación (docs/CHECKLIST_TEMA.md)

- ☑ `pnpm check` en verde (148 tests, 0 errores de tipos, build)
- ☑ `pnpm test:e2e`: aislamiento y recorrido local verificados
- ☑ `node scripts/a11y-audit.mjs --only=natural` → **11/11 superficies**
- ☑ Barrido completo → **99/99 superficies** (las 8 tiendas anteriores no regresan)
- ☑ 1440 px · 375 px · modo oscuro (`.dark` forzada)
- ☑ Catálogo (prístino, filtrado y sin resultados), ficha, carrito y checkout
- ☑ Contraste AA — el rojo de la pastilla sale de `--color-destructive`, que en
  claro es oscuro (4,8:1 sobre blanco) y en oscuro es claro: el par aguanta en
  los dos modos sin escribir un rojo literal.
- ☑ Texto sobre foto: **no hay**. El copy del hero vive en la columna blanca de
  al lado, que es lo que hace la referencia y lo que evita el problema que el
  auditor no sabe ver (el caso de Iris).

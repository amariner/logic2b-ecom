# Tema industrial — ficha de entrega

Tienda **METRIA** (instrumentación de inspección y medida). Entregada el
2026-07-25 en sesión local. Réplica de la referencia *TAGARNO*.

- **Referencia:** `public/images/referencias/02-industrial.webp`
- **Colección:** `src/collections/industrial.ts` — nombre de tienda: **METRIA** ☑
- **Catálogo:** 10 productos (reparto de ROADMAP § 9B.0) · slugs `ind-*` ·
  4 categorías (visión e inspección, soportes y mesas, iluminación, ópticas y
  accesorios). **Los 10 llevan `subtitle`**: era la capacidad que este tema pedía
  y que la migración 0002 ya había dejado puesta.
- **Imaginería:** ☑ 10 imágenes generadas con Higgsfield
  (`marketing_studio_image`, sesión LOCAL) · ☑ optimizadas a WebP con `cwebp`
  (`scripts/fetch-industrial-images.mjs`, sin dependencias npm nuevas)

## Qué se replicó y qué no

| Elemento de la referencia | Estado |
|---|---|
| Barra de miga a ancho completo en azul eléctrico | ✅ navegación real |
| Rejilla SIN gap, celdas separadas solo por filete | ✅ sin doble línea ni marco |
| Rejilla irregular con celda de 2 columnas | ✅ **dos** celdas dobles (índices 0 y 5) |
| Tarjeta `divided`: imagen / datos separados por filete | ✅ |
| Subtítulo técnico en gris bajo el nombre | ✅ columna `subtitle` de D1 |
| Botón azul de compra que **aparece al pasar el ratón** | ✅ con equivalente táctil |
| Pastilla azul arriba a la izquierda | ✅ pero dice «Últimas N» (ver abajo) |
| Franja azul a ancho completo bajo la rejilla | ✅ con función real (ver abajo) |
| Pie negro | ✅ vía `layout.darkFooter` (cambio de motor, ver abajo) |
| Radio 0 en todo salvo pastillas | ✅ `--radius-card: 0` · `--radius-btn: .25rem` |
| Fondo de celda que alterna blanco/gris imperceptible | ⚠️ se resuelve al revés: la celda reacciona al hover (ver abajo) |
| `Load more` azul | ❌ **no se replica**: no hay paginación que cargar |
| Hamburguesa ☰ y hora local del comercio | ❌ **no se replica**: viven en la cabecera del motor |
| Pastilla `New` | ❌ **no se replica**: no hay fecha de alta que la sostenga |
| 3 columnas de enlaces del pie | ❌ **no se replica**: no tienen destino en la demo |

Las cuatro exclusiones son la misma decisión: la demo no finge funcionalidad
(CLAUDE.md § 14). Y cada una se sustituye por algo que sí funciona:

- **La franja azul se queda** porque es el remate visual de la referencia, pero
  hace algo verdadero: con filtro o búsqueda activa **enlaza** al catálogo
  completo, y sin filtro dice cuántas referencias hay. El número sale de D1.
- **La pastilla azul se queda** y dice «Últimas 2», «Últimas 4»… con el stock
  real. Dos productos van a `stock: 0` en el seed para que «Agotado» también
  salga de la base y no de una etiqueta pintada.
- **La hora local** habría obligado a irse a `nav: 'immersive'` y dejar carrito,
  checkout y ficha sin cabecera, como Iris y Street. No se paga ese peaje una
  tercera vez por un detalle de marca.

### El hover-para-comprar, resuelto (riesgo 4 de TEMAS.md § 8)

El botón se oculta con **`visibility: hidden`, no solo con `opacity: 0`**. Con
opacity el botón seguía siendo un destino de tabulación y un blanco de clic
invisible, y el auditor lo cazaba con razón (contraste 1,00:1: texto a alfa 0
sobre su propio fondo). Con `visibility` no existe hasta que se revela, y se
revela por tres caminos:

- **ratón**: `.ind-cell:hover`, como en la referencia;
- **teclado**: `.ind-cell:focus-within` — al enfocar el enlace de la tarjeta el
  botón se hace visible y el siguiente tabulador entra en él;
- **táctil**: `@media (hover: none), (pointer: coarse)` → siempre visible.

El estado «agotado» **nunca** se esconde: se tiene que leer sin pasar el ratón.

### El hover de la celda, invertido a propósito

En la referencia la celda va de gris casi imperceptible a blanco. Aquí va de
`--color-background` a `--color-muted`, que es lo contrario en claro y lo mismo
en oscuro: `muted` es más claro que el fondo en modo oscuro, así que en los dos
modos la celda **se ilumina**, que es la señal que importa. La alternativa
(gris fijo → blanco) habría dejado la rejilla en blanco sobre página oscura.

## Cambio de MOTOR consultado (§ 14 / veto del arquitecto)

El pie negro es uno de los cinco rasgos firma de la referencia, y con `nav: 'top'`
el pie lo monta `Shop.astro`, no el tema. Se paró y se consultó con Andreu
(2026-07-25), que delegó la decisión. De tres opciones —renunciar al pie negro,
tema inmersivo, o que el motor honre el descriptor— se eligió la tercera:

**`Shop.astro` ahora lee `theme.layout.darkFooter`.** El campo estaba declarado
y documentado en el descriptor desde 2026-07-20 («Footer oscuro a sangre vs.
footer claro con filete») y el motor lo **ignoraba**: era configuración muerta.
Ahora pinta el MISMO pie, con el mismo contenido y los mismos enlaces, sobre
`#111111`. Coste: ~20 líneas, ningún token nuevo, y sirve a los 9 temas. Además,
el color y la superficie del pie salen de utilidades de Tailwind y pasan a CSS de
componente, para que la variante oscura no tenga que pisar clases (la trampa de
especificidad de CHECKLIST_TEMA § 3).

Verificado con el barrido completo del auditor: **88/88 superficies en verde**,
las 7 tiendas anteriores incluidas.

### Y un defecto del motor que esta tienda destapó

MV-320 es el **primer producto del escaparate con ficha técnica** en su captura,
así que su columna derecha es más alta que la imagen — y la caja de la foto, al
ser celda de un `grid` con `align-items: stretch`, se estiraba y dejaba un bloque
gris muerto debajo. Un `self-start` en `ProductPage.astro` lo arregla **para las
8 tiendas**; no era un requisito del tema, era un defecto latente del motor que
nadie había expuesto todavía.

## Contraste (lo que el auditor sí ve y lo que no)

- **#ffffff sobre #1b4dff = 5,91:1** (AA). Es el par de la miga azul, la franja y
  el botón de compra. `--color-brand-dark` (#1339cc) da 8,45:1.
- **#d4d4d4 sobre #111111 = 11,3:1** en el pie oscuro; el nombre de la tienda va
  en blanco puro (18,9:1).
- El separador `/` de la miga **no lleva `opacity`**: al 70 % se queda en ~3,4:1
  y el auditor mide color computado, no intención decorativa.
- **Nada de texto sobre foto** en este tema (no hay hero), así que no hay ninguna
  superficie que el auditor no pueda computar. Es el primero de los siete.

## Imaginería: por qué el fondo tiene que ser BLANCO PURO

La rejilla no tiene gap, así que la caja de imagen y la celda comparten el mismo
blanco y el filete es lo único que separa. **Tres imágenes salieron con fondo
#ef–#f8** y en la rejilla se veían como un recuadro gris dentro de la celda: se
regeneraron con el fondo pedido explícitamente («pure white #FFFFFF, absolutely
uniform, blown-out seamless studio white»). Los ids del CDN quedan apuntados en
el script, con la nota de por qué.

Y la caja de imagen es **cuadrada** (`aspect-ratio: 1`), no de alto fijo: una
imagen de 800×800 la llena exacta y no queda letterbox que delate el fondo. La
celda doble usa `aspect-ratio: 2` para que su alto siga cuadrando con la fila.

## Coste del tema

- **Ficheros nuevos:** `src/collections/industrial.ts`,
  `seed/collections/industrial.ts`, `scripts/fetch-industrial-images.mjs`,
  `src/components/themes/industrial/{Catalog,Breadcrumb,Filters,ProductGrid}.astro`,
  10 imágenes en `public/images/collections/industrial/`.
- **Registros tocados:** `src/lib/collections.ts`, `seed/collections/index.ts`,
  `src/lib/demo-themes.ts` (tokens + `status: 'ready'`), `catalogViews` de
  `CatalogPage.astro`, `STORES` de `a11y-audit.mjs`, `STORES`+`FICHAS` de
  `capture-screens.mjs`, `SWITCHER_ORDER` de `Shop.astro`, `galleryOrder` de
  `index.astro`.
- **¿Hizo falta rozar el motor?** **SÍ, una vez y consultado**: `Shop.astro` para
  `layout.darkFooter` (ver arriba). No es deuda pendiente: es deuda de motor
  **pagada**, con el barrido de 88 superficies como red.
- **`ProductDetail.astro` borrado**: la ficha de Base + los tokens del tema
  bastan. No hacía falta estructura propia.

## Verificación

- ☑ `pnpm check` en verde (astro check + 148 tests + build)
- ☑ `node scripts/a11y-audit.mjs --only=industrial` → **11/11**
- ☑ Barrido completo del auditor → **88/88** (sin regresión en las otras 7)
- ☑ `pnpm test:e2e` → flujo completo de compra + panel (27 comprobaciones)
- ☑ 1440px · 375px · modo oscuro · catálogo prístino, filtrado y sin resultados
- ☑ `capture-screens.mjs` con las 3 capturas nuevas (`/estilos` y la galería del
  hero de la landing ya no enseñan un hueco)

## Gotchas nuevos (van al CHECKLIST)

1. **`<=` dentro de una expresión JSX rompe el build de Astro** («Unable to
   assign attributes when using <> Fragment shorthand»): lo parsea como apertura
   de etiqueta. Cualquier comparación con `<` o `<=` va en el frontmatter.
2. **`aspect-ratio` no manda sobre un flex item cuyo hijo tiene `height: 100%`**:
   el alto lo acaba fijando la imagen y la relación de aspecto no llega a
   aplicarse (aquí la fila salía del doble de alta). La imagen va
   `position: absolute; inset: 0` para salir del flujo.

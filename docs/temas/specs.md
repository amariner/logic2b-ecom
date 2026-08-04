# Tema specs — ficha de entrega

Tienda **KALIBRE** (componentes de relojería y micromecánica, B2B). Entregada el
2026-07-25 en sesión local. Réplica de la referencia *ACF-01*. **Décima y última
tienda del escaparate: con esta, F11.2a queda cerrada.**

- **Referencia:** `public/images/referencias/05-specs.webp`
- **Colección:** `src/collections/specs.ts` — nombre de tienda: **Kalibre** ☑
- **Catálogo:** 9 productos · slugs `spe-*` · 4 categorías (platinas y puentes,
  escape y rodaje, caja y bisel, esfera y agujas). **Los nueve llevan `specs`**:
  era la capacidad que este tema pedía —la que TEMAS.md § 8 marcaba como el
  riesgo de datos más gordo de la serie— y la migración 0002 ya había dejado
  puesta la columna `specs_json`. 9 no es casual: la rejilla irregular es
  **2 + 4 + 3 = 9**, el bloque entero de la referencia sin hueco final.
- **Imaginería:** ☑ 9 macros técnicos generados con Higgsfield
  (`marketing_studio_image`, sesión LOCAL, 800×800) · ☑ optimizados a WebP con
  `cwebp` (`scripts/fetch-specs-images.mjs`, sin dependencias npm nuevas).
  Uno volvió `failed` del proveedor y se relanzó sin tocar el prompt.

## Qué se replicó y qué no

| Elemento de la referencia | Estado |
|---|---|
| Rótulo **enorme y muy apretado** arriba a la izquierda | ✅ es el H1 y dice lo que se está viendo |
| Párrafo diminuto **justificado** en gris a la derecha + filete | ✅ sale de `collection.description` |
| Cabecera de grupo `ACF-01` + `9 items` diminuto | ✅ el recuento se cuenta de D1 |
| Guion **naranja** a la derecha = plegado del acordeón | ✅ `<details>/<summary>` nativos, cero JS (ver abajo) |
| Rejilla **irregular** de verdad: filas de 2, 4 y 3 | ✅ composición fija sobre 12 columnas |
| Celda: `● Nombre` con filete debajo | ✅ el bullet se dibuja, no se escribe |
| Filas `Etiqueta — / — VALOR` con valor mono a la derecha | ✅ salen de `specs_json` vía `parseSpecs` |
| **Las specs ARRIBA de la imagen** | ✅ es el rasgo del tema |
| Escala de grises entera salvo el guion | ✅ único color de la página |
| Hoja centrada sobre fondo gris | ✅ con filete, para que funcione en oscuro |
| Anchos **desiguales** dentro de la fila de 4 | ❌ **no se replica**: medidos en la captura son iguales (206/208/208/207 px). La irregularidad real es el número de celdas por fila, no su ancho |
| Precio y botón de compra | ➕ **añadidos**: la referencia es un portfolio, no una tienda |

- **El precio entra como una fila de spec más**, bajo la imagen y con el mismo
  registro tabular (`Precio / 189,00 €`), en vez de como pastilla comercial
  pegada encima. Era la única forma de meter comercio en una hoja técnica sin
  romperla.
- **La densidad `compact` se queda en escritorio.** Era el riesgo 5 de
  TEMAS.md § 8 y se resolvió por breakpoints: 1 columna hasta 40rem, 2 hasta
  64rem y la composición irregular solo a partir de ahí. Una celda de 3/12 en un
  móvil dejaría la tabla de specs en dos palabras por línea.

## El guion naranja: por qué se DIBUJA y no se escribe

La referencia pone un `—` naranja como control de plegado. Escrito como
carácter sería **texto pequeño en acento**, y ahí `#c2410c` no llega:

| Fondo | Contraste con `#c2410c` | ¿Texto AA (4,5:1)? | ¿Gráfico (3:1)? |
|---|---|---|---|
| Hoja en claro (`#ffffff`) | **5,18:1** | ✅ | ✅ |
| Hoja en oscuro (`#0a0a0a`) | **3,82:1** | ❌ | ✅ |

Medido sobre píxeles reales en el navegador, no estimado. Por eso el control es
una **barra con `background-color`** y `aria-hidden`: como elemento gráfico de
interfaz el umbral es 3:1 y pasa en los dos modos. El nombre accesible lo pone
el `<summary>` (`ACF-01 9 componentes`), que es lo que oye un lector de pantalla.
Plegado, la misma barra gira 90°.

**Es un control de verdad, no un adorno:** `<details open>` + `<summary>`
nativos. Cero JS, cero dependencias, funciona con teclado de serie.

## Lo que el auditor NO vio (y solo se caza mirando)

**En modo oscuro la hoja quedaba negra flotando sobre un fondo CLARO.** El fondo
de página usaba `--surface-sunken`, que es un gris claro **fijo** (`#fafafa`), no
un token dark-aware. El auditor dio 11/11 en verde igualmente — y con razón: mide
contraste de TEXTO, y todo el texto vive sobre la hoja, que sí invierte. El fondo
de alrededor no tiene texto, así que no lo mira nadie salvo el ojo.

Arreglado con `--color-muted` (dark-aware) + filete en la hoja, que es lo que la
separa del fondo ahora que en claro los dos grises son vecinos.

**Patrón para lo que quede:** `--surface-product` y `--surface-sunken` son grises
FIJOS a propósito (las cajas de producto deben seguir siendo claras en oscuro,
porque la imaginería lleva el fondo claro incrustado). Eso está bien para una
caja de imagen y **mal para el fondo de una página**.

## Imaginería: por qué este tema usa `cover` y los demás `contain`

El resto de temas piden el fondo con el código exacto del token y usan
`object-fit: contain`, así que el letterbox es invisible. **Aquí no funcionó.**
Pese a pedir `#e8e8e8` explícito en los nueve prompts, el generador devolvió un
gris de estudio **distinto en cada pieza (208–229) y con degradado vertical** (la
platina va de 210 arriba a 196 abajo). Medido con `dwebp -ppm` sobre los WebP ya
escritos.

Conclusión: ningún valor de `--surface-product` podía casar, y con `contain` en
caja 4:3 se veía un recuadro más claro dentro de cada celda. Con `cover` no hay
costura, y el recorte del 12,5 % de arriba y abajo no toca ninguna pieza porque
todas están centradas con margen. Verificado a ojo en las nueve.

**Para la próxima:** si un tema necesita el fondo del token, hay que **comprobar
el píxel del fichero descargado**, no fiarse de que el prompt lo pidiera.

## Coste

Ficheros nuevos:

- `src/collections/specs.ts`
- `seed/collections/specs.ts`
- `src/components/themes/specs/` — `Catalog.astro`, `Filters.astro`,
  `ProductGrid.astro` (3 ficheros; sin `ProductDetail`: la ficha la sirve Base)
- `scripts/fetch-specs-images.mjs`
- `public/images/collections/specs/` — 9 WebP
- `public/images/screens/store-specs-*` — 3 capturas

Ficheros tocados (solo registro): `seed/collections/index.ts`,
`src/lib/collections.ts`, `src/components/store/CatalogPage.astro`,
`src/layouts/Shop.astro`, `src/pages/index.astro`, `scripts/a11y-audit.mjs`,
`scripts/capture-screens.mjs`, `src/lib/demo-themes.ts` (solo `status: 'ready'`).

**¿Hizo falta rozar el motor? NO.** Ni un token nuevo ni una línea de lógica
compartida. Los 14 tokens estaban declarados desde 2026-07-20 y `specs_json`
llega al tema porque `getActiveProducts` hace `SELECT *`. El tema que TEMAS.md
§ 8 marcaba como «el que más datos nuevos pide» acabó siendo trabajo de
presentación puro, porque la migración 0002 ya había pagado la factura.

## Verificación

- ☑ `node scripts/a11y-audit.mjs --only=specs` → **11/11**, verde a la primera
- ☑ Barrido completo → **110/110** (las 9 tiendas anteriores no regresan)
- ☑ `pnpm check` → 148 tests, 0 errores de tipos
- ☑ E2E de aislamiento y recorrido local (27 checks)
- ☑ Clic REAL en el botón «Añadir»: añade al carrito y **no navega** a la ficha
  (el `z-index` sobre el área extendida hace su trabajo)
- ☑ Rejilla verificada bajo filtro: 2 productos → `6 6`; 3 → `4 4 4`; búsqueda
  con 2 aciertos → `6 6`; búsqueda sin resultados → estado vacío. **Sin huecos en
  ninguna combinación**
- ☑ Revisión a 1440, 375 y modo oscuro · sin desbordamiento horizontal a 375
- ☑ Plegado del grupo con teclado; nombre accesible `ACF-01 9 componentes`

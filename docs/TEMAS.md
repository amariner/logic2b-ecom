# CATÁLOGO DE ESTILOS — Logic2B Ecommerce

> Documento de referencia para desarrollar los temas. Cada tema se desarrolla en
> su propia sesión; **lee este fichero completo antes de empezar uno**.
>
> Reescrito el 2026-07-20 tras observar en detalle las 8 referencias reales.
> Fuente de verdad del código: [`src/lib/demo-themes.ts`](../src/lib/demo-themes.ts).

---

## 1. Qué es esto y por qué existe

Logic2B Ecommerce vende una tienda **a medida**. El problema comercial es que «a medida»
suena caro y abstracto: el cliente no puede imaginarse su tienda. El catálogo de
estilos resuelve eso — son 19 direcciones visuales completas, cada una derivada de
una referencia real de ecommerce, entre las que el cliente elige un punto de
partida.

### La regla que no se rompe

> **Un tema es presentación y simulación local. Ninguna demo pública usa el backend.**

El catálogo se deriva del seed y se embebe en la página; carrito, portes y
confirmación viven en `localStorage`/`sessionStorage`. En `DEMO_MODE`,
`/api/cart/quote` y `/api/checkout/session` están retirados: no se crea ningún
pedido, no se descuenta stock y no se envía ningún email.

El panel `/demo/admin` es otra muestra independiente: lee fixtures de D1 y es
de solo lectura. Nunca debe reflejar una acción realizada en un escaparate.

### Un solo contrato local con muchas presentaciones

Cada tema (`/demo/tiendas/<id>`) conserva su dirección visual sobre el mismo
contrato de superficies. La demo principal es ARCE. Los importes demo parten de
`price_cents` del seed y se calculan localmente solo para ilustrar el recorrido;
no son una autorización de cobro ni una fuente de datos para el backend.

Todas las superficies conservan `DemoJourneyBanner`, montado por `Shop.astro`,
y se componen con `ProductPage`, `CartPage`, `CheckoutPage` y `ThanksPage`. La
franja ofrece el acceso al `Gestor tienda` (`/demo/admin`) y ningún tema puede
ocultarla con CSS.

---

## 2. Arquitectura de un tema

```
tema = vars (14 tokens CSS) + layout (descriptor estructural) + componentes
```

### 2.1 `vars` — tokens CSS

Lista **cerrada** (`THEME_VARS`). Un tema no puede tocar nada más: eso es lo que
impide que un tema degenere en un fork del CSS. Si un tema necesita una variable
nueva, se añade a `THEME_VARS`, **a todos los temas** y al script anti-flash de
`Shop.astro` (hay tests que lo obligan).

| Grupo | Variable | Para qué |
|---|---|---|
| Acento | `--color-brand` | color de acción (botones, enlaces, foco) |
| | `--color-brand-dark` | estado hover/active |
| | `--color-brand-fg` | **texto sobre el acento — no siempre es blanco** |
| Tipografía | `--font-display` | titulares |
| | `--font-accent` | etiquetas técnicas, numeración, refs |
| | `--tracking-display` | interletraje de titular (−0.04em … 0.02em) |
| | `--weight-display` | grosor de titular (400 … 700) |
| Forma | `--radius-btn` | radio de botón |
| | `--radius-card` | radio de tarjeta / caja de imagen |
| | `--border-width` | grosor de filete (`0px` = sin borde) |
| Superficie | `--surface-product` | fondo de la caja de imagen de producto |
| | `--surface-sunken` | fondo de sección hundida / footer claro |
| Ritmo | `--space-density` | multiplicador de padding (0.75 … 1.5) |
| | `--grid-gap` | separación de la rejilla |

> **Accesibilidad, no negociable.** `--color-brand-fg` existe porque *Guide* usa
> amarillo y *Street* verde neón: blanco encima sería ilegible. Hay un test que
> exige contraste WCAG AA (≥ 4.5) entre acento y su texto en **todos** los temas.
> Un tema que no pasa ese test no entra.

### 2.2 `layout` — descriptor estructural

| Campo | Valores | Efecto |
|---|---|---|
| `gridCols` | `2 \| 3 \| 4 \| 5` | columnas del catálogo en desktop |
| `gridStyle` | `uniform \| irregular` | celdas iguales, o con spans distintos |
| `nav` | `top \| sidebar` | dónde vive la navegación |
| `hero` | `none \| split \| card \| fullbleed` | cabecera del catálogo |
| `card` | `hairline \| plain \| elevated \| divided` | tratamiento de tarjeta |
| `filters` | `chips \| sidebar \| dropdown` | cómo se filtra |
| `density` | `compact \| regular \| airy` | densidad general |
| `annotations` | `boolean` | etiquetas mono (numeración, refs) |
| `darkFooter` | `boolean` | footer oscuro a sangre |

> **`gridStyle: 'irregular'`** significa composición explícita por breakpoint
> (celdas que ocupan 2 columnas, filas de altura distinta). **No** es
> `grid-auto-flow: dense`, que reordena los items y rompe el orden de catálogo.

### 2.3 Componentes

En `src/components/themes/<id>/`. Se crean **al desarrollar el tema**:

```
Header.astro   ProductGrid.astro   ProductCard.astro
Footer.astro   ProductDetail.astro Filters.astro
```

Los que un tema no redefina **caen al tema Base**. No hay obligación de
implementar los seis.

### 2.4 Contrato de ficha, carrito, checkout y gracias

La frontera ejecutable vive en `src/lib/storefront-contract.ts`. Los cuatro
componentes compartidos exponen:

- `data-commerce-surface` para identificar la superficie;
- `data-commerce-part` para estilizar sus bloques sin copiarlos;
- slots tipados para copy o marcado puramente visual;
- en el slot completo de ficha, los selectores tipados
  `PRODUCT_COMMERCE_SELECTORS` para cantidad y añadir al carrito.

El tema puede usar esos hooks y slots para cambiar composición, jerarquía y
tono. El componente compartido conserva el script, el carrito local, el cálculo
demo y la confirmación efímera. Si un diseño no cabe en estos puntos de extensión, se
amplía el contrato compartido para todos; nunca se crea una ruta de compra
paralela dentro del tema.

### 2.4 Los dos tipos de imagen

| Carpeta | Qué es | Campo | ¿Público? |
|---|---|---|---|
| `public/images/referencias/` | Captura del **layout** de origen | `reference.file` | ❌ Interno |
| `public/images/temas/` | **Imaginería propia** en la estética del tema | `sample` | ✅ Se enseña en `/estilos` |

`/estilos` es indexable y republicar ahí el diseño de otra tienda no procede. Lo
que se enseña es material propio generado con Higgsfield.

**Estado:** las referencias de los temas entregados y sus capturas reales de
tienda están en el repo. `/temas` prioriza esas capturas; la muestra estática es
solo el fallback de una dirección que todavía no tenga escaparate propio.

---

## 3. Cómo se desarrolla un tema (checklist de sesión)

1. **Abrir la referencia** de `public/images/referencias/` y leer la ficha de § 5.
   *No trabajar de memoria ni del resumen: mirar la imagen.*
2. **Verificar tokens.** Los de `demo-themes.ts` son una propuesta desde la
   captura; al implementar suelen necesitar ajuste. Cambiarlos ahí, nunca
   hardcodear color en un componente.
3. **Crear `src/components/themes/<id>/`** con solo lo que el tema redefine.
4. **Conectar a la simulación local compartida.** Ningún endpoint de comercio;
   cero escritura de pedido, stock o email.
5. **Pasar `status` a `'ready'`** — entra solo en el selector y en `/estilos`.
6. **`pnpm check`** en verde (incluido el test de contraste).
7. **Verificar en navegador** con `wrangler dev`: catálogo, ficha, carrito,
   checkout.
8. **Responsive y modo oscuro.** La base los soporta; el tema no debe romperlos.
9. **Comprobar el puente de demo.** La franja debe verse en catálogo, ficha,
   carrito y checkout y mostrar el enlace `Gestor tienda` a `/demo/admin`.
   Los productos de cada tema pueden ser independientes.

---

## 4. Ajuste a Logic2B UI

Todos los temas se construyen **encima** de la base Logic2B UI: shadcn/ui
neutral, Inter, tokens oklch de croma 0, radios del sistema.

**Invariante (base):** escala de grises neutra, Inter, tokens semánticos, modo
oscuro, foco visible accesible.

**Variable (tema):** acento, tipografía de titular, forma, densidad, rejilla y
estructura.

**Consecuencia:** ninguna referencia se copia literalmente. Se toma su *sistema*
—densidad, ritmo, jerarquía, tratamiento de producto— y se reconstruye en Inter +
neutros. Teenage Engineering en Logic2B UI no es Teenage Engineering: es su
lógica editorial con nuestra tipografía y nuestros grises.

---

## 5. Los temas

> Cada ficha enlaza **la imagen que hay que abrir** antes de tocar código.

---

### 01 · Editorial — *Teenage Engineering*

📎 **Referencia: [`01-editorial.webp`](../public/images/referencias/01-editorial.webp)** · original: `tienda de musica.jpg`
🖼️ Muestra: [`temas/editorial.webp`](../public/images/temas/editorial.webp)

**Para quién:** diseño y objeto, audio y tecnología, marcas con voz propia.

**Estructura observada**
- La página vive en una **hoja blanca flotando sobre gris claro**, con margen
  visible a los lados. No es full-bleed.
- **Numeración de sección en superíndice**: `Store⁽⁰³⁾`, `EMS⁽⁰⁴⁾`, `News⁽⁰⁵⁾`.
- **Rejilla irregular**: no es 4×N uniforme. Hay una celda alta que ocupa 2 filas
  (el sintetizador), celdas anchas, y columnas de 2 apiladas. Composición
  explícita, no automática.
- **Párrafo con sangría escalonada**: cada línea del bloque de texto se indenta
  progresivamente. Es de lo más reconocible del estilo.
- **Palabras sueltas flotando** arriba a la derecha, a distintas alturas:
  `innovative.` `portable.` `stylish.`
- Etiqueta en corchetes gris: `[vision]`.
- **Texto vertical rotado 90° en rojo** por los márgenes izquierdo y derecho —
  una lista de cursos repetida como textura tipográfica.
- Sección EMS: foto centrada con **texto diminuto formando un patrón de
  «skyline»** debajo — tipografía densa como recurso gráfico.
- Tarjeta de producto: imagen sobre gris muy claro, nombre abajo a la izquierda
  (pequeño), precio debajo en gris más claro, **`+` en la esquina inferior
  derecha**.
- Botones `Explore`: naranja, rectangulares, radio mínimo, pequeños.
- News: fila de 3-4 tarjetas con imagen + titular + fecha, flechas `‹ ›`.

**Notas de implementación**
- El `+` es **añadir al carrito real**, no decoración.
- El texto vertical rotado: **un solo eje y con moderación**. Debe ser
  `aria-hidden` — es textura, no contenido, y un lector de pantalla leyéndolo
  sería ruido puro.
- La sangría escalonada se hace con `text-indent` por línea o `::first-line`; no
  merece JS.
- `compact` a 375px: romper a 2 columnas, no a 4.

**Recursos:** producto sobre hueso claro, luz suave cenital, sombra corta.
Escena monocroma salvo el naranja.

---

### 02 · Industrial — *TAGARNO*

📎 **Referencia: [`02-industrial.webp`](../public/images/referencias/02-industrial.webp)** · original: `tienda de electronica.jpg`
🖼️ Muestra: [`temas/industrial.webp`](../public/images/temas/industrial.webp)

**Para quién:** B2B y maquinaria, suministro industrial, catálogos con ficha
técnica.

**Estructura observada**
- Header: **hamburguesa ☰ a la izquierda** incluso en desktop, wordmark en
  mayúsculas con tracking, nav mínima (`Catalogue`). Derecha: **hora local**
  (`6:03 PM - UA`), lupa, `Cart — 0`.
- **Barra de miga a ancho completo en azul eléctrico**, texto blanco:
  `Catalogue / All`.
- **Rejilla sin gap**: las celdas se tocan y se separan **solo por filete**. Da
  sensación de tabla técnica.
- **Rejilla irregular**: el monitor de la fila 3 **ocupa 2 columnas**.
- Fondo de celda alterna sutilmente entre blanco y gris casi imperceptible.
- Tarjeta: imagen centrada grande, y abajo a la izquierda nombre + **subtítulo
  de especificación en gris** (`330x magnification`) + precio.
- **En hover**: la celda se vuelve blanca y aparece el botón azul `Add to cart`
  abajo a la derecha, alineado con el precio.
- Badge `New`: pastilla azul pequeña arriba a la izquierda.
- **`Load more` a ancho completo en azul**, texto blanco centrado.
- **Footer negro** en tres bloques: barra superior (wordmark, copyright, cookie
  policy, selector de país con bandera), zona central con **3 columnas de
  enlaces**, y barra inferior con miga y crédito.
- Radio 0 en todo salvo pastillas de badge/botón.

**Notas de implementación**
- El subtítulo técnico **necesita un campo que hoy no existe**. En la demo se
  deriva del seed; una tienda real puede modelarlo después.
- La rejilla sin gap con filete: filete a derecha y abajo, y quitarlo en el borde
  exterior. Cuidado con el doble filete en las esquinas.
- La hora local es un detalle de marca B2B; si se implementa, que sea la del
  comercio, no la del visitante.
- El hover que revela el botón **necesita equivalente táctil**: en móvil el botón
  debe estar siempre visible.

**Recursos:** instrumento técnico sobre blanco puro, luz plana neutra, sin sombra
dramática. Estética de catálogo de fabricante.

---

### 03 · Natural — *All Natural (AFF)*

📎 **Referencia: [`03-natural.webp`](../public/images/referencias/03-natural.webp)** · original: `tienda de cremas.jpg`
🖼️ Muestra: [`temas/natural.webp`](../public/images/temas/natural.webp)

**Para quién:** cosmética y cuidado personal, alimentación, marcas DTC.

**Estructura observada**
- El DTC clásico bien hecho. Es el tema **más convencional**, y eso es virtud:
  convierte.
- Header de tres zonas: nav a la izquierda (`Collections Products Brand Journal`),
  **wordmark centrado** (`All Natural™`), acciones a la derecha (`Account Search
  Bag (4)`). Tipografía muy fina y pequeña.
- **Hero partido**: izquierda blanca con `Shop All` + 2 líneas de descripción;
  derecha, **foto lifestyle a sangre** ocupando ~55% del ancho.
- `Sort by Relevance ⌄` alineado a la derecha bajo el hero.
- **Sidebar de filtros** con acordeones: `Filter (0)`, Collections (New Arrivals,
  Bestsellers, On Sale, Kits, Giftcards), Category, Type, Price ⌄, Size ⌄.
  Checkboxes cuadrados vacíos.
- Rejilla 4 columnas **uniforme**, imagen sobre gris cálido claro.
- Producto = **bote + su caja** juntos en la misma foto.
- Badges arriba a la derecha: `New` (pastilla blanca, filete fino) y `-30%`
  (pastilla blanca con **texto rojo**).
- Bajo la imagen: **nombre a la izquierda y precio a la derecha en la MISMA
  línea**; debajo, categoría en versalitas gris (`SKIN`, `HAIR`).
- En oferta: precio original **tachado en gris** + precio rebajado en negro.
- **Panel lateral de producto/carrito** (tarjeta flotante independiente):
  cabecera `Menu · All Natural™ · Bag (2)`, imagen grande con **paginación de 4
  puntos**, categoría en versalitas, título, precio + tachado, descripción,
  `Size` con pastilla `100 ml` seleccionada, **stepper `− 1 +`** en caja con
  filete, y botón **negro a ancho completo** `Add to cart`.

**Notas de implementación**
- El descuento usa `compare_at_price_cents` del seed únicamente como dato visual
  de la demo.
- El panel deslizante debe ir sin framework: `<dialog>` o detalle progresivo.
- Único tema junto con Minimal que no usa chips de filtro.

**Recursos:** bote blanco mate + caja de color (teal, oliva, arena, rojo) sobre
gris cálido, luz difusa suave, sombra hacia la derecha.

---

### 04 · Guide — *Pour over*

📎 **Referencia: [`04-guide.webp`](../public/images/referencias/04-guide.webp)** · original: `tienda cafe.jpg`
🖼️ Muestra: [`temas/guide.webp`](../public/images/temas/guide.webp)

**Para quién:** café y especialidad, producto que necesita explicación,
contenido + venta.

**Estructura observada**
- Fondo de página gris claro. Todo son **tarjetas muy redondeadas** (~16px) en
  blanco azulado muy pálido.
- **Hero como tarjeta grande**: título + emoji (`Pour over ☕`), descripción de 3
  líneas, y **mucho vacío deliberado en el centro**. Abajo: `About` a la
  izquierda, `Made just for fun. Or not?` a la derecha.
- **Nav como radio buttons** arriba a la derecha del hero, en 2 columnas × 3
  filas: Beans / Temperature, ● Methods (seleccionado, círculo relleno) / Ratio,
  Water / More.
- Tarjetas de producto en 4 columnas. Cada una:
  - **Fila superior**: nombre en **mono, mayúsculas, con tracking** a la
    izquierda (`ORIGAMI`) y **`# 008` en mono** a la derecha.
  - **Centro**: ilustración de línea del objeto, con aire generoso.
  - **Pastilla amarilla `NEW`** abajo a la izquierda (solo en algunas).
- **Ilustración de línea en lugar de fotografía.** Es lo que define el tema.

**Notas de implementación**
- **El amarillo obliga a texto en tinta** (`--color-brand-fg: #1a1a1a`). Es el
  motivo de que ese token exista. Nunca blanco sobre este acento.
- La ilustración de línea es un **compromiso de recursos importante**: es un
  estilo gráfico propio, no fotografía. Presupuestarlo.
- Los radio buttons deben ser **navegación real accesible** (enlaces con
  `aria-current`), no inputs de formulario falsos.
- El vacío del hero es intencional. No rellenarlo.

**Recursos:** ilustración de línea plana, trazo negro de grosor uniforme, sin
sombra ni relleno, sobre blanco azulado. **No fotografía, no textura de papel.**

---

### 05 · Specs — *ACF-01*

📎 **Referencia: [`05-specs.webp`](../public/images/referencias/05-specs.webp)** · original: `tienda de piezas.jpg`
🖼️ Muestra: [`temas/specs.webp`](../public/images/temas/specs.webp)

**Para quién:** relojería y precisión, componentes, producto con muchos datos.

**Estructura observada**
- **La ficha técnica como género.** La página entera es una hoja de
  especificaciones.
- Titular `Specs` **enorme y muy apretado**, arriba a la izquierda. A la derecha,
  un párrafo diminuto justificado en gris. Filete horizontal debajo.
- Cabecera de grupo: `ACF-01` grande + `9 items` diminuto al lado. **A la derecha
  del todo, un `—` naranja**: el control de plegado del acordeón. Es el **único
  color de la página**.
- **Rejilla irregular de verdad**: fila 1 con 2 celdas anchas, fila 2 con 4
  estrechas de anchos desiguales, fila 3 con 3 medianas.
- Estructura de cada celda, **en este orden**:
  1. `● Nombre` — bullet de punto relleno + nombre, con filete debajo.
  2. **Filas de especificación**: `Weight — / — 1.301 GRAM`. Etiqueta a la
     izquierda, **una `/` como separador hacia la mitad**, valor alineado a la
     derecha **en mono**. Tres filas: Weight, Material, Grade. Filete fino entre
     ellas.
  3. **Después** la caja de imagen en gris medio.
- Es decir: **las specs van ARRIBA de la imagen**, no debajo. Muy distintivo.
- Todo en escala de grises salvo el guion naranja.

**Notas de implementación**
- Las filas de especificación se derivan del seed sin tocar el backend demo.
- La rejilla irregular es **composición fija por breakpoint**, no
  `grid-auto-flow`.
- **No debe tocar el backend.** Si faltan datos, ampliar el fixture embebido.

**Recursos:** componente sobre gris medio uniforme, macro técnico, greyscale
total, sombra mínima. Estética de despiece de ingeniería.

---

### 06 · Minimal — *propro*

📎 **Referencia: [`06-minimal.webp`](../public/images/referencias/06-minimal.webp)** · original: `tienda de muebles.jpg`
🖼️ Muestra: [`temas/minimal.webp`](../public/images/temas/minimal.webp)

**Para quién:** mobiliario e interiorismo, moda, producto que se vende por la
foto.

**Estructura observada**
- **El aire es el material principal.**
- La tienda vive en una **hoja blanca insertada** sobre fondo gris claro, con
  margen lateral visible.
- Fila de cabecera dentro de la hoja: wordmark `propro` a la izquierda, luego
  `CATALOG` + `( 12 items )` debajo, un **desplegable `SORTING BY ⌄`**, y a la
  derecha las categorías en mayúsculas: `ALL PRODUCTS · CHAIRS · **SOFT
  FURNITURE** (activa, en negrita) · TABLES · ACCESSORIES`.
- **Sidebar izquierdo**: `● CATALOG` (activo con bullet relleno), `COLLECTIONS`,
  `ABOUT US`, `CONTACTS`, hueco, y **`CART (0)`**. Todo en mayúsculas pequeñas
  con tracking.
- Rejilla de **2 columnas** con imágenes grandes sobre gris claro y calle blanca
  entre ellas.
- **Sin filetes en ninguna parte**: la separación es puro espacio.
- Bajo la imagen: nombre pequeño en gris, precio debajo algo más marcado. Ambos
  a la izquierda, sin énfasis.
- **Footer gris oscuro a sangre** (más ancho que la hoja): copyright + legales a
  la izquierda, y dos columnas de enlaces en mayúsculas.

**Notas de implementación**
- Con 2 columnas y ese aire, **la foto lo es todo**. Este tema exige la mejor
  imaginería del catálogo; con fotos mediocres se cae solo.
- El sidebar debe colapsar a hamburguesa o barra superior en móvil.
- `--border-width: 0` significa que los componentes deben **leer esa variable**,
  no llevar `border` fijo. Cuidado al reutilizar componentes de Base.
- El `CART (0)` en el sidebar, no en el header: es parte del carácter del tema.

**Recursos:** mueble único sobre gris claro uniforme, sombra de contacto suave,
encuadre muy generoso, vista frontal.

---

### 07 · Launch — *P1*

📎 **Referencia: [`07-launch.webp`](../public/images/referencias/07-launch.webp)** · original: `tienda de motos.jpg`
🖼️ Muestra: [`temas/launch.webp`](../public/images/temas/launch.webp)

**Para quién:** catálogo corto de alto valor, producto estrella, preventa.

**Estructura observada**
- **Landing de lanzamiento** más que catálogo. Para pocos productos con mucho que
  contar.
- Banda gris claro: titular grande de **peso ligero** en 2 líneas, y debajo
  **`▶ Watch Video`** con glifo de play circulado.
- **Fila de features con scroll horizontal**: 4 items cuyas imágenes **se cortan
  en ambos bordes**, indicando desplazamiento. Cada item: imagen sobre el gris
  (sin tarjeta ni filete), `01` diminuto en gris, título mediano, y descripción
  de 2 líneas.
- Banda blanca: `Safety & Security Matters`, titular **muy grande y ligero**.
- **Dos tarjetas con filete fino**, cada una:
  - Cabecera: título a la izquierda, párrafo descriptivo a la derecha. Filete
    debajo.
  - Cuerpo en 2 columnas: **ilustración grande en gris claro a la izquierda**
    (escudo / candado), **lista a la derecha**.
  - Items de lista con **bullet `○` de círculo hueco** y filete entre ellos. Los
    filetes **solo abarcan la columna derecha**, no la tarjeta entera.
- **Barra inferior sticky**, blanca con filete superior: miniatura del producto,
  **● punto verde** + `P1 Batch III — Now Available to Order`, y botón
  `Configure Now →` con filete y flecha.

**Notas de implementación**
- La barra sticky es lo distintivo: muestra el estado de stock del fixture
  embebido, sin consultar ni modificar D1.
- Con `gridCols: 3` y este planteamiento, **encaja mal con 60 productos**. Es
  para catálogos cortos; si el cliente tiene 100 SKUs, este no es su tema.
- El scroll horizontal: `overflow-x: auto` con `scroll-snap`, accesible por
  teclado. No un carrusel con JS.
- El filete que solo cubre la columna derecha es un detalle fácil de perder.

**Recursos:** producto en perfil o tres cuartos sobre gris muy claro, luz de
estudio limpia, sombra suave. Paleta monocroma.

---

### 08 · Street — *Up There Athletics*

📎 **Referencia: [`08-street.webp`](../public/images/referencias/08-street.webp)** · original: `tienda ropa.jpg`
🖼️ Muestra: [`temas/street.webp`](../public/images/temas/street.webp)

**Para quién:** moda y streetwear, calzado deportivo, marcas con drops y
campañas.

> **Tema nuevo (2026-07-20).** No estaba en la primera tanda de referencias.
>
> **✅ Entregado el 2026-07-25** como tienda **ASFALTO**. Ficha completa en
> [`docs/temas/street.md`](temas/street.md), con lo que se replicó, lo que
> deliberadamente NO (contador de carrusel, «Read Full Article» y newsletter:
> serían funcionalidad fingida) y los gotchas. Ojo a un cambio respecto a lo que
> dice esta ficha: el tema acabó en **`nav: 'immersive'`**, no `'top'` — era la
> única forma de poner el header debajo del hero sin tocar `Shop.astro`.

**Estructura observada**
- **Ticker verde neón** en lo más alto: banda estrecha con texto repetido en
  marquesina (`Holiday Shipping Cut-Offs`) sobre verde lima, texto oscuro.
- **Hero a sangre por encima del header**: foto de campaña a pantalla completa
  con `Available Now` + titular (`New Balance × District Vision`) superpuestos
  arriba a la izquierda, **contador `1/3` y flechas** arriba a la derecha, y
  `↓ Scroll For More` abajo a la izquierda.
- **El header va DEBAJO del hero**, no encima: logo + `Shop` `Club House` a la
  izquierda; `Login` `Search` `PLN zł` `Bag` a la derecha.
- Fila de **3 tarjetas editoriales** de categoría: imagen con antetítulo pequeño
  y **título superpuesto**.
- Cabecera de sección **centrada con un glifo encima** (`⚡` sobre `Latest
  Arrivals`, `❋` sobre `Club House`).
- **Rejilla densa de 5 columnas**: imagen pequeña sobre gris muy claro, y debajo
  marca/categoría en gris diminuto (`District Vision / Latest`), nombre, y
  precio + `Sold Out` en gris.
- Botón `See More...` como **pastilla centrada**.
- `Men's Latest` / `Women's Latest`: partición en 2 con fotografía grande.
- **Sección `Club House` tipo revista**: mezcla asimétrica de carteles gráficos
  grandes (uno verde neón, otro tipográfico naranja), bloques de artículo con
  fecha + `Read Full Article`, y tarjetas de producto pequeñas. Es lo que da
  carácter al tema.
- **Footer casi negro** con columnas de enlaces en **mayúsculas monoespaciadas**,
  alta de newsletter con botón `Sign Up`, y `TO TOP` abajo a la derecha.

**Notas de implementación**
- **El verde neón obliga a texto en tinta** (`--color-brand-fg: #111111`), igual
  que Guide.
- El ticker en marquesina: CSS puro con `@keyframes`, y **debe respetar
  `prefers-reduced-motion`** (parar la animación). Movimiento infinito sin escape
  es un problema de accesibilidad real.
- El header bajo el hero rompe el patrón de `SiteHeader`: es el único tema con
  `hero: 'fullbleed'`. Verificar que el sticky sigue funcionando al hacer scroll.
- `Sold Out` deriva del stock del fixture embebido, no de una etiqueta manual.
- La sección Club House pide contenido editorial que la demo no tiene. Se puede
  resolver con bloques del seed; **no crear un CMS**.
- 5 columnas a 375px → 2. Es el salto más agresivo del catálogo.

**Recursos:** calzado deportivo en tres cuartos sobre gris claro, luz editorial
nítida con sombra definida, tonos coral/rojo. Energía de revista deportiva.

---

### 09 · Iris — *cinemática de producto*

📎 **Referencia: [`09-iris.webp`](../public/images/referencias/09-iris.webp)**

**Para quién:** óptica, producto premium y lanzamientos de alto impacto.

Tema inmersivo con vídeo controlado por scroll, negro absoluto, magenta y
catálogo de tres columnas. Su implementación y límites están documentados en
[`docs/temas/iris.md`](temas/iris.md).

---

### 10 · Tema Noddo — *O&D Product Line*

📎 **Referencia: [`10-noddo.webp`](../public/images/referencias/10-noddo.webp)**

**Para quién:** tecnología doméstica, diseño industrial y objetos conectados.

Carcasa monocroma a ancho completo con composición irregular y siete productos
estáticos. Las fichas, carrito y checkout se simulan en el navegador; no se
acoplan a D1. `DemoJourneyBanner` enlaza con el panel ficticio independiente.
Ficha completa: [`docs/temas/noddo.md`](temas/noddo.md).

---

### 11 · Sitēga — *sanitarios y grifería*

📎 **Referencia: [`11-sitega.webp`](../public/images/referencias/11-sitega.webp)**

**Para quién:** baño e interiorismo, cerámica y piedra, marcas arquitectónicas.

Hoja blanca sobre gris, navegación tipográfica, titulares editoriales en ruso,
mosaico irregular de lavabos y grifería, bloque negro de colecciones y footer a
sangre. El catálogo visual usa ocho productos propios y el recorrido demo local
mantiene la misma frontera: simulación local y panel ficticio independiente.

Ficha completa: [`docs/temas/sitega.md`](temas/sitega.md).

### 12 · Forma — *gafas y accesorios*

📎 **Referencia: [`12-forma.webp`](../public/images/referencias/12-forma.webp)**

**Para quién:** ópticas independientes, marcas de accesorios, diseño y moda.

Galería editorial de retratos, monturas y taller. El catálogo local incluye seis
productos de óptica y solar, con fichas, carrito y checkout demo propios.

Ficha completa: [`docs/temas/forma.md`](temas/forma.md).

### 13 · STRETCH — *skincare audiovisual*

📎 **Referencia: [`13-stretch.webp`](../public/images/referencias/13-stretch.webp)**

**Para quién:** cosmética y skincare, bienestar y marcas sostenibles.

Hero dividido a pantalla completa con imagen y vídeo, navegación inmersiva,
carrusel horizontal de siete productos y cierre en tres categorías audiovisuales.
Las fichas, carrito y checkout usan estado local y conservan el recorrido común
hacia el gestor de tienda.

Ficha completa: [`docs/temas/stretch.md`](temas/stretch.md).

### 14 · ARGENT. — *moda cinematográfica*

📎 **Referencia: [`14-argent.webp`](../public/images/referencias/14-argent.webp)**

**Para quién:** moda de autor, streetwear premium y marcas que venden mediante
campañas editoriales.

Hero de retrovisor a sangre con navegación superpuesta, wordmark condensado,
carrusel blanco de cinco prendas y un díptico de campaña vertical. La estructura
y los ocho assets generados con Higgsfield están entregados y verificados. Ficha completa:
[`docs/temas/argent.md`](temas/argent.md).

### 15 · SILLAGE — *galería olfativa*

📎 **Referencia: [`15-sillage.webp`](../public/images/referencias/15-sillage.webp)**

**Para quién:** perfumería y cosmética, retail selecto y marcas de autor.

Hero sensorial en tarjeta, cuatro novedades sobre gris cálido, producto
destacado, manifiesto editorial, familias apiladas y cierre de showroom. La
colección, sus catorce assets y el recorrido comercial están implementados y
verificados. Ficha completa:
[`docs/temas/sillage.md`](temas/sillage.md).

### 16 · SUMMIT — *lujo alpino*

📎 **Referencia: [`16-summit.webp`](../public/images/referencias/16-summit.webp)**

**Para quién:** moda técnica, deporte de montaña y equipamiento premium.

Hero inmersivo de expedición, producto aislado y mosaico de cuatro piezas con
campaña vertical. Siete productos y nueve assets propios componen un escaparate
completo, responsive y conectado al recorrido comercial compartido. Ficha:
[`docs/temas/summit.md`](temas/summit.md).

### 17 · LÍTICA — *cosmética mineral*

📎 **Referencia: [`17-litica.webp`](../public/images/referencias/17-litica.webp)**

**Para quién:** cosmética y skincare, bienestar y marcas naturales de autor.

Hero partido, retícula de filetes, materia cálida y ritual monocromo. Seis
productos y diez assets propios sostienen la dirección sin duplicar lógica de
compra. Ficha: [`docs/temas/litica.md`](temas/litica.md).

### 18 · NERA — *sastrería editorial*

📎 **Referencia: [`18-nera.webp`](../public/images/referencias/18-nera.webp)**

**Para quién:** moda de autor, sastrería femenina y colecciones cortas.

Hero editorial a sangre, cuatro prendas aisladas y mosaico alterno de campaña y
producto sobre blanco. Ocho productos y once assets propios replican el ritmo y
la jerarquía de la referencia con identidad NERA. Ficha:
[`docs/temas/nera.md`](temas/nera.md).

---

## 6. Tabla resumen

| # | Tema | Acento | Cols | Rejilla | Nav | Hero | Tarjeta | Filtros | Densidad | Estado |
|---|------|--------|------|---------|-----|------|---------|---------|----------|--------|
| — | Base | `#008060` | 4 | uniform | top | none | plain | chips | regular | ✅ |
| 01 | Editorial | `#d42f08` | 4 | **irregular** | top | none | hairline | chips | compact | ✅ |
| 02 | Industrial | `#1b4dff` | 4 | **irregular** | top | none | divided | dropdown | compact | ✅ |
| 03 | Natural | `#14594a` | 4 | uniform | top | **split** | plain | **sidebar** | regular | ✅ |
| 04 | Guide | `#f5c518` | 4 | uniform | top | **card** | elevated | chips | airy | ✅ |
| 05 | Specs | `#c2410c` | 3 | **irregular** | top | none | divided | dropdown | compact | ✅ |
| 06 | Minimal | `#1a1a1a` | 2 | uniform | **sidebar** | none | plain | dropdown | airy | ✅ |
| 07 | Launch | `#15803d` | 3 | uniform | top | none | hairline | chips | airy | ✅ |
| 08 | Street | `#c3f53c` | **5** | uniform | **immersive** | **fullbleed** | plain | chips | compact | ✅ |
| 09 | Iris | `#E6074E` | 3 | uniform | **immersive** | **fullbleed** | plain | dropdown | regular | ✅ |
| 10 | Tema Noddo | `#111111` | 3 | **irregular** | **immersive** | **fullbleed** | plain | chips | compact | ✅ |
| 11 | Sitēga | `#111111` | 4 | **irregular** | **immersive** | **fullbleed** | plain | chips | airy | ✅ |
| 12 | Forma | `#171717` | 4 | **irregular** | **immersive** | **fullbleed** | plain | chips | airy | ✅ |
| 13 | STRETCH | `#171717` | 4 | uniform | **immersive** | **fullbleed** | divided | chips | airy | ✅ |
| 14 | ARGENT. | `#1b1b19` | **5** | uniform | **immersive** | **fullbleed** | plain | chips | compact | ✅ |
| 15 | SILLAGE | `#2f302c` | 4 | uniform | top | **card** | plain | dropdown | airy | ✅ |
| 16 | SUMMIT | `#8b4e2e` | 3 | **irregular** | **immersive** | **fullbleed** | divided | dropdown | compact | ✅ |
| 17 | LÍTICA | `#9a3f1f` | 3 | **irregular** | top | **split** | divided | dropdown | compact | ✅ |
| 18 | NERA | `#55788a` | 4 | uniform | top | **fullbleed** | divided | dropdown | compact | ✅ |

---

## 7. Orden sugerido de desarrollo

Por **riesgo creciente**: los primeros validan la arquitectura antes de meterse
en los que tocan datos.

1. **Minimal** — el más lejano a Base estructuralmente (nav lateral, 2 columnas,
   sin filetes) pero **sin datos nuevos**. La mejor prueba de que `layout`
   aguanta.
2. **Editorial** — valida densidad compacta, rejilla irregular y anotaciones.
3. **Launch** — valida composición de landing y stock en vivo.
4. **Guide** — valida acento claro y pide ilustración de línea: primer
   compromiso serio de recursos.
5. **Street** — valida rejilla de 5, hero a sangre y ticker accesible.
6. **Industrial** — primer tema que quiere un campo nuevo (subtítulo técnico).
7. **Natural** — quiere precio de oferta (`compare_at_price`).
8. **Specs** — el que más datos nuevos pide.

---

## 8. Riesgos abiertos

1. **Tres temas piden datos que el modelo no tiene.**
   - *Industrial* → subtítulo de especificación por producto.
   - *Natural* → precio de oferta (`compare_at_price`).
   - *Specs* → filas de especificación estructuradas.

   En las demos deben derivarse del seed sin tocar D1. Si se necesitan en una
   tienda real, su modelo se diseña fuera del escaparate público.

2. **Coste de imaginería.** Cada tema quiere su propia estética de producto.
   *Guide* además pide ilustración de línea. Es el capítulo más caro.

3. **Deriva de componentes.** 16 temas × 6 componentes = 96 ficheros si se
   implementa todo. Mitigación: **herencia de Base, implementar solo lo que el
   tema redefine**. Vigilar en cada sesión.

4. **Accesibilidad de los recursos «de carácter».** El texto rotado de Editorial,
   el ticker de Street y el hover-para-comprar de Industrial son bonitos y
   problemáticos. Cada ficha dice cómo resolverlos; **no saltárselo**.

5. **`compact` en móvil.** Editorial, Industrial, Specs y Street hay que
   verificarlos a 375px. La densidad es de escritorio.

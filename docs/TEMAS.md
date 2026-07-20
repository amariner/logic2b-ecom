# CATÁLOGO DE ESTILOS — LogicEcom

> Documento de referencia para desarrollar los temas. Cada tema se desarrolla en
> su propia sesión; **lee este fichero completo antes de empezar uno**.
>
> Estado del contrato: definido 2026-07-20. Fuente de verdad del código:
> [`src/lib/demo-themes.ts`](../src/lib/demo-themes.ts).

---

## 1. Qué es esto y por qué existe

LogicEcom vende una tienda **a medida**. El problema comercial es que "a medida"
suena caro y abstracto: el cliente no puede imaginarse su tienda. El catálogo de
estilos resuelve eso — son 7 direcciones visuales completas, cada una derivada de
una referencia real de ecommerce, entre las que el cliente elige un punto de
partida.

**Lo que se vende con esto:** "elige el estilo que más se parece a lo que tienes
en la cabeza; lo adaptamos a tu marca". Convierte una conversación abstracta en
una elección concreta de catálogo.

### La regla que no se rompe

> **Un tema es exclusivamente capa de presentación. El backend es UNO para todos.**

D1, `lib/pricing.ts`, `lib/shipping.ts`, `lib/quote.ts`, `/api/cart/quote`,
`/api/checkout/session`, el webhook de Stripe y `emails_outbox` son **compartidos
y no se tocan al desarrollar un tema**.

Si desarrollando un tema aparece la necesidad de cambiar lógica de negocio, es
señal de que algo se ha modelado mal en la capa de presentación. **Parar y
replantear, no bifurcar el backend.** Siete backends es exactamente el fracaso
que este diseño existe para evitar.

La demo desplegada sigue siendo **una sola**, con un tema activo. El catálogo es
el escaparate de lo que se puede pedir, no siete tiendas en producción.

---

## 2. Arquitectura de un tema

Un tema son **tres cosas**:

```
tema = vars (tokens CSS)  +  layout (descriptor estructural)  +  componentes
```

### 2.1 `vars` — tokens CSS

Lista **cerrada** (`THEME_VARS`). Un tema no puede tocar nada más: eso es lo que
impide que un tema degenere en un fork del CSS. Si un tema necesita una variable
nueva, se añade a `THEME_VARS` **y a los 8 temas**, más al script anti-flash de
`Shop.astro` (hay tests que lo obligan: `demo-themes.test.ts` y
`theme-inline-script.test.ts`).

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

> **Accesibilidad, no negociable.** `--color-brand-fg` existe porque el tema
> *Guide* usa amarillo: blanco encima sería ilegible. Hay un test que exige
> contraste WCAG AA (≥ 4.5) entre acento y su texto en **todos** los temas.
> Un tema que no pasa ese test no entra.

### 2.2 `layout` — descriptor estructural

Declarativo a propósito: mantiene la decisión de diseño en un sitio auditable en
vez de repartida en condicionales por las páginas.

| Campo | Valores | Efecto |
|---|---|---|
| `gridCols` | `2 \| 3 \| 4` | columnas del catálogo en desktop |
| `nav` | `top \| sidebar` | dónde vive la navegación |
| `card` | `hairline \| plain \| elevated \| divided` | tratamiento de tarjeta |
| `filters` | `chips \| sidebar \| dropdown` | cómo se filtra |
| `density` | `compact \| regular \| airy` | densidad general |
| `annotations` | `boolean` | etiquetas mono (numeración, refs) |
| `darkFooter` | `boolean` | footer oscuro a sangre |

### 2.3 Componentes

Viven en `src/components/themes/<id>/`. Se crean **al desarrollar el tema**, no
antes. Superficie mínima que cubre un tema:

```
src/components/themes/<id>/
  Header.astro       nav, carrito, buscador
  ProductGrid.astro  rejilla del catálogo
  ProductCard.astro  tarjeta de producto
  ProductDetail.astro ficha (PDP)
  Filters.astro      filtros de categoría
  Footer.astro       pie
```

Los que un tema no redefina **caen al tema Base**. No hay obligación de
implementar los seis: si *Launch* comparte tarjeta con Base, no se duplica.

---

## 2.4 Los dos tipos de imagen (no confundirlos)

| Carpeta | Qué es | Campo | Origen | ¿Público? |
|---|---|---|---|---|
| `public/images/referencias/` | Captura del **layout** de la tienda de origen | `reference.file` | Aportada por Andreu | ❌ Interno |
| `public/images/temas/` | **Imaginería de producto propia** en la estética del tema | `sample` | Generada con Higgsfield | ✅ Se enseña en `/estilos` |

La distinción importa: `/estilos` es indexable, y republicar ahí el diseño de
otra tienda no procede. Lo que se enseña es material propio que comunica el aire
del estilo. Las referencias son documentación de trabajo.

**Estado 2026-07-20:** las 7 muestras (`temas/`) están generadas y en el repo.
Las 7 referencias (`referencias/`) **siguen pendientes de subir**.

---

## 3. Cómo se desarrolla un tema (checklist de sesión)

1. **Leer la ficha del tema** en § 5 y mirar la referencia en
   `public/images/referencias/`.
2. **Verificar tokens.** Los de `demo-themes.ts` son una primera propuesta hecha
   desde la captura; al implementar suelen necesitar ajuste. Cambiarlos ahí,
   nunca hardcodear color en un componente.
3. **Crear `src/components/themes/<id>/`** con solo los componentes que el tema
   realmente redefine.
4. **Conectar contra el backend compartido.** Los mismos endpoints. Cero lógica
   de precio, stock o envío en el componente.
5. **Pasar `status` a `'ready'`** en `demo-themes.ts`. Esto lo mete
   automáticamente en el selector de la tienda y actualiza `/estilos`.
6. **Tests.** `pnpm vitest run` en verde, incluido el de contraste.
7. **Verificar en el navegador** con `wrangler dev`: catálogo, ficha, carrito y
   checkout con el tema activo.
8. **Responsive y modo oscuro.** La base Logic2B UI los soporta; el tema no debe
   romperlos.

---

## 4. Ajuste a Logic2B UI

Todos los temas se construyen **encima** de la base Logic2B UI
(`ui.logic2b.com`): shadcn/ui neutral, Inter, tokens oklch de croma 0, radios del
sistema. El tema es un *skin* sobre esa estructura, no un reemplazo.

**Qué aporta la base (invariante):** escala de grises neutra, Inter como sans,
tokens semánticos (`background`, `foreground`, `muted`, `border`…), soporte de
modo oscuro, foco visible accesible.

**Qué aporta el tema (variable):** acento, tipografía de titular, forma, densidad,
rejilla y estructura.

**Consecuencia práctica:** ninguna referencia se copia literalmente. Se toma su
*sistema* —densidad, ritmo, jerarquía, tratamiento de producto— y se reconstruye
en Inter + neutros. Teenage Engineering en Logic2B UI no es Teenage Engineering:
es su lógica editorial con nuestra tipografía y nuestros grises.

---

## 5. Los siete temas

Referencia de origen, ADN visual y notas de implementación.

---

### 01 · Editorial — *ref. Teenage Engineering*

`public/images/referencias/01-editorial.webp`

**Para quién:** diseño y objeto, audio y tecnología, marcas con voz propia.

**ADN visual**
- Rejilla suiza **densa**, casi sin aire entre celdas (`--grid-gap: 0.5rem`).
- Numeración de sección en superíndice: `Store⁽⁰³⁾`, `EMS⁽⁰⁴⁾`, `News⁽⁰⁵⁾`.
- Filete hairline en todas las cajas, esquinas **rectas** (`--radius-card: 0`).
- Naranja señal como único color en una página por lo demás monocroma.
- Anotaciones monoespaciadas sueltas como textura tipográfica.
- Tarjeta de producto con afordancia `+` en la esquina para añadir rápido.
- Bloques de texto con alineación irregular (sangría escalonada) — editorial.

**Notas de implementación**
- El `+` es un **añadir al carrito real**, no decorativo. Va contra el mismo
  endpoint que el resto.
- La numeración de sección sale de `layout.annotations: true`.
- El texto rotado vertical de la referencia: usar con mucha moderación, un solo
  eje. Es fácil que degenere en ruido y perjudique accesibilidad.
- Cuidado con la densidad en móvil: `compact` a 375px necesita romper a 2
  columnas, no a 4.

**Recursos:** producto sobre fondo hueso muy claro, luz dura, sombra corta y
definida. Objeto centrado, encuadre generoso.

---

### 02 · Industrial — *ref. TAGARNO*

`public/images/referencias/02-industrial.webp`

**Para quién:** B2B y maquinaria, suministro industrial, catálogos con ficha
técnica.

**ADN visual**
- Rejilla **a sangre sin gap** (`--grid-gap: 0`): las celdas se separan solo por
  filete. Da sensación de tabla/catálogo técnico.
- Azul eléctrico saturado como acento de acción y en barras a ancho completo.
- Barra de miga de pan de ancho completo en color, bajo el header.
- Cero radios en todo (`--radius-btn: 0`, `--radius-card: 0`).
- Tarjeta: nombre + **subtítulo de especificación** + precio. El subtítulo
  técnico (`330× magnification`) es parte del ADN.
- Botón "Añadir" que aparece **en hover** sobre la tarjeta, en azul.
- Footer **negro** con varias columnas de enlaces.
- Barra "Cargar más" de ancho completo en azul.

**Notas de implementación**
- El subtítulo técnico necesita un campo. Reutilizar `description` recortada o
  añadir columna es decisión a tomar **al desarrollar** — si hace falta migración
  de D1, se consulta antes (afecta al backend compartido).
- La rejilla sin gap con filete pide `border-collapse` conceptual: filete a la
  derecha y abajo, y quitar el del borde exterior.
- `darkFooter: true` — el footer negro es estructural, no decorativo.

**Recursos:** producto técnico sobre blanco puro, iluminación neutra de estudio,
sin sombra dramática. Estética de catálogo de fabricante.

---

### 03 · Natural — *ref. All Natural (AFF)*

`public/images/referencias/03-natural.webp`

**Para quién:** cosmética y cuidado personal, alimentación, marcas DTC.

**ADN visual**
- El DTC clásico bien hecho. Es el tema **más convencional** del catálogo, y eso
  es una virtud: convierte.
- **Sidebar de filtros** a la izquierda con acordeones y checkboxes
  (Colecciones, Categoría, Tipo, Precio, Talla).
- Badges sobre la tarjeta: `New` (neutro) y `−30%` (acento).
- Precio tachado + precio de oferta cuando hay descuento.
- Hero lifestyle apaisado en la cabecera del catálogo.
- **Panel de carrito deslizante** por la derecha con detalle de producto,
  selector de cantidad y "Añadir al carrito" a ancho completo.
- Producto sobre fondo gris muy claro, sin borde.

**Notas de implementación**
- El descuento implica precio de oferta. **No inventar campo**: hoy el modelo no
  tiene `compare_at_price`. Decidir al desarrollar — si se añade, es migración de
  D1 y toca backend compartido, así que **se consulta antes**.
- El panel deslizante debe funcionar sin JS pesado: `<dialog>` o detalle/summary
  progresivo. Nada de traer un framework.
- `filters: 'sidebar'` es el único tema junto con Minimal que no usa chips.

**Recursos:** packaging sobre fondo neutro cálido, dos productos juntos (frontal
+ caja), luz suave difusa. Paleta de producto en verdes, azules pizarra y arena.

---

### 04 · Guide — *ref. Pour over*

`public/images/referencias/04-guide.webp`

**Para quién:** café y especialidad, producto que necesita explicación, contenido
+ venta.

**ADN visual**
- Editorial **amable**: tarjetas muy redondeadas (`--radius-card: 1rem`) sobre
  fondo off-white con tinte frío.
- Cabecera-tarjeta grande con título, emoji y descripción del catálogo.
- Navegación por **radio buttons** en dos columnas (Beans / Methods / Water /
  Temperature / Ratio / More) — nav como índice de guía.
- Etiquetas monoespaciadas en mayúscula: `ORIGAMI`, `AEROPRESS`.
- **Numeración de item** a la derecha de cada tarjeta: `# 008`, `# 007`.
- Pill amarilla `NEW` en la esquina inferior.
- **Ilustración de línea** en vez de fotografía. Es lo que define el tema.
- Muy aireado (`--space-density: 1.25`).

**Notas de implementación**
- **El amarillo obliga a texto en tinta** (`--color-brand-fg: #1a1a1a`). Es el
  motivo de que ese token exista. Nunca blanco sobre este acento.
- La ilustración de línea es un compromiso de recursos importante: es un estilo
  gráfico propio, no fotografía. Presupuestarlo al planificar el tema.
- La numeración `# 008` sale de `layout.annotations: true`.
- Los radio buttons deben ser navegación real accesible (enlaces con
  `aria-current`), no inputs de formulario falsos.

**Recursos:** ilustración de línea monocroma, trazo fino uniforme, fondo
transparente. **No fotografía.**

---

### 05 · Specs — *ref. ACF-01*

`public/images/referencias/05-specs.webp`

**Para quién:** relojería y precisión, componentes, producto con muchos datos.

**ADN visual**
- **Ficha técnica** como género. La página es una hoja de especificaciones.
- Escala de grises casi pura; naranja como acento **mínimo** (solo el `−` del
  acordeón y poco más).
- Titular enorme y muy apretado (`--tracking-display: -0.04em`).
- Secciones **acordeón** con contador de items: `ACF-01 · 9 items`.
- Filas de especificación repetidas: `Weight / Material / Grade`, con la barra
  `/` como separador y el valor alineado a la derecha en mono.
- Bullets de punto `●` antes de cada nombre de componente.
- Producto sobre gris medio, rejilla irregular (celdas de distinto tamaño).

**Notas de implementación**
- Las filas de especificación necesitan **datos estructurados por producto**. Hoy
  no existen. Opciones: JSON en una columna nueva, o tabla `product_specs`.
  Cualquiera es migración de D1 → **consultar antes de implementar**.
- La rejilla irregular (2 grandes + 4 medianas + 3 anchas) es composición fija,
  no `grid-auto-flow`. Definirla explícitamente por breakpoint.
- Este es el tema con **más riesgo de tocar backend**. Planificarlo con eso en
  mente.

**Recursos:** componentes sobre gris uniforme, render técnico o macro, sin color,
sombra mínima. Estética de despiece de ingeniería.

---

### 06 · Minimal — *ref. propro*

`public/images/referencias/06-minimal.webp`

**Para quién:** mobiliario e interiorismo, moda, producto que se vende por la
foto.

**ADN visual**
- **Aire como material principal** (`--space-density: 1.5`, `--grid-gap: 2rem`).
- **Nav lateral izquierdo** fijo (Catálogo / Colecciones / Nosotros / Contacto)
  con bullet `●` marcando el activo. Único tema con `nav: 'sidebar'`.
- Rejilla de **2 columnas** con imágenes muy grandes sobre gris claro.
- **Sin filetes** (`--border-width: 0`): la separación es puro espacio.
- Monocromo total: el acento *es* el color de texto. Cero color de marca.
- Tipografía de titular **ligera** (`--weight-display: 400`).
- Precio discreto, mismo tamaño que el nombre, sin énfasis.
- Filtros como categorías en línea arriba + dropdown de orden.
- Footer oscuro con columnas.

**Notas de implementación**
- Con 2 columnas y ese aire, **la foto de producto lo es todo**. Este tema exige
  la mejor imaginería del catálogo; con fotos mediocres se cae solo.
- El nav lateral debe colapsar a hamburguesa o barra superior en móvil.
- `--border-width: 0` significa que los componentes deben leer esa variable, no
  llevar `border` fijo. Cuidado al reutilizar componentes de Base.

**Recursos:** producto único sobre gris claro uniforme, sombra de contacto suave,
encuadre muy generoso con mucho aire alrededor. Fotografía de catálogo de
mobiliario.

---

### 07 · Launch — *ref. P1*

`public/images/referencias/07-launch.webp`

**Para quién:** catálogo corto de alto valor, producto estrella, preventa y
reservas.

**ADN visual**
- **Landing de lanzamiento** más que catálogo. Pensado para pocos productos con
  mucho que contar.
- Titulares **enormes** y ligeros (`--weight-display: 400`).
- Fila de **features numeradas** `01 / 02 / 03 / 04` con imagen, título y párrafo
  corto. Composición de scroll horizontal en la referencia.
- Tarjetas de especificación emparejadas (*Safety* / *Security*) con listas de
  bullets `○` y un icono grande a la izquierda.
- **Barra inferior sticky** con punto verde de estado, texto de disponibilidad
  (`P1 Batch III — Now Available to Order`) y CTA con flecha.
- Secciones alternando fondo blanco y gris muy claro.
- Enlace "Watch Video" con icono de play circular.

**Notas de implementación**
- La barra sticky es el elemento distintivo: debe mostrar **estado real de stock**
  desde D1, no un texto fijo. Ahí está la gracia comercial.
- Con `gridCols: 3` y este planteamiento, el tema encaja mal con 60 productos.
  Documentar que es para catálogos cortos — si el cliente tiene 100 SKUs, este no
  es su tema.
- El scroll horizontal de features: que sea `overflow-x: auto` con scroll-snap,
  accesible por teclado, no un carrusel con JS.

**Recursos:** producto en tres cuartos sobre blanco, iluminación de estudio
limpia, sombra suave. Estética de lanzamiento de producto tecnológico.

---

## 6. Tabla resumen

| # | Tema | Acento | Cols | Nav | Tarjeta | Filtros | Densidad | Estado |
|---|------|--------|------|-----|---------|---------|----------|--------|
| — | Base | `#008060` | 4 | top | plain | chips | regular | ✅ listo |
| 01 | Editorial | `#d42f08` | 4 | top | hairline | chips | compact | ⏳ |
| 02 | Industrial | `#1b4dff` | 4 | top | divided | dropdown | compact | ⏳ |
| 03 | Natural | `#14594a` | 4 | top | plain | sidebar | regular | ⏳ |
| 04 | Guide | `#f5c518` | 4 | top | elevated | chips | airy | ⏳ |
| 05 | Specs | `#c2410c` | 3 | top | divided | dropdown | compact | ⏳ |
| 06 | Minimal | `#1a1a1a` | 2 | sidebar | plain | dropdown | airy | ⏳ |
| 07 | Launch | `#15803d` | 3 | top | hairline | chips | airy | ⏳ |

---

## 7. Riesgos abiertos

Cosas que **no** están resueltas y que hay que decidir antes de tocarlas:

1. **Tres temas piden datos que el modelo no tiene.**
   - *Industrial* → subtítulo de especificación por producto.
   - *Natural* → precio de oferta (`compare_at_price`).
   - *Specs* → filas de especificación estructuradas.

   Cualquiera de las tres es **migración de D1**, o sea backend compartido.
   Consultar antes de implementar. La alternativa barata: derivarlos del seed sin
   tocar el esquema (p. ej. specs en un JSON del seed, no en D1).

2. **Coste de imaginería.** Cada tema quiere su propia estética de producto.
   *Guide* además pide ilustración de línea en vez de fotografía. Es el capítulo
   de recursos más caro del catálogo.

3. **Deriva de componentes.** Siete temas × seis componentes = 42 ficheros si se
   implementan todos completos. La mitigación es la herencia: **implementar solo
   lo que el tema realmente redefine** y caer a Base para el resto. Vigilar en
   cada sesión que no se esté duplicando Base con cambios cosméticos.

4. **`compact` en móvil.** Los temas densos (Editorial, Industrial, Specs) hay
   que verificarlos a 375px. La densidad es de escritorio; en móvil todos
   convergen a algo parecido.

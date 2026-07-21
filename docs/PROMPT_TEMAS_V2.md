# PROMPT — Fase 9B: un motor, ocho tiendas radicalmente distintas

> Pega este documento entero como primer mensaje de la sesión, dentro del repo.
> Escrito el 2026-07-21 tras replantear el alcance del catálogo de estilos.
> Lee además `CLAUDE.md`, `docs/TEMAS.md` y `docs/ROADMAP.md § Fase 9`.

---

## 1. LA TESIS COMERCIAL (esto manda sobre todas las decisiones técnicas)

Lo que LogicEcom vende es:

> **«Diseñamos tiendas radicalmente distintas, muy trabajadas a nivel de diseño,
> y las entregamos rápido.»**

Lo que hace eso posible —y lo que hay que proteger con disciplina— es que
**la base técnica es idéntica en todos los proyectos**. Cada encargo nuevo debe
consistir en tocar **solo diseño y productos**. Nada más.

> *(Contexto interno: la velocidad viene de trabajar con agentes de IA. **No es
> un argumento público**: no aparece en la landing, ni en `/estilos`, ni en la
> documentación de cliente. Lo que se enseña es el resultado.)*

### La consecuencia técnica, que es toda la Fase 9B

Cada tema del catálogo **es un ensayo del proceso de entrega real**. Si
desarrollar un tema exige tocar el motor, el proceso no escala y la promesa
comercial es falsa. Por tanto el objetivo de esta fase es doble:

1. Que las 8 tiendas se vean **totalmente distintas** entre sí.
2. Que se hayan construido **sin tocar el motor ni una vez**.

**Lo segundo importa más que lo primero.** Un tema espectacular que haya exigido
bifurcar lógica de negocio es un fracaso de arquitectura disfrazado de éxito de
diseño. Si al desarrollar un tema aparece la necesidad de tocar el motor: **para,
y arréglalo en el motor para todos**, no en el tema.

---

## 2. LA FRONTERA: MOTOR vs. KIT DE TEMA

Esta tabla es el contrato. Mantenerla nítida es el trabajo.

| MOTOR — se escribe una vez, no se bifurca jamás | KIT DE TEMA — lo único que se toca por proyecto |
|---|---|
| D1: esquema, migraciones, acceso (`lib/db.ts`) | Tokens (`vars`) y descriptor `layout` |
| `lib/pricing.ts`, `lib/shipping.ts`, `lib/quote.ts` | Componentes en `src/components/themes/<id>/` |
| `/api/cart/quote`, `/api/checkout/session` | Catálogo de productos (seed de su colección) |
| Webhook de Stripe, `emails_outbox` | Imaginería del producto |
| Carrito, checkout, `/demo/gracias` | Textos y copy de la tienda |
| Backoffice completo y export CSV | `shop.config` de esa colección |
| Cliente de carrito, formateadores, utilidades | |

**Regla de oro:** si un cambio no cabe en la columna derecha, **no es trabajo de
tema**. Páralo y consúltalo.

### Señal de que la frontera se está rompiendo

Un tema pide un dato que el modelo no tiene. Pasa con tres:

- *Industrial* → subtítulo técnico por producto.
- *Natural* → precio de oferta (`compare_at_price`).
- *Specs* → filas de especificación estructuradas.

**Antes decíamos: «derívalo del seed sin tocar el esquema».** Con la tesis del
§ 1 encima de la mesa, **ese consejo queda superado y hay que decirlo**: eran
apaños para que un tema no tocara el motor. Pero un cliente real **también** va a
querer descuentos y fichas técnicas. Tres apaños distintos en tres temas es
justo la deriva que hay que evitar.

**Lo correcto es resolverlo UNA vez en el motor**, como capacidades opcionales
que cada tema usa o ignora (propuesta a validar en § 3.2).

---

## 3. DECISIONES QUE HAY QUE CERRAR ANTES DE ESCRIBIR CÓDIGO

**No implementes nada sin respuesta de Andreu a estas cuatro.**

### 3.1 Hasta dónde llega «copiar la referencia»

Andreu ha pedido copiar cada referencia «casi al detalle». Hay que precisarlo,
porque **`docs/TEMAS.md § 4` dice hoy lo contrario** («ninguna referencia se
copia literalmente») y porque las referencias son capturas de tiendas reales de
terceros (Teenage Engineering, TAGARNO, Up There Athletics, propro, ACF-01…).

**Propuesta — copiar el SISTEMA con fidelidad total, no la identidad ajena:**

| Se copia con fidelidad | No se copia |
|---|---|
| Rejilla, spans, ritmo vertical, densidad | Marca, wordmark, logotipo |
| Anatomía de tarjeta, orden de los elementos | Textos y claims literales |
| Jerarquía y escala tipográfica | Catálogo y fotos de producto |
| Recursos de carácter (ticker, numeración, filetes) | Fuentes propietarias de la marca |

Da tiendas totalmente distintas entre sí —que es el objetivo— sin publicar el
diseño de otro en un sitio comercial indexable (`/estilos` es indexable, y
`docs/TEMAS.md § 2.4` ya marcaba esta línea). **Si Andreu quiere ir más allá, que
lo decida él explícitamente. No lo asumas.**

### 3.2 El modelo de datos del motor (toca D1 → requiere OK expreso)

Dos cosas a la vez, en **una sola migración**:

**(a) Colecciones.** Columna `collection` en `products`: cada tema tiene su
catálogo, las lecturas filtran por la colección activa de la ruta. Un backend,
un esquema. *(Descartadas: tablas por tema = 8 backends de facto, exactamente el
fracaso que la arquitectura existe para evitar; y seeds separados, que no
permiten tener las 8 tiendas vivas a la vez.)*

**(b) Capacidades opcionales de producto**, todas nullable y todas ignorables:

| Columna | Para qué | Quién la usa |
|---|---|---|
| `subtitle TEXT NULL` | subtítulo técnico bajo el nombre | Industrial |
| `compare_at_price_cents INTEGER NULL` | precio anterior tachado | Natural |
| `specs_json TEXT NULL` | filas etiqueta/valor de ficha técnica | Specs |

⚠️ **Guardarraíl no negociable para `compare_at_price_cents`: es EXCLUSIVAMENTE
presentación.** No entra en `lib/pricing.ts`, ni en el cálculo de portes, ni en
el umbral de envío gratis, ni en los `line_items` de Stripe. El precio real sigue
siendo `price_cents` y solo él. Un descuento que se cuele en la lógica de cobro
es un bug de dinero. **Que haya test que lo fije.**

Ventaja de hacerlo ahora y no tema a tema: los tres temas «de riesgo» dejan de
serlo, y un cliente real hereda descuentos y ficha técnica de serie.

### 3.3 Cuántos productos por tema

Recomendación: **8–12**. Llena la rejilla de cada estilo (incluida la de 5
columnas de Street) y es asumible en coste de imagen. Launch, que es de catálogo
corto por definición, con **4–6**.

### 3.4 Presupuesto de imaginería

Es **el capítulo más caro** (riesgo abierto nº 2 de `docs/TEMAS.md`). Con 8–12
productos por tema salen **~70–100 imágenes** de producto, más heros.

- Cada tema tiene su **receta visual propia** —fondo, luz, encuadre, paleta— ya
  escrita en el apartado «Recursos» de su ficha en `docs/TEMAS.md § 5`.
- **Guide necesita ilustración de línea, no fotografía.** Sistema gráfico aparte.
- ⚠️ **La red de las sesiones cloud bloquea el CDN de Higgsfield.** Generar y
  descargar imágenes **solo en sesión local**.
- Recomendación: **generar primero, implementar después**, para no dejar el front
  bloqueado esperando assets.

Cerrar con Andreu: créditos disponibles y si va en sesión dedicada.

---

## 4. LO QUE HACE QUE EL PROCESO SEA RÁPIDO (y demostrable)

Si la promesa es «distinto y rápido», el repo tiene que hacerla cierta:

- **Scaffold de tema.** Un comando (`pnpm new:theme <id>`) que cree
  `src/components/themes/<id>/` con los stubs, la entrada de tokens y el registro
  de rutas. Que arrancar un estilo cueste segundos, no copiar-pegar.
- **Un `shop.config` por colección**, con todo lo específico de la tienda
  (nombre, textos, categorías, zonas). Nada de eso hardcodeado en componentes.
- **Checklist de entrega de tema**, corta y real, derivada de estas 4 sesiones.
- **Medir el coste de cada tema**: al cerrar cada uno, anotar en el ROADMAP
  ficheros tocados y si hizo falta rozar el motor (debe ser **no**). Esa serie es
  la prueba interna de que la promesa comercial se sostiene.

---

## 5. LA DEMO GENÉRICA (backoffice y flujo transaccional)

Petición explícita de Andreu: el backend de demo usa **productos genéricos**, no
los de ningún tema, y cubre **todas las variantes posibles**. Es coherente con la
tesis: el motor se enseña una vez, y se enseña completo.

El seed genérico debe dejar sembrado:

- **Pedidos en los cinco estados**: `pending`, `paid`, `shipped` (con tracking),
  `delivered`, `cancelled`.
- **Pedidos de forma distinta**: una línea; varias líneas; con envío gratis por
  superar el umbral; sin alcanzarlo; de zonas distintas (península / Baleares /
  Canarias, según `shop.config.ts`).
- **Los dos tipos de email** en `emails_outbox`: confirmación y aviso de envío
  con tracking.
- **Estados de producto**: agotado, stock bajo, inactivo. Y —si entra § 3.2(b)—
  con oferta, con subtítulo y con ficha técnica.
- **Estados vacíos alcanzables**: categoría sin productos, búsqueda sin
  resultados.
- **`order_events` con timeline real**, no un único evento.

Objetivo: que el panel se pueda **enseñar en una llamada de venta** sin fabricar
el estado a mano, que es lo que hay que hacer hoy.

---

## 6. QUÉ SOBREVIVE DE LO YA HECHO

Hay 4 temas desarrollados (**Minimal, Editorial, Launch, Guide**).

**Sobrevive:** el sistema de tokens `THEME_VARS` (14 variables), el descriptor
`layout`, los componentes de `src/components/themes/<id>/` —ahí está la mayor
parte del trabajo de diseño—, el test de contraste WCAG AA, la guardia del script
anti-flash y el fallback a Base.

**Cambia de sitio:** hoy cada tema es **una vista del catálogo compartido**,
montada por el registro `catalogViews` de `src/pages/demo/tienda/index.astro`.
Pasan a tener **home y ficha propias** sobre su colección (previsiblemente
`/demo/<tema>/` y `/demo/<tema>/[slug]`). El **selector con cookie**
(`ecom-demo-theme-id` → `src/lib/active-theme.ts`) pierde sentido para el
escaparate: cada tema es su URL. Decidir si se conserva para la demo genérica.

**Hay que rehacer:** catálogo e imágenes de los 4 temas hechos — hoy los cuatro
venden aceite del Maestrat.

**Alcance por tema: solo home + ficha de producto**, y como mucho una página
adicional si el estilo la pide. Carrito, checkout, panel y emails **no se
multiplican por 8**.

Dilo claro en el ROADMAP: es **un replanteamiento de la Fase 9**, no una
continuación.

---

## 7. GOTCHAS YA DESCUBIERTOS (no los redescubras)

1. **El `<body>` de `Base.astro` lleva `bg-white text-gray-900` FIJOS** (compat
   pre-Logic2B UI): un titular sin clase de color hereda gris oscuro también con
   `.dark`. Convención: color explícito semántico (`text-foreground` /
   `text-muted-foreground`) en todo texto, y superficie dark-aware
   (`bg-background` / `bg-muted`) en el wrapper. **No «arregles» el body**: es
   tarea del port Logic2B UI.
2. **Acento claro y texto.** El test mide el par relleno
   acento/`--color-brand-fg`, pero Base usa el acento también como color de
   texto (`.text-brand`): amarillo (Guide) o verde neón (Street) sobre blanco es
   ~1,7:1, ilegible. Resuelto en Guide con una regla con scope
   `[data-store-theme='guide']` en `global.css`, **sin capa a propósito**: dentro
   de `@layer base` pierde contra la capa de utilidades de Tailwind. **Street
   necesitará lo mismo.**
3. **Cero color/tamaño hardcodeado**: todo sale de tokens. Token nuevo =
   `THEME_VARS` + los 9 temas + script anti-flash de `Shop.astro` (hay tests).
4. **Clases de Tailwind como literales** — el escáner no ve clases dinámicas.
5. **Data-attribute propio por tema** en los botones de compra
   (`data-guide-add`, `data-launch-add`…) para no colisionar con Base.
6. **`wrangler dev` sirve el build de `dist/`**, no recarga en caliente: tras
   cambiar código, `pnpm build`.
7. **No lances `pnpm db:reset` con `wrangler dev` levantado**: borra
   `.wrangler/state` bajo el server y rompe el binding de D1 (500 en toda la
   tienda). Para el server, resiembra, y levántalo de nuevo.
8. **Sesiones cloud empujan a `origin/main`**: `git fetch` SIEMPRE al empezar.

---

## 8. ORDEN DE TRABAJO

Cada fase termina con commit, resumen breve y **parada para OK**.

- **9B.0** — Cerrar las cuatro decisiones de § 3. Sin código.
- **9B.1** — **Motor**: migración única (colecciones + capacidades opcionales),
  refactor de lectura, test que fija que `compare_at_price_cents` no entra en
  ninguna cuenta. Es el cimiento; a partir de aquí el motor no se vuelve a tocar.
- **9B.2** — **Demo genérica** (§ 5): seed de fixtures con todas las variantes.
- **9B.3** — **Scaffold y checklist** de tema (§ 4). Antes de repetir 8 veces,
  hacer barato repetir.
- **9B.4** — **Rutas por tema** y re-hospedaje de los 4 temas existentes sobre el
  modelo nuevo, aún con imágenes placeholder.
- **9B.5** — **Imaginería en sesión LOCAL**, tema por tema, con las recetas de
  `docs/TEMAS.md § 5`.
- **9B.6** — **Un tema por sesión**, ya con su catálogo y sus fotos. Orden por
  riesgo creciente. Con § 3.2(b) cerrado, Industrial/Natural/Specs dejan de ser
  los de riesgo.
- **9B.7** — Actualizar `/estilos` para que enlace a las 8 tiendas reales.
- **9B.8** — Reescribir `docs/TEMAS.md` con el contrato nuevo (hoy describe el
  modelo de «una tienda, 8 pieles» y queda desfasado).

---

## 9. REGLAS QUE NO CAMBIAN

- **El motor es UNO y no se bifurca por tema.** Es la tesis comercial, no una
  preferencia de estilo.
- Cambio de esquema de D1 → **consultar antes**, siempre.
- Sin dependencias nuevas sin preguntar.
- TypeScript estricto, sin `any` sin justificar.
- Código y commits en inglés; UI, documentación y comentarios de negocio en
  español.
- `pnpm check` en verde antes de cada commit (hoy: 108 tests, 0 errores).
- Verificación real en navegador con `wrangler dev`: 1440px, 375px y modo oscuro
  forzando `.dark` en `<html>`.
- **El uso de agentes de IA no se publica.** Es capacidad interna.

---

## 10. EMPIEZA AQUÍ

No escribas código todavía:

1. Lee `CLAUDE.md`, `docs/TEMAS.md` completo y `docs/ROADMAP.md § Fase 9`.
2. Devuelve las **cuatro decisiones de § 3** con tu recomendación razonada.
3. Propón la **migración concreta** de § 3.2: nombres de columnas, cómo se
   resuelve la colección activa por ruta, y qué test fija el guardarraíl del
   precio de oferta.
4. Propón el **scaffold de tema** de § 4: qué genera exactamente y qué queda por
   escribir a mano.
5. Estima el **número de imágenes** y el orden de generación.

Cuando Andreu dé el OK, arranca por 9B.1.

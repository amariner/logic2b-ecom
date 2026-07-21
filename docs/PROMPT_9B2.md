# PROMPT — Fase 9B, continuación (desde 9B.2)

> Pega este documento entero como primer mensaje de la sesión, dentro del repo.
> Escrito el 2026-07-21 al cerrar 9B.1.
> Lee además `CLAUDE.md`, `docs/PROMPT_TEMAS_V2.md` (el prompt maestro de la fase),
> `docs/ROADMAP.md § Fase 9B` y `docs/TEMAS.md`.

---

## 0. DÓNDE ESTAMOS

La Fase 9B replantea la Fase 9: de **«una tienda con 8 pieles»** a **«8 tiendas
sobre un motor que no se bifurca»**. La tesis comercial que manda sobre cualquier
decisión técnica:

> «Diseñamos tiendas radicalmente distintas, muy trabajadas a nivel de diseño,
> y las entregamos rápido.»

Eso solo es cierto si cada encargo nuevo toca **únicamente diseño y productos**.
Un tema espectacular que haya exigido tocar el motor es un fracaso de
arquitectura disfrazado de éxito de diseño.

**9B.0 (decisiones) y 9B.1 (motor) están HECHAS, commiteadas, mergeadas a `main`,
desplegadas en producción y verificadas.** El detalle completo está en
`docs/ROADMAP.md § Fase 9B`. Estado: `pnpm check` en verde con **128 tests**.

*(Contexto interno: la velocidad viene de trabajar con agentes de IA. **No es un
argumento público** — no aparece en la landing, ni en `/estilos`, ni en la
documentación de cliente.)*

---

## 1. LAS 7 DECISIONES YA CERRADAS — no las reabras

1. **Fidelidad: RÉPLICA del screenshot, no «inspirado en».** Cada tema se
   construye **mirando su `.webp`** de `public/images/referencias/` y clavando la
   composición: rejilla, gaps, filetes, escala tipográfica, colores exactos,
   orden de los elementos. La imaginería de Higgsfield reproduce la receta visual
   de la captura (mismo objeto, fondo, luz, encuadre). **Lo único que NO cruza:**
   nombre de marca, logotipo, textos literales y fuentes propietarias — porque
   `/estilos` es una página comercial indexable. Donde la referencia usa una
   fuente propietaria, se usa el equivalente libre más cercano.
   → Esto **deroga** el «todo se reconstruye en Inter + neutros» de
   `docs/TEMAS.md § 4`. Tipografía de titular y paleta son libres por tema; lo
   que se mantiene es el test de contraste WCAG AA.
2. **Migración de D1**: hecha (ver § 2).
3. **74 productos**, repartidos por lo que llena la rejilla de cada tema:
   Natural y Street 12 · Editorial e Industrial 10 · Specs 9 · Guide y Minimal 8
   · Launch 5.
4. **Guide cambia de CATÁLOGO, no de tema.** Su referencia (*Pour over*) es una
   tienda de café: su colección es **café de especialidad y equipo de cafetería**
   (dripper, molinillo, báscula, hervidor de cuello de cisne, prensa, servidor,
   filtro, taza). Con 8 objetos simples, la **ilustración de línea ENTRA** — son
   8 generaciones, no un sistema gráfico a medida.
5. **`shop.config` partido** en motor + colección: hecho (ver § 2).
6. **El selector con cookie se ELIMINA.** Cada tienda es su URL.
7. **Carrito, checkout y gracias siguen siendo UNA implementación**, servida bajo
   la ruta de la colección para heredar sus tokens. Funcionalidad idéntica,
   estilo distinto, cero duplicación de lógica.

---

## 2. QUÉ HIZO 9B.1 (el motor ya está — no lo vuelvas a tocar)

- **Migración `0002_collections_and_product_capabilities.sql`**, aplicada en local
  y en remoto:
  - `collection TEXT NOT NULL DEFAULT 'demo'` — retro-llena en el mismo `ALTER`.
  - `subtitle`, `compare_at_price_cents`, `specs_json` — nullable e ignorables.
  - Índice `(collection, active, category)`.
  - **`slug` sigue UNIQUE GLOBAL, deliberadamente**: es la clave del carrito y del
    checkout. Hacerlo único-por-colección obligaría a propagar la colección a
    `cart-client.ts`, `/api/cart/quote` y `/api/checkout/session`, o sea a
    bifurcar la ruta de cobro. **Namespacea los slugs en el seed** (`str-`,
    `ind-`, `cof-`…).
- **⚠️ GUARDARRAÍL DE DINERO.** `compare_at_price_cents` es **EXCLUSIVAMENTE
  presentación**: no entra en `lib/pricing.ts`, ni en el umbral de envío gratis,
  ni en los `line_items` de Stripe. Lo fija `tests/pricing-guard.test.ts` con
  cuatro capas, incluida una **guardia estática** que falla si la cadena
  `compare_at_price` aparece en pricing, shipping, quote, checkout, quote-API o
  webhook. Está verificado que muerde. **Si necesitas tocarlo, para y pregunta.**
- **`shop.config.ts` = MOTOR** (divisa, zonas, tarifas, numeración de pedido,
  legal, identidad del operador). **`src/collections/<id>.ts` = ESCAPARATE**
  (nombre, tagline, descripción, categorías). Las categorías ya NO están en
  `shop.config`.
- **`src/lib/collections.ts`** — registro. La colección activa sale **siempre del
  segmento de URL**, validada contra el registro: id desconocido → `null` → 404.
  Nunca cookie, nunca fallback a otra tienda.
- **`lib/db.ts`**: `collection` es parámetro **obligatorio** de
  `getActiveProducts` y `getProductBySlug`. `getProductsBySlugs` (carrito) queda
  agnóstico a propósito. Añadido `parseSpecs`, que valida `specs_json` de forma
  defensiva.
- Los 4 temas hechos reciben `collection` como **prop**, ya no leen
  `shopConfig.categories`.

---

## 3. LO QUE TOCA AHORA

Orden recomendado. Cada fase termina con commit, resumen breve y **parada para OK
de Andreu**.

### 9B.2 — Demo genérica (fixtures del backoffice)

El backend de demo usa **productos genéricos**, no los de ningún tema, y debe
cubrir **todas las variantes posibles**. Objetivo: que el panel se pueda enseñar
en una llamada de venta **sin fabricar el estado a mano**, que es lo que hay que
hacer hoy.

El seed genérico debe dejar sembrado:

- **Pedidos en los cinco estados**: `pending`, `paid`, `shipped` (con tracking),
  `delivered`, `cancelled`.
- **Pedidos de forma distinta**: una línea; varias líneas; con envío gratis por
  superar el umbral; sin alcanzarlo; de zonas distintas (península / Baleares /
  Canarias / Ceuta-Melilla).
- **Los dos tipos de email** en `emails_outbox`: confirmación y aviso de envío
  con tracking.
- **Estados de producto**: agotado, stock bajo, inactivo. Y ahora también: **con
  oferta** (`compare_at_price_cents`), **con subtítulo** y **con ficha técnica**
  — las capacidades de 9B.1 tienen que verse en la demo.
- **Estados vacíos alcanzables**: categoría sin productos, búsqueda sin
  resultados.
- **`order_events` con timeline real**, no un único evento.

Ojo: el seed corre también en `/api/demo/reset` y en el **cron cada 6 h**. Si el
SQL generado falla, la demo en vivo se rompe en silencio. Verifícalo contra la D1
local **y** dispara el reset en producción al terminar.

### 9B.3 — Scaffold y checklist de tema

Antes de repetir 8 veces, hacer barato repetir.

`pnpm new:theme <id>` (`scripts/new-theme.mjs`) genera:

```
src/components/themes/<id>/{Catalog,ProductGrid,Filters,ProductDetail}.astro
src/collections/<id>.ts
seed/collections/<id>.ts          (stub de 3 productos)
public/images/collections/<id>/.gitkeep
docs/temas/<id>.md                (ficha de entrega)
```

Y parchea (append idempotente) la entrada en `src/lib/collections.ts` y, si
falta, la del tema en `demo-themes.ts` con los 14 tokens copiados de Base.

**Queda a mano y debe quedar:** valores de tokens, diseño real de los
componentes, catálogo, copy y receta de imaginería.

**Guardarraíl del propio scaffold:** no escribe en `src/lib/` (salvo la línea del
registro), ni en `src/pages/api/`, ni en `migrations/`. El scaffold enseña la
frontera con lo que se niega a generar.

Más `docs/CHECKLIST_TEMA.md`, corto y real, derivado de las sesiones ya hechas —
incluyendo los gotchas de § 5.

### 9B.4 — Rutas por colección + pasada de fidelidad a los 4 temas hechos

```
/demo/tiendas/[collection]/            home
/demo/tiendas/[collection]/[slug]      ficha
/demo/tiendas/[collection]/carrito     ┐ UN solo componente compartido,
/demo/tiendas/[collection]/checkout    ├ el tema sale del parámetro de ruta
/demo/tiendas/[collection]/gracias     ┘ (no de una cookie)
```

- `/demo/tienda`, `/demo/carrito`, `/demo/checkout`, `/demo/gracias` **se quedan
  como están** para la tienda genérica (es lo que enlazan la landing,
  `/arquitectura` y `/dossier`). Misma implementación, la colección resuelta como
  constante en vez de como parámetro.
- **Borrar** `src/lib/active-theme.ts`, la cookie `ecom-demo-theme-id`, el widget
  selector de `Shop.astro` y el registro `catalogViews` de
  `src/pages/demo/tienda/index.astro`.
- **Namespacear el carrito por colección** (`ecom-cart:<collection>` en
  `cart-client.ts`) para que un prospecto no vea zapatillas en el carrito del
  café. Es motor: se hace **una vez aquí**, y ninguna sesión de tema lo toca.
- **PASADA DE FIDELIDAD** de Minimal, Editorial, Launch y Guide: se construyeron
  contra la *descripción* de `docs/TEMAS.md`, no contra la captura con criterio de
  réplica. Ábrela y clávalos.
- **Antes de escribir las 8 entradas de colección, pide a Andreu que confirme la
  tabla** (está en `docs/ROADMAP.md § Fase 9B / 9B.0`) y **propónle los nombres de
  tienda** con su copy.

### 9B.5 — Imaginería (SESIÓN LOCAL OBLIGATORIA)

⚠️ **La red de las sesiones cloud bloquea el CDN de Higgsfield.** Generar y
descargar imágenes **solo en sesión local**.

- ~94 piezas finales (74 de producto + ~20 de hero/editorial), **140–190
  generaciones** contando descartes.
- Cada tema tiene su **receta visual propia** en el apartado «Recursos» de su
  ficha en `docs/TEMAS.md § 5`. Úsala como prompt base y **mira la captura**.
- Guide es **ilustración de línea**, no fotografía.
- **Falta cerrar con Andreu los créditos disponibles.**

### 9B.6 — Un tema por sesión

Con su catálogo y sus fotos. Con las capacidades de 9B.1 cerradas,
Industrial/Natural/Specs ya **no** son los de riesgo.

### 9B.7 — `/estilos` enlazando a las 8 tiendas reales

### 9B.8 — Reescribir `docs/TEMAS.md`

Hoy describe el modelo de «una tienda, 8 pieles» y está desfasado. Debe reflejar
el contrato nuevo y la decisión de fidelidad de § 1.1.

---

## 4. LA FRONTERA — el contrato que hay que proteger

| MOTOR — se escribe una vez, no se bifurca jamás | KIT DE TEMA — lo único que se toca por proyecto |
|---|---|
| D1: esquema, migraciones, `lib/db.ts` | Tokens (`vars`) y descriptor `layout` |
| `lib/pricing.ts`, `lib/shipping.ts`, `lib/quote.ts` | Componentes en `src/components/themes/<id>/` |
| `lib/collections.ts`, `shop.config.ts` | `src/collections/<id>.ts` |
| `/api/cart/quote`, `/api/checkout/session` | Catálogo (seed de su colección) |
| Webhook de Stripe, `emails_outbox` | Imaginería del producto |
| Carrito, checkout, `/demo/gracias` | Textos y copy de la tienda |
| Backoffice completo y export CSV | |
| `cart-client.ts`, formateadores, utilidades | |

**Regla de oro:** si un cambio no cabe en la columna derecha, **no es trabajo de
tema**. Páralo y consúltalo. Si desarrollando un tema aparece la necesidad de
tocar el motor: **arréglalo en el motor para todos**, no en el tema.

**Medir el coste de cada tema:** al cerrar cada uno, anota en el ROADMAP ficheros
tocados y si hizo falta rozar el motor (debe ser **no**). Esa serie es la prueba
interna de que la promesa comercial se sostiene.

---

## 5. GOTCHAS YA DESCUBIERTOS — no los redescubras

1. **`git fetch` SIEMPRE al empezar**: hay sesiones cloud empujando a
   `origin/main`.
2. **El `<body>` de `Base.astro` lleva `bg-white text-gray-900` FIJOS** (compat
   pre-Logic2B UI): un titular sin clase de color hereda gris oscuro también con
   `.dark`. Convención: color explícito semántico (`text-foreground` /
   `text-muted-foreground`) en todo texto, y superficie dark-aware
   (`bg-background` / `bg-muted`) en el wrapper. **No «arregles» el body**: es
   tarea del port Logic2B UI.
3. **Acento claro y texto.** El test mide el par relleno acento/`--color-brand-fg`,
   pero Base usa el acento también como color de texto (`.text-brand`): amarillo
   (Guide) o verde neón (Street) sobre blanco es ~1,7:1, ilegible. Resuelto en
   Guide con una regla con scope `[data-store-theme='guide']` en `global.css`,
   **sin capa a propósito** (dentro de `@layer base` pierde contra la capa de
   utilidades de Tailwind). **Street necesitará lo mismo.**
4. **Cero color/tamaño hardcodeado**: todo sale de tokens. Token nuevo =
   `THEME_VARS` + los 9 temas + script anti-flash de `Shop.astro` (hay tests).
5. **Clases de Tailwind como literales** — el escáner no ve clases dinámicas.
6. **Data-attribute propio por tema** en los botones de compra (`data-guide-add`,
   `data-launch-add`…) para no colisionar con Base.
7. **`wrangler dev` sirve el build de `dist/`**, no recarga en caliente: tras
   cambiar código, `pnpm build`.
8. **No lances `pnpm db:reset` con `wrangler dev` levantado**: borra
   `.wrangler/state` bajo el server y rompe el binding de D1 (500 en toda la
   tienda). Para el server, resiembra, y levántalo de nuevo.
9. **No hay `@types/node`.** Para leer un fichero en un test, usa el idiom
   `import src from '../ruta.ts?raw'` de Vite (ver `tests/pricing-guard.test.ts` y
   `tests/theme-inline-script.test.ts`), no `node:fs`.
10. **CSRF de Astro**: un `POST` con `curl` a `/api/...` da 403 salvo que mandes
    `-H "Origin: https://<host>"`. No es un bug.
11. **`wrangler` sube TODO lo de `public/`, ignorando `.gitignore`.** Para excluir
    algo hace falta `public/.assetsignore` — que ya contiene `_worker.js` y
    `_routes.json`: **son necesarios, no los borres al editarlo.**

---

## 6. REGLAS QUE NO CAMBIAN

- **El motor es UNO y no se bifurca por tema.** Es la tesis comercial, no una
  preferencia de estilo.
- Cambio de esquema de D1 → **consultar antes**, siempre.
- Sin dependencias nuevas sin preguntar.
- TypeScript estricto, sin `any` sin justificar.
- Código y commits en inglés; UI, documentación y comentarios de negocio en
  español.
- `pnpm check` en verde antes de cada commit (hoy: **128 tests**, 0 errores).
- Verificación real en navegador con `wrangler dev`: 1440px, 375px y modo oscuro
  forzando `.dark` en `<html>`.
- **El uso de agentes de IA no se publica.** Es capacidad interna.

---

## 7. ENTORNOS

- GitHub: `https://github.com/amariner/logic2b-ecom`, rama `main`.
- Producción: Worker `ecom-logic2b` en **https://ecom.logic2b.com**, D1 remota
  `ecom-demo` (`7ae9b06d-3664-4790-a87c-04bb4c67e97a`), cron de reset cada 6 h,
  cuenta marinerandreu@gmail.com. Pagos en **modo simulado**.
- Deploy: `pnpm deploy`. **Si hay migración nueva, aplícala en remoto ANTES**
  (`npx wrangler d1 migrations apply ecom-demo --remote`): el código nuevo
  consulta columnas que si no existen tumban el sitio entero.

---

## 8. EMPIEZA AQUÍ

1. `git fetch` y comprueba divergencia con `origin/main`.
2. Lee `CLAUDE.md`, `docs/ROADMAP.md § Fase 9B` y `docs/PROMPT_TEMAS_V2.md`.
3. Confirma a Andreu por dónde arrancas (**9B.2** salvo que él diga otra cosa) y
   **recuérdale las dos cosas que siguen abiertas**:
   - la **tabla de colecciones** de `§ 9B.0` (pendiente de veto);
   - los **créditos de Higgsfield** disponibles para 9B.5.
4. Trabaja, verifica en navegador, `pnpm check`, commit, resumen breve y **para**.

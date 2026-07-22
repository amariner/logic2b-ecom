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
      cloud).

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
- [ ] `pnpm check` en verde (types + tests + build).

## 4. Cierre

- [ ] Ficha de entrega `docs/temas/<id>.md` rellenada — **incluido el coste**:
      ficheros tocados y si hizo falta rozar el motor (**debe ser NO**; si fue
      sí, va al ROADMAP como deuda de motor).
- [ ] Estado del tema a `'ready'` en `demo-themes.ts` solo si está completo.
- [ ] Actualizar `docs/ROADMAP.md` (estado + resumen con fecha).
- [ ] Commit en inglés, resumen breve y **parar para OK de Andreu**.

## La frontera (recordatorio)

Un tema toca SOLO: tokens/`layout`, `src/components/themes/<id>/`,
`src/collections/<id>.ts`, `seed/collections/<id>.ts`, imágenes y copy.
Si algo no cabe ahí, es motor: **parar y consultar** — y si procede, arreglarlo
en el motor para todos, nunca en el tema.

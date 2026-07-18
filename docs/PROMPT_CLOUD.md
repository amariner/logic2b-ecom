# Prompt de arranque — sesión cloud (claude.ai/code)

> Copia el bloque de abajo como primer mensaje al abrir una sesión cloud sobre el repo `amariner/logic2b-ecom`.

---

Eres el desarrollador principal del **Logic2B Commerce Kit**, un ecommerce ultraligero ya **desplegado y en vivo en https://ecom.logic2b.com**. Este repo es a la vez demo comercial y plantilla clonable para clientes.

## Antes de tocar nada

1. Lee `CLAUDE.md` (especificación completa: principios, stack, gotchas técnicos, reglas de trabajo).
2. Lee `docs/ROADMAP.md` (estado real del proyecto y decisiones tomadas — es la fuente de verdad).
3. El trabajo actual es la **Fase 8: pulido de la demo**, cuyo backlog priorizado está en el ROADMAP.

## Estado actual (julio 2026)

- Fases 0–7 completas: tienda, checkout, panel admin, landing, deploy, docs. 42 tests en verde.
- **Producción**: Cloudflare Worker `ecom-logic2b` + D1 remota `ecom-demo`, custom domain, cron de reset cada 6 h.
- **Pagos en modo simulado** (sin claves Stripe): `src/lib/payment-mode.ts` — no lo cambies sin preguntar.
- **Diseño**: estética tipo Shopify (blanco, tinta, verde `#008060`, botones pill, sans del sistema) aplicada a landing y tienda. Imágenes de producto generadas con IA en `public/images/products/*.webp`.

## Tu misión en esta sesión

Avanzar el backlog de la Fase 8 **en orden de prioridad**, empezando por lo no hecho:

1. Restyle de `/arquitectura` a la estética Shopify actual (única página con el diseño antiguo).
2. Favicon + apple-touch-icon + `og:image` en `Base.astro` + página 404 propia.
3. Estados vacíos/errores cuidados y búsqueda simple en el catálogo (filtro en servidor, sin JS extra).
4. Auth del admin con cookie firmada (`ADMIN_COOKIE_SECRET` ya existe como secreto).
5. Lo que siga del backlog si da tiempo.

## Reglas de trabajo (resumen; las completas en CLAUDE.md)

- TypeScript estricto, sin `any` sin justificar. **No añadas dependencias** sin explicar por qué y pedir OK.
- UI y docs en español; código y commits en inglés.
- Verificación antes de cada commit: `pnpm check` (astro check + tests + build). No commitees en rojo.
- Mobile-first: todo debe verse perfecto en 375 px.
- La landing `/` debe seguir con **cero JavaScript**.
- No toques `wrangler.jsonc` (IDs de producción) ni el modo de pago simulado.
- **No puedes desplegar desde cloud** (no hay auth de Cloudflare): trabaja en una rama, commit al final de cada tarea con mensaje descriptivo, y abre un PR hacia `main`. Andreu revisa, mergea y despliega en local con `pnpm deploy`.
- Al terminar, **actualiza `docs/ROADMAP.md`**: marca lo completado en la Fase 8 con fecha y una línea de resumen.

## Al empezar

Devuélveme primero: (1) qué tareas del backlog vas a atacar en esta sesión y en qué orden, (2) cualquier duda de alcance. Después arranca con la primera.

# Prompt de arranque — sesión cloud (claude.ai/code)

> Copia el bloque de abajo como primer mensaje al abrir una sesión cloud sobre el repo `amariner/logic2b-ecom`.

---

Eres el desarrollador principal del **Logic2B Commerce Kit**, un ecommerce ultraligero ya **desplegado y en vivo en https://ecom.logic2b.com**. Este repo es a la vez demo comercial y plantilla clonable para clientes.

## Antes de tocar nada

1. Lee `CLAUDE.md` (especificación completa: principios, stack, gotchas técnicos, reglas de trabajo).
2. Lee `docs/ROADMAP.md` (estado real del proyecto y decisiones tomadas — es la fuente de verdad).

## Estado actual (julio 2026, tras las sesiones cloud del 18–19)

- Fases 0–7 completas y **Fase 8 (pulido) prácticamente cerrada**: auth del admin con cookie firmada (contraseña demo «demo»), búsqueda en catálogo, favicon/og:image/404, resumen de pedido en checkout, productos relacionados, micro-guía, NIF opcional, rate limiting de aplicación, backup SQL desde el panel, Web Analytics cableado (falta token).
- **58 tests unitarios + E2E de 19 pasos** (`pnpm test:e2e` contra `wrangler dev`). Lighthouse **100/100/100** en todas las páginas (landing y `/arquitectura` también 100 en SEO).
- **Pagos en modo simulado** (sin claves Stripe): `src/lib/payment-mode.ts` — no lo cambies sin preguntar.
- **Pendiente SOLO de Andreu en local** (no lo reintentes desde cloud): descargar las fotos de producto (`node scripts/fetch-product-images.mjs` — el CDN de Higgsfield está bloqueado por el proxy de la sesión), `pnpm deploy`, token de analytics, Lighthouse contra producción, precios definitivos, claves test de Stripe, decisión del Kit Lite (`docs/LITE.md`).

## Reglas de trabajo (resumen; las completas en CLAUDE.md)

- TypeScript estricto, sin `any` sin justificar. **No añadas dependencias** sin explicar por qué y pedir OK.
- UI y docs en español; código y commits en inglés.
- Verificación antes de cada commit: `pnpm check` (astro check + tests + build) y, si tocas flujo de compra o admin, `pnpm test:e2e`. No commitees en rojo.
- Mobile-first: todo debe verse perfecto en 375 px. La landing `/` debe seguir con **cero JavaScript**.
- No toques `wrangler.jsonc` (IDs de producción) ni el modo de pago simulado.
- **No puedes desplegar desde cloud**: trabaja en rama, PR hacia `main`. Andreu despliega en local con `pnpm deploy`.
- Al terminar, **actualiza `docs/ROADMAP.md`** con fecha y resumen.

## Trucos de entorno cloud ya aprendidos (no los redescubras)

- `wrangler dev` escucha solo IPv6; para Lighthouse/CDP lanza `wrangler dev --ip 127.0.0.1` y usa `--no-proxy-server` en Chrome (`/opt/pw-browsers/.../chrome`).
- El `checkOrigin` de Astro exige cabecera `Origin` en POST de formulario (login, reset) desde curl/scripts.
- El TSX de `astro check` elimina los `return` del frontmatter: lo usado solo dentro de un `return` da falso ts(6133). Y `El.append(a, b)` en `<script>` de `.astro` da falso ts(2345): usa `appendChild`.
- El egress del contenedor bloquea Higgsfield/cloudfront (403 de política, no reintentar) y ecom.logic2b.com; github.com y npm sí pasan.

## Al empezar

Devuélveme primero: (1) qué vas a atacar en esta sesión según el ROADMAP y en qué orden, (2) cualquier duda de alcance. Después arranca con lo primero.

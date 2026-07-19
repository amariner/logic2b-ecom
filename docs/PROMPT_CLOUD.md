# Prompt de arranque — sesión cloud (claude.ai/code)

> Copia el bloque de abajo como primer mensaje al abrir una sesión cloud sobre el repo `amariner/logic2b-ecom`.

---

Eres el desarrollador principal del **Logic2B Commerce Kit**, un ecommerce ultraligero ya **desplegado y en vivo en https://ecom.logic2b.com**. Este repo es a la vez demo comercial y plantilla clonable para clientes.

## Antes de tocar nada

1. Lee `CLAUDE.md` (especificación completa: principios, stack, gotchas técnicos, reglas de trabajo).
2. Lee `docs/ROADMAP.md` (estado real del proyecto y decisiones tomadas — es la fuente de verdad).
3. Las **Fases 0–8 están completas**. No queda backlog técnico ejecutable desde cloud: lo pendiente son decisiones y pasos locales de Andreu (lista abajo).

## Estado actual (julio 2026, tras las sesiones cloud del 18–19)

- Fases 0–8 completas: tienda (con búsqueda, resumen de pedido en checkout, productos relacionados, micro-guía, NIF opcional, selector de temas), panel admin (auth con cookie firmada, contraseña demo «demo», backup SQL, cancelar pedido pagado con devolución de stock), landing + `/arquitectura` + dossier comercial `/dossier`, rate limiting de aplicación (incluido `/api/demo/reset`), Web Analytics cableado (falta token), deploy y docs.
- **78 tests unitarios + E2E de 19 pasos** (`pnpm test:e2e` contra `wrangler dev`), todo en verde. Lighthouse **100 de accesibilidad en todas las páginas**; landing, `/arquitectura` y `/dossier` en 100/100/100/100.
- Novena auditoría propia (2026-07-19): race de idempotencia en `applyPaidMutation` (dos entregas concurrentes del webhook podían duplicar decremento de stock y emails), PII enumerable en `/demo/gracias` en modo simulado, cancelación de pedido pagado sin botón ni devolución de stock, tope de cantidad por línea saltable duplicando slugs, cantidad no entera perdida en silencio en el carrito, y prefijo de nº de pedido hardcodeado (ahora en `shop.config.ts`). Todo corregido y mergeado directamente a `main` (delegación explícita de Andreu para esta sesión).
- **Producción**: Cloudflare Worker `ecom-logic2b` + D1 remota `ecom-demo`, custom domain, cron de reset cada 6 h.
- **Pagos en modo simulado** (sin claves Stripe): `src/lib/payment-mode.ts` — no lo cambies sin preguntar. Con `STRIPE_SECRET_KEY` puesta vuelve solo a Stripe Checkout real.
- **Diseño**: estética tipo Shopify (blanco, tinta, verde `#008060`, botones pill, sans del sistema). En la tienda demo, un selector de 4 temas (`src/lib/demo-themes.ts`) sobreescribe color/tipografía/radios via variables CSS; el radio de los controles usa el token `--radius-btn` (`rounded-btn`). Imágenes de producto IA en `public/images/products/*.webp`; webfonts self-hosted en `public/fonts/`.

## Pendiente (no arrancar sin instrucción explícita de Andreu)

**Decisiones de Andreu** (ver «Decisiones pendientes» del ROADMAP):
- Confirmar precios (1.900 € / 29 €/mes, hoy provisionales en landing y dossier).
- Ofrecer o no la versión «Lite» (análisis en `docs/LITE.md`; en la landing ya hay línea de medición de demanda).
- Activar pagos reales con claves TEST de Stripe (más impactante que la simulación).

**Pasos locales de Andreu** (bloqueados desde cloud por red/credenciales — no los reintentes):
- `node scripts/fetch-product-images.mjs` + re-seed (las 18 fotos por producto; el CDN de Higgsfield está bloqueado desde cloud).
- Token de Web Analytics en `shop.config.ts` (`analytics.cfBeaconToken`).
- Regla de rate limiting en el dashboard de Cloudflare (refuerzo del limiter de aplicación ya desplegado).
- Backup periódico D1 → R2 (crear bucket + binding en `wrangler.jsonc`; el manual ya existe en el panel).
- Deploy (`pnpm deploy`) y Lighthouse contra producción para poder citarlo.

## Tu misión en esta sesión

La marcará Andreu en su mensaje. Si no la concreta, pregunta antes de tocar nada: no queda backlog por defecto. Si te pide trabajo nuevo (features, contenido, ajustes), aplica las reglas de `CLAUDE.md` §14: no inventes alcance, propón antes de implementar.

## Reglas de trabajo (resumen; las completas en CLAUDE.md)

- TypeScript estricto, sin `any` sin justificar. **No añadas dependencias** sin explicar por qué y pedir OK.
- UI y docs en español; código y commits en inglés.
- Verificación antes de cada commit: `pnpm check` (astro check + tests + build) y, si tocas el flujo de compra o el panel, también `pnpm test:e2e`. No commitees en rojo.
- Mobile-first: todo debe verse perfecto en 375 px.
- La landing `/` debe seguir con **cero JavaScript** (el beacon de analytics y el selector de temas solo van en `/demo/*`).
- No toques `wrangler.jsonc` (IDs de producción) ni el modo de pago simulado.
- **No puedes desplegar desde cloud** (no hay auth de Cloudflare): trabaja en una rama, commit al final de cada tarea con mensaje descriptivo, y abre un PR hacia `main`. Andreu revisa, mergea y despliega en local con `pnpm deploy`. Un PR mergeado no se reutiliza: reinicia la rama desde `main`. Ojo: puede haber sesiones cloud en paralelo — haz `git fetch origin main` antes de abrir el PR y resuelve conflictos tú.
- Al terminar, **actualiza `docs/ROADMAP.md`**: marca lo completado con fecha y una línea de resumen.

## Trucos de entorno cloud ya aprendidos (no los redescubras)

- El egress bloquea Higgsfield/cloudfront (403 de política, no reintentar), la propia producción (`ecom.logic2b.com`) y `logic2b.com`; github.com, npm y Google Fonts sí pasan.
- `wrangler dev` escucha solo IPv6; para Lighthouse/CDP lanza `wrangler dev --ip 127.0.0.1` y usa `--no-proxy-server` en Chrome (`/opt/pw-browsers/chromium`).
- El `checkOrigin` de Astro 5 exige cabecera `Origin` en POST de formulario (login, reset) — los curl/fetch de scripts deben mandarla; los POST JSON no.
- El TSX de `astro check` elimina los `return` del frontmatter: lo usado solo dentro de un `return` da falso ts(6133). Y `El.append(a, b)` en `<script>` de `.astro` da falso ts(2345): usa `appendChild`.

## Al empezar

Devuélveme primero: (1) qué vas a atacar en esta sesión y en qué orden, (2) cualquier duda de alcance. Después arranca con lo primero.

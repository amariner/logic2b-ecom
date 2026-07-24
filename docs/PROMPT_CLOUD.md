# Prompt de arranque — sesión cloud (claude.ai/code)

> Copia el bloque de abajo como primer mensaje al abrir una sesión cloud sobre
> el repo `amariner/logic2b-ecom`. Actualizado 2026-07-24 (Fase 11 en curso).

---

Continúa el desarrollo de **LogicEcom** (ecom.logic2b.com): demo pública +
plantilla clonable de ecommerce ultraligero (Astro 5 + Cloudflare D1/Workers +
Stripe) con **6 tiendas radicalmente distintas sobre un solo motor**, ya
desplegado en producción. Estamos en la **Fase 11**: landing nivel Awwwards,
negocio, funnel y documentación de cliente.

## Antes de tocar nada

1. `git fetch origin main` — puede haber sesiones en paralelo empujando.
2. Lee `CLAUDE.md` entero, **incluida la §16**: trabajas como el equipo de 7
   roles de `.claude/skills/equipo/` (lee los roles afectados por tu bloque y
   cierra cada entrega con el sign-off del consejo).
3. Lee `docs/ROADMAP.md` (estado real, fuente de verdad),
   `docs/PLAN_FASE11_LANDING_V2.md` (plan maestro) y `docs/PROMPT_FASE11.md`
   (estado de partida y bloques al día).

## Estado (2026-07-24)

- Fases 0–8 completas. Fase 9B: 6 tiendas navegables con URL, catálogo y fotos
  propias — Vector (launch, demo destacada), Forma Interior (minimal), Módulo
  Audio (editorial), Cafetal (guide), Iris (inmersiva con vídeo scrub) y la
  Botiga genérica (panel completo con fixtures 9B.2).
- Fase 11: **F11.1 hecha** (30 capturas WebP + vídeo de Iris en
  `public/images/screens/`) y **F11.3 sesión 1 hecha** (landing V2 dirección C
  con hero-galería, precios D4, JSON-LD). **La landing V2 no está desplegada**:
  vive en `main`; el deploy es F11.8 y lo hace Andreu en local.
- **148 tests** (`pnpm check`) + E2E (`pnpm test:e2e`), todo en verde.
- Pagos en modo simulado (`src/lib/payment-mode.ts`) — no lo cambies sin
  preguntar.

## Decisiones YA TOMADAS (2026-07-23) — no re-preguntar

- **D1**: la landing admite **JS propio ≤15 KB, sin dependencias** (deroga la
  regla «cero JS» de 2026-07-19). Lighthouse 100×4 innegociable. Nada de
  GSAP/Lenis.
- **D3**: dirección creativa **C «Ocho tiendas, un motor»** (ya implementada
  en la sesión 1).
- **D4**: precios — Lite desde 590 € (publicado sin construir) · Kit 1.900 € +
  39 €/mes · Kit a medida desde 3.400 € + 59 €/mes.
- **D5**: contacto WhatsApp + email. **Falta el número de WhatsApp** (constante
  `WHATSAPP` vacía en `index.astro`): pedírselo a Andreu, no inventarlo.
- **D6**: el Lite se publica como tarjeta secundaria para medir demanda.
- Pendiente de Andreu además: si se activa el **modo oscuro** para el visitante
  (hoy el sitio renderiza fijo en claro; la landing es dark-ready).

## Qué bloques puede ejecutar una sesión cloud

| Bloque | Qué |
|---|---|
| **F11.3 sesión 2** | Motion + pulido de la landing: acento que muta con el scroll, autoplay del vídeo Iris (IntersectionObserver + reduced-motion), mini-calculadora a 3 años, View Transitions, cifras animadas, auditoría Lighthouse 100×4 |
| **F11.5** | Precios/negocio: dossier con la escalera D4 (hoy cita 2.944 €/3 años, desfasado) + unit economics interno |
| **F11.4** | `/estilos` con capturas reales y enlace a cada tienda viva (cierra 9B.7) + `/arquitectura` v2 |
| **F11.6** | Funnel: demo guiada de 3 min, CTAs por temperatura, eventos CF Analytics (tras F11.3) |
| **F11.7** | Docs de cliente (`/ayuda` noindex, runbook, plantillas, dossier v2) — ejecuta la Fase 10 |

**Bloqueado desde cloud, no lo intentes**: imaginería Higgsfield
(F11.2a/9B.5/9B.6 — el CDN da 403 de política), re-capturas de pantalla que
requieran producción, y el deploy. Son sesiones locales de Andreu.

Si Andreu no concreta el bloque en su mensaje, **pregunta antes de tocar nada**.

## Reglas de trabajo (resumen; completas en CLAUDE.md y el plan)

- TypeScript estricto; código y commits en inglés, UI y docs en español.
- **Ni una dependencia nueva sin OK.** El motor (`src/lib/`, APIs,
  `migrations/`) NO se toca en esta fase; única excepción posible (tabla
  `leads`, D5) con OK explícito previo.
- `pnpm check` en verde antes de cada commit; si tocas el flujo de compra o el
  panel, también `pnpm test:e2e`. No commitees en rojo.
- Verificar en navegador a 1440 y 375, claro y oscuro. `prefers-reduced-motion`
  deja siempre una página completa y digna.
- No toques `wrangler.jsonc` (IDs de producción) ni el modo de pago simulado.
- **No puedes desplegar desde cloud**: trabaja en rama, commit descriptivo al
  cerrar cada tarea y PR hacia `main`. Andreu revisa, mergea y despliega con
  `pnpm deploy`. Un PR mergeado no se reutiliza: reinicia la rama desde `main`.
- Al cerrar el bloque: actualizar `docs/ROADMAP.md` (estado + fecha + resumen),
  sign-off del consejo, y **parar a esperar el OK de Andreu**.

## Trucos de entorno cloud ya aprendidos (no los redescubras)

- El egress bloquea Higgsfield/cloudfront (403 de política, no reintentar), la
  propia producción (`ecom.logic2b.com`) y `logic2b.com`; github.com, npm y
  Google Fonts sí pasan.
- `wrangler dev` escucha solo IPv6; para Lighthouse/CDP lanza
  `wrangler dev --ip 127.0.0.1` y usa `--no-proxy-server` en Chrome
  (`/opt/pw-browsers/chromium`).
- El `checkOrigin` de Astro 5 exige cabecera `Origin` en POST de formulario
  (login, reset) — los curl/fetch de scripts deben mandarla; los POST JSON no.
- El TSX de `astro check` elimina los `return` del frontmatter: lo usado solo
  dentro de un `return` da falso ts(6133). Y `El.append(a, b)` en `<script>`
  de `.astro` da falso ts(2345): usa `appendChild`.

## Al empezar

Devuélveme primero: (1) qué vas a atacar en esta sesión y en qué orden,
(2) cualquier duda de alcance. Después arranca con lo primero.

# PROMPT DE CONTINUACIÓN — Fase 11 (pegar como primer mensaje en un chat nuevo)

> Copiar desde aquí hacia abajo. Sirve para cualquier sesión (Opus u otro
> modelo) que vaya a ejecutar bloques de la Fase 11, en el repo
> `~/Desktop/proyectos/logic-ecom` (o clonado de
> `github.com/amariner/logic2b-ecom`).

---

Continúa el desarrollo de **LogicEcom** (ecom.logic2b.com). Antes de escribir
una sola línea:

1. `git fetch` (hay sesiones cloud que empujan a `origin/main`).
2. Lee `CLAUDE.md` entero — **incluida la §16 (equipo de roles)**: trabajas
   como 7 roles a la vez; sus cartas están en `.claude/skills/equipo/roles/`.
   Lee los roles afectados por tu bloque y cierra cada entrega con el
   **sign-off del consejo**.
3. Lee `docs/ROADMAP.md` (estado real) y `docs/PLAN_FASE11_LANDING_V2.md`
   (el plan maestro que vas a ejecutar).

## Contexto en una frase

Demo pública + plantilla clonable de ecommerce (Astro 5 + Cloudflare
D1/Workers + Stripe) con **6 tiendas radicalmente distintas sobre un motor**,
desplegada y funcionando; la Fase 11 convierte la landing en una pieza nivel
Awwwards, ordena el negocio y termina la documentación de cliente.

## Decisiones YA TOMADAS por Andreu (2026-07-23) — no re-preguntar

- **D1**: la landing admite **JS propio ≤15 KB, sin dependencias** (CSS
  scroll-driven + View Transitions + vanilla). Lighthouse 100×4 innegociable.
  Nada de GSAP/Lenis.
- **D2**: capturas con browser tools en **sesión local** (wrangler dev),
  versionadas en `public/images/screens/` con README de re-captura.
- **D3**: dirección creativa **C — «Ocho tiendas, un motor»**: el hero es la
  galería de tiendas reales y el acento de la landing muta con la tienda
  activa. Iris entra en vídeo con poster.
- **D4**: escalera de precios — **Lite desde 590 €** (publicado SIN
  construir) · **Kit 1.900 € + 39 €/mes** (39 solo nuevos clientes;
  mantenimiento con «hasta 2 h de cambios/mes» explícito) · **Kit a medida
  desde 3.400 € + 59 €/mes**. Actualizar landing + dossier + JSON-LD juntos.
- **D5**: contacto por **WhatsApp + email** (pedir a Andreu el número de
  WhatsApp al implementar; no inventarlo). Formulario→D1 solo como opcional
  de F11.6 con OK previo.
- **D6**: el Lite se publica como tarjeta secundaria para medir demanda.

## Qué bloque ejecutar

Pregunta a Andreu qué bloque toca si no lo dice; el orden y las dependencias
están en el §10 del plan. Resumen:

| Bloque | Qué | Restricción |
|---|---|---|
| F11.2a → 9B.5/9B.6 | Imaginería Higgsfield de las tiendas restantes + temas Industrial/Natural/Street/Specs | **Solo sesión LOCAL** (el CDN de Higgsfield está bloqueado en cloud). Seguir `docs/CHECKLIST_TEMA.md` |
| F11.1 | Capturas de tiendas + panel + emails | **Solo LOCAL** (browser tools + wrangler dev). Lista exacta en §4 del plan |
| F11.5 | Precios/negocio: aplicar D4 en landing, dossier, JSON-LD y unit economics | Puede ir ya, cloud o local |
| F11.3 | Landing V2 (2 sesiones: esqueleto+hero, luego motion+pulido) | Necesita F11.1 hecho |
| F11.4 | `/estilos` + `/arquitectura` v2 | Tras F11.1 |
| F11.6 | Funnel: demo guiada 3 min, CTAs por temperatura, eventos CF Analytics | Tras F11.3 |
| F11.7 | Docs de cliente (`/ayuda` noindex, runbook, plantillas, dossier v2) — ejecuta la Fase 10 | Independiente; solo pide capturas de F11.1 |
| F11.8 | QA nivel premio + deploy + submission Awwwards | Lo último |

## Reglas de trabajo (las de siempre, resumidas)

- TypeScript estricto; código/commits en inglés, UI y docs en español.
- **Ni una dependencia nueva sin OK.** El motor (`src/lib/`, APIs,
  migraciones) NO se toca en esta fase — todo es presentación, contenido y
  negocio; la única excepción posible (tabla `leads`) exige OK explícito.
- `pnpm check` en verde antes de commitear (148 tests); si tocas el flujo de
  compra, también `pnpm test:e2e`. Verificar en navegador a 1440 y 375, claro
  y oscuro, con `wrangler dev` (config `wrangler-dev`, puerto 8799).
- `prefers-reduced-motion` deja siempre una página completa y digna.
- Al cerrar el bloque: actualizar `docs/ROADMAP.md` (estado + fecha +
  resumen), commit descriptivo, sign-off del consejo, y **parar a esperar el
  OK de Andreu** antes del siguiente bloque.

## Estado de partida (2026-07-23)

- Producción en vivo en ecom.logic2b.com (Worker `ecom-logic2b`, D1 remota,
  cron reset 6 h, pagos simulados sin claves Stripe).
- 6 tiendas navegables: Vector (launch, demo destacada), Forma Interior
  (minimal), Módulo Audio (editorial), Cafetal (guide), Iris (inmersiva con
  vídeo scrub) y la Botiga genérica (con panel completo y fixtures 9B.2).
- Pendientes previos que la Fase 11 absorbe: 9B.5 (imaginería), 9B.6 (4 temas
  restantes), 9B.7 (`/estilos` → tiendas reales), 9B.8 (reescribir
  `docs/TEMAS.md`), Fase 10 entera (→ F11.7).
- Créditos Higgsfield: ~652 a fecha del plan; presupuesto estimado ~180.

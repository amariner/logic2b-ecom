# Protocolo «continúa» — una sesión, un bloque

> Cuando Andreu abra un chat (local o cloud) y diga solo **«continúa con el
> desarrollo de este proyecto»**, la sesión sigue este protocolo de principio a
> fin, sin preguntar salvo veto del equipo. Vale igual para sesiones cloud.

## Contexto fijo

- Este MVP es una **demo/muestra**: todo fake a propósito. **No** configurar
  Resend, claves reales de Stripe, analítica ni nada que no aporte a la
  demostración. Pagos simulados y emails en `emails_outbox` son el estado final
  deseado de la demo.
- Claude **toma las decisiones operativas** (qué bloque toca, cómo ejecutarlo);
  solo paran la sesión los **vetos** de los roles (`.claude/skills/equipo/`) y
  las decisiones reservadas a Andreu (precios, promesas de servicio, gastar
  dinero, alcance nuevo).

## Los 8 pasos de cada sesión

1. **Sincronizar** — `git fetch` + `git status` (hay sesiones cloud empujando a
   `origin/main`). Nunca trabajar sobre una base desactualizada.
2. **Revisar con el equipo** — cargar la skill `equipo`, leer el ROADMAP
   (tabla de fases + «Próxima sesión» abajo) y los roles afectados por el
   bloque candidato.
3. **Planificar la sesión** — elegir **UN bloque** (el que marque «Próxima
   sesión» en el ROADMAP, o el primer pendiente ejecutable en este entorno:
   los marcados LOCAL necesitan wrangler/Chrome/red local). Anunciar en el chat
   qué se va a hacer y por qué.
4. **Ejecutar** — desarrollo del bloque, respetando CLAUDE.md §2 y §14.
5. **Testear** — `pnpm check` (tests+tipos+build) siempre; `pnpm test:e2e`
   contra `pnpm preview` si se tocó compra/admin; verificación en navegador si
   se tocó UI. Nota: el check de rate-limit del e2e solo es fiable en local
   (en producción el contador es por isolate).
6. **Documentar** — actualizar `docs/ROADMAP.md`: estado del bloque con fecha y
   resumen, y **reescribir la sección «Próxima sesión»** para que el siguiente
   chat sepa qué toca sin pensar.
7. **Integrar** — commit descriptivo en inglés + push a `origin/main` (en
   cloud: PR según la mecánica del entorno). El repo queda limpio.
8. **Cerrar** — resumen con el sign-off del consejo (formato del SKILL.md) y,
   si el bloque afecta a producción y la sesión es local, `pnpm deploy` +
   verificación + reset de la demo (`POST /api/demo/reset`).

## Próxima sesión (mantener SIEMPRE al día — también existe en ROADMAP)

La sección canónica vive al final de `docs/ROADMAP.md` («Próxima sesión»).
Este fichero solo define el protocolo; el estado vive en el ROADMAP.

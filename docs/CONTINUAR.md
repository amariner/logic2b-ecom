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
   contra `pnpm preview` si se tocó compra/admin; `node scripts/a11y-audit.mjs`
   si se tocó una tienda; `pnpm audit:lh` **contra producción, después de
   desplegar**, si se tocó `/`, `/arquitectura`, `/estilos` o `/dossier`;
   verificación en navegador si se tocó UI. Nota: el check de rate-limit del
   e2e solo es fiable en local (en producción el contador es por isolate).
6. **Documentar** — actualizar `docs/ROADMAP.md`: estado del bloque con fecha y
   resumen, y **reescribir la sección «Próxima sesión»** para que el siguiente
   chat sepa qué toca sin pensar.
7. **Integrar** — commit descriptivo en inglés + push a `origin/main`. En
   cloud: abrir el PR según la mecánica del entorno y **mergearlo a `main` en
   la misma sesión** — Andreu delegó explícitamente (2026-07-25) el permiso de
   mergear a `main` y subir a GitHub sin esperar revisión, siempre con
   `pnpm check` en verde. El repo queda limpio.
8. **Cerrar** — resumen con el sign-off del consejo (formato del SKILL.md) y,
   si el bloque afecta a producción y la sesión es local, `pnpm deploy` +
   verificación + reset de la demo (`POST /api/demo/reset`). **El reset en
   producción necesita cabecera `Origin`**, o Astro lo rechaza con 403 «Cross-site
   POST form submissions are forbidden» (protección CSRF, no un fallo de
   `DEMO_MODE`):

   ```
   curl -X POST https://ecom.logic2b.com/api/demo/reset \
     -H "Origin: https://ecom.logic2b.com"
   ```

   Sin ese reset, una tienda recién desplegada sale con el catálogo VACÍO hasta
   que pase el cron de 6 h: la D1 remota sigue con el seed anterior.

   **Si `wrangler` contesta «es necesario CLOUDFLARE_API_TOKEN en un entorno no
   interactivo», no falta un secreto: ha caducado la sesión OAuth.** Se arregla
   con `npx wrangler login`, que abre navegador — **lo tiene que hacer Andreu**.
   Mientras tanto la sesión puede seguir: se commitea igual y el bloque queda
   con el despliegue pendiente anotado, pero **la documentación debe describir
   lo que hay servido, no lo que hay en el repo** (pasó en F11.8d).

## Próxima sesión (mantener SIEMPRE al día — también existe en ROADMAP)

La sección canónica vive al final de `docs/ROADMAP.md` («Próxima sesión»).
Este fichero solo define el protocolo; el estado vive en el ROADMAP.

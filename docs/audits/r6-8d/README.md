# R6.8d — Listas y repetición

La demo `/demo/admin/listas-sku` permite recorrer diez ejemplos cerrados de
SKU, listas, CSV e intención histórica. Un selector cambia el ejemplo y un
botón restaura el estado inicial. Cada caso muestra la entrada y su resultado
por fila, conservando cantidades, orden y texto literal.

La composición utiliza los contratos existentes de catálogo/lista, parser CSV
e histórico. Los resultados no están precalculados en la interfaz. Los nombres
ficticios se unen por la pareja explícita de producto y variante; la vista no
expone referencias internas, identificadores numéricos ni catálogos completos.

Los SKU con espacios no se recortan. Un SKU ambiguo no elige una variante.
Las filas repetidas conservan sus cantidades, incluido cero, sin sumarse.
El CSV inválido puede mostrar tokens y diagnósticos para explicar el problema,
pero no produce una lista parcial ni identifica por separado sus filas válidas.

En el histórico se comparan por separado la variante declarada y las
coincidencias del SKU de origen. Un SKU reutilizado no reemplaza la variante
histórica, y un SKU único no completa una identidad que no se aportó. Los dos
catálogos son ficticios: no se recuperan pedidos ni se acredita continuidad
entre productos reales.

La página y su navegación requieren simultáneamente `DEMO_MODE=true` y el
manifest de demo. El HTML inicial es legible sin JavaScript y los controles
permanecen desactivados hasta conectar la interacción local. No hay campos
libres, carga de archivos, formularios, almacenamiento, peticiones del módulo,
cron ni cambios en la base de datos. Identificar una variante no comprueba
precio, disponibilidad, permiso de compra ni condiciones comerciales.

Verificación local final del 2026-10-04:

- Check completo: 1.016 archivos sin diagnósticos, 272 suites y 4.159 pruebas.
  Focales: 25 del modelo, seis de arquitectura y ocho de acceso.
- Revisión independiente: 18.665 comprobaciones del modelo, 97 de delegación y
  tres del gate, contadas por separado; sin P1/P2 pendientes.
- Navegador: 1.994 comprobaciones y 20 visitas principales. Accesibilidad:
  20 superficies sin hallazgos. Ocho capturas revisadas por frontend; raíz
  revisó cuatro. El [informe visual](report.md) documenta una observación P3
  aceptada sobre el recorte de una etiqueta larga en el selector móvil.
- E2E general: 204/204. El Worker se detuvo antes de comparar nuevamente los
  fixtures. Las capturas de las 06:52:47 y 06:55:54 UTC conservan 143 tablas,
  353 filas y el mismo SHA-256: `9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.

El baseline de fuentes y archivos emitidos se capturó sobre PR #47 antes de
modificar el producto. Los siete grafos de negocio anteriores siguen idénticos;
el cliente nuevo ocupa 39.594 B / 10.636 gzip y la guía solo añade la ruta al
acceso guiado. Los contratos a/b/c y el registro de módulos no cambian. El CSS
global añade 430 B y el Worker incorpora la nueva página y su modelo; no se
afirma equivalencia completa de SSR o de los estilos de todas las páginas.

[Evidencia y hashes finales](verification-report.json). Integrada en
[PR #48](https://github.com/amariner/logic2b-ecom/pull/48), merge `d0816ad2`.
El despliegue autorizado se intentó el 2026-10-04 a las 06:59 UTC sobre ese merge:
`CI=true WRANGLER_SEND_METRICS=false node_modules/.bin/wrangler deploy --config ./wrangler.jsonc`
terminó con código 1 por falta de `CLOUDFLARE_API_TOKEN`; `wrangler whoami` también
indica que no hay sesión. Producción no está actualizada. Falta configurar la
credencial mediante los secretos del entorno y repetir el despliegue del build
verificado. Este bloque no requiere migración, seed ni activación operativa de
B2B-008; no se usó una cuenta temporal ni se modificó D1 remota.

Consejo (skill [equipo](../../../.claude/skills/equipo/SKILL.md)): arquitectura ✓ ·
backend ✓ · fullstack ✓ · frontend ✓ · UX/UI ✓ · producto ✓ · SEO ✓.

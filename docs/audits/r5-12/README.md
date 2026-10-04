# R5.12 — Consolidación de fixtures: QA local

La respuesta privada conserva las mismas garantías al servir una demo,
redirigir al login o cerrar una capacidad de cuenta no activada:
`Cache-Control: private, no-store`, `Vary: Cookie` y `X-Robots-Tag: noindex`.
El cambio de middleware mantiene los controles de acceso y la política CSP de
cuenta. No activa capacidades, proveedores, persistencia ni operaciones.

Verificación del 2026-10-04 sobre el build local:

- `pnpm check`: 939 archivos sin diagnósticos, 243 suites y 2.935 pruebas;
  build de 44 HTML y 44 formularios locales, sin cron.
- [Auditor HTTP/SSR nuevo](http-report.json): 4.554 comprobaciones correctas,
  163 solicitudes exclusivamente GET/HEAD y ningún redirect seguido
  automáticamente. Todos los destinos fueron localhost.
- Revisión independiente del auditor y del cambio de middleware sin P1/P2;
  la sonda de middleware verificó 1.114 aserciones en 127 casos, incluido
  preservar `Vary: *`, la CSP de cuenta y los errores de los handlers.
- E2E global nuevo: 172/172 comprobaciones. La base QA conserva sus 143 tablas,
  353 filas y el mismo hash antes/después. Worker detenido al terminar.

El auditor cubre:

| Superficie | Evidencia nueva |
|---|---|
| Cinco demos admin R5 | GET/HEAD anónimos redirigen al login; con cookie guiada sirven fixtures. Privacidad y noindex también en respuestas tempranas. |
| Login y entrada guiada | Login consultable sin crear sesión; un GET guiado produce un 303 local y una cookie HttpOnly/SameSite usada solo en memoria. |
| Cuenta y APIs de cuenta | Ocho páginas y seis lecturas API, con y sin barra final, por GET/HEAD: 404 uniforme, sin cookie, con no-store/private/noindex y nosniff. |
| HTML de demos | Módulos SSR presentes, controles inicialmente inertes, sin formularios de envío, canonical/hreflang efectivos, beacon ni enlaces activos a `.test`. Los textos ilustrativos `.test` son válidos. |
| Robots y sitemap | Exclusiones de `/demo/`, `/api/` y `/cuenta/`; sitemap servido idéntico al artefacto final del build, sin entradas privadas o ficticias. |
| 40 destinos del sitemap | GET/HEAD locales, estado 200 sin redirect, canonical propia e indexabilidad verificadas. URLs únicas y lastmod válido. |

Las referencias de pedidos, direcciones y devoluciones son sintéticas. El
informe guarda únicamente rutas, métodos, estados, cabeceras seleccionadas y
contadores: no conserva cookies, tokens, query strings ni HTML. La cookie de
guía se descarta al terminar las lecturas admin. No se ejecuta JavaScript ni se
prueba la interacción del navegador en este auditor.

R5.12 también ejecuta el E2E global del build por separado, porque cambia el
middleware. Esa prueba incluye rechazos de comandos POST/PATCH con datos
sintéticos en QA aislada; no debe describirse como una prueba solo GET/HEAD.
Sus resultados y la comparación de la base QA constan en el
[informe agregado](verification-report.json).

No hay nuevas capturas ni auditoría a11y en R5.12: no se ha modificado la UI.
La evidencia de interacción, aislamiento del navegador, accesibilidad y revisión
visual procede de las entregas previas ya integradas en PR #25:

| Demo | Evidencia visual heredada |
|---|---|
| Segmentos | [R5.6d](../r5-6d/README.md) |
| Mercados y contenido | [R5.8b](../r5-8b/README.md) |
| Publicación del catálogo | [R5.9b](../r5-9b/README.md) |
| Impuestos | [R5.10b](../r5-10b/README.md) |
| Monedas y métodos | [R5.11c](../r5-11c/README.md) |

El auditor HTTP no acredita ausencia de efectos tras interacciones JavaScript,
ni disponibilidad de la demo remota. Este bloque no activa las capacidades
operativas pendientes.

Repetir contra un único Worker local con el build final y fixtures preparados:

```sh
BASE_URL=http://127.0.0.1:8793 OUTPUT_DIR=docs/audits/r5-12 pnpm audit:r5:fixtures
```

No iniciar Workers adicionales, utilizar D1 remota ni registrar cron para esta
evidencia. El auditor no arranca servidores ni prepara bases de datos.

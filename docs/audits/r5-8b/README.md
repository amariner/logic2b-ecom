# R5.8b — Mercados e idiomas: QA local

La ruta `/demo/admin/mercados` muestra selección de idioma, fallback explícito,
borradores y publicación simulada con dos contenidos ficticios. Los cambios
viven solo en memoria; recargar o restablecer recupera el ejemplo inicial.
El plan de direcciones `.test` es texto, sin enlaces ni metadatos SEO reales.

Verificación del 2026-10-03 sobre el build local:

- `pnpm check`: 897 archivos sin diagnósticos, 227 suites y 2.023 pruebas.
- Modelo y gate: 24 pruebas; revisión independiente sin P1/P2 pendientes.
- E2E: 160/160. Build: 44 HTML y 44 formularios locales, sin envíos ni cron.
- [Navegador](report.json): 120 comprobaciones a 1440/375, incluido teclado,
  borrador incompleto, publicación y reedición, reset, recarga y modo sin JS.
- [Accesibilidad](a11y-report.json): ocho superficies, cero errores y avisos;
  movimiento reducido en la reedición. El panel conserva su diseño claro.
- Cero solicitudes HTTP, escrituras de almacenamiento, beacons, ventanas
  externas o errores JavaScript durante las interacciones del módulo. La guía
  compartida conserva su uso previo de sessionStorage: el informe diferencia
  preparación y recarga del intervalo de interacción del módulo.
- Base QA intacta: 143 tablas, 353 filas; hash antes/después idéntico en el
  [informe agregado](verification-report.json). Worker de QA detenido.

MKT-003/006/007 siguen instaladas e inactivas. La página exige manifest demo y
`DEMO_MODE=true`, permanece noindex y no añade operación de cliente. No hubo
DDL, datos reales ni despliegue; estas pruebas no acreditan el sitio remoto.

| Estado | Escritorio | Móvil |
|---|---|---|
| Inicio en español | [1440](inicio-es-1440.png) | [375](inicio-es-375.png) |
| Francés ausente, alternativa española | [1440](fallback-fr-1440.png) | [375](fallback-fr-375.png) |
| Inglés publicado en el ejemplo | [1440](en-publicado-1440.png) | [375](en-publicado-375.png) |
| Nuevo borrador, publicación anterior conservada | [1440](en-reeditado-1440.png) | [375](en-reeditado-375.png) |

Repetir con un único Worker local ya preparado con fixtures sintéticos:

```sh
BASE_URL=http://127.0.0.1:8793 OUTPUT_DIR=docs/audits/r5-8b pnpm test:e2e:markets
BASE_URL=http://127.0.0.1:8793 node scripts/a11y-audit.mjs --only=market-content: --json
BASE_URL=http://127.0.0.1:8793 pnpm test:e2e
```

No usar una D1 remota ni registrar cron para preparar esta evidencia.

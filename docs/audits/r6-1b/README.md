# R6.1b — Empresas y sedes: QA local

`/demo/admin/empresas` muestra dos empresas ficticias y sus sedes, contactos y
roles descriptivos. Los registros inactivos siguen visibles. La evidencia VAT
se evalúa por separado: no concede acceso, pertenencia, exenciones ni crédito.
Cambiar de empresa reinicia la comprobación; restablecer o recargar recupera
el ejemplo inicial.

Verificación del 2026-10-04 sobre el build local:

- `pnpm check`: 948 archivos sin diagnósticos, 246 suites y 3.077 pruebas.
- [Navegador](report.json): 601 comprobaciones a 1440 y 375 píxeles, ocho capturas,
  sin excepciones ni errores de consola.
- [Accesibilidad](a11y-report.json): ocho superficies, cero errores y avisos;
  incluye movimiento reducido. El panel conserva su diseño claro, sin modo oscuro.
- Cero solicitudes HTTP, escrituras de almacenamiento, temporizadores, beacons
  o ventanas externas propios del módulo. Ningún intento bloqueado de API,
  mutación HTTP ni navegación externa.

La batería comprueba:

- Alpha sin comprobar, positiva, negativa, caducada y sin caso configurado;
  Beta sin declaración VAT, con selector oculto e inerte.
- Pertenencia exacta de sedes, contactos y roles del área seleccionada,
  ámbitos de empresa o sede, registros inactivos y contacto sin rol.
- Independencia entre VAT y directorio, limpieza de evidencia al cambiar de
  empresa, teclado real, foco, reset, recarga y lectura sin JavaScript.
- Redirección anónima GET/HEAD a login y respuesta guiada privada, no-store,
  Vary Cookie y noindex; ningún canonical ni hreflang en esta página privada.
- Ausencia de HTTP, escrituras de almacenamiento, temporizadores, beacons,
  ventanas externas y errores propios del módulo. La guía realizó tres
  escrituras al arrancar y dos al recargar, exclusivamente en
  `logic2b:ecom-guide:v1`. Su almacenamiento y el rAF visual compartido de
  WhatsApp se registran aparte. El rAF se reconoce por su punto exacto de
  llamada, cotejado con la fuente y el HTML; ningún otro temporizador se permite.

Las ocho capturas conservan el lanzador compartido de la guía:

| Estado | Escritorio | Móvil |
|---|---|---|
| Alpha sin comprobar | [1440](default-1440.png) | [375](default-375.png) |
| Alpha con evidencia positiva | [1440](valid-1440.png) | [375](valid-375.png) |
| Alpha con evidencia caducada | [1440](expired-1440.png) | [375](expired-375.png) |
| Beta sin declaración VAT | [1440](no-vat-1440.png) | [375](no-vat-375.png) |

Las ocho imágenes se revisaron visualmente: lectura y espaciado correctos,
foco visible, estados y ámbitos legibles, sin overflow ni defectos nuevos.

La fecha del ejemplo es fija: 3 de octubre de 2026 a las 12:00 UTC. Una evidencia
que vence en ese instante ya está caducada. El caso no configurado conserva solo
el instante de evaluación, sin inventar fechas de comprobación o vencimiento.
Sin comprobar y sin declaración no muestran fechas ni evaluaciones.

La separación comprobada es la del contenido del área seleccionada. Los
fixtures del bundle y las dos tarjetas de selección son públicos; esto no es
una prueba de autorización ni aislamiento de datos reales. La vista no expone
el identificador VAT, referencias de perfil ni hashes de identidad.

Repetir después de preparar un único Worker local de fixtures:

```sh
BASE_URL=http://127.0.0.1:8793 OUTPUT_DIR=docs/audits/r6-1b pnpm test:e2e:companies
BASE_URL=http://127.0.0.1:8793 node scripts/a11y-audit.mjs --only=company-directory: --json
```

No utilizar D1 remota ni registrar cron para esta evidencia. El E2E global y
la comparación de la base QA se registran por separado en el informe agregado.

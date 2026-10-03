# R5.10b — Impuestos: QA local

`/demo/admin/impuestos` compara cinco casos fiscales sintéticos con importes
expresados con o sin impuesto incluido. La evidencia VAT se consulta por separado:
una respuesta positiva no concede exención, condición B2B ni jurisdicción fiscal.
Los controles solo cambian el ejemplo en memoria; restablecer o recargar recupera
su estado inicial.

Verificación del 2026-10-03 sobre el build local:

- `pnpm check`: 921 archivos sin diagnósticos, 235 suites y 2.427 pruebas.
- [Navegador](report.json): 340 comprobaciones a 1440/375. Incluye los cinco casos,
  ambas interpretaciones de importes y los cuatro estados VAT, teclado real,
  foco estable, reset, recarga en un documento nuevo y consulta sin JavaScript.
- [Accesibilidad](a11y-report.json): ocho superficies, cero errores y avisos,
  con movimiento reducido. El panel mantiene su diseño claro, sin modo oscuro.
- Cero solicitudes HTTP, escrituras de almacenamiento, temporizadores,
  beacons, ventanas externas o errores JavaScript propios del módulo.
  No hubo intentos de API, mutaciones HTTP ni navegación externa.
- El almacenamiento de la guía y el `requestAnimationFrame` visual del contacto
  flotante compartido se registran aparte. Las tres escrituras de arranque y dos
  de recarga usan exclusivamente la clave `logic2b:ecom-guide:v1`. El rAF se
  reconoce por su llamada exacta en el HTML, contrastada con la fuente local;
  no se permite ningún otro temporizador. No son cron.

Resultados fijos comprobados, en céntimos, como **neto / impuesto / bruto**:

| Caso | Sin impuesto incluido | Con impuesto incluido |
|---|---|---|
| Tasas mixtas | 2975 / 324 / 3299 | 2686 / 289 / 2975 |
| Redondeo por línea | 60 / 7 / 67 | 55 / 5 / 60 |
| Tipo cero y exención explícita | 2975 / 41 / 3016 | 2939 / 36 / 2975 |
| Portes pendientes | Totales pendientes; productos resueltos | Totales pendientes; productos resueltos |
| Sin respuesta fiscal | Sin cálculo | Sin cálculo |

Los importes desconocidos carecen de `data-cents` y muestran «Pendiente» o
«Sin calcular»; los ceros reales conservan el atributo y su formato monetario.
En las cuarenta combinaciones de caso, interpretación y evidencia VAT, el cambio
de VAT deja intactos importes, tratamientos, evidencia de exención y totales.
Las tasas son ilustrativas; estos resultados no acreditan reglas fiscales reales.

Las ocho capturas se revisaron en escritorio y móvil: foco visible, lectura y
espaciado correctos, sin overflow. Conservan el lanzador compartido de la guía:

| Estado | Escritorio | Móvil |
|---|---|---|
| Tasas mixtas, impuesto añadido | [1440](excluido-1440.png) | [375](excluido-375.png) |
| Tasas mixtas, impuesto incluido | [1440](incluido-1440.png) | [375](incluido-375.png) |
| Tipo cero y exención con evidencia propia | [1440](cero-exento-1440.png) | [375](cero-exento-375.png) |
| Portes pendientes y totales desconocidos | [1440](envio-pendiente-1440.png) | [375](envio-pendiente-375.png) |

La ruta exige manifest demo y `DEMO_MODE=true`, es noindex y no contiene
formularios ni entrada de identificadores fiscales reales. MKT-009 y MKT-010
permanecen instaladas e inactivas. Esta evidencia no activa checkout, proveedores,
persistencia ni datos reales, y no acredita un despliegue remoto. El E2E global y
la comparación de la base QA constan en el [informe agregado](verification-report.json).

Repetir con un único Worker local preparado con fixtures sintéticos:

```sh
BASE_URL=http://127.0.0.1:8793 OUTPUT_DIR=docs/audits/r5-10b pnpm test:e2e:taxes
BASE_URL=http://127.0.0.1:8793 node scripts/a11y-audit.mjs --only=tax-demo: --json
```

No utilizar D1 remota ni registrar cron para preparar esta evidencia.

# R6.4c — Condiciones y cobros: QA local

`/demo/admin/condiciones-pago` compara un calendario declarado con una
observación histórica de importes. Los casos y fechas son fixtures cerrados:
no crea cobros, pedidos, recordatorios ni movimientos y no acredita una deuda,
un saldo actual o un permiso operativo.

Verificación del 2026-10-04 sobre el build local definitivo y un único Worker
QA con fixtures. Las ocho imágenes tienen el pase visual frontend/UX aprobado:
calendario, observación y `asOf` legibles; diferencia negativa real, ausencia sin
importes residuales y calendario no configurado sin fechas ni hitos ficticios.
Los selectores, sus flechas y el foco están despejados, sin overflow horizontal.

- `pnpm check`: 977 archivos sin diagnósticos, 258 suites y 3.560 pruebas.
- [Navegador](report.json): 2.660 comprobaciones correctas, 72 visitas a estados
  y ocho capturas. Sin excepciones ni errores de consola.
- [Accesibilidad](a11y-report.json): ocho superficies, cero errores y avisos,
  incluida la comprobación de movimiento reducido.
- Cero HTTP, escrituras de almacenamiento, temporizadores, beacons y ventanas
  propios del módulo; ningún intento bloqueado de API, mutación HTTP o
  navegación externa. Los efectos de la guía y del layout se registran aparte.

La matriz recorre doce casos y tres fechas de evaluación a 1440 y 375 píxeles:
36 estados por tamaño, 72 visitas en total. Por tamaño se verificaron 28 observaciones
utilizables y ocho desconocidas; 33 calendarios configurados y tres sin
condición. Las posiciones monetarias son 13 por debajo, nueve iguales
y seis por encima del importe declarado; tres reversiones parciales, tres
totales y 22 sin reversión.

El oráculo usa importes, fechas y etiquetas literales independientes del modelo.
Compara también los textos visibles y sus atributos: declarado, aplicado,
revertido, neto, diferencia firmada, base, vencimiento, evaluación, observación,
`asOf`, hitos y posiciones. Distingue cero conocido de dato ausente. Tras
observaciones incompletas, ausentes o futuras, elimina los importes derivados
y sus atributos sin borrar una fecha de observación legítima. Cambiar la
evaluación conserva el corte histórico; nunca finge movimientos posteriores.

Las ocho superficies de captura y accesibilidad son:

| Estado | Escritorio | Móvil |
|---|---|---|
| Parcial, fecha de vencimiento | [1440](partial-1440.png) | [375](partial-375.png) |
| Sin evidencia, después del vencimiento | [1440](missing-after-1440.png) | [375](missing-after-375.png) |
| Exceso aplicado, diferencia negativa | [1440](excess-1440.png) | [375](excess-375.png) |
| Sin condición, observación conservada | [1440](unconfigured-1440.png) | [375](unconfigured-375.png) |

La batería incluye teclado, foco estable, reset, recarga en otro documento y
SSR sin JavaScript con controles desactivados. Comprueba la redirección anónima
y las cabeceras privadas/no-store/noindex del acceso guiado. Los identificadores
técnicos, referencias y hashes no deben aparecer en el módulo.

Ambas flechas de selectores se comprueban mediante hit-test real a 320 y 375
píxeles, con la guía visible. Su apertura, cierre, minimizar, Escape y cambios
de tamaño se comprueban aparte. Antes de cada captura se restaura el scroll a
cero y se esperan 75 ms desde Node para procesar el layout compartido.

El arnés bloquea y cuenta intentos de HTTP operativo, API, navegación externa,
storage, temporizadores, beacons y ventanas del módulo. Solo admite las
escrituras conocidas de la guía en `logic2b:ecom-guide:v1`, separadas entre
arranque, interacción explícita y recarga. El rAF compartido de WhatsApp se
identifica por su caller exacto, cotejado con la fuente y el HTML. Ningún
efecto propio del módulo se excluye.
La guía realizó tres escrituras iniciales y dos de recarga por tamaño. Sus
interacciones móviles registraron ocho escrituras y ocho eventos de la clave
permitida; al cerrar, el almacenamiento volvió al estado inicial. No hubo
fallos de hit-test ni se ocultó ningún disparador para las capturas.

El panel mantiene su presentación clara; se audita movimiento reducido, sin
atribuirle un modo oscuro inexistente. La revisión visual examinó las ocho
imágenes reales; los casos cero, 320 píxeles y sin JavaScript corresponden a
aserciones del arnés y no a capturas adicionales. Se conserva el lanzador real
de la guía: en escritorio cruza parte del texto de posición del segundo hito,
sin tapar fechas ni controles. La guía móvil permanece integrada en el header.

Ejecutar solo contra el Worker local de fixtures ya preparado:

```sh
BASE_URL=http://127.0.0.1:8793 OUTPUT_DIR=docs/audits/r6-4c pnpm test:e2e:collection
BASE_URL=http://127.0.0.1:8793 node scripts/a11y-audit.mjs --only=company-collection: --json
```

No utilizar D1 remota, iniciar otro Worker ni registrar cron. El
[informe agregado](verification-report.json) recoge los 188 checks E2E y la
comparación de la base QA: 143 tablas y 353 filas, con hash idéntico antes y
después. El Worker se cerró al terminar. La integración no implica despliegue.

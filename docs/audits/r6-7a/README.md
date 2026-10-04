# R6.7a — Referencia PO declarada

Contrato puro para conservar una referencia de orden de compra de ejemplo,
con o sin token documental, vinculada a una oferta histórica completa.
`not_provided` significa que el artefacto no aporta una referencia; no demuestra
que no exista fuera del ejemplo. El número conserva su texto exacto y el emisor
debe coincidir con la empresa de la solicitud.

La validación comprueba todo el directorio, catálogo, solicitud e historial de
ofertas antes de comparar los vínculos, también cuando la referencia es nula.
La asociación tiene fecha y versión explícitas; no representa emisión fiscal,
autenticidad documental, pago, deuda, aprobación ni historial durable.

Verificación local del 2026-10-04:

- `pnpm check`: 995 archivos sin diagnósticos, 265 suites y 3.841 pruebas;
  build con 44 HTML, 44 formularios locales y cero cron.
- Focales: 26 pruebas del contrato y seis de arquitectura. Registro,
  manifiestos y acceso: 121 pruebas adicionales, todas correctas.
- Revisión independiente: 6.726 aserciones, sin P1/P2. Cubre 72 escenarios,
  96 números Unicode, 15 tokens, 14 versiones, 28 modificaciones válidas de
  vínculos en tres estados de presencia y siete corrupciones ocultas.
- Importación y llamadas sin efectos, getters ejecutados ni reloj implícito.
  Bundle diagnóstico público: 21.746 B / 5.869 gzip, sin imports externos;
  conserva 281 B de constantes históricas de otros contratos, sin adaptadores
  operativos. Este tamaño no representa código añadido al cliente Astro.
- Siete grafos cliente, 358 fuentes seleccionadas, 19 CSS y los 60 JS públicos
  conservan sus hashes respecto a R6.6c. El Worker mantiene 281 archivos y añade
  296 B por el registro B2B-007, su dependencia y el descriptor; la comparación
  de nombres generados no afirma equivalencia completa del SSR.

La evidencia de interacción se hereda expresamente de
[R6.6c / PR #41](../r6-6c/README.md): 9.068 comprobaciones de navegador, ocho
superficies de accesibilidad sin hallazgos, ocho capturas, E2E196 y hash intacto
de 143 tablas/353 filas de QA sintética. No se han vuelto a ejecutar HTTP,
Worker, navegador o base de datos para este contrato sin interfaz nueva.

El [informe agregado](verification-report.json) registra las fuentes congeladas,
la revisión y la comparación del build con R6.6c. `companies` 1.9.0 mantiene
B2B-007 instalada e inactiva en avanzado/demo, dependiente de B2B-006 y sin
superficies operativas. No hay despliegue, migración, proveedor ni activación.

Consejo: arquitectura ✓ · backend ✓ · fullstack ✓ · producto ✓ · frontend ✓ ·
UX/UI ✓ · SEO ✓. La evidencia documental y su demo quedan para los siguientes
subcortes de R6.7; declarar una PO no completa la operación por PO.

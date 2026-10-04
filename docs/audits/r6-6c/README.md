# R6.6c — Ofertas y presupuesto de ejemplo

Evidencia local del 4 de octubre de 2026 para `/demo/admin/presupuestos-empresa`, sobre el build final de las 04:33:32 UTC. La demo compara propuestas y recorre un presupuesto en memoria mediante las APIs puras reales. No crea pedidos, cobros, reservas ni aceptaciones legales.

- [Navegador](report.json): **9.068 comprobaciones correctas** a 1440 y 375 px. Son **72 visitas** a los 36 estados sin presupuesto, **24 visitas** a las 12 combinaciones de creación y recorridos adicionales de emisión, aprobación, caducidad y cancelación; no se presentan como todos los historiales posibles.
- [Accesibilidad](a11y-report.json): **8 superficies, 0 errores y 0 avisos**. Se verifica movimiento reducido; el admin conserva su diseño claro, sin atribuir un modo oscuro inexistente.
- Fullcheck final: **993 archivos sin diagnósticos, 264 suites y 3.814 tests**, 44 HTML y 44 formularios locales, sin cron. E2E global final: **196/196**, en una ejecución posterior al navegador y a11y.
- La base QA aislada conserva **143 tablas y 353 filas** entre la captura previa fresca (04:18:03 UTC) y la posterior: SHA-256 `9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`. Sin preparación nueva de DB en este recorrido. Chrome y Worker quedaron cerrados.
- Ocho capturas definitivas revisadas por frontend/UX; revisión adicional de raíz sobre cuatro. Selectores y flechas despejados, foco visible, sin overflow horizontal, importes firmados y ausencias legibles. La guía real permanece visible.
- Se corrigió la explicación ambigua de una fecha anterior deshabilitada: ahora identifica su opción. La regresión contrasta el texto visible y su ocultación, y estas capturas e informes sustituyen la ejecución provisional anterior.

El recorrido comprueba que comparar otra pareja conserva el presupuesto, elegir otra oferta elimina el presupuesto anterior y exige crearlo de nuevo, y cambiar el instante no aplica acciones ni caduca una aprobación histórica. Contrasta importes, variantes, cantidades, fechas UTC, historial, textos y atributos con valores literales independientes. Incluye igualdad temporal, creación tardía, caducidad explícita, acciones deshabilitadas, limpieza de nulos, teclado real, foco tras acciones, reset, recarga y SSR sin JavaScript.

El arnés bloquea antes de enviar peticiones externas, APIs o métodos distintos de GET/HEAD. Se observaron **0 solicitudes HTTP, escrituras de storage, temporizadores, beacons o ventanas del módulo**, 0 excepciones y 0 fallos de hit-test. También verifica redirección anónima, acceso guiado, `private/no-store`, `Vary: Cookie`, `noindex` y ausencia de formularios operativos.

Las excepciones del shell se contabilizan por separado: la guía escribe únicamente su clave de sesión conocida, 3 veces al arrancar y 2 al recargar cada viewport; el recorrido móvil añade 8 escrituras explícitas de guía y termina con el almacenamiento original. Solo se permite el `requestAnimationFrame` de layout de WhatsApp cuya posición exacta se coteja con el HTML servido y el fuente. Hay sondeos estrictos de los tres selectores a 320 y 375 px y pruebas de foco al abrir, cerrar y redimensionar la guía. Antes de cada PNG se restaura scroll 0 de forma instantánea y se esperan 75 ms desde Node, sin ocultar controles.

| Estado | 1440 px | 375 px |
|---|---|---|
| Comparación inicial, sin presupuesto | [PNG](initial-1440.png) | [PNG](initial-375.png) |
| Aprobación histórica después del vencimiento, otro par comparado | [PNG](approved-after-1440.png) | [PNG](approved-after-375.png) |
| Nueva oferta y borrador sin aprobación transferida | [PNG](new-draft-1440.png) | [PNG](new-draft-375.png) |
| Caducidad explícita en el instante límite | [PNG](expired-1440.png) | [PNG](expired-375.png) |

El entry final `CompanyNegotiationDemo…Cn5OmnWr.js` ocupa **43.149 B / 11.944 gzip**; su grafo completo de 4 archivos y 4 aristas suma **57.551 B / 17.134 gzip**. Son medidas estáticas, no una medición de transferencia HTTP. De los 58 JS públicos de PR40, 54 mantienen nombre y SHA; el build nuevo tiene 60. Crédito, cobros y directorio conservan sus grafos; catálogo y cantidades extraen un bloque compartido de catálogo (cada grafo +123 B), contrastado estructuralmente por revisión independiente. La guía cambia únicamente al añadir la ruta explícita (+21 B). Los 19 CSS emitidos conservan nombre y SHA. El inventario de 358 fuentes seleccionadas registra los tres archivos nuevos y los cambios de navegación/allowlist; no representa todo el SSR transitivo.

Las pruebas de interacción de esta página son nuevas. La comparación con PR40 no convierte la evidencia anterior de otras demos en una ejecución nueva de sus recorridos. El [informe agregado](verification-report.json) reúne el fullcheck, el E2E global y la comprobación de la base QA coordinados por raíz.

Reproducción contra un único Worker local de fixtures ya preparado:

```sh
BASE_URL=http://127.0.0.1:8793 OUTPUT_DIR=docs/audits/r6-6c node scripts/test-company-negotiation-demo.mjs
BASE_URL=http://127.0.0.1:8793 node scripts/a11y-audit.mjs --only=company-negotiation: --json > docs/audits/r6-6c/a11y-report.json
```

Consejo del alcance verificado: fullstack ✓ · frontend ✓ · UX/UI ✓. La revisión del contrato y el motor pertenece al informe agregado; esta auditoría no activa operaciones.

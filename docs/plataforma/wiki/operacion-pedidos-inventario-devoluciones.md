# Operación de pedidos, inventario y devoluciones

> Ficha operativa R3.12 enlazada por los módulos `orders`, `inventory` y
> `fulfillment`. Solo describe capacidades con estado `actual` y evidencia
> ejecutable. No genera todavía una URL pública ni entra en el sitemap: el
> publicador de contenido pertenece a R8.4.

## Qué está disponible

Logic2B Ecommerce puede activar por despliegue un panel operativo que separa
pedido, inventario, preparación y posventa. El comercio ve únicamente los
módulos que necesita; la demo pública enseña fixtures y rechaza cualquier
mutación.

| Resultado operativo | Capacidades actuales | Evidencia principal |
|---|---|---|
| buscar y revisar pedidos a escala | `ORD-001`–`ORD-004` | cursor/FTS, filtros URL, notas, etiquetas y timeline |
| corregir un pedido con preview | `ORD-005`–`ORD-007` | versión, stock, captura/reembolso e idempotencia |
| detener y reanudar preparación | `ORD-010` | holds múltiples, SLA e histórico |
| actuar sobre una selección estable | `ORD-011` | dry-run SHA-256, job por chunks y resultado por fila |
| generar albaranes y registrar referencias fiscales | `ORD-012` | snapshot, versión, checksum y frontera fiscal externa |
| mantener stock por variante y ubicación | `INV-001`–`INV-005` | ledger append-only, reserva opcional y principal compatible |
| mover y contar stock | `INV-007`, `INV-008` | tránsito/recepción y foto versionada con ajuste |
| decidir desde dónde preparar | `INV-011` | política, disponibilidad y explicación congelada |
| preparar y entregar por cantidades | `FUL-001`–`FUL-005` | grupos, tracking, parcialidad y estados derivados |
| recibir y resolver una devolución | `FUL-011`, `FUL-013` | RMA versionado, reembolso y reposición tras inspección |

## Cómo funciona el recorrido completo

1. El stock entra en el ledger de una ubicación mediante apertura,
   transferencia, conteo o movimiento compensatorio.
2. La compra reserva y consume la variante vendible en la fuente compatible.
3. Un hold activo impide crear un nuevo fulfillment sin borrar ni alterar el
   pedido.
4. Al preparar, el motor filtra ubicaciones por mercado, canal y cobertura
   completa; prioridad, coste e ID desempatan. La decisión y sus descartes
   quedan guardados.
5. El fulfillment posee sus líneas, cantidades y tracking. El pedido solo pasa
   a enviado cuando no queda cantidad pendiente y a entregado cuando todos los
   grupos lo están.
6. Una devolución reclama únicamente unidades entregadas y no reclamadas. La
   recepción no repone por sí sola: la inspección decide destino y el cierre
   crea el reembolso o el cambio pendiente.
7. Solo una inspección `restock` crea un movimiento de retorno en la ubicación
   receptora. El histórico del RMA, el dinero y el stock se confirman juntos.

## Qué ve el comercio

- índice de pedidos con búsqueda, filtros y cursores estables;
- detalle con progreso, grupos, notas, etiquetas, actividad e incidencias;
- pantallas separadas para ubicaciones, transferencias, conteos, reglas de
  asignación, devoluciones y documentos;
- estados vacíos, conflicto de versión y explicación de por qué una operación
  no puede avanzar;
- controles de demo deshabilitados y API de efectos cerrada con `403`.

La complejidad no se activa por defecto. Ubicaciones, acciones masivas,
asignación, RMA y documentos son capacidades independientes con dependencias
validadas en el manifest.

## Qué ocurre por detrás

- dinero y cantidades se calculan en servidor;
- cada intención usa una clave de idempotencia y las carreras se serializan en
  batches D1;
- movimientos, eventos, auditoría y proyecciones se escriben con la misma
  condición de éxito;
- la evidencia excluye PII y el backup administrativo omite el audit log;
- los cambios de stock son append-only y los estados cerrados no se reabren
  editando filas;
- albaranes y etiquetas son artefactos no fiscales; facturas y rectificativas
  solo guardan la referencia emitida por un proveedor externo.

## Límites expresos

Esta ficha no promete capacidades incompletas o externas:

- no existe todavía un portal de devolución para cliente (`FUL-010`);
- un cambio de producto queda como salida pendiente; reserva y diferencia de
  cobro pertenecen a `FUL-012` y siguen parciales;
- la ventana de devolución es fija y no sustituye reglas configurables por
  categoría, coste o excepción (`FUL-014` parcial);
- compra de etiquetas, tracking multioperador, ERP/WMS y emisión fiscal son
  conectores, no servicios propios activos;
- alertas, órdenes de compra, archivo/retención, permisos por rol completos,
  RPO/RTO y SLO/alertas siguen en bloques posteriores;
- la demo no opera pedidos reales y no constituye un entorno productivo.

## Cuándo conviene activarlo

El flujo simple sigue siendo suficiente cuando todo el stock vive en un único
almacén y cada pedido sale completo. Las capacidades R3 aportan valor cuando el
comercio necesita explicar dónde está cada unidad, preparar desde varias
ubicaciones, separar incidencias de estados comerciales, recibir devoluciones o
conservar documentos versionados.

Activar módulos que el equipo no va a operar añade carga cognitiva. El manifest
permite mantenerlos ausentes de navegación, rutas, jobs y efectos hasta que el
proyecto tenga responsables y runbook.

## Evidencia y operación

- journey vertical: `tests/r3-consolidation-runtime.test.ts`;
- carga/concurrencia previa: asignación, transferencias, conteos, holds, jobs y
  RMA tienen suites dedicadas;
- restore: backup esquema 18 y cero fallos FK antes/después;
- guía consolidada: `docs/plataforma/GUIA_OPERACION_R3.md`;
- runbooks específicos enlazados desde `docs/plataforma/README.md`.

Revisión: 2026-08-14. Responsable técnico: arquitectura/backend. Antes de
convertir esta ficha en contenido indexable deben existir el publicador R8.4,
la revisión editorial y las evidencias de ruta exigidas por `WIKI_SEO.md`.

# Guía consolidada de operación R3

Esta guía reúne el corte y la recuperación de R3.1–R3.12 para despliegues
aislados de Logic2B Ecommerce. El estado objetivo es D1 con migraciones
`0001`–`0024`, backup administrativo esquema 18 y un Worker compatible con
pedidos operativos, ubicaciones, transferencias, conteos, asignación,
devoluciones y documentos.

R3.12 no añade DDL. Consolida el sistema ya expandido y no autoriza aplicar
migraciones remotas, desplegar, borrar tablas ni cargar fixtures sobre datos
reales.

## Mapa de la ola

| Migración | Bloque | Expansión canónica |
|---|---|---|
| `0014_order_list_indexes` | R3.1 | índices y búsqueda FTS del índice de pedidos |
| `0015_order_collaboration` | R3.2 | notas, revisiones, etiquetas y actividad |
| `0016_order_amendments` | R3.3 | versión de pedido y edición financiera/inventario |
| `0017_order_holds` | R3.4 | incidencias múltiples, SLA y bloqueo de preparación |
| `0018_order_bulk_actions` | R3.5 | selección congelada, lotes, filas y replay |
| `0019_inventory_locations` | R3.6 | ubicación principal y proyección del ledger global |
| `0020_inventory_transfers` | R3.7 | tránsito, recepción parcial y discrepancia |
| `0021_inventory_counts` | R3.8 | foto, doble control y ajuste append-only |
| `0022_inventory_allocation` | R3.9 | política, decisión explicada y movimientos de asignación |
| `0023_returns_rma` | R3.10 | expediente, recepción, inspección y resolución |
| `0024_order_documents` | R3.11 | snapshots, versiones, artefactos y referencias externas |

Todas las migraciones son expand-only. Los espejos legacy de pedido e
inventario se conservan; retirarlos necesita una contracción posterior con ADR,
backup, ensayo y autorización expresa.

## Preflight obligatorio

1. Identificar el commit exacto, el entorno y las capacidades activas del
   manifest. La demo pública nunca habilita efectos comerciales.
2. Congelar mutaciones administrativas del despliegue objetivo.
3. Ejecutar `pnpm check` y el test vertical R3.12 sobre ese commit.
4. Exportar D1 sin imprimir filas ni PII y guardar hash/tamaño en evidencia
   privada.
5. Listar las migraciones ya aplicadas. Ejecutar únicamente los rehearsals
   posteriores al baseline real y siempre sobre una copia aislada.
6. Exigir `integrity_check=ok`, cero filas en `foreign_key_check` y cero
   divergencias entre ledger global y ubicación principal.

Comandos locales de evidencia:

```bash
pnpm exec vitest run tests/r3-consolidation-runtime.test.ts
pnpm check
pnpm db:rehearse:order-amendments -- --baseline <backup.sql> --output-dir <dir>
pnpm db:rehearse:order-holds -- --baseline <backup.sql> --output-dir <dir>
pnpm db:rehearse:order-bulk-actions -- --baseline <backup.sql> --output-dir <dir>
pnpm db:rehearse:inventory-locations -- --baseline <backup.sql> --output-dir <dir>
pnpm db:rehearse:inventory-transfers -- --baseline <backup.sql> --output-dir <dir>
pnpm db:rehearse:inventory-counts -- --baseline <backup.sql> --output-dir <dir>
pnpm db:rehearse:inventory-allocation -- --baseline <backup.sql> --output-dir <dir>
pnpm db:rehearse:returns -- --baseline <backup.sql> --output-dir <dir>
pnpm db:rehearse:documents -- --baseline <backup.sql> --output-dir <dir>
```

Cada script declara el baseline que admite. No se reaplica una migración sobre
una base que ya la contiene.

## Reconciliación consolidada

Las consultas se ejecutan por recuento o agregado. No se copian datos de
clientes a tickets, logs o conversaciones.

```sql
PRAGMA integrity_check;
PRAGMA foreign_key_check;

SELECT count(*) AS location_divergences
FROM inventory_balances b
JOIN inventory_location_balances lb ON lb.variant_id=b.variant_id
JOIN inventory_locations l ON l.id=lb.location_id AND l.is_primary=1
WHERE b.on_hand<>lb.on_hand OR b.reserved<>lb.reserved
   OR b.version<>lb.movement_version
   OR b.reservation_version<>lb.reservation_version;

SELECT count(*) AS transfer_over_receipts
FROM inventory_transfer_lines
WHERE received_quantity + discrepancy_quantity > shipped_quantity;

SELECT count(*) AS allocation_without_fulfillment
FROM inventory_allocation_decisions d
LEFT JOIN fulfillments f ON f.id=d.fulfillment_id AND f.order_id=d.order_id
WHERE f.id IS NULL;

SELECT count(*) AS return_overclaims
FROM return_request_lines rl
WHERE rl.requested_quantity>rl.eligible_quantity
   OR rl.received_quantity>rl.requested_quantity;

SELECT count(*) AS generated_without_artifact
FROM order_documents d
LEFT JOIN order_document_artifacts a ON a.document_id=d.id
WHERE d.source='generated' AND a.document_id IS NULL;

SELECT count(*) AS external_with_artifact
FROM order_documents d
JOIN order_document_artifacts a ON a.document_id=d.id
WHERE d.source='external';
```

Todos los resultados de conflicto deben ser cero. Un desajuste detiene el corte:
no se corrige con `UPDATE` manual sobre una tabla canónica.

## Matriz de incidencias

| Síntoma | Contención inmediata | Diagnóstico | Recuperación segura |
|---|---|---|---|
| Búsqueda o listado incompleto | suspender decisiones masivas | comparar filtros/cursor y reconstruir FTS en copia | reconstruir proyección; no editar pedidos |
| Hold activo o SLA vencido | detener nueva preparación | revisar motivo, responsable e histórico | reasignar o resolver con versión; vencer SLA no libera |
| Lote parado | no crear otro lote equivalente | revisar run, lease y resultado por fila | reanudar el mismo run; replay solo de filas reintentables |
| Principal diverge del ledger global | congelar inventario y fulfillment | ejecutar reconciliación por variante | usar movimiento compensatorio ensayado; nunca ajustar ambas tablas a mano |
| Transferencia parcial/discrepante | mantener unidades restantes en tránsito | revisar recibos y movimientos enlazados | recibir o declarar discrepancia con la siguiente versión |
| Conteo en conflicto | no aprobar la foto antigua | comparar versiones y movimientos posteriores | invalidar y abrir un conteo nuevo |
| Asignación sin stock | detener preparación del fulfillment | leer explicación y balances congelados | corregir stock/política por su flujo y reintentar con nueva clave |
| Refund/RMA `processing` o `requires_review` | no repetir dinero con otra clave | conciliar referencia e importe con el PSP | reintentar la misma intención o resolver manualmente según runbook |
| Reposición incoherente | congelar ubicación receptora | verificar inspección, resolución y movimiento enlazado | movimiento compensatorio; no reabrir el expediente resuelto |
| Documento incorrecto | no sobrescribir snapshot | comprobar tipo, versión, checksum y fuente | sustituir o anular creando histórico; el fiscal se corrige en el proveedor |
| Backup no restaura | no tocar el origen | guardar error, hash y versión de esquema | restaurar en otra base vacía y corregir el procedimiento, no el backup |

Los detalles específicos y claves de idempotencia viven en los runbooks de
cada capacidad enlazados desde `README.md`.

## Escalado de una incidencia

1. Registrar entorno, commit, versión de migración, hora UTC y correlation/id
   de operación; nunca cuerpo completo, email, dirección o notas privadas.
2. Clasificar impacto: lectura, preparación, stock, dinero, datos o documento.
3. Contener la capacidad mínima mediante manifest o ventana operativa. No
   apagar checkout por una incidencia documental si los contratos son
   independientes.
4. Reproducir sobre backup aislado y ejecutar el test/runbook específico.
5. Recuperar por replay idempotente o hecho compensatorio; no borrar evidencia.
6. Verificar reconciliación, FKs, outbox y superficie afectada antes de reabrir.
7. Documentar causa, alcance, recuperación y acción preventiva. Comunicación,
   RPO/RTO y alertas por cliente siguen siendo alcance de R11.3/R11.5.

## Rollout y downgrade

El rollout coordinado aplica D1 antes del Worker y solo después habilita
capacidad/ruta/efectos. Tras el despliegue se repiten E2E, a11y de superficies
afectadas, backup y reconciliación.

El downgrade normal es de binario y manifest, no de esquema:

1. congelar mutaciones;
2. exportar la base expandida;
3. desactivar efectos de la capacidad afectada;
4. servir un Worker anterior compatible;
5. ejecutar su smoke y conservar todas las tablas R3.

No se borran holds, runs, movimientos, decisiones, RMA, documentos ni eventos.
Una operación confirmada se corrige con una transición o un hecho
compensatorio, nunca reescribiendo su histórico.

## Evidencia vertical R3.12

`tests/r3-consolidation-runtime.test.ts` recorre una transferencia completa de
principal a secundaria, pago con reserva, hold que bloquea preparación,
resolución, asignación explicada a la secundaria, entrega, RMA recibido e
inspeccionado, reembolso, reposición en la ubicación receptora y
backup/restore esquema 18. El cierre exige stock de red coherente y cero fallos
FK antes y después del restore.

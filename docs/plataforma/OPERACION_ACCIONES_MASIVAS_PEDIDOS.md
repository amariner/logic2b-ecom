# Operación de acciones masivas sobre pedidos R3.5

## Contrato servido

`ORD-011` permite congelar hasta 500 pedidos y aplicar únicamente tres acciones:
añadir etiqueta, quitar etiqueta o crear un hold tipado. `AUT-011` separa un
dry-run puro de la confirmación. Estado comercial, fulfillment, dinero,
inventario y proveedores quedan fuera.

| Ruta | Operación |
|---|---|
| `POST /api/admin/order-bulk-actions/preview` | preview sin efectos, válido 15 minutos |
| `POST /api/admin/order-bulk-actions` | confirma el fingerprint y ejecuta el job |
| `GET /api/admin/order-bulk-actions/:id` | progreso y resultado por pedido |
| `POST /api/admin/order-bulk-actions/:id` | replay de fallos o reanudación interrumpida |

La demo pública expone selección y preview para explicar el flujo, pero elimina
jobs/efectos del manifest y rechaza confirmación o replay con `403` antes de D1.

## Preflight y rehearsal de `0018`

Obtener un export administrativo fresco de la base todavía en `0017` y ensayar:

```bash
pnpm exec wrangler d1 export ecom-demo --remote --output=/tmp/ecom-before-0018.sql
pnpm db:rehearse:order-bulk-actions -- \
  --baseline /tmp/ecom-before-0018.sql \
  --output-dir /tmp/logic2b-r3-5-rehearsal
```

El ensayo aplica `0018_order_bulk_actions.sql`, exige cero lotes/filas creados,
compara el hash legacy y repite `integrity_check`, `foreign_key_check` y hash de
esquema después de dump/restore.

Preflight remoto sin PII:

```sql
SELECT count(*) FROM pragma_foreign_key_check;
SELECT count(*) FROM pragma_integrity_check WHERE integrity_check <> 'ok';
SELECT count(*) FROM orders;
SELECT count(*) FROM platform_job_runs WHERE status IN ('pending','running','dead');
```

Después de migrar, ambas tablas nuevas deben estar vacías:

```sql
SELECT count(*) FROM order_bulk_batches;
SELECT count(*) FROM order_bulk_batch_rows;
SELECT count(*) FROM pragma_foreign_key_check;
```

## Rollout coordinado

1. Conservar el export y los artefactos del rehearsal fuera del repositorio.
2. Aplicar `0018` a D1 antes de desplegar el Worker.
3. Verificar migración listada, integridad, FKs y cero lotes creados por DDL.
4. Desplegar el Worker y ejecutar E2E/a11y del índice de pedidos.
5. Confirmar en demo que el preview responde y confirmación/replay siguen en `403`.
6. En un despliegue cliente, activar `ORD-011`/`AUT-011` solo con acceso admin.

## Operación, progreso y recuperación

- `pending`: el lote espera claim; repetir la confirmación exacta no crea otro.
- `running`: consultar progreso. Cada chunk procesa como máximo 25 filas.
- `completed`: todas las filas son terminales sin conflicto/fallo.
- `completed_with_errors`: revisar `result_code`; solo
  `retryable_failure` entra en replay.
- job `pending` interrumpido: replay reanuda el mismo run y conserva filas.
- job `dead`: replay reactiva el run, reinicia sus intentos técnicos y no toca
  filas ya terminales.
- `conflict`/`skipped`: son decisiones terminales explicables, no errores a
  reintentar automáticamente.

La evidencia `order_tag_event` u `order_hold` se escribe en la misma batch D1
que mutación, auditoría y resultado. Un runner concurrente solo puede reclamar
el mismo lote con su `execution_run_id`; la clave por fila evita duplicados.

Consultas operativas sin PII:

```sql
SELECT status, count(*) FROM order_bulk_batches GROUP BY status;
SELECT outcome, count(*) FROM order_bulk_batch_rows
WHERE batch_id = ? GROUP BY outcome;
SELECT run_id, status, attempt_count, replay_count, last_error_code
FROM platform_job_runs WHERE idempotency_key LIKE 'orders.bulk:%';
```

## Retención, backup y rollback

El backup administrativo es esquema 12 e incluye lotes antes de sus filas. La
purga elimina lotes terminales por antigüedad en grupos acotados; el cascade
borra su snapshot operativo, pero no `audit_log`, `order_tag_events` ni
`order_holds`.

Tras restaurar:

```sql
PRAGMA foreign_key_check;
SELECT count(*) FROM order_bulk_batch_rows r
WHERE NOT EXISTS (SELECT 1 FROM order_bulk_batches b WHERE b.id=r.batch_id);
SELECT count(*) FROM order_bulk_batches
WHERE status='running' AND execution_run_id IS NULL;
```

El rollback operativo desactiva `ORD-011`/`AUT-011` y redespliega el Worker
anterior. `0018` es expand-only: no borrar tablas ni filas. Una contracción
requiere otra migración, copia previa y autorización destructiva expresa.

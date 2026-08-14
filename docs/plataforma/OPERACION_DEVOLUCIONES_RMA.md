# Operación de devoluciones/RMA R3.10

## Alcance

`FUL-011` gestiona solicitudes sobre unidades entregadas, recepción,
inspección y cierre por reembolso, cambio o rechazo. `FUL-013` repone solo las
líneas aptas al resolver. El cambio queda materializado como compromiso
pendiente; reserva de salida y diferencia de cobro pertenecen a la evolución de
`FUL-012`.

## Preflight y rollout

1. confirmar backup restaurable en esquema 16 y `PRAGMA foreign_key_check=0`;
2. ensayar `0023_returns_rma.sql` con
   `pnpm db:rehearse:returns -- --baseline <dump-0022.sql> --output-dir <dir>`;
3. aplicar `0023` antes del Worker nuevo; la migración no inventa expedientes;
4. desplegar con `FUL-011` desactivada y validar tablas, índices y API de lectura;
5. activar la capacidad, crear un RMA pequeño y recorrer todos sus hitos;
6. validar un reembolso simulado y una reposición en principal/secundaria;
7. vigilar conflictos, PSP en revisión y movimientos sin expediente.

La demo pública mantiene fixture y navegación, pero toda mutación responde 403
y los controles aparecen deshabilitados.

## Reconciliación

```sql
SELECT rl.order_item_id
FROM return_request_lines rl
JOIN return_requests r ON r.id=rl.return_id
GROUP BY rl.order_item_id
HAVING sum(CASE WHEN r.status NOT IN ('rejected','cancelled')
  THEN rl.requested_quantity ELSE 0 END) > (
  SELECT COALESCE(sum(fi.quantity),0) FROM fulfillment_items fi
  JOIN fulfillments f ON f.id=fi.fulfillment_id
  WHERE fi.order_item_id=rl.order_item_id AND f.status='delivered'
);

SELECT count(*) AS movimientos_invalidos
FROM return_inventory_movements rim
JOIN return_request_lines rl ON rl.id=rim.return_line_id
JOIN inventory_location_movements m ON m.id=rim.location_movement_id
WHERE rl.inspection<>'restock' OR m.reason<>'return_restock';

SELECT count(*) AS reembolsos_invalidos
FROM return_requests r JOIN refunds f ON f.id=r.refund_id
WHERE r.resolution<>'refund' OR f.operation_type<>'return'
  OR (r.status='resolved' AND f.status<>'succeeded');

PRAGMA foreign_key_check;
```

## Incidencias y recuperación

- Sin elegibilidad: revisa entrega, ventana de 30 días y reclamaciones previas.
- `409`: recarga el expediente; otra operación ganó la versión.
- PSP `processing`/`failed`/`requires_review`: no crees otro RMA; reintenta la
  misma resolución con su clave estable y revisa la consola del proveedor.
- Stock cambió al cerrar: la batch revierte; corrige saldo y reintenta.
- Nunca edites líneas, eventos, refund o movimientos confirmados a mano.

## Rollback

Desactiva `FUL-011`; las órdenes, envíos y cancelaciones anteriores siguen
operativas. Conserva tablas y evidencia. Compensa stock con el ledger y resuelve
el dinero en el proveedor usando la misma referencia idempotente.

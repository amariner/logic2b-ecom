# Operación de transferencias de inventario R3.7

## Alcance

`INV-007` permite crear un borrador entre dos ubicaciones activas, enviarlo y
recibirlo en una o varias tandas. Cada recepción separa unidades recibidas de
discrepancias. No incluye conteos, compras a proveedor ni asignación de pedidos.

Hasta R3.9, la ubicación principal es la única vendible: el ledger global y
`products.stock` siguen siendo su espejo. Las unidades enviadas a una secundaria
dejan de estar disponibles en checkout; vuelven al ledger vendible únicamente
si otra transferencia las recibe en la principal.

## Preflight y rollout

1. confirmar backup restaurable en esquema 13 y `PRAGMA foreign_key_check=0`;
2. ensayar `0020_inventory_transfers.sql` con
   `pnpm db:rehearse:inventory-transfers -- --baseline <dump-0019.sql> --output-dir <dir>`;
3. aplicar `0020` antes del Worker nuevo; es expand-only y el Worker anterior
   ignora las tablas;
4. desplegar el Worker que conoce `INV-007` y comprobar GET de ubicaciones y
   transferencias con una sesión administrativa;
5. crear primero un borrador pequeño, confirmar que no cambia stock, enviarlo y
   recibirlo en el destino;
6. reconciliar principal contra legacy y revisar FKs antes de habilitar el uso
   normal.

La demo pública conserva `routes/navigation=true` y `sideEffects=false`: enseña
fixtures, pero creación, envío y recepción responden `403`.

## Reconciliación

```sql
-- La principal debe seguir idéntica al ledger vendible legacy.
SELECT count(*) AS divergencias
FROM inventory_balances b
JOIN inventory_locations l ON l.is_primary = 1
LEFT JOIN inventory_location_balances lb
  ON lb.location_id = l.id AND lb.variant_id = b.variant_id
WHERE lb.variant_id IS NULL
   OR lb.on_hand <> b.on_hand
   OR lb.reserved <> b.reserved;

-- Cada movimiento de transferencia enlaza un movimiento append-only real.
SELECT count(*) AS enlaces_huerfanos
FROM inventory_transfer_movements tm
LEFT JOIN inventory_location_movements lm ON lm.id = tm.location_movement_id
WHERE lm.id IS NULL;

-- Ninguna línea puede contabilizar más de lo enviado.
SELECT count(*) AS lineas_invalidas
FROM inventory_transfer_lines
WHERE received_quantity + discrepancy_quantity > sent_quantity;

PRAGMA foreign_key_check;
```

## Incidencias y recuperación

- Repetir la misma petición con la misma idempotency key devuelve el agregado
  ya materializado y no duplica movimientos.
- Un `409` indica versión perdida o stock cambiado: recargar, revisar el origen
  y repetir con una clave nueva solo si la operación no se aplicó.
- Una recepción parcial permanece `partially_received`; registrar otra recepción
  para las unidades pendientes o declarar la discrepancia comprobada.
- Nunca corregir `sent_quantity`, `received_quantity` ni balances con SQL. Una
  discrepancia es evidencia; R3.8 añadirá ajustes operativos con motivo.

## Rollback

Desactivar `INV-007` retira navegación, rutas y efectos. Un Worker anterior
ignora el esquema nuevo y continúa sobre la principal. Las transferencias ya
enviadas no se borran ni se revierten con `DELETE`: se completan operativamente
o se compensan con otra transferencia. Retirar tablas exige una migración
destructiva y autorización separada.

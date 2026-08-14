# Operación de conteos y ajustes de inventario R3.8

## Alcance

`INV-008` crea sesiones por ubicación y variante, congela saldo/versión y
aplica diferencias como movimientos auditados. Admite conteo cíclico,
conciliación y daño, con doble control opcional. No incluye edición directa,
buckets de stock ni asignación de pedidos.

## Preflight y rollout

1. confirmar backup restaurable en esquema 14 y `PRAGMA foreign_key_check=0`;
2. ensayar `0021_inventory_counts.sql` con
   `pnpm db:rehearse:inventory-counts -- --baseline <dump-0020.sql> --output-dir <dir>`;
3. aplicar `0021` antes del Worker nuevo; es expand-only;
4. desplegar el Worker y comprobar GET de conteos con sesión administrativa;
5. crear un conteo pequeño sin diferencia y confirmar que no crea movimiento;
6. crear una diferencia controlada, aplicarla y reconciliar principal/legacy;
7. habilitar doble control y confirmar que contador y revisor distintos quedan
   en auditoría.

La demo pública conserva rutas y navegación, pero las tres mutaciones responden
`403` y todos los controles aparecen deshabilitados.

## Reconciliación

```sql
-- Principal idéntica al ledger global.
SELECT count(*) AS divergencias
FROM inventory_balances b
JOIN inventory_locations l ON l.is_primary = 1
LEFT JOIN inventory_location_balances lb
  ON lb.location_id = l.id AND lb.variant_id = b.variant_id
WHERE lb.variant_id IS NULL OR lb.on_hand <> b.on_hand OR lb.reserved <> b.reserved;

-- Cada ajuste no cero enlaza un movimiento real con el mismo delta.
SELECT count(*) AS enlaces_invalidos
FROM inventory_count_movements cm
LEFT JOIN inventory_location_movements lm ON lm.id = cm.location_movement_id
WHERE lm.id IS NULL OR lm.delta <> cm.delta;

-- Una sesión aplicada conserva su transición completa.
SELECT count(*) AS estados_invalidos
FROM inventory_counts
WHERE (status = 'applied' AND (submit_idempotency_key IS NULL OR applied_at IS NULL))
   OR (status = 'pending_approval' AND requires_approval <> 1);

PRAGMA foreign_key_check;
```

## Incidencias y recuperación

- `409` por foto obsoleta: no fuerces el balance; crea una sesión nueva.
- Repetir la misma clave devuelve la sesión existente sin duplicar movimientos.
- Un conteo bajo el reservado se rechaza: resuelve reservas antes de recontar.
- Un daño positivo se rechaza; usa conciliación si el hallazgo aumenta físico.
- Una revisión con la identidad del contador se rechaza en dominio y esquema.

## Rollback

Desactivar `INV-008` retira superficie y efectos. Un Worker anterior sigue
operando sobre las tablas previas. No se borran sesiones ni movimientos; una
corrección errónea se compensa mediante otro conteo con motivo y evidencia.

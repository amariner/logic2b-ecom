# Operación del motor de asignación de inventario R3.9

## Alcance

`INV-011` vincula cada fulfillment a una ubicación completa usando mercado,
canal, stock, prioridad y coste. Guarda la explicación y, cuando elige una
secundaria, traslada el consumo ya contabilizado desde principal sin variar el
total físico de la red. No divide un tracking ni adelanta buckets INV-006.

## Preflight y rollout

1. confirmar backup restaurable en esquema 15 y `PRAGMA foreign_key_check=0`;
2. ensayar `0022_inventory_allocation.sql` con
   `pnpm db:rehearse:inventory-allocation -- --baseline <dump-0021.sql> --output-dir <dir>`;
3. aplicar `0022` antes del Worker nuevo; es expand-only y crea una política por ubicación;
4. revisar prioridades, costes, mercados y canales antes de activar `INV-011`;
5. desplegar el Worker, crear una expedición pequeña y revisar explicación;
6. probar una secundaria y confirmar conservación del total de red;
7. vigilar conflictos de versión y ausencia de decisiones sin fulfillment.

La demo pública conserva panel y fixture, pero `PATCH` responde `403` y todos
los controles aparecen deshabilitados.

## Reconciliación

```sql
-- Toda ubicación tiene exactamente una política.
SELECT count(*) AS ubicaciones_sin_politica
FROM inventory_locations l
LEFT JOIN inventory_routing_policies p ON p.location_id = l.id
WHERE p.location_id IS NULL;

-- Cada decisión pertenece a un fulfillment y sus líneas coinciden en pedido.
SELECT count(*) AS decisiones_invalidas
FROM inventory_allocation_decisions d
LEFT JOIN fulfillments f ON f.id = d.fulfillment_id
WHERE f.id IS NULL OR f.order_id <> d.order_id;

-- Una secundaria crea pares release/consume por variante y misma cantidad.
SELECT count(*) AS pares_invalidos
FROM inventory_allocation_movements a
LEFT JOIN inventory_allocation_movements b
  ON b.decision_id = a.decision_id AND b.variant_id = a.variant_id
 AND b.movement_kind = 'secondary_consume'
WHERE a.movement_kind = 'primary_release'
  AND (b.location_movement_id IS NULL OR b.quantity <> a.quantity);

PRAGMA foreign_key_check;
```

## Incidencias y recuperación

- “Ninguna ubicación puede cubrir”: revisa stock, reservas, mercado/canal y estado.
- `409` al editar: recarga; otra persona cambió la versión de política.
- Conflicto de stock al enviar: la batch revierte completa; recalcula y reintenta.
- No borres una decisión ni edites su JSON; es evidencia histórica.
- Una política nueva nace activa con prioridad 1000 para evitar preferencia accidental.

## Rollback

Desactivar `INV-011` devuelve fulfillment al comportamiento global anterior.
No borres tablas ni movimientos. Compensa un traslado incorrecto con operación
de inventario trazable y conserva la explicación original.

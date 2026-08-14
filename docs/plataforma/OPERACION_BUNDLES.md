# Operación de bundles R4.7

## Alcance

`PRC-012` ofrece bundles fijos y configurables. El producto carcasa determina
el precio; la composición determina disponibilidad e inventario. La demo es de
solo lectura y no existe editor visual.

## Preflight y rollout

1. exportar D1 y confirmar que el baseline incluye `0030` y no `bundles`;
2. ejecutar `pnpm db:rehearse:bundles -- --baseline <dump-0030.sql> --output-dir <dir>`;
3. aplicar `0031_bundles.sql` antes del Worker;
4. desplegar con `PRC-012` ausente/disabled y mantener inactivos los productos
   carcasa que no tengan stock propio;
5. crear definiciones `disabled` mediante `/api/admin/bundles`;
6. revisar producto carcasa, componentes únicos, cantidades, grupos,
   mínimos/máximos y defaults; activar con versión esperada;
7. verificar quote y checkout con stock limitante, default y selección explícita;
8. probar reserva/pago, fulfillment, reembolso total y RMA parcial;
9. exportar backup esquema 25 y restaurarlo antes de publicar.

La migración es expand-only y no crea bundles. El rehearsal R4.7 conservó 280
productos, 282 variantes, 282 balances, 8 pedidos y 13 líneas; hash
`4905bc205d676985f638098d203b360c7533d37defbe933b06ed228d2a3ccd2d`, dump
de 564928 bytes y restore íntegro. Artefacto local:
`/tmp/logic2b-r47-rehearsal-final/r4-bundles-1786721547384`.

## Invariantes y diagnóstico

- `available_stock` es el mínimo de componentes; revisar `on_hand-reserved` de
  cada variante default si el bundle aparece agotado;
- `bundle_activation_conflict`: falta un componente fijo, un grupo o defaults
  compatibles con sus límites;
- `order_bundle_component_conflict`: producto, variante, cantidad o snapshot no
  coinciden con la definición/version congelada;
- `bundle_application_conflict`: cabecera, línea, precio, cantidad o composición
  agregada divergen; abortar y recotizar;
- una selección ajena o repetida se rechaza antes de crear pedido;
- refund/RMA reponen `cantidad devuelta × cantidad_per_bundle`; la carcasa no se
  mueve;
- una edición de línea bundle se rechaza de forma explícita.

Consultas mínimas:

```sql
SELECT id, product_id, kind, state, version FROM bundles ORDER BY id;
SELECT bundle_id, group_id, product_id, quantity, is_default
FROM bundle_components ORDER BY bundle_id, sort_order;
SELECT application.order_id, application.bundle_id, application.bundle_version,
       component.product_id, component.variant_id, component.quantity_per_bundle
FROM bundle_applications application
JOIN order_bundle_components component ON component.order_item_id=application.order_item_id
ORDER BY application.order_id, component.variant_id;
SELECT return_id, return_line_id, component_variant_id, quantity
FROM bundle_return_inventory_movements ORDER BY return_id, component_variant_id;
PRAGMA integrity_check;
PRAGMA foreign_key_check;
```

## Rollback operativo

Desactivar `PRC-012`, después deshabilitar definiciones con versión esperada y
retirar de venta carcasas sin stock ordinario. No borrar `0031`: composición,
aplicaciones y vínculos RMA son evidencia histórica. No hay downgrade de datos.

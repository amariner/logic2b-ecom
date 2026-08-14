# Operación de combinabilidad de descuentos R4.5

## Alcance

`PRC-008` administra una matriz versionada de fuentes y clases, con prioridad,
contexto y tope agregado. La API administrativa no incorpora editor visual.
La demo pública sigue siendo de solo lectura. Producto, pedido y envío son
clases del contrato; hoy código es `order`, y automático/cantidad-X-Y son
`product`. No existe todavía una fuente real de descuento sobre envío.

## Preflight y rollout

1. partir de un dump restaurable en `0028` y verificar integridad/FKs;
2. ejecutar `pnpm db:rehearse:discount-combinations -- --baseline <dump-0028.sql> --output-dir <dir>`;
3. aplicar `0029_discount_combinations.sql` antes del Worker; crea cuatro
   tablas vacías, una guarda de combinación y reemplaza la guarda de usos;
4. desplegar con `PRC-008` ausente o disabled: la exclusividad debe permanecer;
5. crear una política `disabled`, revisar contexto, tope y todos los pares;
6. activar con versión esperada y probar dos y tres fuentes, scopes disjuntos,
   regla truncada por tope y código inválido;
7. comprobar quote, checkout y pedido: `schema: 2`, suma y total deben coincidir;
8. confirmar que el uso del código conserva solo su porción y que automáticos o
   cantidad combinados no duplican filas en sus tablas exclusivas;
9. probar reducción/aumento, cancelación parcial y devolución por precio
   congelado;
10. exportar backup esquema 23 y restaurarlo antes de publicar.

Ensayo local: 8 pedidos y 13 líneas conservados, tablas nuevas vacías, hash
`0f4d4312ea7a1c2345048662566d3ba7e41d48740f2e739200a15e9d4ab49aa8`, dump
de 544465 bytes, restore íntegro y cero fallos de FK.

## Reconciliación

```sql
SELECT application.id
FROM discount_combination_applications application
JOIN discount_combination_policies policy ON policy.id=application.policy_id
WHERE application.discount_cents<>(
  SELECT coalesce(sum(json_extract(item.pricing_snapshot_json,'$.discount_cents')),0)
  FROM order_items item WHERE item.order_id=application.order_id
)
OR application.policy_version<>json_extract(application.snapshot_json,'$.version')
OR policy.maximum_discount_basis_points<>
   json_extract(application.snapshot_json,'$.maximum_discount_basis_points');

SELECT item.id
FROM order_items item
WHERE json_extract(item.pricing_snapshot_json,'$.schema')=2
  AND NOT EXISTS (
    SELECT 1 FROM discount_combination_applications application
    WHERE application.order_id=item.order_id
  );

SELECT usage.id
FROM promotion_code_usages usage
JOIN discount_combination_applications application ON application.order_id=usage.order_id
WHERE usage.discount_cents<>(
  SELECT coalesce(sum(json_extract(rule.value,'$.discount_per_unit_cents')*
    coalesce(item.current_qty,item.qty)),0)
  FROM order_items item
  JOIN json_each(item.pricing_snapshot_json,'$.applied_rules') rule
  WHERE item.order_id=usage.order_id
    AND json_extract(rule.value,'$.id')='promotion:'||usage.promotion_id
);

PRAGMA foreign_key_check;
PRAGMA integrity_check;
```

Para informes de campaña, unir aplicaciones exclusivas con las entradas de
`selected_sources` de la aplicación combinada. No sumar el total combinado a
cada fuente.

## Incidencias

- `discount_combination_application_conflict`: política, versión, matriz,
  contexto, suma, línea o tope ya no coinciden; abortar el pedido y recotizar;
- `promotion_code_usage_conflict`: cambió vigencia/límite/scope o la porción del
  código; no convertirla al total combinado;
- `pricing_source_conflict`: un caller antiguo intentó persistir dos
  aplicaciones exclusivas; debe enviar una aplicación PRC-008 canónica;
- regla `capped`: esperado cuando reglas anteriores consumen el tope; revisar
  `raw_discount_per_unit_cents` frente a `discount_per_unit_cents`;
- edición o devolución: no volver a evaluar la matriz; usar
  `order_items.unit_price_cents`.

## Rollback

Desactivar rutas/efectos de `PRC-008`. No contraer `0029`. Las políticas dejan
de consultarse y nuevas cotizaciones recuperan la precedencia exclusiva. Los
pedidos históricos, usos y backups conservan toda su evidencia.

# Operación del motor de reglas de precio R4.1

## Alcance

`PRC-003` evalúa candidatas ya resueltas y conserva su explicación. En R4.1 no
hay editor, tabla de campañas, códigos ni reglas automáticas: esas fuentes
pertenecen a R4.2–R4.3. Sin candidatas, el resultado es exactamente el precio
base anterior.

## Preflight y rollout

1. obtener un dump restaurable en `0024` y verificar `PRAGMA foreign_key_check`;
2. ejecutar `pnpm db:rehearse:price-rules -- --baseline <dump-0024.sql> --output-dir <dir>`;
3. confirmar que el resumen conserva pedidos/líneas y backfillea una explicación
   de descuento cero por cada línea;
4. aplicar `0025_price_rule_snapshots.sql` antes del Worker nuevo;
5. desplegar con cualquier fuente de reglas apagada y comprobar que cotización,
   porte, total y checkout no cambian;
6. validar una regla controlada fuera de producción mediante el puerto tipado y
   contrastar desglose, importe cobrado y snapshot del pedido;
7. activar `PRC-003` solo en despliegues cuyo alcance incluya reglas.

El ensayo del 2026-08-14 sobre el dump local de R3.11 conservó 8 pedidos y 13
líneas, creó 13 snapshots, mantuvo el hash de columnas previas y restauró un
dump de 494788 bytes sin errores de integridad.

## Reconciliación

```sql
SELECT oi.id
FROM order_items oi JOIN orders o ON o.id=oi.order_id
WHERE json_valid(oi.pricing_snapshot_json)=0
   OR json_extract(oi.pricing_snapshot_json, '$.schema')<>1
   OR json_extract(oi.pricing_snapshot_json, '$.currency')<>upper(o.currency)
   OR json_extract(oi.pricing_snapshot_json, '$.unit_price_cents')<>oi.unit_price_cents
   OR json_extract(oi.pricing_snapshot_json, '$.base_unit_price_cents')<>oi.base_unit_price_cents
   OR json_extract(oi.pricing_snapshot_json, '$.quantity')<>coalesce(oi.current_qty, oi.qty);

SELECT oi.id
FROM order_items oi
WHERE oi.base_unit_price_cents < oi.unit_price_cents
   OR json_extract(oi.pricing_snapshot_json, '$.discount_cents')
      <> (oi.base_unit_price_cents-oi.unit_price_cents)*coalesce(oi.current_qty, oi.qty);

PRAGMA foreign_key_check;
```

Una línea de amendment creada por herramientas operativas conserva un snapshot
de fallback si aún no dispone de una regla propia; nunca debe reconstruirse el
pedido histórico consultando reglas vigentes.

## Incidencias y rollback

- contexto inválido o regla duplicada: rechazar la configuración; no degradar a
  un descuento aproximado;
- total distinto entre cotización y proveedor: detener checkout y comparar el
  mismo `pricing_snapshot_json`, cantidad y moneda;
- regla aplicada fuera de vigencia: revisar el instante UTC congelado y los
  límites exclusivos, sin editar pedidos;
- snapshot inválido: aislar el writer que lo produjo y conservar la fila para
  diagnóstico; no repararla recalculando con reglas actuales.

Para rollback, retirar la fuente de candidatas o desactivar `PRC-003`; el motor
devuelve precio base. Conservar `0025`, snapshots e índice. No hay una tabla de
reglas que purgar en R4.1.

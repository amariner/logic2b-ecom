# Operación de códigos promocionales R4.2

## Alcance

`PRC-004` administra códigos por API autenticada y los aplica en quote/checkout
de despliegues cliente. La demo pública bloquea checkout y mutaciones; no hay
códigos reales seed. La cantidad fija de R4.2 descuenta cada unidad elegible,
no el pedido completo.

## Preflight y rollout

1. partir de un dump restaurable en `0025` con FK e integridad en verde;
2. ejecutar `pnpm db:rehearse:promotion-codes -- --baseline <dump-0025.sql> --output-dir <dir>`;
3. aplicar `0026_promotion_codes.sql` antes del Worker: crea tres tablas vacías,
   trigger e índices, sin activar campañas;
4. desplegar con `PRC-004` ausente o disabled y comprobar checkout sin código;
5. activar rutas/efectos solo en el despliegue cliente autorizado;
6. crear primero un código `disabled`, guardar el valor claro fuera de D1 y
   revisar pista, scope, vigencia, mínimo y límites;
7. activar con versión esperada y probar cotización, pedido pendiente, pago y
   caducidad con identidades de ensayo;
8. contrastar el backup vigente (esquema 21 desde R4.3) y restore antes de
   publicar el código.

El ensayo local del 2026-08-14 conservó 8 pedidos, 13 líneas y el hash previo;
forward/restore dejaron las tres tablas vacías e íntegras. El dump restaurado
ocupó 502769 bytes.

## Reconciliación

```sql
SELECT pc.id, pc.global_usage_limit,
  sum(CASE WHEN u.status IN ('reserved','consumed') THEN 1 ELSE 0 END) AS ocupados
FROM promotion_codes pc
LEFT JOIN promotion_code_usages u ON u.promotion_id=pc.id
GROUP BY pc.id
HAVING pc.global_usage_limit IS NOT NULL AND ocupados>pc.global_usage_limit;

SELECT u.id
FROM promotion_code_usages u
JOIN orders o ON o.id=u.order_id
WHERE (u.status='reserved' AND o.status<>'pending')
   OR (u.status='consumed' AND o.status='pending')
   OR u.discount_cents<>(
     SELECT coalesce(sum(json_extract(oi.pricing_snapshot_json,'$.discount_cents')),0)
     FROM order_items oi WHERE oi.order_id=o.id
       AND json_extract(oi.pricing_snapshot_json,'$.applied_rule.id')='promotion:'||u.promotion_id
   );

SELECT promotion_id, customer_key_hash, count(*) AS ocupados
FROM promotion_code_usages
WHERE status IN ('reserved','consumed')
GROUP BY promotion_id, customer_key_hash
HAVING ocupados>(SELECT per_customer_usage_limit FROM promotion_codes
  WHERE id=promotion_id);

PRAGMA foreign_key_check;
```

## Incidencias

- respuesta 422 genérica: código inexistente, inválido, fuera de scope/vigencia
  o sin cupo; no distinguir casos que permitan enumerar identidad;
- `promotion_code_usage_conflict`: otra compra ganó el último cupo o los
  snapshots no coinciden; no crear un segundo pedido ni editar el uso;
- código perdido tras el alta: generar otro y archivar el anterior; D1 no puede
  recuperar el texto claro desde el hash;
- reserva huérfana: confirmar primero el estado del pedido/proveedor y ejecutar
  la transición de caducidad; no cambiar `status` a mano;
- reembolso: conservar uso `consumed` y calcular sobre el snapshot efectivo.

## Rollback

Desactivar rutas/efectos de `PRC-004`. No contraer `0026` ni eliminar usos. Los
pedidos históricos, reembolsos y backup siguen leyendo sus snapshots sin
consultar el código vigente.

# Operación de descuentos automáticos R4.3

## Alcance

`PRC-005` administra campañas automáticas por API autenticada y las aplica en
quote/checkout de despliegues cliente. La demo pública no contiene campañas
seed. La cantidad fija descuenta cada unidad elegible; no es descuento de cesta.

## Preflight y rollout

1. partir de un dump restaurable en `0026` con FK e integridad en verde;
2. ejecutar `pnpm db:rehearse:automatic-discounts -- --baseline <dump-0026.sql> --output-dir <dir>`;
3. aplicar `0027_automatic_discounts.sql` antes del Worker; crea tres tablas
   vacías, dos guardas y tres índices;
4. desplegar con `PRC-005` ausente o disabled y comprobar precio base/códigos;
5. activar rutas/efectos solo en el despliegue cliente autorizado;
6. crear primero una campaña `disabled` y revisar motivo público, scope,
   vigencia, contexto, mínimo, prioridad y efecto;
7. activar con versión esperada y probar quote, checkout, pedido y reembolso;
8. probar además un código válido: debe ganar globalmente y explicar la
   supresión del automático;
9. contrastar backup esquema 21 y restore antes de publicar la campaña.

El ensayo local del 2026-08-14 conservó 8 pedidos, 13 líneas, promociones y el
hash previo. Forward/restore dejaron las tres tablas nuevas vacías e íntegras;
el dump restaurado ocupó 510659 bytes.

## Reconciliación

```sql
SELECT a.id
FROM automatic_discount_applications a
JOIN orders o ON o.id=a.order_id
JOIN automatic_discounts d ON d.id=a.discount_id
WHERE a.discount_cents<>(
  SELECT coalesce(sum(json_extract(oi.pricing_snapshot_json,'$.discount_cents')),0)
  FROM order_items oi WHERE oi.order_id=o.id
    AND json_extract(oi.pricing_snapshot_json,'$.applied_rule.id')='automatic:'||d.id
);

SELECT a.order_id
FROM automatic_discount_applications a
JOIN promotion_code_usages u ON u.order_id=a.order_id;

SELECT oi.id
FROM order_items oi
WHERE json_extract(oi.pricing_snapshot_json,'$.applied_rule.id') LIKE 'automatic:%'
  AND NOT EXISTS (
    SELECT 1 FROM automatic_discount_applications a
    WHERE a.order_id=oi.order_id
      AND 'automatic:'||a.discount_id=json_extract(oi.pricing_snapshot_json,'$.applied_rule.id')
  );

PRAGMA foreign_key_check;
```

## Incidencias

- `automatic_discount_application_conflict`: la campaña cambió entre quote y
  pedido o el snapshot no coincide; no recalcular ni forzar el INSERT;
- `pricing_source_conflict`: el caller intentó congelar código y automático;
  revisar la matriz, no borrar una de las evidencias a mano;
- motivo equivocado: desactivar la campaña y crear otra; la configuración de
  una versión publicada no se edita;
- código rechazado con automático visible: comportamiento esperado en quote;
  checkout debe devolver 422 por el código solicitado;
- reembolso: calcular siempre desde `order_items.unit_price_cents`.

## Rollback

Desactivar rutas/efectos de `PRC-005`. No contraer `0027` ni borrar
aplicaciones. `PRC-004` y el precio base continúan operativos; pedidos y backup
siguen leyendo snapshots históricos.

# Operación de ofertas por cantidad y X/Y R4.4

## Alcance

`PRC-006` administra tramos por unidades o subtotal base. `PRC-007` añade
compra X/Y con scopes idénticos o disjuntos, múltiplos, límite y selección
estable de recompensa. La API es administrativa y no incorpora editor visual.
La demo pública permanece inerte.

## Preflight y rollout

1. partir de un dump restaurable en `0027` con FK e integridad en verde;
2. ejecutar `pnpm db:rehearse:quantity-offers -- --baseline <dump-0027.sql> --output-dir <dir>`;
3. aplicar `0028_quantity_offers.sql` antes del Worker; crea cuatro tablas
   vacías, cinco guardas y tres índices;
4. desplegar con `PRC-006/007` ausentes o disabled y comprobar precio base,
   códigos y automáticos;
5. activar solo `PRC-006` para tramos o también `PRC-007` para X/Y;
6. crear primero una oferta `disabled` y revisar contexto, prioridad, scopes,
   umbrales o múltiplos y efecto;
7. activar con versión esperada y probar quote, checkout, pedido, reducción y
   aumento de cantidad, cancelación parcial y devolución;
8. comprobar código válido y campaña automática: debe quedar una sola fuente;
9. contrastar backup esquema 22 y restore antes de publicar.

El ensayo local conservó 8 pedidos y 13 líneas, además de promociones y
automáticos previos; forward/restore dejaron las cuatro tablas nuevas vacías,
el hash previo intacto y un dump restaurado de 530633 bytes.

## Reconciliación

```sql
SELECT a.id
FROM quantity_offer_applications a
JOIN quantity_offers q ON q.id=a.offer_id
WHERE a.discount_cents<>(
  SELECT coalesce(sum(json_extract(oi.pricing_snapshot_json,'$.discount_cents')),0)
  FROM order_items oi WHERE oi.order_id=a.order_id
    AND json_extract(oi.pricing_snapshot_json,'$.applied_rule.id')='quantity:'||q.id
);

SELECT a.order_id
FROM quantity_offer_applications a
LEFT JOIN promotion_code_usages p ON p.order_id=a.order_id
LEFT JOIN automatic_discount_applications d ON d.order_id=a.order_id
WHERE p.id IS NOT NULL OR d.id IS NOT NULL;

SELECT oi.id
FROM order_items oi
WHERE json_extract(oi.pricing_snapshot_json,'$.applied_rule.id') LIKE 'quantity:%'
  AND NOT EXISTS (
    SELECT 1 FROM quantity_offer_applications a
    WHERE a.order_id=oi.order_id
      AND 'quantity:'||a.offer_id=json_extract(oi.pricing_snapshot_json,'$.applied_rule.id')
  );

PRAGMA foreign_key_check;
```

## Incidencias

- `quantity_offer_application_conflict`: configuración, evidencia, múltiplo,
  redondeo o líneas cambiaron entre quote y pedido; no forzar el INSERT;
- `quantity_offer_product_role_conflict`: un scope usa un rol incompatible con
  el tipo de oferta;
- `pricing_source_conflict`: el caller intentó combinar fuentes antes de R4.5;
- descuento real ligeramente mayor al teórico: comportamiento esperado; el
  residuo de céntimos favorece al comprador y queda congelado;
- edición posterior: no reevalúa el umbral ni X/Y; usa el precio del pedido;
- reembolso: calcular siempre desde `order_items.unit_price_cents`.

## Rollback

Desactivar rutas/efectos de `PRC-006/007`. No contraer `0028` ni borrar
aplicaciones. `PRC-004/005` y el precio base continúan operativos; backup y
pedidos históricos conservan su evidencia.

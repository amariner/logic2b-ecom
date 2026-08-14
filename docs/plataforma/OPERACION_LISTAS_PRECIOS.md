# Operación de listas de precios contextuales

`PRC-009` define precios base por mercado, canal y empresa. No es una campaña:
se resuelve antes de promociones y cada línea explica si procede de catálogo o
de una lista.

## Rollout

1. exportar D1 y comprobar que el baseline tiene `0029`;
2. ejecutar `pnpm db:rehearse:price-lists -- --baseline <dump-0029.sql> --output-dir <dir>`;
3. aplicar `0030_contextual_price_lists.sql`;
4. desplegar con `PRC-009` ausente/disabled y confirmar precio de catálogo;
5. crear listas disabled mediante `/api/admin/price-lists`;
6. revisar divisa, mercados, canales, vigencia, prioridad, productos y hashes;
7. activar primero una lista general controlada y después scopes empresariales;
8. verificar quote, checkout, aplicación por pedido y backup esquema 24.

La migración es expand-only y no crea listas. El rehearsal R4.6 conservó 8
pedidos y 13 líneas, hash
`d2c74820ff9fbd50068b11e54a4928ff2e46dcbb97ad05450f9811c0a6eb0e77`
y dump de 552665 bytes. Artefacto local:
`/tmp/logic2b-r46-rehearsal/r4-price-lists-1786719301131`.

## Invariantes

- el navegador nunca envía importes autoritativos;
- `customer.company` no selecciona listas;
- empresa precede a general aunque la general tenga prioridad numérica menor;
- el fallback se decide por producto, no por carrito;
- promociones calculan mínimos y efectos sobre el precio de lista elegido;
- cada aplicación coincide con los `price_origin` de las líneas del pedido;
- edición, devolución y restore conservan el precio efectivo congelado.

## Diagnóstico

- `no_eligible_list`: revisar state, divisa, mercado, canal y vigencia;
- origen catálogo con lista activa: revisar que el producto esté en la lista;
- lista empresarial ignorada: comprobar que integración servidor aporta un hash
  SHA-256 canónico, nunca una razón social libre;
- `price_list_application_conflict`: comparar versión, producto/precio, contexto,
  line count y subtotales contra `order_items.pricing_snapshot_json`;
- conflicto de estado: releer versión y repetir solo si la transición sigue
  siendo válida.

Consultas mínimas:

```sql
SELECT id, state, version, priority, currency FROM price_lists ORDER BY priority, id;
SELECT price_list_id, product_id, price_cents FROM price_list_products ORDER BY price_list_id, product_id;
SELECT price_list_id, price_list_version, order_id, catalog_subtotal_cents,
       effective_subtotal_cents, line_count FROM price_list_applications ORDER BY applied_at;
PRAGMA integrity_check;
PRAGMA foreign_key_check;
```

## Rollback operativo

Desactivar `PRC-009` y sus rutas/efectos. No borrar `0030`: las aplicaciones y
snapshots son evidencia de dinero. Una lista concreta se deshabilita con versión
esperada; las nuevas quotes caen a la siguiente lista o al catálogo.

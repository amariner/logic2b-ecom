# Operación de edición segura de pedidos R3.3

## Contrato servido

`ORD-005` añade la edición de pedidos pagados desde el detalle administrativo:

| Ruta | Operación |
|---|---|
| `POST /api/admin/order-amendments/preview` | recalcula líneas, portes, total, delta y stock |
| `POST /api/admin/order-amendments` | crea una intención idempotente y la concilia |
| `POST /api/admin/order-amendments/:id` | reintenta un reembolso pendiente/revisable |
| `POST /api/webhooks/stripe` | confirma o expira el cobro adicional alojado |

La confirmación vuelve a calcular el plan desde D1. Un delta positivo reserva
stock y abre Stripe Checkout; uno negativo se reparte entre capturas concretas;
un delta cero se aplica sin PSP. En `DEMO_MODE` las rutas devuelven `403` y el
panel solo explica el flujo con fixtures inertes.

## Preflight y rehearsal de `0016`

Obtener primero un backup administrativo fresco de la base todavía en `0015`.
Wrangler D1 no exporta esta base por FTS5, por lo que el endpoint autenticado de
backup es la fuente restaurable. Ejecutar:

```bash
pnpm db:rehearse:order-amendments -- \
  --baseline <backup-0015.sql> \
  --output-dir .wrangler/rehearsals
```

El ensayo crea una SQLite aislada con esquema `0001`–`0015`, restaura los
datos, ejecuta `0016`, compara hashes legacy, comprueba FKs/integridad y repite
las verificaciones tras dump/restore. Bloquea si encuentra dos líneas de la
misma variante en un pedido, un reembolso sin una única captura histórica o un
importe histórico superior a su captura.

Preflight remoto equivalente, sin PII:

```sql
SELECT count(*) FROM pragma_foreign_key_check;
SELECT count(*) FROM (
  SELECT order_id, variant_id FROM order_items WHERE variant_id IS NOT NULL
  GROUP BY order_id, variant_id HAVING count(*) > 1
);
SELECT count(*) FROM refunds;
```

## Rollout

1. Conservar el backup y la salida del rehearsal fuera del repositorio.
2. Aplicar `0016_order_amendments.sql` a D1 antes del Worker.
3. Verificar `edit_version=1`, `current_qty=qty`, FKs vacías y migración listada.
4. Desplegar el Worker y ejecutar E2E/a11y del panel.
5. Comprobar que la demo muestra el bloque inerte y rechaza las tres mutaciones.

La instalación avanzada activa `INV-004` junto a `ORD-005`; minimal y standard
no cargan rutas, controles ni efectos de edición.

## Reconciliación

- `pending_payment`: esperar webhook. Al expirar, se libera la reserva y el
  pedido no cambia.
- `pending_refund` o `processing`: reintentar la misma intención; cada parte
  conserva su idempotency key y referencia PSP.
- `requires_review`: revisar la referencia en Stripe y usar el botón de
  conciliación. No abrir otra edición mientras la intención siga activa.
- `conflict`: recargar; otra mutación ganó por `edit_version`, versión de pago,
  reserva o estado del amendment.

Los payloads de evento y la auditoría solo contienen ids, cantidades agregadas,
delta y estados. Dirección, nombre, teléfono y email permanecen fuera.

## Backup y rollback

El backup administrativo es esquema 10 e incluye `order_amendments`, sus
líneas y `refund_payment_allocations` en orden de FK. Tras restaurar:

```sql
PRAGMA foreign_key_check;
SELECT count(*) FROM order_amendments;
SELECT count(*) FROM order_amendment_lines;
SELECT count(*) FROM refund_payment_allocations;
```

El rollback operativo desactiva `ORD-005` y redespliega el Worker anterior. La
migración es expand-only: no borrar columnas, tablas ni asignaciones. Un cobro
o reembolso ya confirmado debe reconciliarse antes de cualquier contracción,
que exigiría otra autorización destructiva.

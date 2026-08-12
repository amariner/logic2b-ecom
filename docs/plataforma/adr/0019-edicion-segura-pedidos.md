# ADR-0019 — Edición segura de pedidos pagados

- Estado: aceptado
- Fecha: 2026-08-12
- Bloque: R3.3
- Decisión de esquema: autorizada por Andreu el 2026-08-12

## Contexto

R2 permite pagar, reservar inventario, preparar por cantidades y cancelar o
reembolsar parcialmente. Editar un pedido pagado no puede reducirse a cambiar
`order_items.qty`: una edición puede competir con un envío, cobrar otra captura,
reembolsar una captura anterior, reponer inventario o cambiar una dirección que
ya se utilizó para preparar un paquete.

El navegador no es fuente de precios, portes, saldo financiero ni stock. Una
previsualización tampoco concede un lock: la confirmación recalcula el mismo
plan y exige la versión de pedido observada.

## Decisión

1. `orders.edit_version` serializa cualquier edición aplicada. Cada intención
   conserva `expected_order_version`; una versión obsoleta pierde sin efectos.
2. `order_items.qty` conserva el snapshot con el que nació la línea y
   `current_qty` materializa su cantidad vigente, incluido cero. La historia no
   se borra y fulfillment usa la cantidad vigente.
3. `order_amendments` congela antes/después de dirección y totales, delta,
   moneda, razón, sesión alojada y estado. Sus líneas congelan variante, nombre,
   SKU, precio servidor y cantidades antes/después.
4. Solo existe una edición activa por pedido. Puede modificar unidades todavía
   no enviadas ni canceladas; la dirección solo cambia antes de la primera
   salida física.
5. Un delta positivo crea una nueva Stripe Checkout Session alojada. Las
   unidades adicionales quedan reservadas; el webhook aplica captura, líneas,
   totales, inventario, evento y auditoría en una batch. La expiración libera la
   reserva y no altera el pedido.
6. Un delta negativo crea primero una intención durable de reembolso. Cada
   parte se asigna a una captura concreta mediante
   `refund_payment_allocations`; el mismo idempotency key llega al PSP. Solo
   cuando todas las asignaciones están confirmadas se aplican cantidades,
   totales, reposición, evento y auditoría.
7. Un delta cero (por ejemplo, solo dirección) se aplica en una batch sin PSP.
8. El pago principal sigue siendo un único ledger por pedido. Los cobros
   adicionales son transacciones `capture`; `expected_amount_cents` representa
   el bruto capturado autorizado, mientras los ajustes negativos son
   transacciones `refund`. No aparece un segundo saldo mutable.
9. La demo pública muestra la capacidad con datos inertes. Sin `ORD-005` no hay
   ruta, controles ni carga cognitiva.

## Invariantes

- Todo importe es un entero en céntimos y se recalcula desde D1.
- `total_after = subtotal_after + shipping_after` y `delta = after - before`.
- La cantidad vigente nunca baja de lo enviado más lo cancelado.
- Una captura adicional no se aplica sin stock reservado y pago confirmado.
- Un reembolso no supera la parte no asignada de su captura.
- Dos ediciones, o una edición frente a fulfillment/reembolso, tienen un solo
  ganador observable.
- Un replay conserva la misma intención, sesión, llamada PSP y evento.
- Dirección y PII nunca entran en payloads de evento, audit diff ni logs.

## Compatibilidad y rollback

La migración `0016` solo añade columnas, tablas, índices y un trigger. El
backfill copia `qty` a `current_qty` y asigna los reembolsos históricos a la
única captura que admitía R2. El binario anterior ignora las columnas nuevas;
el binario R3.3 usa `COALESCE(current_qty, qty)` durante la ventana de rollback.

El rollback operativo consiste en desactivar `ORD-005` y volver al binario
anterior. No se eliminan tablas ni columnas. La contracción exige otra ADR,
ventana estable y autorización destructiva independiente.

## Alternativas descartadas

- Mutar `qty` y `total_cents` sin historial: pierde evidencia y no resiste
  concurrencia.
- Crear un segundo ledger de pagos por edición: duplica reglas de saldo y rompe
  cancelaciones posteriores.
- Cobrar un enlace manual y marcar el ajuste a mano: no es idempotente ni
  reconciliable.
- Reservar stock en el navegador: viola la autoridad del servidor.

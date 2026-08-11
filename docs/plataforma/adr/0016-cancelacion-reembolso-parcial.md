# ADR-0016 — Cancelación y reembolso parcial por cantidades

- Estado: **propuesto; pendiente de puerta de migración y política de envío**
- Fecha: 2026-08-11
- Mandato: R2.13

## Contexto

R2.10 materializa una intención de reembolso total antes del PSP y R2.12 impide
usar ese flujo cuando ya existe un envío. `refunds` admite varias filas por
pedido, `refund_items` congela línea/cantidad/importe y el ledger financiero ya
limita la suma reembolsada a la captura. Falta demostrar dos invariantes para
operar por cantidades:

1. la línea seleccionada pertenece al mismo pedido que la intención;
2. dos solicitudes simultáneas no pueden cancelar/reembolsar la misma unidad,
   ni una unidad que ya pertenece a un fulfillment activo.

Ambas deben quedar protegidas en D1 antes de llamar a Stripe o al adaptador
simulado. Una comprobación previa en TypeScript no basta bajo concurrencia.

## Decisión propuesta

La propuesta exacta vive en
[`../sql/0013_partial_refund_guards.proposed.sql`](../sql/0013_partial_refund_guards.proposed.sql):

1. añadir a `refunds` un `operation_type` con default
   `total_cancellation`, compatible con toda fila R2.10;
2. distinguir `partial_cancellation` de `return`/`adjustment`, para no impedir
   que R3 modele una devolución de mercancía ya entregada;
3. validar mediante trigger que `refund_items.order_item_id` pertenece a
   `refunds.order_id`;
4. para cancelaciones, reservar la suma de cantidades de toda intención no
   cancelada y de todo fulfillment activo antes del PSP;
5. considerar `failed` y `requires_review` todavía reservados: se reconcilian
   con la misma identidad. Solo `cancelled` libera unidades;
6. derivar `cancelled_quantity` para fulfillment únicamente de
   `partial_cancellation|total_cancellation` con reembolso `succeeded`.

No se elimina ni renombra una columna, no se añade dependencia y no se toca
ningún dato PCI. La migración es aditiva, pero requiere autorización expresa y
rehearsal antes de entrar en `migrations/` o D1 local/remota.

## Workflow posterior a la puerta

1. El admin envía ids de línea, cantidades, motivo, decisión de reposición y
   clave idempotente; nunca envía importes.
2. El servidor rechaza líneas enviadas/canceladas, calcula
   `unit_price_cents × quantity` y crea una intención `partial_cancellation`.
3. El trigger reserva todas las cantidades de la intención en la misma batch.
4. El adaptador recibe solo referencia de pago, moneda, importe y clave estable.
5. El éxito añade un asiento `refund`, mueve el pago a `partially_refunded` o
   `refunded`, registra evento/auditoría/email y repone solo las cantidades cuya
   decisión sea `restock`.
6. El pedido permanece operativo mientras conserve unidades netas. Solo una
   cancelación monetaria completa sin fulfillment proyecta `cancelled`.
7. Replay, retry y reconciliación recuperan la misma intención; una selección
   diferente exige otra clave y compite contra las cantidades reservadas.

El flujo parcial queda limitado a unidades **no enviadas**. Reembolsar una
unidad enviada/entregada requiere devolución/RMA e inspección (FUL-010/011), no
una cancelación administrativa que reponga stock de forma ficticia.

## Puerta comercial: gastos de envío

El esquema separa `subtotal_cents` y `shipping_cents`, pero el pedido no guarda
una asignación de envío por línea. Hace falta escoger una política antes de
construir el cálculo y la UI:

- **A — recomendada:** un reembolso parcial devuelve solo mercancía
  seleccionada (`shipping_cents=0`). El flujo total existente devuelve el envío
  completo. Es determinista y no inventa un prorrateo.
- **B:** permitir devolver el envío completo al cancelar las últimas unidades
  reembolsables. Exige un control/confirmación explícitos y cambia la promesa
  operativa al cliente.

No se propone un prorrateo: sin una regla comercial y una asignación congelada
sería dinero inventado por redondeo.

## Rollout y rollback propuestos

1. exportar y restaurar una copia aislada de la D1 objetivo;
2. comprobar que toda `refund_item` histórica pertenece a su pedido y que no
   supera la cantidad no enviada;
3. aplicar `0013`, repetir integridad/FKs y ensayar dos intenciones concurrentes;
4. desplegar el binario que escribe `operation_type` y deriva cantidades;
5. verificar total R2.10, parcial, replay, PSP timeout y backup/restore;
6. conservar la columna y el trigger al volver al binario anterior: su default
   mantiene el flujo total. No borrar intenciones para liberar cantidades.

## Criterio de terminado

- migración y backfill/rehearsal aprobados;
- property tests de céntimos, cantidades, orden de líneas y concurrencia;
- varias devoluciones no superan captura ni cantidad neta;
- stock, pago, pedido, fulfillment, evento, auditoría y email coherentes;
- demo visible pero 403; capability gate sin rutas/efectos al desactivar;
- E2E y a11y del panel a 1440/375;
- documentación honesta y sin prometer devoluciones de mercancía.

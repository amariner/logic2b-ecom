# Operación de reembolsos totales y parciales R2.10–R2.13

Este runbook cubre la cancelación con reembolso total o por cantidades iniciada
desde el detalle administrativo. No cubre devoluciones/RMA de mercancía ya
enviada, cambios de precio ni créditos de tienda.

## Precondiciones

- pedido en `paid`;
- pago principal `captured`, con moneda e importe iguales al pedido;
- proveedor soportado (`stripe` con secreto configurado o `simulated`);
- capacidad `ORD-007` con `routes` y `sideEffects` activas;
- motivo y decisión de reposición confirmados por la persona operadora.
- en un parcial, cantidades enteras positivas que sigan pendientes; los
  importes se calculan exclusivamente con snapshots del servidor.

La demo pública mantiene `sideEffects=false` y además responde 403 cuando
`DEMO_MODE=true`. Nunca llama al proveedor ni escribe una intención.

## Secuencia y garantías

1. El servidor relee pedido, pago, líneas, fulfillments y cancelaciones y
   calcula el importe; el navegador envía cantidades, nunca dinero.
2. Inserta `refunds` y `refund_items` antes de la llamada externa. El total usa
   `r2:refund:order:{order_id}:total`; cada parcial conserva una clave UUID del
   navegador prefijada por pedido.
3. El adaptador pasa esa clave al PSP. Un retry consulta o repite la misma
   operación idempotente.
4. Se contrastan proveedor, referencia del pago, moneda e importe. Una
   divergencia queda en `requires_review`, nunca como éxito.
5. Los triggers de `0013` reservan línea y cantidad contra intenciones no
   canceladas y fulfillments activos, de modo que una carrera se resuelve antes
   del PSP.
6. El éxito escribe una sola transacción financiera y, bajo la misma guarda de
   evento, actualiza pago/reembolso/pedido, evento, auditoría, timeline,
   notificación y stock opcional.

Un fallo entre la llamada y el cierre se recupera ejecutando de nuevo la misma acción:
la intención y la clave ya existen, por lo que el PSP no recibe una segunda
devolución. Dos solicitudes concurrentes comparten esa clave y solo una puede
cerrar los efectos D1.

## Estados visibles

| Estado | Significado | Acción |
|---|---|---|
| `pending` | intención durable, llamada pendiente o interrumpida | reintentar con la misma acción |
| `processing` | PSP aceptó pero aún no confirmó | esperar y reintentar para consultar |
| `succeeded` | PSP y ledger confirmados | ninguna; el replay devuelve éxito |
| `failed` | PSP indicó fallo terminal | revisar proveedor y decidir siguiente paso |
| `requires_review` | respuesta o identidad no coincide con el ledger | no mutar pedido; reconciliar manualmente |

En cancelación por cantidades, `pending`, `processing`, `failed`, `succeeded` y
`requires_review` reservan sus unidades; solo `cancelled` las libera. Así un
fallo incierto nunca permite enviar o reembolsar dos veces la misma unidad. La
persona operadora reintenta la misma clave o reconcilia, sin borrar evidencia.

## Reconciliación segura

1. Localizar pedido, `payments`, `refunds` y `payment_transactions` por
   `order_id`; no copiar respuestas crudas del PSP a logs o tickets.
2. Comprobar que el importe reembolsado acumulado no supera la captura y que la
   moneda coincide.
3. Consultar la referencia externa desde el panel del proveedor.
4. Si la operación existe y coincide, reintentar la acción: el adaptador usa la
   referencia y clave existentes para cerrar D1.
5. Si no coincide, mantener `requires_review` y escalar; no editar asientos ni
   borrar filas. Una corrección futura debe ser otro movimiento auditable.

R2.10 no incorpora reconciliación automática por webhook. El estado intermedio
es durable y el procedimiento manual es el fallback explícito hasta una ola
posterior.

## Política de envío por propietario

`shop.config.ts#refunds.partialShippingPolicy` admite dos valores:

- `merchandise-only` (predeterminado): todo parcial devuelve solo mercancía;
- `full-on-final-cancellation`: añade el envío completo solo al cancelar la
  última mercancía pendiente y si nunca salió un fulfillment.

El panel explica la política configurada y el email confirma si el abono incluyó
envío. Cambiarla es una decisión de configuración y despliegue del propietario,
no una casilla por operación. El reembolso total anterior sigue incluyendo el
envío completo.

## Corte de esquema R2.13

La migración aditiva `0013_partial_refund_guards.sql` fue autorizada, ensayada y
aplicada local y remotamente el 2026-08-12. Antes de repetir el rehearsal contra
un export `0012`, congelar
mutaciones y usar:

```bash
pnpm db:rehearse:partial-refunds -- \
  --baseline /ruta/aislada/baseline.sql \
  --output-dir /ruta/aislada
```

El ensayo no imprime filas ni PII: valida preflight, pertenencia, cantidades
reservadas por refunds/fulfillments, liberación exclusiva de `cancelled`, hash
R2.12 y dump/restore. No autoriza por sí solo el runtime ni el rollout remoto;
ambos requieren el runtime R2.13 compatible.

## Verificación

```bash
pnpm check
pnpm db:reset
pnpm exec wrangler dev --port 8787
BASE_URL=http://127.0.0.1:8787 pnpm test:e2e
BASE_URL=http://127.0.0.1:8787 node scripts/a11y-audit.mjs --only=admin:pedido-pagado
```

Las pruebas de runtime cubren ambas políticas, éxito, replay, timeout seguido de
recuperación, estado `processing`, reposición sí/no, acumulación y carreras
refund/refund y refund/fulfillment. El E2E confirma que la demo pública rechaza
la mutación.

## Corte productivo del 2026-08-12

El export remoto fresco de 510.914 bytes conservó hashes, 4 fulfillments, cero
refunds históricos y dump/restore. D1 quedó en `0013`, con la guarda presente y
cero violaciones FK. El Worker `52779fca-8202-4f4d-92d4-c1f64304cb71` sirve el
runtime compatible; E2E remoto pasó 44/44 y el pedido pagado pasó a11y 2/2 a
1440/375 sin errores ni avisos.

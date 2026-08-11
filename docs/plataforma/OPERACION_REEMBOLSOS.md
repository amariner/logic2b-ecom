# Operación de reembolsos totales R2.10

Este runbook cubre la devolución total iniciada desde el detalle administrativo.
No autoriza reembolsos parciales, cambios de precio, créditos de tienda ni una
decisión comercial sobre cuándo devolver stock.

## Precondiciones

- pedido en `paid`;
- pago principal `captured`, con moneda e importe iguales al pedido;
- proveedor soportado (`stripe` con secreto configurado o `simulated`);
- capacidad `ORD-007` con `routes` y `sideEffects` activas;
- motivo y decisión de reposición confirmados por la persona operadora.

La demo pública mantiene `sideEffects=false` y además responde 403 cuando
`DEMO_MODE=true`. Nunca llama al proveedor ni escribe una intención.

## Secuencia y garantías

1. El servidor relee pedido, pago y líneas y calcula el total; el navegador no
   envía dinero ni cantidades.
2. Inserta `refunds` y `refund_items` con
   `r2:refund:order:{order_id}:total` antes de la llamada externa.
3. El adaptador pasa esa clave al PSP. Un retry consulta o repite la misma
   operación idempotente.
4. Se contrastan proveedor, referencia del pago, moneda e importe. Una
   divergencia queda en `requires_review`, nunca como éxito.
5. El éxito escribe una sola transacción financiera y, bajo la misma guarda de
   evento, actualiza pago/reembolso/pedido, evento, auditoría, timeline,
   notificación y stock opcional.

Un fallo entre los pasos 3 y 5 se recupera ejecutando de nuevo la misma acción:
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

`pending`, `processing`, `succeeded` y `requires_review` bloquean envío o
cancelación administrativa. `failed` deja disponible la resolución manual. El
bloqueo cubre tanto la mutación como el evento, evitando timeline o auditoría
fantasma.

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

## Verificación

```bash
pnpm check
pnpm db:reset
pnpm exec wrangler dev --port 8787
BASE_URL=http://127.0.0.1:8787 pnpm test:e2e
BASE_URL=http://127.0.0.1:8787 node scripts/a11y-audit.mjs --only=admin:pedido-pagado
```

Las pruebas de runtime cubren éxito, replay, timeout seguido de recuperación,
estado `processing`, reposición sí/no y dos solicitudes concurrentes. El E2E
confirma que la demo pública rechaza la mutación.

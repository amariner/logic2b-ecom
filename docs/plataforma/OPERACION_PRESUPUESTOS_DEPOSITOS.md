# Operación de presupuestos y depósitos (`ORD-008`, `CHK-011`)

## Estado del contrato

R4.11 está implementado localmente con migración `0035` y backup esquema 29.
Las capacidades quedan `installed`, no activas. El único adaptador es
`simulated-hosted-payment`: no usa red, credenciales ni dinero y no acepta
webhooks públicos. Producción continúa en `0032`; `0033`–`0035` requieren un
rollout remoto autorizado y ordenado.

## Preflight y rollout

1. Confirmar backup y Time Travel del D1 objetivo.
2. Aplicar y validar primero `0033` y `0034`.
3. Exportar una baseline en `0034` y ejecutar:

   ```bash
   pnpm db:rehearse:preliminary-orders -- \
     --baseline /ruta/baseline-0034.sql --output-dir /tmp/logic2b-r411
   ```

4. Verificar hash idéntico, dump restaurable, FKs limpias y cinco tablas nuevas
   vacías.
5. Aplicar `0035_preliminary_orders_deposits.sql` antes del Worker compatible.
6. Mantener ambas capacidades instaladas hasta que el proyecto decida importes,
   vigencia, puerta de conversión y proveedor. Un adaptador real debe autenticar
   cada hecho y pasar las pruebas contractuales antes de abrir un webhook.
7. Activar `routes` y `sideEffects` mediante el manifest del cliente. La demo
   pública no se activa.

No ejecutar rollout remoto, contratar proveedor ni instalar SDKs sin una
autorización separada.

## Reconciliación

```sql
-- Versiones proyectadas e historial deben coincidir.
SELECT quote.id, quote.version, max(event.version_after) AS event_version
FROM preliminary_orders quote
JOIN preliminary_order_events event ON event.preliminary_order_id = quote.id
GROUP BY quote.id
HAVING quote.version <> max(event.version_after);

-- Pagos duplicados por proveedor: debe devolver cero filas.
SELECT provider_adapter, provider_event_reference, count(*) AS duplicates
FROM preliminary_order_payments
GROUP BY provider_adapter, provider_event_reference
HAVING count(*) > 1;

-- Convertidos cuyo vínculo/pedido no coincide.
SELECT quote.id, quote.reference, quote.converted_order_id
FROM preliminary_orders quote
LEFT JOIN orders purchase ON purchase.id = quote.converted_order_id
WHERE quote.status = 'converted' AND purchase.id IS NULL;

-- Pagados convertidos pendientes de converger a pedido pagado.
SELECT quote.id, purchase.order_number, purchase.status,
       payment.status AS ledger_status, reservation.status AS reservation_status
FROM preliminary_orders quote
JOIN orders purchase ON purchase.id = quote.converted_order_id
LEFT JOIN payments payment ON payment.order_id = purchase.id
LEFT JOIN inventory_reservations reservation
  ON reservation.owner_type = 'order' AND reservation.owner_id = purchase.order_number
WHERE quote.payment_status = 'paid' AND purchase.status <> 'paid';

PRAGMA foreign_key_check;
PRAGMA integrity_check;
```

Si la última consulta devuelve filas, reintentar la confirmación verificada o
la conversión con su misma identidad hace converger el pedido y la reserva. No
editar estados, versiones, saldos ni stock a mano.

## Incidencias

- Replay: responder como idempotente; no crear otro pago, pedido o reserva.
- Versión en conflicto: releer el presupuesto y generar un enlace para la etapa
  vigente; no reutilizar un enlace de otra versión.
- Enlace vencido: no confirmar ni alterar fechas; crear uno nuevo con una
  caducidad aprobada por el proyecto.
- Falta de stock al convertir: el batch aborta completo. No hay pedido ni
  reserva parcial; conciliar el depósito y decidir reembolso o resolución.
- Pago confirmado con pedido aún pendiente: usar la consulta anterior y
  reintentar el mismo hecho para completar la transición idempotente.
- Referencia o firma inválida en un adaptador real: rechazar antes de persistir;
  nunca guardar payload, PAN, CVC o URL alojada.

## Rollback

1. Desactivar `sideEffects` y `routes` de `CHK-011` y `ORD-008`.
2. Pausar la creación de sesiones en el proveedor.
3. Mantener un Worker compatible mientras haya confirmaciones pendientes.
4. No borrar tablas ni vínculos: son evidencia de dinero y conversión.
5. Restaurar solo desde backup esquema 29 sobre una base con `0035` aplicada.

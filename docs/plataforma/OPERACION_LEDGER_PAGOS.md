# Operación del ledger de pagos R2.9

Este runbook coordina `0011_payment_ledger.sql`, el backfill por moneda y el
binario R2.9. La migración es aditiva: conserva `orders.status` y
`orders.stripe_*` como espejos de rollback durante R2.14 y hasta una contracción autorizada. No almacena PAN, CVC,
token de tarjeta ni respuestas crudas del proveedor.

## Invariantes del corte

- cada pedido tiene exactamente una intención de pago principal;
- `orders.currency`, `payments.currency` y la moneda de cada asiento coinciden;
- el importe esperado es `orders.total_cents`, decidido en servidor;
- `captured` y `requires_review` tienen una única captura por el total;
- `pending` y `cancelled` no tienen movimiento financiero;
- un pedido cancelado que antes estuvo pagado bloquea el corte como
  `requires_review`; nunca se fabrica un reembolso;
- el replay del backfill no cambia recuentos ni hashes;
- `PRAGMA foreign_key_check` queda vacío e `integrity_check = ok`.

## Ensayo obligatorio

1. Exportar una copia fresca, nunca trabajar sobre la D1 real:

   ```bash
   pnpm exec wrangler d1 export ecom-demo --remote --output /ruta/segura/baseline.sql -y
   ```

2. Ensayar esquema, backfill, replay y restore con la moneda de
   `shop.config.ts` normalizada a mayúsculas:

   ```bash
   pnpm db:rehearse:payments --baseline /ruta/segura/baseline.sql \
     --output-dir /ruta/segura/rehearsal --currency EUR
   ```

El script admite un export en `0008` y aplica `0009`/`0010` únicamente dentro
de la copia. Si detecta un pedido pagado y luego cancelado, se detiene. La
opción `--allow-requires-review` solo sirve para diagnosticar una copia; no
autoriza el corte real.

## Corte coordinado

En un cliente con checkout activo se abre una ventana breve sin nuevas compras.
La demo pública ya rechaza checkout y no necesita esa pausa.

1. Conservar el export fresco hasta terminar la observación.
2. Aplicar las migraciones pendientes con Wrangler.
3. Generar el SQL exacto de backfill en un fichero nuevo:

   ```bash
   node scripts/generate-r2-payment-backfill.mjs \
     --currency EUR --output /ruta/segura/r2-payment-backfill.sql
   ```

4. Ejecutarlo una sola vez; es idempotente para permitir recuperación:

   ```bash
   pnpm exec wrangler d1 execute ecom-demo --remote \
     --file /ruta/segura/r2-payment-backfill.sql -y
   ```

5. Verificar recuentos, monedas, saldos, FKs y ausencia de `requires_review`.
6. Desplegar el binario R2.9 y ejecutar E2E/smoke.
7. Reabrir checkout solo cuando pedido, pago, captura, stock, evento y email
   hayan pasado la prueba de extremo a extremo.

### Evidencia del corte de la demo — 2026-08-11

- baseline remoto conservado: 409.232 bytes;
- D1 `0001`–`0011`; 8 pedidos, 8 pagos, 6 capturas y 0 reembolsos;
- cero `requires_review`, monedas divergentes, descuadres de captura o FKs;
- Worker `08d0e8e3-dbfc-40b2-a277-6028b49e577b`; E2E remoto 38/38.

Wrangler 4.111 devolvió `incomplete input` al enviar por `/query` los triggers
con `CASE ... END` anidado. El corte usó la importación atómica por fichero,
verificó tablas/triggers antes de registrar cada migración y no dejó estado
parcial. El DDL canónico evita ya el `END` anidado mediante el equivalente
`SELECT RAISE ... WHERE`, validado contra el parser remoto. D1 permite
`PRAGMA foreign_key_check` —vacío en el corte—, pero rechaza
`PRAGMA integrity_check` por `SQLITE_AUTH`; la comprobación de integridad se
ejecutó sobre la copia aislada del rehearsal.

## Rollback y recuperación

- Antes del deploy, el binario anterior ignora las tablas nuevas. La columna
  `orders.currency` acepta temporalmente vacío para no romper escrituras legacy.
- Después del deploy, volver al binario anterior sigue siendo posible porque
  R2.9 mantiene `orders.status`, `stripe_session_id` y
  `stripe_payment_intent`. Si ese binario crea pedidos, se repite el rehearsal y
  el backfill antes de reactivar R2.9.
- No se borran tablas ni asientos para corregir. Una incoherencia detiene
  checkout, conserva la copia y se reconcilia con un asiento explícito en el
  bloque autorizado correspondiente.
- El backup administrativo de esquema 5 incluye pagos, transacciones,
  reembolsos y asignaciones. `audit_log` continúa fuera del export HTTP.

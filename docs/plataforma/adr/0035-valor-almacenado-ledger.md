# ADR-0035 — Valor almacenado con ledger append-only

- Estado: aceptado
- Fecha: 2026-08-17
- Bloque: R4.8
- Capacidades: `PRC-010`, `PRC-011`

## Contexto

Tarjetas regalo y crédito en tienda son dinero con restricciones propias. Un
campo mutable de saldo no explica emisión, reserva, consumo, reverso ni
reembolso y permite convertir por error valor promocional en efectivo. El
navegador tampoco puede aportar un saldo, una identidad o un importe
autoritativos.

## Decisión

1. Cada cuenta tiene moneda, estado, política legal explícita, saldo y reservado
   proyectados; cada cambio nace de un asiento inmutable y versionado.
2. El código de tarjeta se entrega una sola vez y D1 conserva únicamente un
   SHA-256 normalizado. El crédito de tienda usa una identidad ya hasheada por
   servidor; R4.8 no introduce perfiles de cliente.
3. Checkout autoriza y reserva contra versión/saldo actuales. El pago captura
   la reserva en la misma batch que el pedido; expiración o cancelación pendiente
   la libera.
4. `payments.expected_amount_cents` representa solo el cobro externo y
   `stored_value_expected_cents` la parte interna. Su suma debe coincidir con el
   total comercial del pedido.
5. Un reembolso repone primero el valor almacenado aplicado y solo el resto
   vuelve al PSP. Así una tarjeta o crédito no se convierte en efectivo.
6. Caducidad, financiación, transferibilidad y cash-out se documentan por
   proyecto y exigen referencia de revisión legal; no hay política universal.

## Consecuencias

- Migración expand-only `0032_stored_value.sql`, backup esquema 26 y cinco
  tablas nuevas.
- Emisión/listado/estado quedan tras auth admin, capability y bloqueo de demo.
- Pago mixto, replay, concurrencia, expiración y reembolso necesitan gates
  transaccionales; no se añade dependencia, coste ni superficie PCI.

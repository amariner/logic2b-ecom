# Tarjetas regalo y crédito en tienda con saldo trazable

> Ficha interna. No crea una ruta pública ni promete una política legal común a
> todos los comercios.

Logic2B Ecommerce puede habilitar valor almacenado como módulo por despliegue.
Cada emisión, reserva, uso, liberación y reembolso queda en un ledger inmutable;
el saldo visible es una proyección verificable, no el único dato contable.

## Qué está implementado

- tarjetas regalo con código hasheado y mostrado una sola vez;
- crédito ligado a una identidad opaca generada en servidor;
- uso parcial o total y pago mixto con Stripe Checkout;
- reserva concurrente, captura al pagar y liberación al expirar/cancelar;
- reembolso primero al valor almacenado original y después al PSP;
- emisión y cambios de estado auditados, API admin protegida y backup/restore.

## Límites honestos

- No hay venta pública de tarjetas, editor visual ni portal de saldo.
- R4.8 no crea cuentas de cliente: el crédito espera la identidad de R5.
- Caducidad, dinero promocional, transferibilidad, cash-out e impuestos requieren
  revisión legal/comercial por proyecto.
- La demo pública es de solo lectura y no conecta dinero real.

# Presupuestos y depósitos explícitos

`ORD-008` y `CHK-011` separan presupuesto, cobro y pedido para no reservar
stock ni iniciar fulfillment antes de una decisión explícita.

## Recorrido

```text
draft -> issued -> approved -> converted
                      |            |
                      + pago       + reserva de stock
                        depósito     al convertir
                        y saldo
```

Cada presupuesto congela líneas, céntimos, moneda, depósito, vigencia y una
puerta de conversión: aprobación, depósito o pago completo. Emitir, aprobar,
cobrar y convertir son transiciones versionadas diferentes. Caducar o cancelar
un caso no cobrado no crea un pedido.

El enlace alojado toma del servidor la siguiente etapa exacta (`deposit`,
`balance` o `full`). D1 conserva referencia opaca, estado e idempotencia, nunca
la URL ni un payload remoto. Solo un hecho autenticado por el adaptador puede
crear un asiento de presupuesto.

## Conversión e inventario

Convertir materializa un pedido `pending`, sus líneas, intención de pago,
timeline, outbox y reserva en un batch. Los cobros previos se copian al ledger
del pedido sin duplicarlos. Cuando el total está pagado, la transición de pedido
consume la reserva y descuenta stock una sola vez.

La disponibilidad se comprueba en el momento de convertir. Si ya no existe,
todo el batch aborta y el presupuesto conserva su dinero para conciliación; no
se genera un pedido incompleto ni stock negativo.

## Estado de producto

- capacidades instaladas pero apagadas en presets;
- API administrativa protegida y auditada;
- demo pública de solo lectura;
- adaptador simulado solo para pruebas locales;
- sin porcentaje, plazos, copy contractual o proveedor predeterminados;
- sin perfil R5, crédito B2B, impuestos nuevos ni documento fiscal.

Decisión: [`../adr/0038-presupuestos-depositos-transiciones-explicitas.md`](../adr/0038-presupuestos-depositos-transiciones-explicitas.md).
Operación: [`../OPERACION_PRESUPUESTOS_DEPOSITOS.md`](../OPERACION_PRESUPUESTOS_DEPOSITOS.md).

# ADR-0025 — Asignación vinculante, determinista y explicable

- Estado: **aceptado para implementación**
- Fecha: 2026-08-14
- Bloque: R3.9
- Decisión de esquema: cubierta por la autorización general de migraciones del 2026-08-14

## Contexto

R3.6 materializa ubicaciones, R3.7 permite abastecerlas y R3.8 corrige su
físico. El pago continúa descontando el ledger global, reflejado en principal,
antes de conocer la expedición. Consumir otra ubicación al enviar sin compensar
principal descontaría dos veces; repartir una misma expedición entre almacenes
también rompería su unidad física y su tracking.

## Decisión

Cada fulfillment elige exactamente una ubicación capaz de cubrir todas sus
líneas. Mercado y canal filtran candidatos; después se exige disponibilidad
íntegra y se ordena por prioridad ascendente, coste de manipulación ascendente
e ID de ubicación ascendente. Se persisten candidato seleccionado, versión de
política, demanda y motivo de cada descarte.

Principal considera disponible el compromiso ya descontado al pagar. Si gana,
no se crea otro movimiento. Si gana una secundaria, la misma batch libera en
principal/global exactamente la demanda y la consume en secundaria. El total
físico de la red no cambia. Cada envío parcial puede decidir de nuevo, pero una
decisión ya persistida es inmutable e idempotente.

## Invariantes

1. una sola ubicación cubre íntegramente cada fulfillment;
2. filtros y desempates no dependen del orden de lectura;
3. la explicación conserva reglas y versión usadas, sin datos personales;
4. principal no vuelve a consumir una venta ya contabilizada;
5. reasignar conserva la suma de stock físico de la red;
6. decisión, fulfillment y movimientos se confirman o revierten juntos;
7. una carrera de saldo o versión no deja evidencia parcial;
8. una política se edita con versión optimista y auditoría en la misma batch.

## Rollback

`0022` es expand-only. Desactivar `INV-011` retira navegación, rutas y efectos;
el fulfillment anterior vuelve a operar sobre el compromiso global. Las
decisiones y movimientos confirmados no se borran. Una asignación secundaria
errónea se corrige con movimientos compensatorios, nunca reescribiendo ledger.

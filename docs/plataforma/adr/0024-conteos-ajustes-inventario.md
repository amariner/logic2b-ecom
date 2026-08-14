# ADR-0024 — Conteos versionados y ajustes append-only

- Estado: **aceptado para implementación**
- Fecha: 2026-08-14
- Bloque: R3.8
- Decisión de esquema: cubierta por la autorización general de migraciones del 2026-08-14

## Contexto

R3.6 separa balances por ubicación y R3.7 mueve unidades con trazabilidad. Una
cifra editable en el panel rompería el ledger, las reservas y la compatibilidad
de la ubicación principal. Un conteo también puede quedar obsoleto si venta,
reserva o transferencia cambia el stock antes de aplicarlo.

## Decisión

Cada sesión congela ubicación, variante, cantidad física y
`expected_movement_version`. La cantidad contada produce un delta, pero el
balance no cambia hasta aplicar la sesión. La aplicación revalida cantidad y
versión y materializa una corrección `reconciliation_correction` o `damage` en
el ledger append-only. Un delta cero conserva evidencia sin inventar movimiento.

El control directo pasa de `draft` a `applied`. Si se activa doble control, el
conteo pasa primero a `pending_approval` y solo un `reviewed_by` distinto de
`counted_by` puede aplicarlo. Las tres mutaciones tienen clave idempotente y
versión optimista.

Hasta R3.9, la ubicación principal continúa pasando por el ledger global y sus
triggers; una secundaria cambia solo su ledger por ubicación y no se vuelve
vendible. No se adelantan buckets de stock R3.6 ni asignación de pedidos R3.9.

## Invariantes

1. ubicación y variantes activas, una variante por sesión;
2. cantidad contada entera y no negativa;
3. daño nunca aumenta stock ni una corrección deja físico bajo reservado;
4. cantidad o versión distinta a la foto invalida toda la aplicación;
5. contador y revisor son distintos cuando hay doble control;
6. auditoría, balance, movimiento y enlace se escriben en una única batch;
7. cada idempotency key materializa como máximo una transición;
8. principal, ledger global y `products.stock` permanecen alineados.

## Rollback

`0021` es expand-only. Desactivar `INV-008` retira navegación, rutas y efectos;
el Worker anterior ignora las tablas. Los ajustes ya aplicados no se borran ni
se reescriben: se compensan con un conteo nuevo. Retirar tablas exige una
migración destructiva y autorización separada.

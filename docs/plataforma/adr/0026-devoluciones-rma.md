# ADR-0026 — RMA separado de cancelación, con cierre transaccional

- Estado: **aceptado para implementación**
- Fecha: 2026-08-14
- Bloque: R3.10
- Decisión de esquema: cubierta por la autorización general de migraciones del 2026-08-14

## Contexto

Una cancelación devuelve cantidades que aún no salieron; una devolución recibe
mercancía ya entregada. Reutilizar el flujo de cancelación permitiría abonar o
reponer antes de verificar la recepción y mezclaría saldos logísticos distintos.

## Decisión

El RMA tiene identidad, líneas y eventos propios. Solo puede reclamar unidades
entregadas, no reclamadas y dentro de 30 días. Avanza por solicitud,
autorización, tránsito, recepción, inspección y resolución. La recepción fija
cantidades físicas; la inspección decide `restock`, `damaged` o `reject` y una
resolución homogénea de reembolso o cambio para las líneas aceptadas.

El cierre es la única operación que repone. Un reembolso usa el ledger y las
asignaciones de captura existentes con `operation_type=return`; un cambio crea
un compromiso pendiente explícito. Evento, auditoría, dinero, movimientos,
enlaces y estado RMA comparten la misma batch guardada por versión.

## Invariantes

1. ninguna cantidad supera lo entregado menos reclamaciones activas;
2. autorizar o recibir no cambia stock ni dinero;
3. toda línea recibida se inspecciona antes del cierre;
4. un expediente no mezcla reembolso y cambio;
5. solo `restock` vuelve a disponible y lo hace en la ubicación receptora;
6. el PSP y el ledger comparten idempotencia estable por RMA;
7. una carrera de versión revierte toda evidencia interna;
8. pedido y fulfillment entregados permanecen inmutables.

## Rollback

`0023` es expand-only. Desactivar `FUL-011` retira navegación, rutas y efectos.
No se borran expedientes ni movimientos. Un PSP incierto queda en
`processing`, `failed` o `requires_review` y se reconcilia repitiendo el mismo
cierre; cualquier corrección de inventario usa un movimiento compensatorio.

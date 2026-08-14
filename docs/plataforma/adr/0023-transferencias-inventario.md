# ADR-0023 — Transferencias trazables sin adelantar asignación

- Estado: **aceptado para implementación**
- Fecha: 2026-08-14
- Bloque: R3.7
- Decisión de esquema: cubierta por la autorización general de migraciones del 2026-08-14

## Contexto

R3.6 mantiene el ledger legacy y la ubicación principal exactamente alineados.
Las ubicaciones secundarias están vacías y todavía no existe el motor de
asignación R3.9. Una transferencia no puede convertir stock secundario en
vendible ni permitir que un Worker anterior prometa unidades que solo existen
fuera de la principal.

## Decisión

La transferencia es un agregado versionado con líneas inmutables desde el
envío, recibos parciales y discrepancias explícitas. El borrador no mueve stock.
Enviar descuenta cada cantidad del origen y la deja en tránsito; recibir añade
solo la cantidad confirmada al destino. La diferencia declarada cierra unidades
sin inventar una entrada compensatoria.

Mientras R3.9 no asigne pedidos por ubicación, `inventory_balances` continúa
representando únicamente la ubicación principal:

- si origen o destino es la principal, el movimiento pasa por el ledger global
  y sus triggers R3.6 mantienen el espejo y `products.stock`;
- en una secundaria, el movimiento se escribe directamente en el ledger por
  ubicación;
- el stock en tránsito y en ubicaciones secundarias no entra en checkout;
- `inventory_transfer_movements` enlaza cada salida/entrada con el movimiento
  append-only exacto que cambió el balance.

Se reutiliza `manual_adjustment` como razón cerrada del ledger R2, pero
`reference_type=inventory_transfer` y el enlace tipado conservan la semántica
sin reconstruir una tabla existente. R3.8 no se adelanta: no hay conteos ni
edición directa de cifras.

## Invariantes

1. origen y destino activos, distintos y versionados;
2. una variante aparece una sola vez por transferencia;
3. el borrador no cambia balances y, tras enviarse, sus cantidades no cambian;
4. recibido + discrepancia nunca supera enviado;
5. cada idempotency key materializa como máximo una creación, envío o recibo;
6. balance y movimiento auditado se escriben en una única batch;
7. principal y ledger global permanecen idénticos durante toda R3.7;
8. una secundaria no participa en venta/reserva antes de R3.9.

## Rollback

La migración es expand-only. Desactivar `INV-007` elimina navegación, rutas y
efectos. El Worker anterior ignora las tablas nuevas; como no puede crear
transferencias, sigue operando sobre la principal. No se eliminan movimientos,
recibos ni tablas sin una migración destructiva independiente.

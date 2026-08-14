# ADR-0022 — Ubicaciones de inventario y transición desde el ledger global

- Estado: **aceptado e implementado localmente**
- Fecha: 2026-08-14
- Bloque: R3.6
- Decisión de esquema: cubierta por la autorización general de migraciones del 2026-08-14

## Contexto y alcance

R2 conserva un ledger global por variante. R3.6 debe representar almacenes y
tiendas sin inventar un reparto histórico, romper reservas activas ni volver
incompatible un Worker anterior. Transferencias, conteos y asignación pertenecen
a R3.7–R3.9 y no se adelantan.

## Decisión

`inventory_locations` guarda código canónico, nombre operativo, tipo, estado,
zona horaria y versión optimista. Existe exactamente una principal activa.
`inventory_location_balances` y `inventory_location_movements` proyectan el
ledger global en esa principal. El backfill copia balances, reserva, versiones y
todo movimiento existente; las secundarias nacen vacías.

Durante la transición, triggers expand-only reflejan cualquier insert/update del
ledger global, incluidas reservas, en la principal. Así un Worker anterior sigue
escribiendo correctamente. R3.7 sustituirá esta proyección 1:1 por movimientos
de transferencia explícitos antes de admitir stock en secundarias.

El admin puede crear ubicaciones vacías y modificar metadatos con auditoría y
versión esperada. No puede desactivar la principal ni cambiarla. La demo solo
lee fixtures; `INV-005` gobierna ruta, navegación y efectos.

## Invariantes

1. un único `is_primary=1`, siempre activo;
2. código minúsculo estable y único, sin PII;
3. principal y global coinciden en físico, reservado y versiones;
4. cada movimiento global tiene una única proyección por `source_movement_id`;
5. ubicaciones secundarias no reciben stock hasta R3.7;
6. no se borra ubicación con balances y no hay contracción en `0019`.

## Rollback

El Worker anterior ignora las tablas nuevas y continúa escribiendo el ledger
global; los triggers mantienen la proyección. Desactivar `INV-005` retira UI/API.
No se eliminan triggers/tablas/filas sin otra migración y autorización destructiva.

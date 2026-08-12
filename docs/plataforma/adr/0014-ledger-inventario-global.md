# ADR-0014 — Ledger de inventario global por variante

- Estado: **accepted; implementado en R2.7–R2.8 (sin despliegue remoto)**
- Fecha: 2026-08-10
- Mandato: R2.6

## Contexto

El stock vivo continúa en `products.stock`. El cobro lo reduce con
`MAX(stock - qty, 0)`, la cancelación lo incrementa y el panel sustituye la
cifra absoluta. Las tres rutas están protegidas por evento/auditoría, pero no
conservan qué movimiento explica el saldo, el `MAX` oculta una sobreventa y las
variantes no tienen disponibilidad propia.

R2.2–R2.5 ya separan producto editorial y variante vendible. R2.6 debe fijar el
modelo de inventario antes de escribir una migración: unidad, razones,
idempotencia, concurrencia, backfill, reconciliación, reservas futuras y espejo
legacy. R2 sigue teniendo una única ubicación global; almacenes pertenecen a
R3.6 y no se anticipan con una columna vacía.

## Decisión

El inventario canónico se compone de:

1. `inventory_movements`, ledger append-only por variante;
2. `inventory_balances`, proyección versionada con `on_hand` y `reserved`;
3. `inventory_reservations`, líneas y eventos de balance reservado, contrato
   R2.8 instalado pero apagado por defecto mediante `INV-004`.

La disponibilidad siempre se calcula como `on_hand - reserved`. No se almacena
una tercera cifra que pueda divergir. `products.stock` permanece como espejo de
la variante por defecto durante R2.14 y hasta una contracción autorizada; se asigna desde `balance.on_hand`, nunca se
incrementa/decrementa de forma independiente.

Los DDL ensayables están fuera de `migrations/`:

- [`../sql/0009_inventory_ledger.proposed.sql`](../sql/0009_inventory_ledger.proposed.sql), candidato de R2.7;
- [`../sql/0010_inventory_reservations.proposed.sql`](../sql/0010_inventory_reservations.proposed.sql), propuesta histórica materializada y reforzada en `migrations/0010_inventory_reservations.sql`.

La migración R2.8 tampoco activa la capacidad: presets y demo la dejan instalada
sin jobs ni efectos hasta un opt-in explícito.

## Invariantes

### Balance y movimiento

- la unidad es `product_variants.id`; producto y SKU no son claves contables;
- `on_hand`, `reserved`, cantidades y deltas son enteros seguros;
- `on_hand >= reserved >= 0` y `version` crece exactamente uno por movimiento;
- cada movimiento congela `balance_after` y `version_after` y la pareja
  variante–versión es única;
- `sum(delta) = on_hand` para cada variante desde su apertura;
- un movimiento no se edita ni borra por aplicación: una corrección crea otro
  movimiento con razón, actor, referencia y correlación;
- `idempotency_key` es única globalmente: replay de webhook, cancelación o
  ajuste no mueve dos veces;
- toda razón tiene dirección válida: venta/daño salen; cancelación/devolución
  entran; ajuste/corrección admite ambos signos; solo la apertura admite cero;
- no se guarda PII, payload de proveedor, nombre de producto ni email.

Las razones iniciales son `legacy_opening_balance`, `sale`,
`cancellation_restock`, `return_restock`, `manual_adjustment`,
`reconciliation_correction` y `damage`. Añadir una razón exige ampliar contrato,
tests y SQL; no se aceptan strings libres que impidan explicar el saldo.

### Reservas

- estados: `active → released|consumed|expired`; los terminales no reabren;
- una pareja reserva–variante es única y su cantidad es positiva;
- crear una reserva incrementa `reserved` solo si continúa habiendo disponible;
- liberar o expirar reduce `reserved`; consumir reduce `reserved` y crea el
  movimiento `sale` sobre `on_hand` en la misma unidad de trabajo;
- cada transición usa estado+versión esperados e idempotencia; los balances usan
  `reservation_version` separada para no abrir huecos en versiones del ledger;
- el job de expiración usa el contrato duradero R1.11 cada minuto y lotes de 100;
- sin capacidad activa no hay creación, job, navegación ni trabajo por visita,
  y todos los balances conservan `reserved = 0`.

## Unidad de trabajo y concurrencia D1

R2.7 compondrá cada escritura en una única `DB.batch()`:

1. leer balance/version y validar razón/referencia en dominio;
2. actualizar balance con guarda `version = expected`, disponibilidad no
   negativa y ausencia de la clave idempotente;
3. insertar el movimiento desde el balance resultante con
   `version_after = expected + 1`;
4. escribir audit log y evento/outbox cuando el caso de uso lo requiera;
5. asignar `products.stock` desde el balance solo para la variante por defecto.

`APPLY_INVENTORY_DELTA_SQL` materializa la primera guarda. D1 serializa la
batch; una carrera por la última unidad deja un ganador. Cero filas actualizadas
significa `conflict`, `insufficient_stock` o `already_applied` tras una lectura
clasificadora; nunca se reintenta a ciegas con una versión nueva.

La inserción del movimiento no usa un delta independiente del que actualizó el
balance. Si cualquier sentencia falla, la batch completa revierte. El espejo
legacy es una asignación idempotente al saldo canónico, por lo que un replay no
puede duplicarlo.

## Backfill R2.7

Sobre export fresco y restaurado en aislamiento:

1. exigir exactamente una variante por defecto activa para todo producto
   vendible y stock legacy entero no negativo;
2. crear un balance para **cada variante** con `on_hand = products.stock`,
   `reserved = 0`, `version = 1`, según la decisión ya aceptada en ADR-0012;
3. crear un movimiento por variante con razón `legacy_opening_balance`, delta y
   `balance_after` iguales al stock legacy, incluido cero, clave estable
   `r2:inventory:opening:{variant_id}` y referencia a la migración;
4. comprobar por variante suma, `balance_after`, versión y stock del producto;
   no sumar variantes entre sí porque el modelo legacy no distinguía pools;
5. comprobar cero claves duplicadas, balances sin apertura, aperturas sin
   balance, FKs e `integrity_check`;
6. ensayar dump/restore y comparar hashes antes de autorizar escritura dual.

Tras el corte, un ajuste del panel deja de fijar `products.stock`: calcula un
delta desde el balance/version leídos y registra `manual_adjustment`. La venta
deja de usar `MAX`; disponibilidad insuficiente aborta todo el cobro y requiere
reconciliación del pedido, no un saldo truncado.

## Reconciliación y observabilidad

La reconciliación obligatoria compara:

```sql
SELECT b.variant_id, b.on_hand, COALESCE(SUM(m.delta), 0) AS ledger_total
FROM inventory_balances b
LEFT JOIN inventory_movements m ON m.variant_id = b.variant_id
GROUP BY b.variant_id
HAVING b.on_hand <> ledger_total;
```

También verifica versión máxima, último `balance_after`, `reserved` frente a
reservas activas (desde R2.8) y espejo de la variante default. El resultado
expone solo ids técnicos, recuentos y deltas; no SKU/nombre/email. Una diferencia
no se “arregla” con UPDATE: crea una investigación y, si procede, un movimiento
`reconciliation_correction` auditado.

## Rollout y rollback

R2.7 sigue expand/contract:

1. migración aditiva + backfill, sin lectores nuevos;
2. shadow-read por variante y reconciliación a cero;
3. doble escritura canónica+espejo en venta, cancelación y admin;
4. corte de lectura a balance con flag reversible;
5. una versión completa estable antes de retirar writers legacy tras R2.14.

Volver el binario es seguro mientras el espejo siga íntegro. Después de aceptar
escrituras solo canónicas, un rollback escritor exige congelar mutaciones,
reconciliar y reabrir explícitamente; no se alternan fuentes de verdad.

## Alternativas rechazadas

- **Solo una columna de stock en variante:** no explica movimientos ni replay.
- **Ledger sin balance:** recalcular todas las filas en cada quote no escala.
- **`available` persistido:** introduce una tercera proyección divergente.
- **`MAX(stock - qty, 0)`:** oculta sobreventa y confirma cobro sin unidades.
- **Razón libre:** vuelve imposible validar dirección y reconciliar por causa.
- **Stock por producto con variante opcional:** perpetúa dos unidades contables.
- **Ubicación `default`:** anticipa R3.6 sin operación de almacenes real.
- **Activar reservas en R2.7:** mezcla dos puertas de concurrencia y un job nuevo.

## Consecuencias

- R2.7 puede implementar el ledger sin reinterpretar contratos durante la
  migración.
- La escritura será más costosa que una sola actualización, pero permanece en
  una batch D1 pequeña y gana trazabilidad/idempotencia.
- El stock histórico global se replica inicialmente en cada variante porque no
  existe evidencia para repartirlo; la regla queda explícita y reversible.
- Reservas quedan instaladas por R2.8, con escritura y job totalmente inertes
  mientras `INV-004` no tenga `sideEffects` y `jobs`.
- Este ADR no aplica migraciones, no cambia runtime, no altera dinero/pago ni
  autorizó el corte local R2.7; el despliegue remoto sigue siendo una puerta
  operativa separada.

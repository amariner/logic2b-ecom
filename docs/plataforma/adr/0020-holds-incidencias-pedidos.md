# ADR-0020 — Holds e incidencias operativas de pedido

- Estado: aceptado e implementado
- Fecha: 2026-08-13
- Bloque: R3.4
- Decisión de esquema: autorizada por Andreu y servida el 2026-08-13

## Contexto

El estado comercial de un pedido (`paid`, `shipped`, `delivered`…) no explica
si operaciones puede prepararlo ahora. Una dirección dudosa, una inconsistencia
de inventario o una revisión de pago deben detener la preparación sin inventar
estados combinatorios como `paid_on_hold` ni borrar el motivo cuando se resuelve.

R3.4 necesita holds manuales y automáticos, responsable, SLA y resolución. La
misma incidencia puede coexistir con otra: resolver la dirección no debe liberar
un pedido que sigue bloqueado por inventario.

## Decisión de dominio

1. El hold es ortogonal a `orders.status`. Un pedido está operativamente
   bloqueado mientras exista al menos un hold activo.
2. Cada hold declara origen `manual` o `automatic`, motivo tipado, responsable,
   vencimiento UTC e idempotency key. Los productores automáticos no crean
   duplicados al reintentarse.
3. Puede haber varios holds activos por pedido. No existe un booleano mutable en
   `orders`: la condición se deriva de las incidencias activas.
4. La resolución exige versión optimista y un código tipado. Reasignar también
   incrementa versión; dos operadores no pueden pisarse en silencio.
5. El SLA se calcula con un instante recibido, nunca leyendo el reloj global en
   dominio. Al alcanzar `due_at`, la incidencia está vencida, pero no se libera.
6. El detalle libre vive como nota interna R3.2. Eventos, auditoría y logs solo
   llevan ids, códigos y cambios de versión; nunca cuerpo de nota ni PII.
7. Crear o avanzar un fulfillment debe comprobar cero holds activos dentro de
   la misma operación D1. El estado comercial, el pago y el stock no cambian al
   crear o resolver una incidencia.
8. Los contratos `order_hold_created`, `order_hold_assigned` y
   `order_hold_resolved` pertenecen a `orders`. Su idempotencia usa hold y
   versión; ningún payload transporta responsable o nota.

## Esquema materializado

La migración expand-only `0017_order_holds.sql` añade una proyección
`order_holds` y un histórico inmutable `order_hold_events`:

- `order_holds`: pedido, estado, origen, motivo, responsable actual, SLA,
  versión, idempotencia y timestamps de creación/resolución;
- `order_hold_events`: alta, reasignación y resolución con actor, snapshots no
  sensibles y orden estable para el timeline;
- índices para activos por pedido, vencidos activos e idempotencia del productor.

La migración crea cero holds al aplicarse. Un Worker anterior ignora las tablas
nuevas; no hay backfill, contracción, dependencia ni coste mensual. Se ensayó
sobre el backup remoto `0016`, se aplicó a D1 demo y se cargaron después las
fixtures por el canal de seed.

## Integración servida

1. El puerto de aplicación coordina alta, asignación y resolución con
   `audit_log`, evento/outbox y timeline en una batch.
2. El guard de preparación vive en la creación de fulfillment y la carrera
   hold-vs-envío deja solo un lado observable.
3. El índice expone filtro por hold y SLA; el detalle muestra responsable,
   vencimiento y resolución. La demo sigue inerte y responde `403` a las
   mutaciones.
4. Backup/restore usa el esquema 11 y conserva proyección e histórico.

## Criterio de terminado de R3.4

- alta manual y automática idempotente;
- varios holds simultáneos, responsable reasignable y SLA visible;
- resolución optimista con histórico y auditoría sin PII;
- preparación imposible con cualquier hold activo, incluida concurrencia;
- migración ensayada, backup/restore, reset, tests, E2E y a11y en verde;
- capacidad documentada como real solo después de quedar servida.

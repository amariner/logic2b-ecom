# ADR-0020 — Holds e incidencias operativas de pedido

- Estado: propuesto; dominio puro aceptado, DDL pendiente de autorización
- Fecha: 2026-08-13
- Bloque: R3.4
- Decisión de esquema: **no autorizada todavía**

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

## Esquema propuesto — no materializar sin autorización

La futura migración expand-only añadirá una proyección `order_holds` y un
histórico inmutable `order_hold_events`:

- `order_holds`: pedido, estado, origen, motivo, responsable actual, SLA,
  versión, idempotencia y timestamps de creación/resolución;
- `order_hold_events`: alta, reasignación y resolución con actor, snapshots no
  sensibles y orden estable para el timeline;
- índices para activos por pedido, vencidos activos e idempotencia del productor.

La migración crea cero holds al aplicarse. Un Worker anterior ignora las tablas
nuevas; no hay backfill, contracción, dependencia ni coste mensual. El DDL, el
rehearsal y cualquier aplicación local/remota quedan explícitamente fuera hasta
que Andreu autorice la migración.

## Integración prevista

1. Un puerto de aplicación coordinará alta, asignación y resolución con
   `audit_log`, evento/outbox y timeline en una batch.
2. El guard de preparación se insertará en creación y avance de fulfillment;
   se probará la carrera hold-vs-envío para que solo un lado sea observable.
3. El índice expondrá filtro por hold y SLA; el detalle mostrará responsable,
   vencimiento y resolución. La demo seguirá inerte y responderá `403` a las
   mutaciones.
4. Backup/restore subirá de versión solo cuando exista el esquema autorizado.

## Criterio de terminado de R3.4

- alta manual y automática idempotente;
- varios holds simultáneos, responsable reasignable y SLA visible;
- resolución optimista con histórico y auditoría sin PII;
- preparación imposible con cualquier hold activo, incluida concurrencia;
- migración ensayada, backup/restore, reset, tests, E2E y a11y en verde;
- capacidad documentada como real solo después de quedar servida.

# ADR-0007 — Outbox transaccional sobre D1

- Estado: **proposed — espera aprobación de Andreu**
- Fecha: 2026-08-06
- Mandato: R1.6

## Contexto

R1.5 ya produce sobres de evento versionados y sin PII, pero la operación de
pedido todavía escribe sus efectos síncronos en una `batch`: timeline, stock y
mensajes de email se confirman juntos. Eso conserva la consistencia actual,
pero un consumidor lento o caído no puede reintentarse con independencia del
negocio y cada consumidor nuevo volvería a crecer la unidad de trabajo.

El diseño debe funcionar en D1 sin una cola de pago ni un proceso residente.
D1 ejecuta una base de datos de forma single-threaded y sus `batch` son
transacciones: las sentencias se ejecutan en orden y un fallo revierte el lote.
El claim puede ser, por tanto, un único `UPDATE … RETURNING`; no necesita
`SELECT FOR UPDATE`, que SQLite no ofrece.

## Decisión propuesta

Adoptar dos tablas, definidas exactamente en
[`../sql/0004_event_outbox.proposed.sql`](../sql/0004_event_outbox.proposed.sql):

1. `event_outbox_events` guarda una copia inmutable del sobre. `event_id` es su
   identidad y `idempotency_key UNIQUE` deduplica el hecho de negocio.
   `correlation_id` queda indexado para traza. Actor, entidad y `payload_json`
   reconstruyen el sobre sin guardar el pedido ni añadir PII.
2. `event_outbox_deliveries` guarda una entrega por suscriptor operativo. La
   pareja `(event_id, consumer_id)` es única: un retry no crea otra entrega.
   `consumer_id` es el id estable del módulo suscriptor; ese módulo agrega sus
   efectos para un tipo de evento en una única operación idempotente.

La mutación de negocio, el evento y sus entregas se insertan en **la misma
`DB.batch()`**. Una colisión de `idempotency_key` no se ignora: la guarda de la
mutación debe haber decidido antes si esta ejecución ganó. Si aun así colisiona,
se revierte el lote y se investiga una violación del contrato.

El dispatcher no genera mensajes ni interpreta pedidos. Hidrata y valida el
sobre, resuelve el consumidor declarado por el registro de módulos y le entrega
el evento. Notificaciones continúa siendo una función del evento más los datos
que lee mediante su puerto; el dispatcher solo coordina entrega.

## Claim, lease y concurrencia

- Antes de reclamar, el dispatcher normaliza leases vencidos: vuelve a
  `pending` los intentos 1–7 y mueve a `dead` el intento 8. Esta reconciliación
  y el claim se ejecutan en una sola `DB.batch()`.
- El claim es el `UPDATE … RETURNING` exportado por
  `src/platform/events/outbox-contract.ts`: selecciona hasta 25 pendientes por
  `(available_at, id)`, incrementa el intento y fija una lease de 60 segundos.
- D1 serializa escrituras sobre una base; dos Workers concurrentes no reclaman
  la misma fila. Los updates de éxito o fallo exigen `status='processing' AND
  claimed_by=?`: un Worker cuya lease caducó no puede cerrar el trabajo del
  nuevo propietario.
- La entrega es **at-least-once**, no exactly-once. Cada consumidor deduplica
  por `idempotency_key`; el outbox deduplica la fila por `event_id + consumer`.

## Retry y dead-letter

El intento se cuenta al reclamar. Los fallos 1–7 vuelven a `pending` con
backoff de **30 s, 2 min, 10 min, 30 min, 2 h, 6 h y 24 h**. El fallo 8 pasa a
`dead`. No hay jitter: el volumen por despliegue es pequeño y el orden
determinista simplifica operación y pruebas.

Solo se persisten `last_error_code` (80 caracteres) y un mensaje redacted de
500 caracteres; nunca stack, payload, email, dirección ni respuesta completa
del proveedor. Una entrega `dead` no se borra automáticamente. El replay manual
será autenticado, incrementará un contador de auditoría cuando exista R1.8 y
creará una nueva ventana de intentos sin duplicar el evento.

## Activación y recuperación

R1.7 compondrá dos disparadores sobre el mismo dispatcher:

1. `ExecutionContext.waitUntil()` tras confirmar la transacción, para latencia
   baja sin mantener abierta la respuesta;
2. un barrido programado para recuperar retries y ejecuciones interrumpidas.

No se incorpora Cloudflare Queues ni otra dependencia. La demo mantiene jobs y
efectos comerciales apagados por manifest, así que no entrega emails reales.
El contrato general de jobs y su registro canónico siguen siendo R1.11; R1.7
solo conectará este barrido mínimo y documentado para que un retry no dependa de
que llegue otra petición.

## Retención

- Entregas `pending`, `processing` y `dead`: nunca se purgan automáticamente.
- Entregas `delivered`: 30 días desde `delivered_at`.
- Un evento se borra a partir de 30 días y únicamente cuando ya no tiene
  entregas asociadas; así, los hechos sin suscriptores también conservan una
  ventana operativa. La FK evita huérfanos. El audit log de R1.8 será la
  evidencia de largo plazo, no el outbox.
- La limpieza corre por lotes pequeños en el barrido programado. Los índices
  parciales evitan escaneos completos y contienen lecturas/escrituras D1.

## Compatibilidad y despliegue

El SQL usa SQLite soportado por D1: `CHECK`, JSON1, FKs, índices parciales y
`UPDATE … RETURNING`. Es una migración aditiva: no cambia ni bloquea las tablas
existentes. R1.7 debe ensayarla primero sobre una copia/export local, aplicar
schema, verificar índices con `PRAGMA`, ejecutar concurrencia/retry/replay y
solo entonces aplicarla a remoto.

La migración no se aplica en R1.6. Aprobar este ADR autoriza convertir el SQL
propuesto en `migrations/0004_event_outbox.sql` durante R1.7; cualquier cambio
de tabla, retención, número de intentos o infraestructura exige volver a la
puerta de decisión.

## Alternativas rechazadas

- **Una fila por evento con un único estado:** no permite que dos consumidores
  progresen o fallen de forma independiente.
- **Cloudflare Queues como fuente de verdad:** añade infraestructura y no puede
  confirmar atómicamente con D1. Podrá ser un acelerador futuro, nunca sustituir
  el registro transaccional.
- **Reutilizar `emails_outbox`:** contiene un mensaje ya materializado y PII;
  no es un hecho de dominio ni sirve a consumidores distintos.
- **Borrar dead-letter a los 30/90 días:** puede ocultar una pérdida no resuelta.
- **Exactly-once:** no es una garantía realista frente a un fallo después del
  efecto externo y antes del ACK. Se exige consumidor idempotente.

## Consecuencias e invariantes

- Un commit de negocio aceptado deja siempre su evento durable y sus entregas.
- Un fallo del consumidor nunca revierte dinero, stock o estado del pedido.
- Un evento puede entregarse más de una vez; su efecto no puede duplicarse.
- El outbox no contiene PII y los errores se redactan antes de persistir.
- No aparece una ruta, pantalla, coste fijo ni dependencia nueva.
- R1.7 no empieza hasta que Andreu apruebe esta propuesta de esquema.

## Referencias de plataforma verificadas

- [D1 `batch()` y atomicidad transaccional](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
- [D1: concurrencia y base single-threaded](https://developers.cloudflare.com/d1/reference/faq/#how-much-work-can-a-d1-database-do)
- [Compatibilidad SQL de D1](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
- [Índices parciales en D1](https://developers.cloudflare.com/d1/best-practices/use-indexes/)

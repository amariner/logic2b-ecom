# ADR-0011 — Jobs duraderos y bloqueados sobre D1

- Estado: **accepted — migración autorizada por Andreu**
- Fecha: 2026-08-07
- Mandato: R1.11

## Contexto

El Worker tenía dos Cron Triggers conectados directamente: reset de fixtures
cada seis horas en demo y barrido del outbox cada cinco minutos en una tienda
real. `DEMO_MODE` evitaba ejecutar el cron ajeno, pero no existían identidad de
ejecución, lock entre isolates, timeout, reintento ni replay. Dos entregas del
mismo tick podían solaparse y un Worker interrumpido no dejaba evidencia
operable.

Cloudflare Cron Triggers no aporta un lock transaccional con D1. Un singleton
en memoria solo protege un isolate y Durable Objects/Queues añadirían
infraestructura innecesaria. Andreu autorizó expresamente una migración
aditiva para resolver el lock con la base ya aislada por despliegue.

## Decisión

Adoptar un registro tipado de jobs y una fila durable por ejecución en
`platform_job_runs` (`migrations/0006_platform_job_runs.sql`).

1. Un descriptor fija id y módulo propietario, alcance, modo de despliegue,
   trigger único o recurrente, timeout, máximo de intentos y backoffs.
2. Cada solicitud aporta `scheduled_for` e `idempotency_key`. La clave única
   convierte una entrega repetida del mismo tick en la misma ejecución.
3. El claim es una escritura D1 serializada: pasa una fila `pending` a
   `running`, incrementa el intento y asigna `locked_by` más una lease. Dos
   Workers no obtienen la misma fila.
4. El runner usa el timeout del descriptor y entrega un `AbortSignal`. Un fallo
   vuelve a `pending` con backoff; el quinto intento queda `dead`.
5. Una lease vencida se recupera en el siguiente claim. El propietario viejo
   no puede confirmar porque éxito y fallo exigen `locked_by` vigente.
6. El replay interno reinicia una fila `dead`, pone intentos a cero e
   incrementa `replay_count`; no crea endpoint ni navegación.
7. Los éxitos se conservan 30 días y se purgan de 100 en 100. `pending`,
   `running` y `dead` no se purgan automáticamente.

La garantía es **at-least-once**, no exactly-once. Cada handler debe ser
idempotente: el reset ya lo es porque reemplaza fixtures completos y el
dispatcher del outbox ya deduplica cada entrega.

## Activación por manifest

Hay dos alcances distintos:

- `deployment-maintenance`: infraestructura interna necesaria para mantener el
  despliegue. El reset de fixtures pertenece a este alcance y solo existe en
  modo `demo`; no habilita cobros, emails ni mutaciones públicas.
- `capability`: solo se compone cuando el módulo está operativo y la capacidad
  requerida lleva `jobs=true`. `notifications.event-outbox-sweep` exige
  `AUT-002` y solo existe en modo `client`; el manifest público fuerza el flag
  a `false`.

El composition root exige además que el modo del manifest coincida con
`DEMO_MODE`. Ante deriva, no crea la fila ni ejecuta efectos. Los dos Cron
Triggers de `wrangler.jsonc` se conservan, pero ya no contienen lógica de
negocio en `src/worker.ts`.

## Timeout y efectos tardíos

Abortar una promesa no revierte I/O que el adaptador ya haya iniciado. Por eso
el timeout también es una lease y el ACK está cercado por propietario; un
handler debe aceptar reentrega. El reset D1 y el outbox cumplen esa condición.
No se promete cancelación distribuida de un proveedor externo.

## Seguridad y datos

La tabla no contiene payload, PII, secretos, URL, stack ni respuesta de
proveedor. Solo persiste ids técnicos, tiempos, estados y un código/mensaje
cerrado de error. No se expone por backup público, API o panel. La operación
excepcional usa D1 mediante el control plane autorizado.

## Alternativas rechazadas

- **Lock global en memoria:** no coordina isolates ni sobrevive a reinicios.
- **Reutilizar el outbox de eventos:** mezcla hechos de negocio con trabajo
  programado y obliga a fabricar eventos falsos para cada tick.
- **Cloudflare Queues o Durable Objects:** añaden infraestructura y no son
  necesarios para el volumen aislado de cada cliente.
- **Una fila mutable por job recurrente:** pierde historial e impide deduplicar
  ticks concretos o reejecutar una incidencia identificada.
- **Reintento infinito:** oculta fallos permanentes y consume D1 sin intervención.

## Consecuencias

- Los jobs únicos y recurrentes comparten una primitiva testeable.
- El reset conserva el mismo horario y resultado, con evidencia y exclusión
  mutua añadidas.
- El barrido mínimo del outbox deja de ser una excepción previa a R1.11.
- Una nueva tarea debe declararse en su módulo, registrarse, elegir alcance y
  demostrar idempotencia antes de conectarse.
- La tabla y tres índices añaden almacenamiento acotado, sin dependencia ni
  servicio mensual nuevo.

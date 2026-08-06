# ADR-0006 — Sobre de evento versionado

- Estado: **accepted**
- Fecha: 2026-08-06
- Mandato: R1.5

## Contexto

El motor ya coordinaba pedido, stock, timeline y aviso por email, pero lo hacía
por llamada directa: `payment-transition.ts` construía las plantillas de
notificación, y tres endpoints escribían SQL de pedido, evento y bandeja. Cada
consumidor nuevo —outbox (R1.7), audit log (R1.8), observabilidad (R1.9),
automatizaciones (R7.8)— habría inventado su propio formato de hecho y su propia
clave de deduplicación.

La decisión debía tomarse **antes** del outbox: el esquema de R1.6 se diseña
sobre un contrato de evento, no al revés.

## Decisión

Adoptar un **sobre único y versionado** en `src/shared-kernel/events.ts` con
`event_id`, `type`, `version`, `occurred_at`, `actor`, `entity`,
`correlation_id`, `causation_id`, `idempotency_key` y `payload`.

1. **El sobre no transporta PII.** Identifica y correlaciona; nombre, email y
   dirección se piden al módulo propietario. Así el sobre puede persistirse o
   registrarse en logs sin abrir superficie de datos personales nueva.
2. **`idempotency_key` describe el hecho, no la entrega.** Dos entregas del
   mismo cobro producen la misma clave; el consumidor puede descartar la
   segunda.
3. **`correlation_id` agrupa el flujo de negocio** (para pedidos,
   `order:<nº>`) y **`causation_id` apunta al hecho concreto que lo provoca**:
   el `event_id` de otro sobre o el id del evento del proveedor.
4. **Reloj y fuente de ids se inyectan.** El dominio no toca nada ambiental; el
   composition root elige las fuentes reales y los tests inyectan las suyas.
5. **La fábrica valida lo que produce.** Un sobre inválido no sale del proceso
   que lo creó.
6. **La fila de `order_events` pasa a ser una proyección del hecho**, no el
   hecho. El texto de la nota se redacta en un único sitio, que también usa el
   seed de la demo.
7. **El registro de módulos declara emisores y suscriptores.** Un tipo de
   evento tiene un solo emisor, su prefijo es el del módulo, y una suscripción a
   un hecho que nadie emite falla al arrancar.

## Alternativas consideradas

- **Bus o cola desde ya**: rechazado. R1.5 no debe cambiar comportamiento ni
  añadir infraestructura; el despacho asíncrono es R1.7 y necesita el esquema
  aprobado en R1.6.
- **Payload con el pedido completo**: rechazado. Habría metido PII en un
  artefacto pensado para persistirse y registrarse, justo antes de decidir su
  retención.
- **Que `orders` siguiera generando emails**: rechazado. Es la dependencia que
  ADR-0002 prohíbe y la que impide añadir un consumidor sin tocar el pedido.
- **Suscripción declarada como dependencia de módulo**: rechazado. Convertiría
  el evento en un acoplamiento con pasos extra; la unión la hace el composition
  root.

## Consecuencias

Hay una traducción explícita entre el hecho y los datos que necesita el
consumidor, y el composition root gana un caso de uso compuesto por operación de
escritura de pedido. A cambio, notificaciones deja de depender de pedidos,
la presentación deja de escribir SQL y R1.6 puede diseñar el outbox sobre un
contrato ya ejecutable.

R1.7 sustituye la coordinación temporal: la unidad de trabajo confirma mutación,
hecho y entregas en una batch; el dispatcher materializa después cada efecto y
su ACK de forma atómica.

## Invariantes

- El sobre es inmutable y sin PII.
- Un tipo de evento tiene un emisor único y su prefijo es el de su módulo.
- Toda transición de estado de pedido emite su hecho; la fila del timeline se
  deriva de él.
- El `UPDATE` guardado sigue decidiendo la idempotencia: quien no gana la
  carrera no emite efectos, ni de negocio ni de notificación.

## Señal de revisión

Un consumidor que necesite datos personales dentro del payload, o un hecho que
no pueda derivar una `idempotency_key` estable, obliga a un ADR sucesor —no a
una excepción silenciosa en el sobre.

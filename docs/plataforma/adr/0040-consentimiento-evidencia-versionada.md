# ADR-0040 — Consentimiento como evidencia versionada por canal y finalidad

- Estado: aceptado como contrato; persistencia y captura pendientes
- Fecha: 2026-08-17
- Bloque: R5.2
- Capacidad: `CUS-007`

## Contexto

Comprar como invitado (`CUS-001`) y disponer de un perfil deduplicable
(`CUS-002`) no demuestran permiso para enviar comunicaciones cuya autoridad sea
el consentimiento. Tampoco una preferencia de suscripción, una compra, una
dirección guardada o la ausencia de una retirada constituyen por sí solas una
concesión.

R5.2 necesita un contrato auditable que no adelante decisiones jurídicas de
cada comercio. El texto, la base jurídica, los plazos de conservación, las
finalidades concretas y la clasificación de cada comunicación dependen del
proyecto y de revisión competente; el motor solo puede conservar la evidencia
que una política aprobada le entregue.

## Decisión

1. La unidad de consentimiento es la combinación de sujeto, canal y finalidad.
   Un grant de email no autoriza SMS y una finalidad no autoriza otra.
2. El sujeto es un `customer_profile` opaco o una `contact_identity` HMAC de
   64 caracteres. La segunda forma permite registrar evidencia de un invitado
   sin exigir cuenta o perfil y sin guardar ni exponer el email como clave.
3. Conceder exige una acción afirmativa literal. Casillas ausentes o
   premarcadas, compra, navegación, silencio, preferencias y datos importados
   nunca se convierten en un grant por inferencia.
4. Cada hecho conserva: identificador opaco, sujeto, canal, finalidad,
   identificador y versión del aviso presentado, fuente y referencia opaca,
   región, instante del hecho, instante de registro, versión secuencial y clave
   idempotente. No contiene email, teléfono, IP, user-agent ni texto legal.
5. La evidencia es append-only. Retirar crea un hecho nuevo que referencia el
   grant vigente y hereda la versión del aviso que se aceptó; no actualiza ni
   elimina el grant. Un consentimiento posterior crea otra versión y conserva
   todo el linaje.
6. El historial de cada combinación sujeto/canal/finalidad es estrictamente
   secuencial y no retrocede en el tiempo. La escritura usa versión optimista e
   idempotencia: un retry idéntico recupera el mismo hecho; reutilizar la clave
   con otra petición falla.
7. Consentimiento y preferencia son señales independientes. Para una
   comunicación clasificada como `consent_required` hacen falta consentimiento
   vigente y ausencia de opt-out. Marcar una preferencia como `subscribed` no
   crea autoridad. Un opt-out puede ser más restrictivo que el consentimiento.
8. Una comunicación `transactional_required` necesaria para ejecutar o
   informar de la transacción no depende de `CUS-007`. La clasificación y su
   autoridad no las decide este contrato; deben venir de la política aprobada
   del proyecto. Nunca se reclasifica marketing como transaccional para eludir
   consentimiento.
9. `CUS-007` queda `installed` en el preset avanzado y ausente en los demás.
   El estado instalado publica el contrato, no habilita capturas, consultas,
   envíos, UI, rutas, navegación, jobs o proveedores.

## Contrato previo al esquema

`src/modules/customers/domain/consent.ts` aporta:

- tipos cerrados para sujeto, alcance, aviso, fuente y evidencia;
- reducción determinista del historial append-only;
- comandos explícitos de grant y retirada;
- reconsentimiento, control de versión e idempotencia;
- una decisión pura que separa consentimiento, preferencia y necesidad
  transaccional.

`ConsentRepository` define lectura de historial/estado y append atómico. No
admite lookup público por email, actualización ni borrado del historial.

## Fronteras

- No se fija texto de aviso, finalidad comercial, base jurídica, región legal,
  plazo de conservación o política de derechos de datos.
- No se capturan IP, user-agent, email o teléfono como evidencia genérica.
- No se implementan double opt-in, newsletter, segmentación, proveedor de
  mensajes, centro de preferencias, cuenta o autoservicio.
- No se emiten eventos con PII ni se imprimen identidades o evidencia en logs.
- Retirada no significa borrado: reconciliar privacidad y obligaciones de
  conservación pertenece a R5.3 y a la política aprobada del proyecto.

## Gate de persistencia

El futuro esquema expand-only se reservará como
`0037_consent_evidence.sql`. Antes de crearlo requiere autorización expresa de
esquema y deberá definir inserción/versionado atómicos, unicidad de
idempotencia, integridad de la referencia de retirada y consultas acotadas por
sujeto/canal/finalidad. También deberá elevar el backup a esquema 31 y ensayar
migración, restore, concurrencia y `foreign_key_check` sobre una copia real.

No habrá backfill desde pedidos, perfiles, outbox o preferencias: los datos
históricos no demuestran una acción afirmativa ni qué aviso se presentó.

## Verificación

- grant explícito con todos los metadatos y sin PII directa;
- aislamiento entre canal y finalidad;
- retirada y reconsentimiento sin mutar evidencia anterior;
- retry idempotente y conflicto ante reutilización distinta;
- versión optimista y rechazo del orden temporal inválido;
- preferencia suscrita insuficiente y opt-out más restrictivo;
- comunicaciones transaccionales necesarias independientes de `CUS-007`;
- manifest y registro mantienen la capacidad instalada e inerte.

## Rollback

Mientras no exista persistencia ni superficie, retirar `CUS-007` del manifest
revierte la composición. Cuando haya evidencia durable, desactivar captura o
consumo deberá conservar el historial; nunca se hará rollback mediante borrado.

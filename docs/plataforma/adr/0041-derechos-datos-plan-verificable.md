# ADR-0041 — Derechos de datos como solicitud verificada y plan revisable

- Estado: aceptado; persistencia implementada en R5.3b, ejecución pendiente
- Fecha: 2026-08-17
- Bloque: R5.3
- Capacidad: `CUS-008`

## Contexto

Disponer de perfil y consentimiento no autoriza a exportar, corregir o eliminar
datos ante cualquier petición. Hace falta verificar al solicitante, saber qué
módulo es autoridad de cada dato y revisar qué operación corresponde. Un
`DELETE` transversal dañaría snapshots de pedido, ledgers, documentos,
auditoría y obligaciones que el motor no puede decidir de forma universal.

La política aplicable, los plazos, las excepciones y la identidad suficiente
dependen del proyecto y de revisión competente. R5.3 debe preparar un flujo
seguro sin convertir esas decisiones en defaults legales.

## Decisión

1. `CUS-008` modela solicitudes de acceso, rectificación, restricción y
   borrado/anonimización. El nombre de la solicitud no determina por sí solo la
   operación ejecutable.
2. El sujeto es un perfil opaco o una identidad de contacto HMAC. La petición
   guarda referencias opacas a payload y evidencia de verificación; no incluye
   email, teléfono, documentos, tokens o valores corregidos.
3. El lifecycle es append-only y versionado: recepción, verificación, plan
   dry-run, aprobación/rechazo, inicio, finalización/fallo o cancelación.
4. Ningún plan existe antes de verificar identidad. Verificar no ejecuta nada.
5. Cada propietario de datos declara qué puede exportar, corregir, restringir
   o anonimizar y devuelve una decisión dry-run. El plan puede indicar
   `retain`, `manual_review` o una operación propuesta con un reason id aportado
   por la política del proyecto.
6. El plan usa fingerprint y una decisión por propietario. No contiene filas,
   PII, SQL ni artefactos exportados. Una rectificación referencia su payload
   protegido de forma opaca.
7. Aprobar exige un actor distinto de quien construyó el plan. Un plan con
   decisiones `manual_review` no puede aprobarse. Inicio y finalización deben
   referenciar exactamente el fingerprint aprobado.
8. Idempotencia y versión optimista forman parte de cada hecho. Un retry
   idéntico recupera evidencia; reutilizar la clave con otro comando falla.
9. Pedidos, pagos, fulfillments, documentos y audit log permanecen bajo sus
   propietarios. No se borran por defecto ni se promete anonimización total.
10. `CUS-008` queda instalada e inerte: `0038` conserva el lifecycle y sus
    referencias opacas, pero no existen rutas, export HTTP, UI, jobs o
    mutaciones hasta gates posteriores.

## Contrato de persistencia

El dominio ofrece un reducer del historial y comandos que prueban el lifecycle,
verificación, dry-run, doble control, fingerprint e idempotencia. `0038` y el
repositorio D1 implementan historial, estado y append atómico con decisiones y
referencias normalizadas, sin JSON libre. El puerto de propietario solo declara
capacidades y construye una decisión de preview; todavía no expone ejecución.

## Fronteras

- No se fija retención, base jurídica, plazo de respuesta o excepción.
- No se define qué prueba de identidad es suficiente en cada región.
- No se almacena PII, documento, magic link, token o payload de corrección.
- No se crea export descargable, endpoint, email o panel.
- No se borran datos ni se implementa cascade/anonymize.
- El audit log no entra en el backup HTTP ni se convierte en prueba pública.

## Gates posteriores

Andreu autorizó expresamente `0038` el 2026-08-18. La persistencia guarda
solicitudes/evidencias append-only, protege referencias, soporta versión e
idempotencia atómicas y eleva backup/rehearsal sin artefactos sensibles. La
ejecución real necesita todavía política aprobada, autenticación, permisos,
rate limit, auditoría y adaptadores por propietario. Cada superficie y cada
operación destructiva conservan su propio gate.

## Verificación

- no hay plan ni ejecución antes de verificar;
- una rectificación usa referencia opaca, nunca el nuevo valor;
- dry-run único por propietario y fingerprint estable;
- aprobación con doble control y bloqueo de `manual_review`;
- inicio/finalización ligados al plan aprobado;
- retry idempotente, versión optimista y tiempo no regresivo;
- capacidad instalada sin superficies o efectos.

## Rollback

Retirar flags/consumidores futuros revierte el comportamiento, pero las tablas
y solicitudes durables se conservan. Nunca se hará rollback borrando evidencia.

# ADR-0021 — Acciones masivas seguras sobre pedidos

- Estado: **aceptado para contrato; persistencia pendiente de autorización**
- Fecha: 2026-08-13
- Bloque: R3.5
- Decisión de esquema: no solicitada ni concedida

## Contexto

El panel ya permite colaborar, editar y bloquear un pedido individual. Operar
muchos pedidos repitiendo formularios es lento, pero aplicar una mutación a un
filtro vivo es inseguro: el conjunto puede cambiar entre la confirmación y la
ejecución, un Worker puede reintentarse y una fila puede quedar obsoleta aunque
el resto del lote siga siendo válido.

R3.5 necesita preview sin efectos, selección estable, progreso verificable,
resultado por pedido y replay. La primitiva R1.11 protege una ejecución de job,
pero `platform_job_runs` no guarda payload ni progreso y deliberadamente no
debe convertirse en una tabla de negocio.

## Decisión de alcance

La primera entrega admite solo tres operaciones basadas en primitivas ya
existentes:

1. añadir una etiqueta activa;
2. quitar una etiqueta asignada;
3. crear un hold tipado con responsable técnico y SLA.

Quedan fuera los cambios de estado comercial, preparación o envío, edición de
líneas/dirección, cobros, reembolsos, inventario y cualquier acción irreversible
o con proveedor externo. Ampliar este catálogo exigirá una decisión de dominio
independiente, no un payload abierto.

## Selección y preview

1. El servidor exige una lista explícita, sin duplicados y ordenada de como
   máximo 500 ids. Nunca se persiste un filtro para reevaluarlo durante el job.
2. La lista tiene un fingerprint SHA-256 versionado. Su orden canónico hace
   estable la identidad aunque el navegador enviase los mismos ids en otro
   orden.
3. El preview captura por pedido únicamente id, versión de edición, estado y
   precondiciones específicas de la acción (etiqueta/hold). No contiene nombre,
   email, dirección, nota ni otra PII.
4. El preview clasifica cada fila como `ready` o `skipped` con un motivo cerrado,
   produce recuentos exactos y no escribe datos ni emite eventos.
5. Caduca a los 15 minutos. Confirmar exige su fingerprint íntegro antes del
   vencimiento; no se acepta una selección libre distinta a la previsualizada.

El preview no promete que la escritura posterior vaya a ser válida. Es una
fotografía explicable; cada fila se revalida dentro de la transacción que la
aplica.

## Ejecución durable y concurrencia

El diseño propuesto —todavía sin DDL— separa tres responsabilidades:

- `order_bulk_batches`: intención inmutable, acción tipada, fingerprints,
  actor técnico, estado y contadores;
- `order_bulk_batch_rows`: selección congelada, snapshot de precondición y
  resultado terminal por pedido;
- `platform_job_runs`: lease, timeout, reintento y estado del handler R1.11,
  enlazado por una identidad técnica, sin absorber payload de negocio.

El job será único (`orders.execute-bulk-action`), de capacidad cliente y no
recurrente. Procesará lotes de 25 filas para acotar CPU y D1. Antes de mutar,
cada fila vuelve a leer sus precondiciones:

- añadir/quitar etiqueta comprueba la asignación actual;
- crear hold comprueba estado permitido y ausencia de un hold activo del mismo
  motivo;
- la versión observada permite explicar cambios concurrentes, pero no sustituye
  las precondiciones específicas.

Una escritura que ya tiene el efecto deseado termina como `replayed` o
`skipped`, según exista evidencia de que pertenece al mismo lote. Una condición
que cambió de forma incompatible termina `conflict`; no revierte las filas ya
aplicadas ni bloquea las independientes.

La idempotency key de fila se deriva como
`bulk:<batch-id>:<action>:order:<order-id>`. La persistencia deberá imponer
unicidad por lote/pedido y registrar resultado más evidencia en la misma batch
D1 que la mutación, su auditoría y los eventos de dominio existentes.

## Progreso y replay

Los únicos resultados son `pending`, `applied`, `replayed`, `skipped`,
`conflict`, `retryable_failure` y `permanent_failure`. El progreso se deriva de
filas persistidas; no usa porcentajes estimados en memoria.

El replay selecciona solo `pending` o `retryable_failure`. Nunca reinicia
`applied`, `replayed`, `skipped`, `conflict` ni `permanent_failure`. El job sigue
siendo at-least-once; la garantía de no duplicar efectos está en la clave por
fila y en las primitivas idempotentes de etiqueta/hold.

## Capacidad, seguridad y demo

- `ORD-011` gobierna rutas, navegación, job y efectos de acciones masivas.
- `AUT-011` gobierna el contrato de dry-run sin efectos laterales.
- Ambas quedan `installed` y sin flags en el preset avanzado hasta que exista
  persistencia, runtime, permisos, UI y operación completos.
- La demo pública no podrá activar job ni efectos, aunque muestre fixtures en
  una fase posterior.
- Se añade el permiso cerrado `orders.bulk`; no se reutiliza un permiso de
  transición, reembolso o fulfillment.
- Audit log, eventos y logs solo incluirán ids, tipo de acción, motivo cerrado,
  estados, versiones y recuentos; nunca selección por email ni datos del pedido.

## Gate de persistencia pendiente

Antes de crear una migración debe existir autorización explícita. La propuesta
deberá ser expand-only, no crear lotes al aplicarse, ser ignorada por Workers
anteriores y demostrar:

1. límites, checks y claves únicas de lote/fila;
2. claim/replay concurrente sin doble mutación;
3. resultados parciales y reanudación después de interrupción;
4. retención/purga operable de lotes terminales sin borrar auditoría de negocio;
5. rehearsal sobre backup, restore y `foreign_key_check`;
6. capacidad apagada sin ruta, navegación, job ni efecto;
7. demo con mutaciones rechazadas antes de tocar D1.

## Alternativas rechazadas

- **Ejecutar el filtro al confirmar:** deriva el alcance tras la decisión humana.
- **Una transacción para 500 pedidos:** aumenta lock/timeout y hace imposible
  informar fallos independientes.
- **Solo `platform_job_runs`:** mezclaría infraestructura con payload y progreso
  de negocio, contradiciendo ADR-0011.
- **`Promise.all` desde la petición:** no sobrevive a la respuesta ni ofrece
  replay durable.
- **Exactly-once:** D1/Workers no lo prometen; claves y writers idempotentes sí
  hacen seguro el at-least-once.
- **Acción genérica con JSON libre:** evita validación exhaustiva y puede abrir
  operaciones económicas sin una decisión explícita.

## Consecuencias

El contrato puro, fingerprints, límites, clasificación y reglas de replay ya
son testeables sin esquema ni side effects. El siguiente incremento requiere
una migración nueva y queda bloqueado por su gate de autorización; hasta
entonces no hay endpoint, job, UI, cambio en D1 ni despliegue necesario.

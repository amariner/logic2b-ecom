# R5.6c.2 — Ejecución interna reanudable de segmentos

Estado: **implementado localmente; inactivo y sin registro de jobs**. Fecha: 2026-10-03.
Propietario: `customers`; capacidad: CUS-009. No activa recálculos ni concede
permisos de comunicación. Se apoya en [ADR-0045](adr/0045-segmentos-calculados-observables.md),
el [runbook](OPERACION_SEGMENTACION.md) y los
[gates existentes](PROPUESTA_SEGMENTACION_PERSISTENTE.md).

## Implementación local

`src/modules/customers/application/customer-segmentation-execution.ts`
implementa `createCustomerSegmentExecution({ repository, source, policy, now })`.
Se prueba con repositorio SQLite y captura D1 reales. Los puertos se inyectan
directamente: no hay otra fachada, registro de job, cron, ruta, flag o consumidor,
ni cambio de esquema o de formato de backup.

La solicitud inicial sigue siendo `requestRun`: su llamador conserva el comando
completo y su clave. Ante pérdida de respuesta se repite **ese mismo comando**;
la respuesta recupera el `runId` sin crear otra generación. Como el replay puede
devolver la fotografía histórica `requested`, siempre se consulta `readRun`
antes de decidir el siguiente paso.

El coordinador expone `advance` sobre un `runId` existente, actor interno,
política esperada, tamaño de lote y `AbortSignal` opcional. Valida y copia la
entrada antes de I/O. Cada invocación realiza como máximo **una transición**:

| Estado observado | Trabajo permitido | Resultado observable |
|---|---|---|
| `requested` | Capturar una vez e importar mediante `startRun` atómico. | `running`, incluso con población vacía. |
| `running`, cursor presente | Evaluar un único lote con revisión/cursor observados. | `running` con contadores confirmados. |
| `running`, sin cursor y procesados = total | `completeRun`. | `completed`; todavía sin publicación. |
| `completed` o `failed` | Lectura, sin nueva captura ni escrituras. | Estado terminal existente. |

El lote es obligatorio, entero entre 1 y 100. Los límites de captura permanecen:
100 perfiles, 1.000 pedidos, 5.000 pagos, 10.000 transacciones, 10.000 movimientos
de saldo, 1.000 modificaciones y 256.000 bytes de snapshot. Un exceso rechaza el
conjunto entero. No hay bucles de recálculo, reintentos ilimitados ni división de
la importación en transacciones parciales. Una colisión permite una relectura
de reconciliación y devuelve control; otra invocación podrá continuar.

## Identidad, tiempos y recuperación

Cada escritura usa un **envoltorio de comando inmutable** con operación,
`runId`, revisión esperada, actor, `occurredAt` y argumentos completos. Su clave
se deriva de la huella canónica de ese contenido, con prefijo de operación y
longitud compatible con el repositorio. Repetirlo conserva también fecha,
límite, cursor y, para inicio, snapshot completo. Cambiar cualquiera de esos
valores exige otro comando y otra clave.

La fecha se obtiene una vez al preparar el comando, nunca en cada intento. Para
el inicio debe ser igual o posterior a `capturedAt` y a la última revisión; los
pasos posteriores respetan `recordedAt`. Un reloj incoherente falla: no se
inventa una fecha futura ni se cambia retroactivamente el snapshot. `capturedAt`
procede del corte D1 de R5.6c.1 y no es un parámetro histórico `asOf`.

Dentro de una invocación se conserva el envoltorio hasta resolver su respuesta.
Después de perder el proceso, la recuperación relee la ejecución. Si ya está
`running`, usa sus hechos y revisión persistidos; **no vuelve a capturar**. Si
continúa `requested`, puede obtener una captura nueva y preparar otro intento:
no afirma estar reproduciendo el snapshot que se perdió antes de persistirlo.
Si una escritura anterior todavía llega a confirmar, el CAS de revisión
determina el ganador y revierte íntegramente el otro intento.

Un error de transporte después de iniciar una escritura deja resultado
desconocido. No se convierte en éxito ni provoca automáticamente `failRun`.
Se conserva el error y se reconcilia mediante lectura o replay exacto. Las
guardas del repositorio, no un mutex de proceso, aseguran que dos coordinadores
no importen dos poblaciones ni evalúen dos veces una posición.

## Fallos, cancelación y cambios de definición

Si la captura termina con error antes de llamar a `startRun`, el coordinador
intenta `requested → failed` sobre la revisión original, con código cerrado
`facts_capture_invalid` o `facts_capture_unavailable`. No almacena SQL,
excepciones crudas ni datos de clientes. Si otro escritor ya inició o cerró la
ejecución, ese CAS pierde: se relee y devuelve el estado ganador, sin marcarlo
fallido por un error de la captura descartada. Si D1 tampoco confirma el fallo,
se informa de infraestructura; no se afirma que exista un estado `failed`.

Se consulta la definición vigente antes de trabajar. Una ejecución abierta de
una versión superada se cierra mediante `failRun` y código
`definition_superseded`, conservando población y progreso ya confirmados. Una
ejecución completada conserva su historia y no se publica si está superada.
Una carrera que cambie la definición después de esta comprobación sigue
protegida por la guarda SQL de publicación. Crear la ejecución sustituta exige
una solicitud nueva con su propia clave; no se cambia la definición del run.

Se comprueba `AbortSignal` antes de iniciar I/O y después de cada lectura, en
particular entre captura y escritura. Abortar detiene pasos siguientes, sin
inventar una transición terminal. D1 no garantiza cancelar una escritura ya
enviada: su confirmación tardía se resuelve con las mismas reglas de CAS y
relectura. `failed` es terminal; reiniciar un cálculo fallido crea otro run.

## Política y publicación

Al iniciar se exige que `policyId`, versión, moneda y huella coincidan con la
política normalizada recibida. La referencia de la fuente tiene forma
`source:<SHA-256-política>:<SHA-256-contenido>`. El coordinador comprueba ambos
componentes contra la política y el contenido normalizados (este último sin
`ref`) antes de persistirla. Al reanudar
verifica la huella de política de la referencia guardada: mismo nombre/versión
con otras reglas produce conflicto explícito, nunca una sustitución silenciosa.
Una referencia antigua sin esa evidencia queda pendiente de revisión interna;
no se le asigna por defecto la política actual.

La publicación es una operación separada y explícita del coordinador, con
`expectedPublicationVersion`, actor, fecha y clave fijados en el comando. Exige
run completo, política esperada y definición vigente. La obsolescencia se delega al CAS del
repositorio, que comprueba el replay exacto antes de exigir definición vigente; un conflicto **no** provoca leer otra versión e incrementarla
automáticamente. Repetir el comando exacto recupera su publicación histórica y
el puntero vigente por separado. Una generación antigua nunca reemplaza otra
superior ya publicada. Completar el cálculo no autoriza por sí solo publicarlo.

## Encaje posterior con jobs y conservación

El [runner actual](../../src/platform/jobs/runner.ts) reclama la siguiente
ejecución disponible del descriptor, que puede ser distinta de la recién
encolada. `JobHandler` recibe el run reclamado y una señal; debe resolver su
identidad real, sin cerrar sobre los parámetros de otra solicitud. Su timeout
usa `Promise.race` y no detiene necesariamente el trabajo D1 ya iniciado.
Estos hechos impiden tratar el lock del job como exclusión de las escrituras
de segmentación o marcar un tramo parcial como recálculo completo.

Una integración posterior debe fijar correlación durable job/run/política,
reanudación tras presupuesto agotado, backoff, cancelación y errores antes de
registrarse. El descriptor pertenecerá a `customers` y CUS-009; el manifest
deberá permitir `jobs` en modo cliente. La demo sigue inerte. R5.6c.2 prueba el
coordinador directamente y no modifica el registro ni el runner compartido.

Las tablas de segmentación son append-only. No se borran ejecuciones, hechos,
publicaciones o claves para recuperar espacio. Los 30 días de purga de jobs
exitosos no son una política de retención de segmentos. Su conservación y la
política completa versionada deben resolverse por proyecto antes de activar;
una huella no reconstruye por sí sola unas reglas perdidas. Backup 38 sigue
conservando la historia existente.

Los resultados del coordinador contienen solo identidad técnica del run,
versión/generación, revisión, estado, contadores, referencia/huellas y motivo
canónico de bloqueo o fallo. Los logs no contienen perfiles, hechos, emails,
direcciones, importes individuales ni mensajes crudos de proveedores.

## Evidencia local y puertas pendientes

Las 29 pruebas del coordinador cubren avance por paso, reinicio tras respuestas
perdidas de inicio/progreso/publicación, comandos exactos reproducidos, carreras,
captura fallida y fallo al registrar ese fallo, población vacía/límite 101,
abortos antes/después de escritura, política divergente, definición superada,
CAS y replay histórico. La revisión independiente no encontró P1/P2 pendientes.
El ensayo workerd/D1 verifica además carreras y reinicio sin recaptura sobre
almacenamiento real local; el backup 38 restaura publicaciones y referencias.
Ver [informe](../audits/r5-6c/facts-d1-report.json).

La revisión del conjunto añadió evidencia separada por medio de pago: saldo y
cobro externo no se acreditan mutuamente. Se comprueba cada intención contra
su importe esperado; un segundo pago incompleto no se oculta con la captura de
otro. En modo neto, una parte requerida ausente produce null/rechazo; no dinero
parcial. Los totales comerciales siguen independientes. La política/proyección
pasa 103 pruebas y la fuente 26, incluidas cuatro regresiones D1 de pagos mixtos.

Validación final del conjunto: `pnpm check` con 870 archivos sin errores ni
avisos, 215 suites y 1.441 pruebas, baseline y build/sitemap correctos. E2E
general sobre Worker local y D1 de QA aislada: 142 comprobaciones, cero fallos,
con las 45 migraciones existentes y seed public-demo. El ensayo workerd/D1 de
segmentación supera sus 12 bloques y restaura 126 tablas idénticas, sin fallos
de claves foráneas. No se aplica ninguna migración remota.

El siguiente paso es [R5.6c.3](PROPUESTA_EJECUCION_SEGMENTACION.md): propuesta
concreta de registro durable de políticas, planes y correlación de pasos con
jobs. Su migración aditiva candidata 0046 necesita autorización local conforme
al veto de arquitectura; no se ha creado DDL. G3 remoto y G4 de uso real siguen
separados. La propuesta no registra cron ni decide políticas comerciales,
retención destructiva o consumidores. La capacidad continúa instalada/inactiva.

Consejo: arquitecto ✓ puertos y esquema existentes · backend ✓ CAS y fallos
ambiguos explícitos · fullstack ✓ reanudación y pruebas definidas · producto ✓
sin promesa de disponibilidad ni activación.

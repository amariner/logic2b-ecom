# Propuesta R5.6b — Persistencia de segmentos calculados

- Estado: **propuesta para revisión; no implementada ni aprobada**.
- Fecha: 2026-09-18.
- Capacidad: `CUS-009`; módulo propietario: `customers`.
- Precedencia: terminar R5.5h y el endurecimiento de R5.6a antes de ejecutar
  este bloque.
- Base: [ADR-0045](adr/0045-segmentos-calculados-observables.md),
  [roadmap de plataforma](ROADMAP.md) y
  [ruta de desarrollo continuo](../RUTA_DESARROLLO_CONTINUO.md).

Este documento concreta qué se pide aprobar para el siguiente cambio de D1.
No crea una migración, no modifica el roadmap y no cambia el estado comercial
de la capacidad. `CUS-009` permanece instalada e inactiva en el preset
avanzado; la matriz conserva su estado mientras no exista nueva evidencia.

## 1. Decisión solicitada y límites

Se propone autorizar **una migración aditiva de cinco tablas**, sus
repositorios internos, pruebas transaccionales y adaptación de backup/restore,
primero sobre bases locales aisladas. No hay backfill de clientes, pedidos ni
pertenencias a segmentos. La instalación deja las cinco tablas vacías.

La migración candidata se llamaría
`0045_customer_segmentation.sql` si esa posición sigue libre al comenzar.
El identificador se confirmará tras sincronizar el repositorio; esta propuesta
no reserva ni crea ningún archivo en `migrations/`.

R5.6b persiste definiciones versionadas, fotografías de ejecuciones, hechos
congelados de candidatos y una proyección publicada de forma atómica.
Incluye el contrato del proveedor de snapshots y un proveedor sintético para
pruebas. El lector real de hechos comerciales, el job de recálculo, su
planificación, las rutas administrativas, la UI, los consumidores de precios o
marketing y cualquier activación quedan en bloques posteriores.

No se añaden dependencias, servicios, credenciales ni umbrales comerciales
predeterminados. Ningún pedido cambia de precio y no se envía comunicación.
La demo no consulta ni escribe estas tablas; si se representa esta capacidad
más adelante, lo hará mediante fixtures inertes. **Demo visual pendiente.**

## 2. Contratos que deben estar cerrados antes del DDL

El dominio R5.6a debe rechazar campos y operadores desconocidos, tipos
incorrectos y relojes inválidos. Debe conservar `null` para hechos ausentes,
enteros seguros no negativos, templates/versiones exactos e inmutabilidad.
No se persiste un objeto que solo haya pasado un cast de TypeScript.

Cada escritura se valida en tres puntos: entrada del repositorio, restricciones
SQL y lectura posterior del dato almacenado. Los errores de contrato, los
conflictos de versión/idempotencia y los fallos de infraestructura se distinguen;
un fallo D1 no se convierte en un segmento vacío o una coincidencia negativa.

Los documentos JSON se serializan de forma canónica antes de obtener su huella
SHA-256. El mismo contenido semántico produce la misma huella aunque cambie el
orden de las claves de entrada. La normalización conserva el orden definido de
las condiciones y nunca modifica los objetos del llamador.

## 3. Modelo propuesto

Los nombres de columnas siguientes fijan el contrato de revisión. El SQL
definitivo se redactará únicamente tras autorizar el gate de migración.

### 3.1 `customer_segment_definitions`

| Campos | Restricción o propósito |
|---|---|
| `segment_id`, `definition_version` | Clave primaria compuesta; identificador canónico y versión entera positiva. |
| `template_id`, `template_version` | Identifican el template que originó esta definición. |
| `template_json`, `parameters_json` | Copia canónica completa del template y sus parámetros; JSON válido que se revalida contra R5.6a. |
| `definition_fingerprint` | SHA-256 del contenido de la definición. |
| `created_at`, `created_by` | Fecha UTC canónica y actor interno opaco; sin nombres ni email. |
| `idempotency_key`, `command_fingerprint` | Clave única y huella del comando completo, incluida la identidad del segmento y la versión esperada. |

Cada fila es inmutable. Crear la primera versión exige `expectedVersion = 0`;
crear la siguiente exige la versión máxima vigente y la incrementa en uno.
Una guarda SQL impide saltos o ramas paralelas. No hay edición de una versión
publicada ni borrado desde la API del repositorio.

Guardar el template completo evita depender de que una futura configuración
conserve la misma definición bajo el mismo nombre. Al leer se vuelve a
instanciar con los parámetros almacenados y se verifica la huella.
Una guarda rechaza que el mismo `template_id`/`template_version` aparezca con
otro `template_json` canónico, aunque pertenezca a otro segmento.

### 3.2 `customer_segment_runs`

| Campos | Restricción o propósito |
|---|---|
| `run_id` | Clave primaria opaca creada en servidor. |
| `segment_id`, `definition_version` | FK compuesta a la definición exacta. |
| `generation` | Entero positivo, único y consecutivo por segmento; ordena ejecuciones sin depender de empates de reloj. |
| `requested_at`, `requested_by` | Contexto inmutable de la solicitud. |
| `idempotency_key`, `command_fingerprint` | Idempotencia de la solicitud; la huella incluye la definición exacta. |

La identidad de la ejecución es inmutable. La solicitud y su primera fotografía
`requested` se insertan en una única transacción. Repetir el comando no crea otra
generación. El estado observable se obtiene de la última revisión de la tabla
de fotografías, no de un segundo estado mutable que pueda divergir.
Una solicitud nueva exige que su definición siga siendo la vigente; una
ejecución anterior puede terminar después de una nueva definición, pero no
publicarla.

### 3.3 `customer_segment_run_snapshots`

| Campos | Restricción o propósito |
|---|---|
| `run_id`, `revision` | Clave primaria compuesta; FK a ejecución y revisiones consecutivas desde 1. |
| `state`, `started_at`, `finished_at`, `cursor` | Estados y combinación temporal del contrato R5.6a. |
| `total_candidates`, `processed_candidates`, `matched_customers`, `error_code` | Contadores enteros seguros y error canónico; `matched <= processed <= total`. |
| `source_snapshot_ref`, `source_snapshot_fingerprint`, `facts_policy_id`, `facts_policy_version`, `facts_captured_at`, `currency` | Identidad, huella del conjunto y política del snapshot; ausentes en `requested` y obligatorios desde el inicio correcto. |
| `last_position` | Posición interna del último candidato consumido; no es un identificador de cliente ni se acepta desde una ruta pública. |
| `recorded_at`, `actor_id` | Evidencia temporal y actor técnico opaco de la transición. |
| `idempotency_key`, `command_fingerprint` | Unicidad por ejecución y huella del comando, incluidos revisión esperada y resultados del lote. |

Las fotografías son append-only. Una guarda exige que la nueva revisión sea la
anterior más uno, que la transición sea válida y que no cambien identidad,
política, conjunto de candidatos o fecha de captura después de iniciar.
`requestedAt`, `segmentId` y `definitionVersion` del DTO se recuperan mediante
la ejecución y la definición; no se duplican como valores editables.

El cursor es un token opaco asociado en D1 a esa ejecución/revisión. El
repositorio resuelve `last_position` a partir de esa asociación; nunca confía en
un offset o un identificador de cliente enviado por el llamador.

### 3.4 `customer_segment_results`

Esta tabla contiene el conjunto cerrado de candidatos y, posteriormente, el
resultado de su evaluación. No se rellena únicamente con las coincidencias:
también debe poder justificarse qué se procesó y qué no coincidió.

| Campos | Restricción o propósito |
|---|---|
| `run_id`, `customer_profile_id` | Clave primaria compuesta; FK a ejecución y perfil. Un perfil aparece como máximo una vez por ejecución. |
| `position` | Entero positivo único por ejecución; orden estable y continuo del snapshot. |
| `customer_profile_version` | Versión del perfil observada al capturar los hechos. |
| `facts_json`, `facts_fingerprint` | Los cuatro hechos normalizados, con `null` explícito, y su huella. |
| `matches`, `missing_facts_json`, `evaluated_revision` | Inicialmente `null`; se fijan conjuntamente una sola vez al evaluar un lote. |

Identidad, posición, versión del perfil y hechos no pueden cambiar. Los tres
campos de resultado admiten una única transición conjunta de pendientes a
evaluados; después son inmutables. La evidencia identifica la revisión que
confirmó el lote. No se puede evaluar fuera de `running`, reutilizar un
candidato ni saltar posiciones.

La referencia al perfil conserva la historia aunque este se fusione después.
Las guardas no exigen que una observación histórica coincida para siempre con
el perfil actual: hacerlo impediría restaurar ejecuciones antiguas. El
proveedor del snapshot acredita la versión en su captura; el lector de
pertenencia aplica la comprobación de vigencia descrita en la sección 6.

### 3.5 `customer_segment_publications`

| Campos | Restricción o propósito |
|---|---|
| `segment_id`, `publication_version` | Clave primaria compuesta; versiones positivas consecutivas de publicación. |
| `run_id`, `definition_version`, `generation` | FK coherente a la ejecución del mismo segmento y su definición. |
| `published_at`, `published_by` | Evidencia de publicación. |
| `idempotency_key`, `command_fingerprint` | Unicidad por segmento y huella del comando completo de publicación. |

Las publicaciones son append-only; el puntero vigente es la fila con mayor
`publication_version` del segmento. No se mantiene una segunda tabla mutable.
Una guarda SQL exige versión anterior exacta y generación superior a la última
publicada, completada y perteneciente a la definición vigente. No exige que sea
la mayor generación solicitada: otra ejecución puede seguir en curso sin haber
reemplazado la publicación. La primera publicación usa
`expectedPublicationVersion = 0`; las siguientes exigen la versión máxima
actual. Una ejecución fallida, parcial, de otro segmento o de una definición
superada nunca avanza este puntero.

Conservar todas las filas mantiene la idempotencia de publicaciones antiguas
sin depender de `audit_log` ni de que la publicación siga siendo la última.
Un reintento exacto devuelve su evidencia original y el estado vigente por
separado; no vuelve a publicar ni retrocede el puntero.

## 4. Snapshot de hechos y conjunto de candidatos

Un timestamp no congela una consulta. Para reproducir un recálculo se deben
conservar la definición, la política de hechos, la población y los valores de
cada candidato. No se vuelve a consultar una población cambiante página a
página bajo el nombre de un mismo snapshot.

El puerto interno `CustomerSegmentFactsSource` debe devolver un snapshot
completo, validado y acotado: referencia opaca, política/versiones, fecha de
captura, moneda y candidatos únicos con versión de perfil y facts. Cada
snapshot proviene de una captura consistente del proveedor; la fecha describe
esa captura y no promete reconstruir cualquier estado histórico de D1.

En R5.6b este puerto solo tiene un proveedor sintético para las pruebas. El
adaptador productivo y su consulta consistente requieren un bloque posterior.
La huella del conjunto incluye metadatos, posiciones, perfiles/versiones y
hechos. Una guarda transaccional rechaza referencias reutilizadas con otra
huella; distintos segmentos sí pueden utilizar el mismo snapshot exacto.

La importación de todos los candidatos y la transición `requested → running`
son una sola transacción. Si no cabe en los límites técnicos comprobados del
adaptador D1, se rechaza antes de escribir. No se degrada a varias transacciones
que dejen un snapshot incompleto. Un protocolo de materialización por lotes,
con su propio estado y recuperación, requeriría revisar este diseño.

Al iniciar se fijan `totalCandidates` y las posiciones consecutivas. Una vez en
`running` no entran candidatos nuevos ni cambian sus hechos. El paso del tiempo,
un pedido nuevo o una devolución posterior requieren otra ejecución.

La política de hechos debe explicar en el bloque del proveedor:

- qué estados/eventos cuentan como pedido;
- qué fecha sirve como último pedido;
- cómo trata cancelaciones, devoluciones, ajustes e importes;
- qué instante y regla de redondeo originan las edades en días;
- qué ausencia de datos obliga a `null`.

Esta propuesta no elige esas reglas comerciales. Los importes son céntimos
enteros y pertenecen a una única moneda por snapshot; nunca se suman monedas
distintas. Un dato no disponible no se sustituye por cero. El proveedor es
interno: un comprador no puede suministrar sus hechos, importes o pertenencia.

## 5. Escrituras, estados y concurrencia

El repositorio expone operaciones internas acotadas:

| Operación | Precondición y efecto atómico |
|---|---|
| `appendDefinition` | Versión esperada exacta; añade una definición inmutable. |
| `requestRun` | Definición vigente exacta; crea ejecución y fotografía `requested`. |
| `startRun` | Revisión `requested` vigente; importa snapshot completo y fotografía `running`. |
| `appendProgress` | Revisión/cursor vigentes; evalúa el siguiente lote contiguo y añade la fotografía que acredita sus resultados. |
| `completeRun` | Todos los candidatos evaluados; añade `completed`, cierra tiempo y elimina cursor. |
| `failRun` | Estado abierto y revisión vigente; añade `failed` con error canónico y cursor nulo. |
| `publish` | Ejecución completada, definición vigente y versión de publicación esperada; añade evidencia y avanza el puntero derivado. |
| Lecturas | Definición, ejecución, fotografías y pertenencia publicada mediante DTO validado y sin PII de contacto. |

Transiciones: `requested → running|failed`, `running → running|completed|failed`.
`completed` y `failed` son terminales; reintentar una ejecución fallida crea una
ejecución nueva. El caso sin candidatos inicia con total cero y puede completar
normalmente. Un fallo anterior al inicio no contiene candidatos ni progreso.

El evaluador del dominio decide `matches` y hechos ausentes a partir de la
definición y los facts persistidos. El puerto de progreso no acepta como verdad
un booleano calculado por el llamador. La huella del comando se calcula sobre
el contenido normalizado del lote y su revisión esperada.

Todas las modificaciones de resultados y fotografía correspondientes se
ejecutan en un `db.batch` transaccional. El guard de la nueva revisión aborta
si otro escritor avanzó; el aborto revierte también las modificaciones previas
del lote. Las filas afectadas deben ser exactamente las esperadas: cero filas
no equivale a éxito.

La fotografía confirma contra las filas persistidas:

- total igual al número de candidatos congelados;
- procesados igual al número de resultados confirmados hasta esa revisión;
- coincidencias igual al número de resultados verdaderos confirmados;
- posiciones evaluadas continuas hasta `last_position`;
- contadores monotónicos y total/política invariables desde el inicio.

Un reintento con la misma clave y huella devuelve el resultado confirmado,
incluso si hay revisiones posteriores. Otra huella con la misma clave produce
conflicto. La lectura posterior a una carrera solo puede recuperar un resultado
si demuestra esa identidad exacta; no absorbe errores genéricos de D1.

## 6. Lectura de la proyección y perfiles que cambian

Una pertenencia solo es visible cuando el puntero apunta a una ejecución
`completed` de la definición vigente y el resultado del perfil es `matches = 1`.
Las filas de una ejecución todavía en cálculo no se mezclan con la publicación
anterior. Completar y publicar son operaciones separadas: un cálculo correcto
puede quedar sin publicar hasta que el consumidor autorizado lo solicite.

La lectura comprueba que el perfil sigue activo, sin destino de fusión y con la
misma versión observada. Una discrepancia devuelve un estado explícito de
proyección no vigente; no reasigna pertenencias al perfil destino ni las
presenta como una evaluación negativa. El siguiente recálculo resolverá el
perfil canónico con un snapshot nuevo.

Cambiar la definición invalida la vigencia del puntero anterior para lecturas
operativas, aunque se conserve su evidencia histórica. Un escritor retrasado
no puede volver a publicar esa definición antigua. Una consulta devuelve por
separado falta de publicación, proyección no vigente y coincidencia negativa.

La pertenencia a un segmento no concede consentimiento, permiso de acceso ni
autorización de comunicación. Los futuros consumidores mantienen sus propios
gates de capacidad, consentimiento, dinero y contexto.

## 7. Backup, restore y compatibilidad

La base observada de esta propuesta es migración `0044` y backup esquema **37**.
El cambio propuesto elevaría el formato a **38**, si ninguna integración previa
lo ha avanzado. Ambos números se verifican antes de implementar.

El backup incorpora las cinco tablas, columnas explícitas, claves/versiones,
hechos, huellas, cursores e historial de publicaciones. Así conserva también la
idempotencia de comandos antiguos. La evidencia interna de `audit_log`
continúa bajo su procedimiento operativo protegido; no se añade al backup HTTP
ni se utiliza como almacén de idempotencia de este bloque.
La extracción necesita un corte consistente de esas cinco tablas o escritores
congelados durante la copia; cinco lecturas independientes mientras avanzan
lotes no acreditan una copia coherente.

No basta con añadir nombres a `BACKUP_TABLES`. Las guardas de progreso requieren
un replay coherente al restaurar:

1. Restaurar perfiles y demás dependencias legacy.
2. Para cada segmento, reproducir las definiciones por versión. Dentro de cada
   definición, insertar sus ejecuciones por generación y su fotografía inicial
   `requested`.
3. Para cada ejecución, insertar los candidatos con hechos originales y
   resultado todavía pendiente; después reconstruir su inicio, si lo tuvo.
4. Para cada revisión de la ejecución, en orden, restaurar los resultados cuyo
   `evaluated_revision` corresponda y la fotografía que los confirma, de forma
   atómica. Conservar también ejecuciones parciales o fallidas.
5. Restaurar las publicaciones de esa definición en su orden original antes de
   insertar la siguiente definición. Insertar todas las definiciones primero
   impediría reproducir publicaciones antiguas bajo el guard de vigencia.
6. Reconciliar al final el puntero derivado y la evidencia de idempotencia antes
   de habilitar escritores.

El generador de restore debe construir este orden a partir de las filas
exportadas; no desactiva guardas ni inventa revisiones. Las referencias a
observaciones históricas siguen siendo restaurables aunque el perfil actual
esté fusionado. El rehearsal cubre específicamente este caso.

La secuencia es por segmento y definición, no un volcado completo por tabla.
Se apoya en dos invariantes SQL: una ejecución solo se solicita sobre la
definición vigente y una publicación solo se acepta sobre la definición
vigente. Por ello, las versiones de definición no retroceden al ordenar las
ejecuciones por generación ni las publicaciones por versión. Antes de emitir
SQL, el generador comprueba ambas propiedades, la continuidad de versiones y
las referencias de cada publicación; una copia que las incumpla se rechaza.

Ejemplo obligatorio de rehearsal: definición 1 con ejecuciones de generaciones
1 y 2, publicación 1 de la generación 1, definición 2 con generación 3 y
publicación 2 de la generación 3. La generación 2 puede haber terminado después
de crear la definición 2 y quedar sin publicar. El restore reproduce primero
definición 1, sus ejecuciones/fotografías y publicación 1; después definición 2,
generación 3 y publicación 2. Conserva los timestamps originales aunque el orden
de inserción de fotografías independientes difiera de su orden de ocurrencia.
Reproducir evidencia nunca dispara jobs ni efectos de negocio.

**Subgate técnico de restore:** el orden anterior es una propuesta que debe
demostrarse con los triggers definitivos activos. El ensayo incluye varias
definiciones publicadas, una definición posterior todavía sin publicación,
ejecuciones antiguas finalizadas tarde y publicaciones omitidas entre
generaciones. Deben recuperarse tanto el historial exacto como la vigencia o
invalidez del puntero final. Si una guarda exige un orden global que los campos
persistidos no permiten reconstruir, G2 queda sin superar y se revisa el diseño
antes de integrar; no se desactiva esa guarda ni se declara el restore válido.

Una copia nueva exige la migración nueva; el restore debe fallar explícitamente
sobre un esquema incompatible. La prueba restaurará en una base aislada vacía
con el esquema correcto y comparará recuentos, versiones, huellas, resultados,
cursores y punteros, además de `PRAGMA foreign_key_check`.

El rollback normal es de código/configuración: capacidad inactiva, ningún job o
consumidor habilitado, Worker anterior compatible y esquema aditivo conservado.
No se ejecuta `DROP TABLE` ni se borran fotografías para simular una reversión.
Una restauración destructiva de datos reales requeriría autorización y ventana
operativa independientes.

## 8. Rehearsal y definición de terminado de R5.6b

El rehearsal parte de una copia local aislada en `0044`, conserva el hash y los
recuentos legacy y aplica una sola expansión revisada. No modifica el estado
local persistente usado por otras sesiones ni obtiene una copia remota sin
autorización.

Debe demostrar al menos:

- datos legacy idénticos, cinco tablas nuevas vacías y cero errores FK;
- versiones consecutivas de definición y carrera con un único ganador;
- rechazo de template/JSON/huella/moneda/tipos inválidos;
- solicitud repetida sin nueva ejecución y conflicto con payload distinto;
- captura completa o rollback completo, incluidos población duplicada y fallos
  inyectados antes del inicio;
- facts inmutables, ausencias `null` y evaluación determinista;
- reintento de lote sin doble cómputo; carrera de dos escritores sobre la misma
  revisión; fallo intermedio que no deja resultados sin fotografía;
- rechazo de cursores de otra ejecución y de progreso fuera de orden;
- cierre sin candidatos, cierre incompleto rechazado y fallo antes/después de
  iniciar;
- publicación tardía rechazada ante otra generación o definición, y reintento
  histórico de publicación sin retroceder el puntero;
- lectura de perfiles fusionados o versionados como no vigente;
- restore íntegro de ejecuciones requested/running/completed/failed, perfiles
  fusionados, publicaciones y evidencia necesaria para reintentar;
- capacidad inactiva y demo sin nuevas rutas, navegación, trabajos ni efectos.

El cierre requiere pruebas focalizadas de dominio/repositorio/migración,
rehearsal y restore verdes, `pnpm check`, revisión del SQL definitivo y evidencia
documental. No se declara disponible un job, una UI o una integración que este
bloque no implementa. Cualquier ensayo de rendimiento solo describe el tamaño
probado; no se promete escalado ilimitado ni un coste operativo nuevo.

## 9. Gates y autorización concreta

| Gate | Decisión y evidencia necesarias | Qué permite |
|---|---|---|
| G0 — Orden y contrato | R5.5h cerrado; R5.6a endurecido y verificado. | Preparar el siguiente bloque sin saltar la cola. |
| G1 — Esquema local | Aprobación expresa de la migración aditiva de cinco tablas y de los cambios de backup/restore aquí descritos. | Implementar migración, repositorios y ensayos sobre datos sintéticos/copias locales autorizadas. |
| G2 — Verificación | SQL revisado, pruebas, rehearsal, restore y `pnpm check` verdes; documentación fiel. | Integrar el bloque según el protocolo del repositorio, manteniendo CUS-009 inactiva. |
| G3 — Rollout remoto | Autorización del despliegue objetivo, credenciales permitidas, backup operativo y recuperación ensayada. | Aplicar esquema/desplegar código únicamente en ese entorno; no activa recálculos. |
| G4 — Productor y uso | Bloque posterior con política de hechos, consistencia/límites del proveedor, lifecycle del job, retención/recuperación y gates de consumidores aprobados por proyecto. | Valorar una activación real independiente; esta propuesta no la concede. |

El veto aplicable está en
[el rol de arquitectura](../../.claude/skills/equipo/roles/arquitecto.md):
«Migración de esquema D1». `CLAUDE.md` §17 mantiene este gate para F13.
La instrucción de desarrollo continuo permite preparar esta propuesta, pero no
sustituye la autorización explícita de G1 ni las decisiones posteriores.

**Pregunta de aprobación al llegar a G1:** ¿Se autoriza implementar esta
migración aditiva y sus repositorios/backup/restore solo en local, con CUS-009
inactiva y sin job, rutas, despliegue remoto ni reglas comerciales
predeterminadas?

Consejo de la propuesta: arquitecto ✓ diseño aditivo y rollback definido ·
backend ✓ invariantes y pruebas exigidas · fullstack ✓ fronteras y estados
explícitos · producto ✓ sin promesas nuevas. Implementación pendiente de G1.

# ADR-0045 — Segmentos calculados, versionados y observables

- Estado: accepted
- Fecha: 2026-08-26
- Bloque: R5.6a
- Capacidad: CUS-009

## Contexto

Los segmentos alimentarán precios, comunicación y automatizaciones en bloques
posteriores. Una etiqueta manual opaca no permite explicar por qué un cliente
pertenece a un grupo, reproducir el resultado ni distinguir datos ausentes de
un umbral extremo. Tampoco es seguro fijar en el motor reglas comerciales que
deben decidirse por proyecto.

## Decisión

CUS-009 usa únicamente segmentos calculados a partir de hechos permitidos. El
lenguaje inicial se limita a enteros no negativos y comparadores `eq`, `gte` y
`lte` sobre edad del perfil, número/importe de pedidos y días desde el último
pedido. Un hecho que no existe se representa como `null`; nunca como `0`, una
fecha inventada o `Number.MAX_SAFE_INTEGER`.

Las reglas nacen de templates versionados. Cada template:

- declara parámetros con rango propio;
- usa cada parámetro exactamente una vez;
- rechaza nombres, hechos, operadores y campos desconocidos;
- se instancia solo con el conjunto exacto de parámetros;
- rechaza valores fuera de rango y límites incompatibles;
- produce una copia inmutable desligada del objeto de entrada.

El motor no incluye templates con umbrales comerciales universales. Cada
despliegue deberá aprobar sus definiciones y versiones.

El recálculo expone fotografías validadas `requested`, `running`, `completed`
y `failed`. Todas incluyen versión de definición, timestamps, cursor opaco,
total, procesados, coincidencias y error canónico. La cronología no puede estar
en el futuro, `matched <= processed <= total`, un cierre completo consume el
total y cada estado acepta solo su combinación temporal y de error válida.

### R5.6a.1 — Validación en ejecución (2026-09-18)

Las entradas del contrato son objetos de datos propios y enumerables; se
admiten diccionarios con prototipo nulo. Se rechazan arrays usados como objetos,
instancias, campos desconocidos u ocultos, símbolos y accessors. La validación
no ejecuta getters y produce `CustomerSegmentationContractError`, también ante
estructuras incompletas o tipos incorrectos. Identificadores y nombres no se
convierten implícitamente a texto. Los arrays de parámetros y condiciones son
no vacíos, densos y sin propiedades adicionales.

El evaluador valida todos los campos y todas las condiciones antes de decidir
una coincidencia. Un hecho ausente o una primera condición falsa no puede
ocultar un operador, hecho, umbral o rango corrupto posterior. Una instancia
conserva un parámetro por condición; no se reconstruye una correspondencia
entre nombres y condiciones que el tipo calculado ya no contiene. Los únicos
comparadores son `eq`, `gte` y `lte`, con límites inclusivos.

Los facts omitidos o `undefined` se normalizan a `null` también al evaluar;
los nombres desconocidos y los valores numéricos inválidos se rechazan. El
cero sigue siendo un dato válido y distinto de la ausencia. El resultado
mantiene hechos ausentes sin duplicados y copias inmutables.

El reloj debe ser numérico, finito y representable por `Date`; no puede usarse
`NaN` para eludir el rechazo de fechas futuras. Un estado `failed` sin inicio
solo admite los tres contadores a cero. Siguen siendo válidos el fallo con
progreso tras iniciar y el cierre completo sin candidatos. Este endurecimiento
no añade persistencia, transiciones entre ejecuciones, jobs ni efectos.

### R5.6c.1 — Política de hechos y captura consistente (2026-10-03)

`defineCustomerSegmentFactsPolicy` exige todas las decisiones, sin defaults:
identidad/versión y esquema, perfiles activos, estados de pedido (cancelación
incluida solo si se declara), elegibilidad por estado o captura confirmada,
fecha de creación/primera/última captura, total original/vigente o cobros,
reembolsos, saldo, ajustes, pagos no resueltos, evidencia ausente, moneda,
exclusión/rechazo de otras monedas y días completos de 24 horas o calendario UTC.
Los estados son los actuales; el evento soportado es la captura financiera
`succeeded`. No se cuentan eventos de timeline como pedidos adicionales.

Los totales comerciales se leen sin volver a restar reembolsos. El neto usa
capturas menos devoluciones confirmadas del ledger; las modificaciones no
añaden su delta otra vez. Los asientos externos y de saldo se agregan separados,
según la opción explícita de incluir saldo. Los ajustes sin dirección económica
se rechazan o ignoran explícitamente. Un pedido pagado sin evidencia financiera
no acredita gasto cero. Una captura de cero sí acredita el evento. Los depósitos
de un presupuesto convertido conservan su fecha anterior a la creación del
pedido. No se infiere la moneda de pedidos legacy con código vacío.

La composición interna `createD1CustomerSegmentFactsSource` realiza siete
SELECT en un único `D1.batch`: reloj de base, perfiles, pedidos, pagos,
transacciones, saldo y modificaciones aplicadas. No hay paginación de datos
vivos ni reconstrucción histórica por timestamp. Se validan propietarios,
monedas, cronología, historia de modificaciones y sumas enteras seguras. La
población se ordena por ID binario y se congela antes de devolver el snapshot.

Los límites técnicos son 100 perfiles, 1.000 pedidos, 5.000 pagos, 10.000
transacciones, 10.000 asientos de saldo y 1.000 modificaciones por captura.
Cada lectura usa un sentinel adicional y rechaza el exceso completo, también
si después una política excluiría esos pedidos. No promete escala superior.
La importación mantiene su máximo de 256.000 bytes y su batch atómico.

La referencia `source:<SHA-256 política>:<SHA-256 contenido>` acredita qué
reglas produjeron los hechos; no sustituye un registro durable de políticas.
La identidad verificable incluye la huella, además del nombre y versión. Una
activación real exige conservar el documento canónico versionado y evitar
reutilizar nombre/versión para otras reglas. El backup 38 conserva la referencia
y los hechos; no puede reconstruir por sí solo un documento de política perdido.

La revisión R5.6c.2 añade completitud separada de evidencia externa/saldo:
se comprueban los importes esperados de cada intención. Un saldo confirmado no
acredita la parte externa, una captura no acredita el saldo y un pago no oculta
la ausencia de otro. Si falta un componente usado por la política, el importe
neto y los extremos de actividad conservan ausencia/rechazo; una captura
acreditada sí permite contar ese pedido. Los totales comerciales y fecha de
creación permanecen independientes de esa evidencia financiera.

El productor no se compone en runtime, cron ni rutas. Las políticas del ensayo
son sintéticas; CUS-009 continúa instalada e inactiva, con demo visual pendiente.

### R5.6c.2 — Avance acotado y recuperación (2026-10-03)

`createCustomerSegmentExecution` coordina los puertos existentes y confirma una
transición por llamada, con comandos inmutables cuya clave incluye la huella
del payload y su fecha. Las guardas del repositorio resuelven concurrencia;
una colisión se reconcilia con una lectura, sin bucles ni mutex de proceso.
Un error de transporte tras escribir se propaga como resultado desconocido;
reanudar relee la revisión confirmada y no duplica captura ni evaluación.

El inicio verifica ambos hashes de la referencia de fuente. La reanudación
exige misma política y los hechos guardados. Un fallo de captura se registra
solo sobre la revisión solicitada; una definición superada no se sustituye
en el run. Cancelar impide pasos posteriores, sin afirmar que una escritura
ya enviada se haya cancelado. Publicar es una operación explícita separada:
el CAS exige definición/generación vigentes para nuevas escrituras y conserva
el replay exacto histórico. Contrato completo en
[EJECUCION_SEGMENTACION](../EJECUCION_SEGMENTACION.md).

## Consecuencias

- El resultado es explicable y reproducible por versión y parámetros.
- La ausencia de datos falla de forma honesta y no clasifica por accidente.
- R5.6a no añade DDL, backfill, repositorio, job, rutas, UI ni efectos.
- R5.6b debe persistir definiciones, ejecuciones y proyecciones mediante una
  migración expand-only, con rehearsal y backup/restore antes de habilitar jobs.
- CUS-009 queda `installed` sin flags en el preset avanzado.

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

## Consecuencias

- El resultado es explicable y reproducible por versión y parámetros.
- La ausencia de datos falla de forma honesta y no clasifica por accidente.
- R5.6a no añade DDL, backfill, repositorio, job, rutas, UI ni efectos.
- R5.6b debe persistir definiciones, ejecuciones y proyecciones mediante una
  migración expand-only, con rehearsal y backup/restore antes de habilitar jobs.
- CUS-009 queda `installed` sin flags en el preset avanzado.

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

## Consecuencias

- El resultado es explicable y reproducible por versión y parámetros.
- La ausencia de datos falla de forma honesta y no clasifica por accidente.
- R5.6a no añade DDL, backfill, repositorio, job, rutas, UI ni efectos.
- R5.6b debe persistir definiciones, ejecuciones y proyecciones mediante una
  migración expand-only, con rehearsal y backup/restore antes de habilitar jobs.
- CUS-009 queda `installed` sin flags en el preset avanzado.

# ADR-0004 — Ciclo de vida de capacidades

- Estado: **accepted**
- Fecha: 2026-08-06
- Mandato: R1.1

## Contexto

La matriz describe disponibilidad de producto; el futuro manifest necesita un
estado operativo distinto para cada despliegue. Mezclarlos haría visible una
capacidad no instalada o vendería una degradada como disponible.

## Decisión

Cada capacidad instalada en un despliegue sigue exactamente estos estados:

```text
absent -> installed -> disabled -> active -> degraded
                     disabled <-> active
active|disabled|degraded -> retired
```

- `absent`: código/config/datos no forman parte del despliegue efectivo.
- `installed`: artefacto presente y validado, aún no publicado ni operativo.
- `disabled`: disponible para ese cliente, sin rutas/nav/jobs/efectos activos.
- `active`: configuración válida, dependencias sanas y contrato operativo.
- `degraded`: activada pero una dependencia/healthcheck impide parte del
  resultado; conserva fallback seguro y visibilidad operativa.
- `retired`: desactivada de forma permanente, datos tratados según plan de
  exportación/retención y sin reactivación implícita.

El estado público de `MATRIZ_CAPACIDADES.md` no se deriva automáticamente de un
manifest de cliente. R1.2 implementa tipos y validación de estado; esta ADR
conserva la decisión y su significado.

## Alternativas consideradas

- Booleano on/off: rechazado; no expresa instalación, degradación ni retirada.
- `degraded` como `disabled`: rechazado; oculta incidentes y fallbacks.
- Borrar al desactivar: rechazado; compromete recuperación y retención.

## Consecuencias

Rutas, navegación, permisos y jobs deberán consultar el mismo estado. Activar
exige config y dependencias; degradar requiere causa observable.

## Invariantes

- `disabled/absent/retired` no ejecutan jobs ni efectos laterales.
- Solo `active` se presenta al comercio como operativa.
- `degraded` nunca habilita una ruta insegura ni relaja una invariante.
- Activación/desactivación es idempotente y auditable cuando exista audit log.
- Ningún estado funcional cambia dinero, stock o esquema en R1.1.

## Deuda conocida

Al aceptar esta ADR no existían manifest, registro, healthcheck ni audit log.
R1.2 cierra el manifest tipado; registro, healthcheck y audit log permanecen en
R1.4, R1.10 y R1.8 respectivamente. El corte efectivo de rutas/nav corresponde
a R1.3.

## Señal de revisión

Un caso real que necesite estado adicional con conducta distinta en rutas,
jobs, datos y soporte exige ADR sucesor; una etiqueta de UI no basta.

# ADR-0010 — Registro de integraciones seguro y sin secretos

- Estado: **accepted — sin persistencia ni superficie pública nueva**
- Fecha: 2026-08-07
- Mandato: R1.10

## Contexto

El motor ya usa tres adaptadores reales: Stripe Checkout, Resend y el export CSV
para Packlink PRO/Sendcloud. Faltaba una fuente tipada que permitiera saber qué
adaptador existe, qué capacidad y módulo lo poseen, cómo se configura sin
secretos y qué healthcheck le corresponde. Añadir una tabla o una pantalla en
la demo habría creado persistencia y superficie operativa antes de necesitarla.

## Decisión

Crear un registro inmutable de solo lectura con exactamente esos tres
adaptadores. Cada descriptor fija id y versión, capacidad, módulo propietario,
healthcheck, modo e implementación existente. El registro de módulos valida que
cada healthcheck tenga un único propietario y el registro de integraciones
rechaza duplicados, ausencias y enlaces incoherentes.

Los snapshots operativos separan tres conceptos:

- estado: `inactive`, `active` o `degraded`;
- health local: `not-applicable`, `healthy` o `degraded`;
- evidencia opcional: última sincronización y último error mediante timestamp
  ISO y código cerrado, nunca mensaje de proveedor.

El corte de composición reduce las credenciales inmediatamente a tres booleanos
de presencia. El registro no acepta strings de secretos, no conserva sus
nombres o valores y no escribe en D1. La demo deja Stripe y Resend inactivos;
el CSV manual permanece activo porque su export de fixtures ya es una capacidad
real sin proveedor remoto.

R1.10 comprueba salud de configuración local. No llama a Stripe o Resend para
probar latencia/permisos, no ejecuta trabajo al arrancar y no inventa una
integración. La evidencia de última operación puede incorporarse cuando el
adaptador la produzca; `null` significa honestamente «sin evidencia».

## Consecuencias

- La composición puede inspeccionar adaptadores sin filtrar secretos.
- Una clave parcial degrada Stripe en vez de presentarlo como sano.
- Un error seguro degrada el adaptador y conserva correlación temporal sin PII.
- No hay migración, endpoint, panel, navegación, job, dependencia o coste.
- `INT-007` queda parcial: falta el sondeo remoto de permisos/latencia y conectar
  evidencia persistente de última operación antes del futuro panel R9.2.

## Alternativas rechazadas

- Guardar estado en D1: activa una migración y retención sin consumidor actual.
- Publicar el registro en `/api` o en el panel demo: expone topología operativa y
  añade una promesa de producto fuera de R1.10.
- Probar proveedores en cada petición o arranque: añade latencia, coste y una
  dependencia externa al lifecycle del Worker.
- Registrar conectores futuros: confunde horizonte de la matriz con adaptadores
  que existen hoy.

# ADR-0001 — Monolito modular y aislamiento por despliegue

- Estado: **accepted**
- Fecha: 2026-08-06
- Mandato: CLAUDE.md §17 y R1.1

## Contexto

Logic2B comparte un motor entre proyectos, pero cada cliente necesita datos,
secretos, dominio y operación aislados. La amplitud funcional futura no debe
introducir una plataforma central ni coste fijo injustificado.

## Decisión

Mantener un monolito modular desplegable como una unidad por cliente. Código y
contratos pueden compartirse; D1, secretos, dominio, bindings, observabilidad y
backups no se comparten entre clientes. El manifest seleccionará capacidades
dentro del artefacto de cada despliegue, no filas de tenants en una base común.

## Alternativas consideradas

- Microservicios: rechazados por coste y complejidad operativa sin necesidad.
- SaaS multiinquilino: rechazado; contradice aislamiento y posicionamiento.
- Copias divergentes del repositorio: rechazadas; impiden mantener invariantes.

## Consecuencias

Despliegue/restore por cliente son simples y el fallo queda contenido. El código
debe evitar configuración global implícita y los upgrades requieren presets y
pruebas de clonabilidad.

## Invariantes

- Ninguna base central de clientes ni secretos compartidos.
- Nada de contenedores o servicios con cuota fija por arquitectura.
- Un módulo apagado no añade rutas, jobs, tablas operativas ni carga cognitiva.
- La demo pública no se conecta al runtime comercial.

## Deuda conocida

La configuración se importa directamente y no existe manifest/composition root.
R1.2 la tipa y ensambla sin migrar D1.

## Señal de revisión

Revisar solo si una obligación legal/técnica demostrable impide aislamiento por
despliegue o si el coste medido de operación supera el modelo de producto. No es
señal suficiente que un proveedor promocione microservicios.

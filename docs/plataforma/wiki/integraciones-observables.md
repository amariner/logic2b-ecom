---
title: Integraciones observables sin exponer credenciales
description: Cómo registramos adaptadores, estado y healthchecks sin guardar secretos ni añadir complejidad al comercio.
capabilities: [PLT-008, INT-001, INT-002, INT-003, INT-005, INT-006, INT-007]
domain: plataforma-seguridad-rendimiento
intent: integraciones-observables
audience: [responsable-ecommerce, agencia]
availability: en-estudio
publishedAt: null
reviewedAt: 2026-08-07
reviewEveryDays: 90
owner: arquitectura
evidence:
  - test: tests/integration-registry.test.ts
  - code: src/integrations/registry.ts
  - decision: docs/plataforma/adr/0010-registro-integraciones-seguro.md
related:
  - arquitectura-modular-ecommerce
  - seguridad-rendimiento
draft: true
---

# Integraciones observables sin exponer credenciales

> **Borrador interno. No genera ruta, sitemap ni canonical.** URL futura:
> `/funcionalidades/integraciones-observables/`. Estado público permitido hoy:
> **En estudio**. El registro existe; el panel, los sondeos remotos, replay y
> desconexión siguen pendientes.

## Resumen

Logic2B Ecommerce registra los adaptadores reales del motor con una identidad,
versión, capacidad propietaria y healthcheck estable. El estado operativo puede
explicar configuración incompleta y último error mediante códigos seguros sin
guardar credenciales, mensajes crudos ni datos del comprador.

## Estado visible

**En estudio.** R1.10 entrega la base interna; todavía no autoriza presentar un
panel de integraciones ni afirmar que cualquier proveedor es conectable.

### Disponible hoy en el motor

- Stripe Checkout alojado, con webhook firmado;
- entrega transaccional mediante Resend fuera de demo;
- export CSV manual para Packlink PRO y Sendcloud;
- registro inmutable de esos tres adaptadores, sin conectores ficticios;
- estado `inactive/active/degraded`, health local y configuración allowlisted;
- última sincronización y último error como evidencia opcional, tipada y sin PII;
- corte de credenciales a booleanos de presencia antes de entrar al registro.

### Falta antes de publicarlo como capacidad completa

- comprobar permisos y latencia del proveedor sin trabajo comercial;
- alimentar última operación desde cada adaptador de forma persistente y segura;
- acciones de replay y desconexión con permisos y auditoría;
- panel operativo, previsto más adelante y ausente de la demo pública.

## Qué significa «health» en esta fase

El healthcheck de R1.10 comprueba configuración y coherencia local. No llama a
Stripe o Resend en cada arranque ni considera una clave presente como prueba de
disponibilidad global del proveedor. Una configuración incompleta se marca
degradada; una integración no aplicable queda inactiva, no «sana» por defecto.

## Secretos y errores

Las credenciales permanecen en secretos del despliegue. El registro recibe solo
`true/false` para su presencia. El último error usa un vocabulario cerrado como
`provider.unavailable` u `operation.failed`, con timestamp ISO, pero nunca body,
stack, email, sesión, payment intent o mensaje crudo del SDK.

## Qué verá el comercio

Nada nuevo en R1.10. No hay ruta, navegación, tabla ni JavaScript adicional. El
futuro panel deberá traducir el estado técnico a una acción comprensible y solo
aparecer en proyectos que tengan esa capacidad activada.

## Verdad comercial

Un logo no convierte un proveedor en integración. La etiqueta «integrable»
exige adaptador operativo, health, tratamiento de errores, replay y proceso de
desconexión. Hoy Stripe y el CSV son capacidades actuales, Resend es parcial y
la observabilidad transversal de integraciones sigue parcial.

**Revisión:** arquitectura · 2026-08-07 · revisar tras R1.12 o R9.2.

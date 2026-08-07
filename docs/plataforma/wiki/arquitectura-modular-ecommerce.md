---
title: Arquitectura modular para ecommerce a medida
description: Cómo aislamos cada tienda y diseñamos módulos activables sin convertir el producto en un SaaS multiinquilino.
capabilities: [PLT-001, PLT-002, PLT-003, PLT-004, PLT-005, PLT-006, PLT-007, PLT-008, PLT-009, PLT-010]
domain: plataforma-seguridad-rendimiento
intent: arquitectura-modular-ecommerce
audience: [comercio, responsable-ecommerce, agencia]
availability: en-estudio
publishedAt: null
reviewedAt: 2026-08-07
reviewEveryDays: 90
owner: arquitectura
evidence:
  - test: tests/architecture.test.ts
  - test: tests/capability-manifest.test.ts
  - test: tests/capability-access.test.ts
  - test: tests/module-registry.test.ts
  - test: tests/integration-registry.test.ts
  - test: tests/job-runtime.test.ts
  - test: tests/platform-consolidation.test.ts
  - document: docs/plataforma/arquitectura/README.md
  - document: docs/plataforma/CREAR_MODULO_Y_JOB.md
  - document: docs/plataforma/AUDITORIA_DEPENDENCIAS_R1.md
  - configuration: platform.config.ts
related:
  - modulos-ecommerce-activables
  - integraciones-observables
  - seguridad-rendimiento
draft: true
---

# Arquitectura modular para ecommerce a medida

> **Borrador interno. No genera ruta, sitemap ni canonical.** URL futura:
> `/funcionalidades/arquitectura-modular-ecommerce/`. Estado público permitido
> hoy: **En estudio**. R1 está cerrado y aporta manifest, registro,
> eventos/outbox, audit log, observabilidad, integraciones, jobs y checks de
> clonabilidad; la publicación editorial sigue siendo una decisión separada.

## Resumen

Logic2B Ecommerce se diseña como un monolito modular desplegado de forma
independiente para cada comercio. El objetivo es ampliar capacidades sin añadir
pantallas, jobs ni configuración a quien no las necesita. Hoy existen el
aislamiento por proyecto, un núcleo transaccional probado y una fuente tipada
por despliegue que gobierna rutas, navegación y composición de módulos. R1 está
consolidado; R2 completará las primitivas transaccionales sin un cambio de motor.

## Estado visible

**En estudio.** R1 está cerrado, pero esta página no debe publicarse como una
promesa global: cada capacidad conserva el estado y la evidencia de la matriz.

### Disponible hoy

- repositorio compartido con despliegue, D1, secretos y dominio por cliente;
- compra con precios revalidados en servidor, pago alojado e idempotencia;
- escaparates públicos aislados del backend comercial;
- checks estáticos que impiden nuevos ciclos, imports invertidos, SQL en
  presentación y filtraciones de SDK sin excepción explícita;
- manifest tipado por despliegue, seis estados, flags, dependencias y rechazo
  temprano de combinaciones inválidas;
- presets técnicos `minimal`, `standard` y `advanced`, composition root y una
  política común que oculta o corta rutas según el estado/flag;
- registro validado de 16 módulos con propietario único de capacidades,
  dependencias, permisos y superficies; composición operativa por preset;
- eventos/outbox, audit log y observabilidad segura ya operativos;
- registro de Stripe, Resend y CSV con healthchecks locales y snapshots sin
  credenciales;
- jobs únicos/recurrentes con D1 lock, timeout, retry/dead-letter y replay;
  reset interno de demo y barrido cliente del outbox ya usan el mismo runner;
- demo completa mediante composición propia sin jobs comerciales, efectos
  comerciales ni mutaciones; solo conserva su mantenimiento de fixtures.
- allowlist arquitectónica vacía: cero ciclos, SQL en presentación o imports
  de SDK/seed fuera de sus adaptadores y puntos de composición;
- guía reproducible para crear módulos/jobs y matriz de clonabilidad por preset.

### Diseñado, todavía no disponible

- sondeos remotos, replay/desconexión y panel de integraciones (olas posteriores).

## El problema operativo

Una tienda pequeña no debería administrar cientos de ajustes. Una operación
mayor tampoco debería migrar de motor cada vez que incorpora inventario,
mercados o una integración. Sin fronteras, cada nueva función añade
condicionales, duplica reglas y hace difícil saber qué está realmente activo.

## Cómo funciona el contrato

1. La configuración del despliegue ya declara capacidades y parámetros.
2. El manifest ya valida dependencias y combinaciones antes de componer.
3. El composition root ya expone estado y flags sin elegir infraestructura.
4. Presentación y acceso ya obedecen esos flags con 404/403 coherente.
5. El registro reúne los módulos y sus superficies conocidas sin activar
   adaptadores ni infraestructura.
6. Healthchecks locales ya marcan integraciones degradadas sin relajar seguridad.
7. El registro de jobs compone mantenimiento por despliegue o trabajo protegido
   por el flag `jobs`; cada tick queda deduplicado y recuperable en D1.
8. La retirada conserva exportación/retención y deja de ejecutar efectos.
9. Los presets se clonan por deployment id sin compartir estado ni secretos.

## Qué verá el comercio

Solo navegación y acciones de los módulos activos. La arquitectura no se
convierte en un constructor universal ni en un panel técnico. La degradación de
una integración debe traducirse en una acción comprensible, no en jerga de SDK.

## Qué ocurrirá por detrás

Los casos de uso dependen de puertos allí donde R1 ya los ha migrado; D1,
Stripe, Resend y otros proveedores son adaptadores. El dominio no conoce Astro,
HTTP ni SDKs. Precio, stock, pedido y pago conservan propietarios distintos y se
coordinan en aplicación o por eventos versionados. R2 completará la separación
física de variantes, inventario, pagos y fulfillment.

## Casos y excepciones

- Capacidad ausente/desactivada: sin ruta ni navegación; jobs y efectos quedan
  fuera de la composición mediante el mismo manifest.
- Configuración inválida: fallo temprano; no arranque parcialmente silencioso.
- Integración caída: estado degradado y fallback seguro si está definido.
- Reintento/duplicado: idempotencia del caso de uso y del adaptador.
- Retirada: no equivale a borrar datos con obligación de conservación.

La línea base de R1.1 se conserva, pero la allowlist está vacía; no permite
crear deuda nueva.

## Configuración e integraciones

Logic2B mantiene contratos y configuración del despliegue. El proveedor externo
mantiene su servicio y credenciales. «Integrable» solo será copy válido cuando
existan adaptador, healthcheck, errores, replay y procedimiento de desconexión.

## Cuándo conviene

Conviene cuando el comercio necesita crecer por etapas o conectar especialistas
sin exponer toda la complejidad. No aporta valor convertir una necesidad única
en configuración permanente: en ese caso se resuelve como servicio gestionado.

## Privacidad, seguridad y rendimiento

El aislamiento por despliegue limita el radio de impacto. Los secretos quedan
fuera de D1 y repositorio. Un módulo apagado no carga JavaScript ni abre rutas.
Dinero, stock, permisos e impuestos permanecen en servidor.

## Preguntas frecuentes (borrador)

### ¿Es una plataforma multiinquilino?

No. Cada cliente conserva despliegue, base, secretos, dominio y observabilidad.

### ¿Un módulo desactivado sigue ejecutándose?

El contrato validado exige que no tenga flags de rutas, navegación, jobs ni
efectos. Los cuatro cortes están conectados a la composición; la demo pública
solo conserva el job interno de mantenimiento de fixtures.

### ¿Ya se pueden activar todos los módulos descritos?

No. La matriz distingue lo actual, parcial, especificado y pendiente. Esta
página seguirá como borrador hasta que el estado y la evidencia permitan una
etiqueta pública honesta.

## Relacionado y CTA futura

Relacionar con módulos activables, integraciones observables y seguridad. Al
publicar, la CTA será solicitar análisis del proyecto; no habrá CTA de
autoactivación mientras el servicio sea gestionado por Logic2B.

**Revisión:** arquitectura · 2026-08-07 · revisar tras R2.1 o en 90 días.

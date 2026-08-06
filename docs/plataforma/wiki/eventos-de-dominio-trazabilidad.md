---
title: Eventos de dominio y trazabilidad del pedido
description: Cada cambio de un pedido queda registrado como un hecho con identidad, causa y trazabilidad, sin guardar datos personales en el registro.
capabilities: [PLT-006, PLT-003, AUT-001, ORD-002]
domain: plataforma-seguridad-rendimiento
intent: eventos-dominio-ecommerce
audience: [responsable-ecommerce, agencia]
availability: en-estudio
publishedAt: null
reviewedAt: 2026-08-06
reviewEveryDays: 90
owner: arquitectura
evidence:
  - test: tests/event-envelope.test.ts
  - test: tests/order-events.test.ts
  - test: tests/orders.test.ts
  - test: tests/admin-orders-patch.test.ts
  - test: tests/outbox-contract.test.ts
  - test: tests/outbox-runtime.test.ts
  - document: docs/plataforma/adr/0006-sobre-de-eventos.md
  - document: docs/plataforma/adr/0007-outbox-transaccional-d1.md
related:
  - arquitectura-modular-ecommerce
  - modulos-ecommerce-activables
draft: true
---

# Eventos de dominio y trazabilidad del pedido

> **Borrador interno. No genera ruta, sitemap ni canonical.** URL futura:
> `/funcionalidades/eventos-dominio-ecommerce/`. No puede publicarse como
> capacidad disponible sin evidencia. R1.7 ya persiste cada hecho junto a la
> mutación, lo entrega al menos una vez con deduplicación y recupera fallos con
> lease, retry y dead-letter. La página sigue como borrador por decisión
> editorial, no por falta de backend.

## Qué resuelve

Cuando un pedido cambia de estado —se crea, se cobra, sale, se entrega, se
cancela— pasan varias cosas a la vez: cambia el pedido, se ajusta el stock, se
escribe el historial y sale un aviso. Si cada una se programa por separado,
tarde o temprano una se queda a medias: el pedido consta como enviado y el
cliente nunca recibe el aviso, o un reintento del banco cobra bien y duplica el
correo.

El motor registra cada cambio como **un hecho con identidad propia**, y todo lo
demás se deriva de él.

## Qué guarda cada hecho

| Dato | Para qué sirve |
|---|---|
| Identificador y momento | Distinguir un hecho de otro sin ambigüedad. |
| Tipo y versión | Saber qué pasó y poder cambiar el formato sin romper lo anterior. |
| Quién lo provoca | Distinguir la pasarela de pago, el panel de la tienda o el propio sistema. |
| Sobre qué pedido recae | Enlazar el hecho con su pedido y su número legible. |
| Hilo y causa | Reconstruir el recorrido completo de un pedido y saber qué disparó cada paso. |
| Clave de repetición | Reconocer que un hecho ya se procesó, aunque llegue dos veces. |

**No guarda datos personales.** El registro identifica el pedido, no a la
persona: nombre, email y dirección viven en el pedido, con su propio control de
acceso. Es una decisión deliberada, tomada antes de decidir cuánto tiempo se
conservan estos registros.

## Qué cambia para el comercio

- El **historial del pedido** que se ve en el panel es exactamente el mismo de
  siempre, con los mismos textos. Lo que cambia es de dónde sale.
- Un **cobro que llega dos veces** (la pasarela reintenta cuando duda) sigue
  produciendo un solo pedido pagado, un solo descuento de stock y un solo aviso.
- Dos **clics seguidos en «marcar enviado»** siguen produciendo un solo email al
  cliente; el segundo avisa de que el pedido ya cambió.
- Añadir un aviso nuevo (un SMS, un WhatsApp, un aviso al ERP) pasa a ser
  enchufar un consumidor a un hecho que ya existe, no tocar la lógica del pedido.

## Límites honestos

- La garantía es **at-least-once**, no exactly-once: cada consumidor debe hacer
  idempotente su efecto. Notificaciones confirma mensaje y ACK en una batch.
- No hay **panel de eventos** ni exportación: el historial visible sigue siendo
  el del pedido.
- Las **automatizaciones** sobre eventos (reglas del tipo «cuando pase X, haz
  Y») son otra capacidad distinta y no están disponibles.

## Estado

`actual`. Backend y recuperación están probados; la publicación de esta página
queda en el carril editorial de la wiki.

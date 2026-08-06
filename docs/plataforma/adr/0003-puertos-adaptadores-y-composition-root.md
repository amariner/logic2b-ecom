# ADR-0003 — Puertos, adaptadores y composition root

- Estado: **accepted**
- Fecha: 2026-08-06
- Mandato: R1.1

## Contexto

D1 y proveedores aparecen hoy en rutas y helpers. Cambiar un proveedor o probar
un caso de uso requiere conocer detalles de infraestructura.

## Decisión

Los casos de uso definen los puertos mínimos que necesitan; D1, Stripe, Resend,
CSV y Cloudflare son adaptadores. `src/composition/create-platform.ts` será el
único lugar que elija implementaciones y conecte módulos. Las rutas Astro y el
Worker serán adaptadores de entrada delgados y recibirán fachadas ensambladas.

No se crea un repositorio genérico ni un bus universal: cada puerto expresa una
necesidad de negocio concreta. R1.1 solo fija el contrato; no implementa
interfaces vacías.

## Alternativas consideradas

- Service locator global: rechazado por dependencias ocultas.
- Instanciar SDKs en cada endpoint: rechazado por duplicación y filtración.
- Abstracción de CRUD genérica: rechazada; pierde invariantes del agregado.

## Consecuencias

Los tests de aplicación usarán fakes de puertos y los contract tests validarán
adaptadores. El composition root conoce más detalles, deliberadamente.

## Invariantes

- Adaptadores dependen de puertos; puertos no dependen de adaptadores.
- Secrets solo llegan al adaptador que los necesita y nunca se guardan en D1.
- Los endpoints no importan SDKs externos ni SQL nuevo.
- Un adaptador desconectado no cambia reglas de negocio.

## Deuda conocida

Stripe se tipa en el webhook, Resend usa `fetch` en `send-email.ts` y hay SQL en
13 entradas de presentación. Salida exacta en `arquitectura/DEUDA.md`.

## Señal de revisión

Revisar si dos adaptadores reales no pueden implementar un puerto sin
condicionales de proveedor en el dominio, o si la creación por petición produce
un coste medido inaceptable.

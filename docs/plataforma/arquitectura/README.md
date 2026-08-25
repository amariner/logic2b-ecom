# Arquitectura modular comprobable

> Fuente de verdad arquitectónica desde R1.1, consolidada al cierre de R1.12 el
> **2026-08-07**. Fija las fronteras que los bloques siguientes deben respetar. No describe
> como migradas las capas que aún siguen planas.

## 1. Tres lecturas que no deben mezclarse

- **Actual**: estructura e imports que existen hoy y que `pnpm check` ejecuta.
- **Deuda aceptada**: incumplimiento localizado en
  [`DEUDA.md`](DEUDA.md), con propietario y bloque de salida. No constituye un
  precedente para código nuevo.
- **Objetivo**: módulos y dirección de dependencias aprobados para la transición
  incremental. Crear carpetas vacías no acerca el código a este objetivo.

## 2. Inventario actual

### Entradas y composición efectiva

| Superficie | Entrada actual | Responsabilidad real |
|---|---|---|
| Worker HTTP | `src/worker.ts#createExports.default.fetch` | Construye `App` de Astro y delega al handler Cloudflare. |
| Cron | `src/worker.ts#createExports.default.scheduled` | Cada 6 h y solo con `DEMO_MODE=true`, ejecuta el seed sobre D1. |
| Middleware | `src/middleware.ts#onRequest` | Corte por capacidad, rate limit en memoria por isolate y auth del admin demo. |
| Páginas servidor | Rutas genéricas/dinámicas y panel bajo `src/pages/demo/` con `prerender=false` | Escaparates desde fixtures locales; panel desde D1 de fixtures. Algunas envolturas fijas de NODDO, Sitēga y STRETCH se prerenderizan porque solo componen la simulación local. |
| API pública | `cart/quote`, `checkout/session`, `contact`, `webhooks/stripe` | Runtime clonable real, aunque los escaparates públicos no lo consumen. |
| API admin | `backup`, pedido, producto, tarifa y export CSV | Operación D1 detrás del middleware. En demo la UI de edición está deshabilitada. |
| API retirada | `POST /api/demo/reset` | Responde 410; solo el cron interno restaura fixtures. |
| Sitemap | `src/pages/sitemap.xml.ts` | Endpoint estático de presentación pública. |

R1.3 conecta el composition root mediante `runtimePlatform`: middleware,
navegación, páginas, endpoints y acciones consultan una política común. R1.4
añade el registro canónico de módulos y absorbe navegación/rutas; los registros
de adaptadores e infraestructura siguen reservados a sus bloques.

### `src/lib/` por responsabilidad actual

| Grupo actual | Archivos | Observación |
|---|---|---|
| Seguridad/plataforma | `admin-auth`, `rate-limit`, `backup` | Web Crypto y D1 aparecen en helpers planos. |
| Catálogo/demo | `db`, `demo-catalog` | `db` es fachada compatible sobre el repositorio producto-variante R2.3; `demo-catalog` recibe fixtures por contrato y composición, sin importar `seed/`. |
| Presentación storefront | `demo-themes`, `theme-catalog`, `nav`, `not-found`, `storefront-contract` | Registro de temas, descubrimiento del catálogo y detalles HTTP viven junto al dominio. |
| Carrito/demo | `cart-client`, `demo-commerce` | Simulación pública local, deliberadamente separada del runtime D1. |
| Precio/quote/envío | `pricing`, `shipping`, `quote` | La aritmética es pura; `quote` obtiene producto y tarifa directamente de D1. |
| Pago/pedido | `stripe`, `payment-mode`, `orders`, `order-transitions`, `thanks` | `orders` conserva numeración y espejos legacy; intención, captura e idempotencia viven en `modules/payments/` y se componen con pedido/inventario en una batch. |
| Notificaciones | `emails`, `send-email`, `contact` | Plantillas, outbox D1 y llamada HTTP a Resend están próximos pero sin puerto. |
| Compartido | `format`, `csv` | `format` depende de `shop.config.ts`; no es todavía un shared-kernel puro. |

### D1 y SQL embebido

El binding entra por casos de uso/adaptadores en todas las superficies HTTP; el
cron usa `env.DB`. Desde R1.5 **no queda SQL en `src/pages/`**. Sigue habiendo
SQL fuera de una carpeta `infrastructure/` en helpers planos que actúan como
adaptadores: `db.ts` solo para tarifas/referencias legacy, `quote.ts`,
`send-email.ts`, `thanks.ts` y `backup.ts`;
y en la composición de la demo, donde `src/worker.ts` ejecuta sentencias
producidas por `seed/seed.ts`.

La regla `presentation-sql` es una allowlist ejecutable y ya está vacía: una
aparición nueva rompe el test arquitectónico.

### Flujo y dependencias reales

```text
escaparate público
  componentes store -> composition/demo-catalog -> demo-catalog(contrato puro)
                                          -> seed inmutable (adaptador)
                    -> demo-commerce -> cart-client/localStorage/sessionStorage
                    -X-> APIs reales / D1 / Stripe / Resend

runtime clonable (desde R2.3, sin SQL en presentación)
  POST cart/quote -> quote -> catalog reader (legacy|shadow|variant)
                           -> pricing + shipping
  POST checkout/session -> quote -> order-operations.placeOrder
                        -> stripe o pago simulado
                        -> order-operations.confirmPayment
  POST webhooks/stripe -> stripe(evento normalizado)
                       -> order-operations.confirmPayment / expirePayment
  PATCH admin/order -> order-transitions -> order-operations.applyPanelTransition

  order-operations (composition root)
    orders.domain           emite el hecho con sobre
    payments.infrastructure intención + asiento + estado financiero
    notifications           consume el hecho -> mensajes
    orders.infrastructure   UNA batch: pedido + pago + evento + timeline + stock + entregas
  event-outbox -> dispatcher -> emails_outbox -> send-email -> HTTP Resend

  mutación efectiva -> audit_log (misma batch; diff allowlisted/redacted)
  tráfico demo/lecturas/rechazos -X-> audit_log

  trabajo legítimo -> observability JSON -> Workers Logs existente
  demo/payload o firma inválida/cron vacío -X-> observability

  env secrets -> presencia booleana -> integration registry
             -X-> D1 / HTTP / logs / snapshots
  Stripe + Resend + CSV -> healthchecks propietarios y evidencia segura opcional
```

El precio se revalida en D1, el cliente no envía importes, el stock se descuenta
tras pago, el `UPDATE` guardado protege la idempotencia y Stripe aloja la
tarjeta. R1.1 no altera ninguno de esos contratos.

### Demo, motor, colecciones y temas

- `src/components/store/*Page.astro` es la presentación compartida.
- `src/lib/demo-catalog.ts` materializa fixtures recibidos por contrato;
  `src/composition/demo-catalog.ts` conecta `seed/` como adaptador. La compra
  pública se simula localmente en `demo-commerce.ts`.
- `src/collections/*.ts` contiene identidad, copy, categorías y tema de cada
  escaparate; tres colecciones conservan componentes/rutas excepcionales.
- `src/components/themes/<id>/` solo debe cambiar presentación y usar hooks del
  contrato storefront.
- `src/collections/index.ts`, `CatalogPage.astro`, `demo-themes.ts` y
  `seed/collections/index.ts` son registros de escaparates/temas, no módulos de
  plataforma. Se mantienen separados hasta que un bloque de storefront modele
  su contrato sin confundir catálogo visual con el registro R1.4.
- El panel público lee D1 de fixtures, pero sus controles quedan `disabled`
  cuando `DEMO_MODE=true`; las APIs operativas siguen formando parte del motor
  clonable, no del recorrido público.

### Configuración, datos y verificación

- `platform.config.ts`: manifest tipado de este despliegue; hoy usa el preset
  técnico `minimal` de demo y no contiene valores secretos.
- `src/platform/configuration/`: IDs, estados, flags, dependencias, config,
  presets, registro de módulos y validación fail-fast materializados en R1.2–R1.4.
- `shop.config.ts`: configuración legacy compartida de la tienda; aún la
  importan presentación, plantillas, precios/envío y numeración.
- `wrangler.jsonc` y `src/env.d.ts`: bindings, variables y secretos esperados.
- `migrations/0001..0007`: esquema versionado del repo/local; producción sigue
  en `0001..0006` hasta su puerta coordinada. El tráfico público demo no escribe
  comercio; solo el Cron Trigger interno registra su reset.
- `src/platform/operations/`: audit log D1 y observabilidad JSON R1.9; el logger
  no importa D1, no acepta campos arbitrarios y no publica superficie HTTP.
- `src/integrations/registry.ts`: registro R1.10 de los tres adaptadores reales;
  enlaza capacidad/módulo/healthcheck y resuelve snapshots sin strings secretos.
- `seed/`: catálogo, colecciones, pedidos demo y SQL reproducible.
- `tests/`: el contrato estático de R1.1 y las pruebas del manifest de R1.2 se
  ejecutan con Vitest sin librerías nuevas.
- `scripts/`: bootstrap, E2E, auditorías, capturas y scaffold de temas.

### Acoplamientos y ciclos

No hay ciclos en los imports estáticos locales bajo `src/` en la línea base.
R1.12 deja la allowlist en **cero excepciones**: no hay import runtime→seed
fuera de composición, dependencia del shared-kernel hacia configuración, SQL
en presentación ni SDK externo fuera de adaptadores. Catálogo, stock, precio,
datos de pago y fulfillment aún comparten físicamente tablas/filas; es deuda de
propiedad para R2, no una excepción a la dirección de imports.

El cierre y la línea base histórica viven en [`DEUDA.md`](DEUDA.md) y
`tests/architecture-allowlist.ts`. No se permiten comodines ni nuevas claves.

## 3. Mapa objetivo

### Árbol lógico

```text
src/
  composition/create-platform.ts
  platform/
    configuration/
    security/
    operations/
  modules/
    catalog/ pricing/ inventory/ cart/ checkout/ payments/ orders/
    fulfillment/ customers/ notifications/ storefront/ marketing/
  integrations/
    stripe/ resend/ logistics-csv/ cloudflare-d1/
  shared-kernel/
```

Cada módulo crea únicamente las capas que usa:

```text
presentation -> application -> domain
infrastructure -> ports definidos por application/domain
composition root -> módulos + adaptadores
domain -X-> Astro, D1, Stripe, Resend, Cloudflare o HTTP
```

Un módulo importa otro solo por su `index.ts` público. Nunca importa
`infrastructure/` o `presentation/` ajenas. Los adaptadores pueden implementar
puertos públicos; el composition root es el único lugar autorizado a elegir
implementaciones concretas.

### Propiedad y API pública

| Módulo | Responsabilidad y datos poseídos | API pública objetivo | Dependencias permitidas |
|---|---|---|---|
| `platform/configuration` | Config validada por despliegue y, desde R1.2, manifest. Sin datos operativos. | `validateCapabilityManifest`, `resolveCapabilityManifest`, presets y tipos publicados. | `shared-kernel`. |
| `catalog` | Producto editorial, variante vendible, opciones y publicación; disponibilidad lee el balance de la variante. | agregado/lector canónicos, rollout `legacy|shadow|variant`, consultas de producto/catálogo y comandos administrativos. | `shared-kernel`, configuración publicada. |
| `pricing` | Dinero base, reglas y desglose. Hoy: `price_cents`; no posee UI de precio anterior. | `PriceQuote`, `calculatePrice`, políticas puras. | `shared-kernel`, tipos públicos de catálogo. |
| `inventory` | Balances versionados y movimientos append-only por variante; `products.stock` es espejo temporal del default. | plan de movimiento, disponibilidad y unidad D1 guardada por evento/auditoría. | `shared-kernel`, identificadores de catálogo. |
| `cart` | Líneas y cantidades, nunca precio autoritativo. Estado invitado puede estar en cliente. | `CartDraft`, normalización y validación de cantidades. | `shared-kernel`, IDs públicos de catálogo. |
| `checkout` | Orquesta cotización y creación del intento de compra; no implementa PSP ni SQL. | `quoteCheckout`, `startCheckout`; puertos hacia pago/pedido. | APIs públicas de cart, catalog, pricing, inventory, fulfillment, customers, payments y orders. |
| `payments` | Intención, transacción financiera e idempotencia del proveedor; posee `payments`, `payment_transactions`, `refunds` y `refund_items`. `orders.stripe_*` continúa como espejo temporal. | Plan de captura, unidad D1 guardada por evento y futuro `PaymentGateway`; el workflow de reembolso llega en R2.10. | `shared-kernel`; adaptadores de PSP en `integrations`. |
| `orders` | Pedido, snapshots, estados y timeline. Posee `orders`, `order_items`, `order_events`. | crear/consultar/transicionar pedido; contratos de eventos desde R1.5. | `shared-kernel`, snapshots públicos; no notificaciones concretas. |
| `fulfillment` | Posee tarifas y el ledger de grupos/asignaciones por línea; tracking y estado global se proyectan al pedido. | cotización, balances pendientes, creación idempotente de envíos parciales/totales, entrega por grupo y exportación logística. | `shared-kernel`, contratos públicos de order/inventory. |
| `customers` | Identidad invitada, dirección y, en el futuro, perfil/consentimiento. Hoy no tiene tabla propia. | validación/normalización y `CustomerSnapshot`. | `shared-kernel`. |
| `notifications` | Mensaje transaccional, plantilla, cola y política de entrega. Posee `emails_outbox`. | `NotificationPort`, `enqueue`, plantillas sobre DTOs propios. | `shared-kernel`, configuración publicada; recibe eventos/DTO, no importa infraestructura de negocio. |
| `integrations` | Adaptadores Stripe, Resend, CSV y futuros proveedores; health/disconnect después. No decide negocio. | implementaciones de puertos y metadatos de adaptador. | puertos públicos de módulos, SDKs externos. |
| `storefront` | Presentación compartida, temas y contrato de demo aislada. No posee dinero/stock/pedido real. | view models, registro de presentaciones y contrato de demo. | APIs de lectura públicas + configuración. |
| `marketing` | Captación y consentimiento futuro. Hoy: solicitud de proyecto. | `submitLead` y puertos de notificación/almacenamiento. | customers/notifications por API pública. |
| `shared-kernel` | Desde R1.5: sobre de evento, actor/entidad, reloj y fuente de ids como puertos. Pendientes `MoneyCents`, IDs opacos y resultado/error base. | `EventEnvelope`, `createEventFactory`, `validateEventEnvelope`, `causedBy`; primitivas sin configuración ni I/O. | Ninguna. |

La propiedad es lógica antes que física: hasta las migraciones de R2, otros
módulos pueden leer una tabla mediante el puerto del propietario, nunca mediante
SQL nuevo. R1.1 no cambia el esquema.

### Dirección entre módulos

Las dependencias de aplicación autorizadas son acíclicas:

```text
checkout -> cart, catalog, pricing, inventory, fulfillment,
            customers, payments, orders
fulfillment -> orders, inventory
marketing -> customers, notifications
storefront -> catalog, cart, checkout, orders, platform/configuration
catalog/pricing/inventory/cart/payments/orders/customers/notifications
  -> shared-kernel (+ configuration cuando sea configuración publicada)
integrations -> puertos públicos; composition conecta adaptadores
```

`orders -X-> notifications`, `payments -X-> orders` e
`inventory -X-> checkout`: la coordinación pertenece a `checkout`/casos de uso
o, desde R1.5, a consumidores de eventos. No se implementan esos eventos en R1.1.

## 4. Composition root

R1.2 materializa `src/composition/create-platform.ts` como función pura. Recibe
el manifest tipado, lo valida y devuelve consultas de capacidad/estado/flags.
R1.3 conecta rutas, navegación y adaptadores Astro a esa fachada mediante
`runtimePlatform`.

R1.4 incorpora `module-registry.ts`: cada capacidad tiene un módulo propietario
y cada descriptor declara dependencias y superficies conocidas. El composition
root selecciona solo módulos operativos y falla si falta una dependencia. No
elige infraestructura, no lee secretos ni inventa adaptadores.

R1.5 añade `event-context.ts` (reloj y fuente de ids reales) y
`order-operations.ts`, el primer caso de uso compuesto: junta el hecho que emite
`orders` con el consumidor de `notifications` y confirma ambos efectos en una
única batch. Es el único punto que conoce los dos módulos a la vez. R1.10 enlaza
los healthchecks de Stripe, Resend y CSV. R1.11 incorpora el registro de jobs:
el refresco semanal de pedidos ficticios es mantenimiento interno de demo y el barrido del outbox
exige `AUT-002.jobs` en un despliegue cliente.
R1.12 añade `demo-catalog.ts` como composición explícita de los fixtures y
deja la allowlist arquitectónica vacía; la guía
[`CREAR_MODULO_Y_JOB.md`](../CREAR_MODULO_Y_JOB.md) fija cómo extender estas
primitivas sin reabrir dependencias invertidas.

## 5. Transición incremental

| Bloque | Movimiento autorizado | Lo que permanece temporalmente |
|---|---|---|
| R1.2 ✅ | Configuración/manifest tipados, presets y `create-platform` puros, sin UI. | Rutas, SQL, tablas, demo y registros de temas siguen iguales. |
| R1.3 ✅ | Rutas/nav consultan capacidades; SQL tocado pasa a casos de uso/adaptadores. | Mutación de pago y outbox conservan contrato y tablas. |
| R1.4 ✅ | Descriptor/registro único de 16 módulos; composition root resuelve módulos operativos y el validador rechaza duplicados/ciclos. Navegación y rutas se derivan del registro. | Seeds, temas, adaptadores y contratos futuros no se mueven ni se inventan. |
| R1.5 ✅ | Sobre versionado en `shared-kernel`; los cinco hechos de pedido lo emiten y el timeline pasa a ser su proyección; notificaciones consume eventos sin depender de pedidos; el webhook recibe un evento normalizado y las tres rutas de escritura pasan a casos de uso compuestos. | El stock lo sigue escribiendo el adaptador de pedidos hasta R2.7. |
| R1.6–R1.7 ✅ | ADR/esquema aprobados; mutación, evento y entregas atómicos; dispatcher con lease, retry, dead-letter, replay interno y retención. | El barrido de 5 min queda conectado al runner canónico en R1.11. |
| R1.8–R1.9 ✅ | Audit log transaccional redactado y señales JSON tipadas para checkout/webhook/outbox/email; demo y tráfico inválido no generan filas ni logs operativos. | Alertas/SLO quedan en R11.5; consulta operativa solo por control plane autorizado. |
| R1.10 ✅ | Registro inmutable de Stripe, Resend y CSV; health local, config allowlisted, última sync/error seguros y credenciales reducidas a presencia. | Panel, replay/desconexión y sondeos remotos de permisos/latencia quedan para R9. |
| R1.11 ✅ | Registro de jobs por módulo; ejecución única/recurrente con D1 lock, timeout, retry/dead-letter, replay y retención; los dos crons existentes usan el runner. | No hay panel ni endpoint de operación; la extensión queda documentada en la guía R1.12. |
| R1.12 ✅ | Allowlist vacía, composición explícita de fixtures, formateo puro, matriz de presets/clones, guía de módulo/job y auditoría de dependencias. | Solo deuda de propiedad física o cambios de esquema reservados a R2+. |

No hay big-bang: cada caso de uso conserva tests y contrato HTTP mientras se
mueve verticalmente (puerto, adaptador, fachada y presentación). La demo local
mantiene su `COMMERCE_ENGINE`; clonabilidad se prueba con presets/config sin
secretos; las colecciones y temas no importan módulos de escritura.

## 6. Medición

En cada consolidación se registran cuatro números obtenidos por el test:

1. excepciones en allowlist (solo puede bajar desde la línea base R1.1);
2. archivos de ruta/página con SQL (no puede subir);
3. ciclos estáticos locales (debe permanecer en cero);
4. imports de SDK/plataforma fuera de adaptadores/composición (no puede subir).

Resultado R1.12: **0 excepciones · 0 archivos de presentación con SQL · 0
ciclos · 0 imports restringidos fuera de adaptadores/composición**.

Una reducción de carpetas o más interfaces no cuenta como mejora si esos cuatro
indicadores y los tests funcionales no mejoran.

## 7. Decisiones

- [`ADR-0001`](../adr/0001-monolito-modular-y-aislamiento.md)
- [`ADR-0002`](../adr/0002-limites-y-direccion-de-dependencias.md)
- [`ADR-0003`](../adr/0003-puertos-adaptadores-y-composition-root.md)
- [`ADR-0004`](../adr/0004-ciclo-de-vida-de-capacidades.md)
- [`ADR-0005`](../adr/0005-transicion-incremental.md)
- [`ADR-0006`](../adr/0006-sobre-de-eventos.md)
- [`ADR-0007`](../adr/0007-outbox-transaccional-d1.md)
- [`ADR-0008`](../adr/0008-audit-log-seguro-d1.md)
- [`ADR-0009`](../adr/0009-observabilidad-segura-workers-logs.md)
- [`ADR-0010`](../adr/0010-registro-integraciones-seguro.md)
- [`ADR-0011`](../adr/0011-jobs-duraderos-d1.md)

## 8. Trazabilidad decisión → evidencia

| Decisión/regla | Check o deuda explícita |
|---|---|
| Monolito y aislamiento por despliegue | ADR-0001 + `platform.config.ts`; manifest/config independiente y validado sin crear infraestructura compartida. |
| `presentation -> application -> domain` | `layer-direction`, `domain-technology-import` y `domain-platform-global`. |
| Grafo entre módulos y API pública | `module-dependency`, `module-private-import` y clasificación obligatoria de todo `src/lib/*.ts`. |
| Puertos/adaptadores; SDK/SQL fuera de presentación | `restricted-sdk-import` y `presentation-sql`; allowlist reducida de 18 a 9 en R1.3, a 7 en R1.4, a 2 en R1.5 y a **0** en R1.12. |
| Sobre de evento versionado y sin PII | ADR-0006 + `tests/event-envelope.test.ts` y `tests/order-events.test.ts`: correlación/causación, clave de idempotencia estable, fallo temprano, proyección del timeline idéntica y consumidor de notificaciones desacoplado. |
| Emisor único por evento y suscripción declarada | `module-registry.ts` + `tests/order-events.test.ts`: prefijo del módulo, sin duplicados, y suscripción a un hecho inexistente rechazada al arrancar. |
| Lifecycle de seis estados | ADR-0004 + `tests/capability-manifest.test.ts`: seis estados, flags, degradación, dependencias y fallo temprano ejecutables. |
| Registro y composición de módulos | `module-registry.ts` + `tests/module-registry.test.ts`: propietario único por capacidad, semver, dependencias/ciclos, superficies y presets operativos. |
| Observabilidad sin PII ni amplificación | ADR-0009 + tests de observabilidad: contrato cerrado, checkout/webhook reales, demo y firma inválida antes de D1/logger, y ausencia de endpoint/exportador. |
| Integraciones registradas sin secretos | ADR-0010 + `tests/integration-registry.test.ts`: tres adaptadores reales, propietarios/healthchecks únicos, configuración incompleta degradada y serialización sin credenciales. |
| Jobs duraderos por capacidad | ADR-0011 + tests de registro/runtime: propietario, manifest, mismo tick, claim concurrente, lease, timeout, retry/dead-letter y replay. |
| Clonabilidad por preset | `tests/platform-consolidation.test.ts`: dos deployment ids por preset, composición estable, demo sin jobs comerciales y fallo temprano. |
| Transición sin big-bang | allowlist vacía pero sellada a la línea base R1.1, cero ciclos y `pnpm check`; contratos HTTP/runtime conservados. |

Las reglas aún no comprobables porque su artefacto no existe (publicación de
configuración y sondeos remotos de health) tienen bloque de salida explícito;
no se presentan como garantías ya implementadas.

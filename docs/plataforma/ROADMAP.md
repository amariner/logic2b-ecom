# Roadmap de plataforma — paridad de capacidad

> Orden canónico posterior al MVP. Cada bloque está dimensionado para **una
> sesión** y debe cerrarse por completo antes de avanzar. Fecha base: 2026-08-06.

## 1. Objetivo y límites

El objetivo es que Logic2B pueda resolver proyectos desde un catálogo pequeño
hasta operaciones complejas sin migrar de motor, manteniendo un panel mínimo por
cliente. No se busca fabricar todos los servicios del ecosistema: banca,
hardware, red publicitaria y logística física se integran o se excluyen.

Arquitectura objetivo: **monolito modular, despliegue aislado por cliente,
capability manifest, eventos/outbox y adaptadores**. No se introducen
microservicios, multi-tenancy central ni dependencias por moda.

## 2. Definición de terminado para toda sesión

Un bloque solo pasa a `cerrado` cuando:

1. el alcance de la fila está implementado; no se deja medio contrato;
2. tipos y validación fijan sus invariantes;
3. dinero/stock/estados incluyen pruebas de concurrencia e idempotencia;
4. `pnpm check` está verde;
5. E2E, accesibilidad, Lighthouse o prueba de carga se ejecutan si aplica;
6. la matriz cambia al estado real, nunca al deseado;
7. se crea o actualiza la ficha de wiki, como borrador si aún no es publicable;
8. este roadmap registra fecha, resumen y siguiente bloque;
9. no añade navegación ni configuración a clientes con el módulo desactivado;
10. el repositorio queda integrado según el protocolo de `docs/CONTINUAR.md`.

Las migraciones, dependencias, servicios con coste, superficie PCI o cambios de
promesa siguen siendo puertas de decisión. El diseño se prepara antes; no se
improvisan durante la implementación.

## 3. Estado global

| Ola | Resultado | Estado |
|---|---|---|
| R0 | Investigación, taxonomía, matriz, roadmap y estrategia wiki | ✅ cerrado 2026-08-06 |
| R1 | Cimientos modulares y observables | ✅ cerrado 2026-08-07 |
| R2 | Núcleo transaccional profesional | ✅ R2.1–R2.14 y Admin V2 cerrados 2026-08-12 |
| R3 | Operación de pedidos, inventario y fulfillment | ✅ cerrado 2026-08-14 |
| R4 | Precios, promociones y modelos de venta | ⬜ |
| R5 | Clientes, privacidad y mercados | ⬜ |
| R6 | B2B | ⬜ |
| R7 | Marketing, analítica y automatización | ⬜ |
| R8 | Storefront componible, búsqueda y contenido | ⬜ |
| R9 | Integraciones y omnicanalidad | ⬜ |
| R10 | IA y comercio agéntico | ⬜ |
| R11 | Escala, seguridad y madurez continua | ⬜ |

## R0 — Estrategia y fuentes — ✅ cerrado

| Bloque | Entrega | Estado |
|---|---|---|
| R0.1 | Auditar repositorio, decisiones vigentes y backend real. | ✅ 2026-08-06 |
| R0.2 | Extraer las nueve ediciones con script reproducible. | ✅ 2026-08-06 |
| R0.3 | Normalizar lanzamientos en 18 dominios y cinco vías de entrega. | ✅ 2026-08-06 |
| R0.4 | Crear matriz con IDs, estado, prioridad y resultado objetivo. | ✅ 2026-08-06 |
| R0.5 | Definir arquitectura y backlog wiki SEO sin marca del benchmark. | ✅ 2026-08-06 |

## R1 — Cimientos modulares y observables

R1 no añade funciones comerciales visibles. Evita que las siguientes olas
conviertan el motor en una colección de condicionales.

| Orden | Bloque de una sesión | Entregables y criterio específico | Estado |
|---:|---|---|---|
| 1 | **R1.1 ADR de arquitectura modular** | Mapear dependencias actuales; definir dominios, capas, puertos/adaptadores, reglas de importación, lifecycle de módulos y esquema objetivo sin migrar D1. ADR aprobado por tests arquitectónicos propuestos. | ✅ 2026-08-06 |
| 2 | **R1.2 Capability manifest tipado** | Manifest por cliente con flags, config y dependencias; validación de combinaciones; fixtures `minimal`, `standard`, `advanced`; sin UI todavía. | ✅ 2026-08-06 |
| 3 | **R1.3 Navegación y rutas por capacidad** | Panel y endpoints consultan el manifest; módulo apagado responde 404/403 coherente y desaparece de navegación; tests por preset. | ✅ 2026-08-06 |
| 4 | **R1.4 Registro de módulos** | Descriptor estable: id, versión, dependencias, permisos, eventos, jobs, healthchecks y enlaces wiki; detector de ciclos. | ✅ 2026-08-06 |
| 5 | **R1.5 Sobre de eventos** | Contrato `event_id`, tipo, versión, timestamp, actor, entity, correlation/causation/idempotency; eventos actuales de pedido adaptados sin cambiar comportamiento. | ✅ 2026-08-06 |
| 6 | **R1.6 Diseño y aprobación de outbox** | ADR, SQL exacto, retención, claim/retry/dead-letter y compatibilidad D1; pruebas contractuales antes de migrar. Puerta de decisión de esquema. | ✅ 2026-08-06 |
| 7 | **R1.7 Outbox transaccional** | Migración aprobada, escritura atómica en mutaciones de pago/pedido y dispatcher idempotente; fallo del consumidor no revierte el negocio. | ✅ 2026-08-06 |
| 8 | **R1.8 Audit log transversal** | Actor, acción, entidad, diff redacted y correlation id; pagos, pedidos, producto y admin cubiertos; sin export HTTP por decisión de seguridad. | ✅ 2026-08-07 |
| 9 | **R1.9 Observabilidad base** | Logger estructurado, errores tipados, métricas de checkout/webhook/outbox/email e IDs visibles en runbook; sin PII. | ✅ 2026-08-07 |
| 10 | **R1.10 Registro de integraciones** | Estado/config no secreta/health/última sync/error; secretos fuera de D1; adaptadores actuales registrados. | ✅ 2026-08-07 |
| 11 | **R1.11 Contrato de jobs** | Ejecución única/recurrente, lock, timeout, reintento y replay; cron de demo migra sin regresión. | ✅ 2026-08-07 |
| 12 | **R1.12 Consolidación R1** | Tests de presets, fallos, concurrencia y clonabilidad; docs de crear módulo; ficha wiki de arquitectura; auditoría de dependencias. | ✅ 2026-08-07 |

## R2 — Núcleo transaccional profesional

Esta ola cambia las primitivas de dinero, producto, inventario y fulfillment.
Cada migración se diseña y ensaya sobre una copia antes de tocar el esquema vivo.

| Orden | Bloque de una sesión | Entregables y criterio específico | Estado |
|---:|---|---|---|
| 13 | **R2.1 Modelo objetivo y plan de migración** | ERD/ADR para producto-variante, inventario, pago, fulfillment y reembolso; compatibilidad con seeds y export; cero código de escritura. | ✅ 2026-08-07 |
| 14 | **R2.2 Producto-variante: esquema** | Migración aditiva, backfill 1:1, constraints/índices y restore rehearsal; producto simple sigue idéntico. | ✅ 2026-08-08 |
| 15 | **R2.3 Producto-variante: dominio y lectura** | Repositorio y tipos canónicos; storefront y quote leen variante; guardarraíl prohíbe precio desde cliente. | ✅ 2026-08-08 |
| 16 | **R2.4 Producto-variante: admin y seed** | CRUD de opciones/variantes/SKU/estado con validación; import/export y seed actual migrados. | ✅ 2026-08-08 |
| 17 | **R2.5 Media y atributos tipados** | Galería, alt/foco/orden/asociación a variante; atributos con definición, valor y validación. | ✅ 2026-08-10 |
| 18 | **R2.6 Ledger de inventario: diseño** | Movimientos, balance, razones, reservas y concurrencia; invariantes y SQL propuesto. | ✅ 2026-08-10 |
| 19 | **R2.7 Ledger de inventario: implementación** | Migración, backfill del stock, escrituras append-only y proyección de disponible; doble webhook no duplica movimiento. | ✅ 2026-08-10 |
| 20 | **R2.8 Reservas y expiración** | Reserva opcional por carrito/checkout, TTL, liberación, captura y carrera última unidad; feature apagada por defecto. | ✅ 2026-08-10 |
| 21 | **R2.9 Ledger de pagos** | Payment/transaction/refund con proveedor, moneda, importe, status e idempotencia; pedido no usa un único string como contabilidad. | ✅ 2026-08-11 |
| 22 | **R2.10 Reembolso total** | Acción admin → proveedor → ledger → evento → email → stock según política; retry seguro y estado visible. | ✅ 2026-08-11 |
| 23 | **R2.11 Fulfillment por líneas** | Fulfillment y fulfillment_items; envío total actual se convierte en un caso simple. | ✅ 2026-08-11 |
| 24 | **R2.12 Fulfillment parcial** | Cantidades parciales, múltiples trackings, email por envío y estados derivados sin perder histórico. | ✅ 2026-08-11 |
| 25 | **R2.13 Cancelación/reembolso parcial** | Selección por cantidad, cálculo servidor, descuento/restitución correcta y pruebas de redondeo/concurrencia. | ✅ 2026-08-12 |
| 26 | **R2.14 Consolidación R2** | E2E producto con variantes → reserva → pago → dos envíos → reembolso parcial; carga/concurrencia; guía de migración. | ✅ 2026-08-12 |

## R3 — Operación profesional

| Orden | Bloque de una sesión | Entregables y criterio específico | Estado |
|---:|---|---|---|
| 27 | **R3.1 Índice de pedidos escalable** | Cursor, búsqueda, filtros combinables, sort estable y límites; URL compartible y consulta indexada. | ✅ 2026-08-12 |
| 28 | **R3.2 Notas, etiquetas y timeline** | Visibilidad interna/cliente, actor, edición auditada y filtros. | ✅ 2026-08-12 |
| 29 | **R3.3 Edición de pedido** | Añadir/quitar/cantidad/dirección con preview de delta, pago adicional o reembolso y stock. | ✅ 2026-08-12 |
| 30 | **R3.4 Holds e incidencias** | Bloqueo manual/automático, motivo, responsable, SLA y desbloqueo; preparación no avanza en hold. | ✅ 2026-08-13 |
| 31 | **R3.5 Acciones masivas** | Selección estable, dry-run, job, progreso, resultados por fila y replay seguro. | ✅ 2026-08-14 |
| 32 | **R3.6 Ubicaciones** | Modelo y admin de almacenes/tiendas; inventario simple se backfillea a ubicación principal. | ✅ 2026-08-14; D1 aplicada, Worker pendiente |
| 33 | **R3.7 Transferencias** | Borrador→enviado→recibido parcial, discrepancias y movimientos de ledger. | ✅ 2026-08-14; local, sin deploy |
| 34 | **R3.8 Conteos y ajustes** | Conteo por ubicación, razón, doble control opcional y auditoría. | ✅ 2026-08-14; local, sin deploy |
| 35 | **R3.9 Motor de asignación** | Reglas deterministas por stock, prioridad, mercado/canal y coste; explicación guardada. | ✅ 2026-08-14; local, sin deploy |
| 36 | **R3.10 Devoluciones/RMA** | Solicitud, elegibilidad, recepción, inspección, resolución, reembolso/cambio y reposición. | ✅ |
| 37 | **R3.11 Documentos operativos** | Albarán, factura/rectificativa mediante conector o plantilla, etiquetas internas y versionado. | ✅ 2026-08-14; local, sin deploy |
| 38 | **R3.12 Consolidación R3** | E2E multiubicación, fulfillment y devolución; runbooks de incidencias; wiki de operación publicada solo para capacidades reales. | ✅ 2026-08-14; local, sin deploy |

## R4 — Precios, promociones y modelos de venta

| Orden | Bloque de una sesión | Entregables y criterio específico | Estado |
|---:|---|---|---|
| 39 | **R4.1 Motor de reglas de precio** | Contexto, prioridad, vigencia y desglose; funciones puras y trazables. | ✅ 2026-08-14; local, sin deploy |
| 40 | **R4.2 Códigos promocionales** | Límites, scopes, uso, seguridad y devolución proporcional. | ✅ 2026-08-14; local, sin deploy |
| 41 | **R4.3 Descuentos automáticos** | Elegibilidad y motivo visible; conflicto con códigos resuelto por matriz. | ✅ 2026-08-14; local, sin deploy |
| 42 | **R4.4 Cantidad y compra X/Y** | Tramos, múltiplos, selección de líneas y casos de edición/devolución. | ✅ 2026-08-14; local, sin deploy |
| 43 | **R4.5 Combinabilidad** | Clases producto/pedido/envío, tope, prioridad y explicación en checkout/pedido. | ✅ 2026-08-14; local, sin deploy |
| 44 | **R4.6 Listas de precios** | Precio por mercado/canal/empresa con fallback y snapshot de origen. | ✅ 2026-08-14; local, sin deploy |
| 45 | **R4.7 Bundles** | Fijo y componible, stock de componentes, fulfillment y devolución. | ✅ 2026-08-14; local, sin deploy |
| 46 | **R4.8 Tarjeta regalo/crédito** | Ledger, emisión, uso parcial, saldo y reembolso; revisión legal por proyecto. | ✅ 2026-08-17; desplegado con `0032` |
| 47 | **R4.9 Preventa/backorder** | Promesa, asignación, cobro y comunicación. | ✅ 2026-08-17; local, `0033` pendiente de rollout |
| 48 | **R4.10 Suscripciones por adaptador** | Contrato proveedor, eventos, cambio/pausa/cancelación, impago y portal. | ✅ 2026-08-17; local, `0034` pendiente de rollout; capacidad instalada |
| 49 | **R4.11 Presupuestos y depósitos** | Draft order, caducidad, aprobación, enlace de pago y saldo. | 🟡 dominio/ADR; migración pendiente de autorización |
| 50 | **R4.12 Consolidación R4** | Matriz exhaustiva de reglas, property tests de dinero y wiki de cada modelo. | ⬜ |

El corte conjunto del 2026-08-17 llevó `0020`–`0032` a la D1 demo y publicó el
Worker `76af7637-8fe3-4aae-8c87-6e78d72e72ad`. Se conservó un bookmark de Time
Travel y un backup operativo antes del cambio; los trece rehearsals, FKs, E2E
remoto y smoke de rutas quedaron verdes. El seed remoto se regeneró después de
las migraciones para que el panel de demostración enseñe los fixtures R3/R4.

R4.9 cerró después en local: `0033` y backup 27 pasaron rehearsal/restore,
`pnpm check` cerró 146 suites/680 tests, el E2E local quedó completo y el panel
pasó 8 superficies a11y 1440/375. D1 remota y Worker siguen en el corte `0032`
hasta un rollout autorizado separado.

R4.10 cerró también en local: `PRC-013`, módulo `subscriptions`, adaptador
simulado sin red, eventos/impago/portal, `0034` y backup 28. Rehearsal/restore,
150 suites/691 tests y E2E local quedaron verdes. La capacidad permanece
instalada, no activa; D1 remota y Worker no cambiaron.

R4.11 tiene cerrado el corte previo al gate: ADR-0038, dominio puro versionado,
puertas explícitas de conversión y puerto de enlace alojado, con `ORD-008` y
`CHK-011` instaladas sin superficie. `pnpm check` pasa 151 suites/699 tests. La
migración expand-only `0035`, persistencia, API y operación esperan autorización
expresa; hasta entonces ambas capacidades siguen `especificado`, no disponibles.

## R5 — Clientes, privacidad y mercados

| Orden | Bloque de una sesión | Entregables y criterio específico | Estado |
|---:|---|---|---|
| 51 | **R5.1 Perfil de cliente** | Identidad deduplicable, direcciones y relación con pedidos sin romper guest checkout. | ⬜ |
| 52 | **R5.2 Consentimientos** | Canal, finalidad, versión legal, fuente, región, timestamp y retirada. | ⬜ |
| 53 | **R5.3 Derechos de datos** | Exportar, corregir, anonimizar/borrar con excepciones fiscales y audit log. | ⬜ |
| 54 | **R5.4 Cuentas passwordless** | Login seguro, sesiones, revocación y anti-enumeración; módulo opcional. | ⬜ |
| 55 | **R5.5 Autoservicio** | Pedidos, direcciones y devolución sobre permisos mínimos. | ⬜ |
| 56 | **R5.6 Segmentación** | Lenguaje de filtros limitado, templates y recálculo observable. | ⬜ |
| 57 | **R5.7 Modelo de mercados** | Contexto de país/idioma/moneda/dominio, resolución y fallback. | ⬜ |
| 58 | **R5.8 Traducciones y URLs** | Campos traducibles, flujo editorial, canonical, hreflang y sitemap. | ⬜ |
| 59 | **R5.9 Publicación por mercado** | Producto/variante/canal, preview y explicación. | ⬜ |
| 60 | **R5.10 Impuestos** | Adaptador, snapshots, redondeo, exenciones y validación VAT ID. | ⬜ |
| 61 | **R5.11 Multidivisa y métodos locales** | Presentación, cobro, reembolso y conciliación. | ⬜ |
| 62 | **R5.12 Consolidación R5** | E2E dos mercados, privacidad y cuenta opcional; revisión SEO/legal/seguridad. | ⬜ |

## R6 — B2B

| Orden | Bloque de una sesión | Entregables y criterio específico | Estado |
|---:|---|---|---|
| 63 | **R6.1 Empresas, sedes y contactos** | Modelo, roles y VAT ID. | ⬜ |
| 64 | **R6.2 Catálogos y listas B2B** | Publicación/precio por empresa con fallback. | ⬜ |
| 65 | **R6.3 Reglas de cantidad** | Mínimos, múltiplos y cajas desde catálogo a checkout. | ⬜ |
| 66 | **R6.4 Condiciones de pago** | Neto N, vencimiento, recordatorios y estado. | ⬜ |
| 67 | **R6.5 Crédito y aprobaciones** | Límites por empresa/comprador y workflow humano. | ⬜ |
| 68 | **R6.6 Presupuesto/pedido preliminar** | Solicitud, negociación versionada y conversión a pedido. | ⬜ |
| 69 | **R6.7 PO, factura y conciliación** | Referencia de compra y adaptador contable. | ⬜ |
| 70 | **R6.8 Pedido rápido/repetición** | SKU, CSV, listas y pedido anterior. | ⬜ |
| 71 | **R6.9 Consolidación R6** | E2E dos empresas con reglas distintas; permisos, dinero y wiki B2B. | ⬜ |

## R7 — Marketing, analítica y automatización

| Orden | Bloque de una sesión | Entregables y criterio específico | Estado |
|---:|---|---|---|
| 72 | **R7.1 Contrato de eventos analíticos** | Taxonomía, versión, consentimiento y deduplicación. | ⬜ |
| 73 | **R7.2 Embudo e informes comerciales** | Conversión, ventas, AOV, producto y devoluciones con definiciones visibles. | ⬜ |
| 74 | **R7.3 Analítica operativa** | Preparación, entrega, cancelación, devolución e inventario. | ⬜ |
| 75 | **R7.4 Campañas y atribución** | UTM, costes, modelo y enlaces de descuento. | ⬜ |
| 76 | **R7.5 Feed de catálogo** | Merchant/Meta, validación, incremental, diagnóstico y healthcheck. | ⬜ |
| 77 | **R7.6 Email/CRM adapter** | Contactos, consentimiento, segmentos y eventos normalizados. | ⬜ |
| 78 | **R7.7 WhatsApp/SMS adapter** | Consentimiento, plantillas, opt-out y observabilidad. | ⬜ |
| 79 | **R7.8 Motor de automatizaciones** | Trigger/filtro/acción, reintentos, secrets y dry-run. | ⬜ |
| 80 | **R7.9 Recetas de ciclo de vida** | Bienvenida, abandono, poscompra y reactivación, apagadas por defecto. | ⬜ |
| 81 | **R7.10 Tests y rollouts** | Asignación estable, métrica, guardrails, decisión y rollback. | ⬜ |
| 82 | **R7.11 Consolidación R7** | E2E campaña→pedido→atribución→automatización; privacidad y wiki. | ⬜ |

## R8 — Storefront componible, búsqueda y contenido

| Orden | Bloque de una sesión | Entregables y criterio específico | Estado |
|---:|---|---|---|
| 83 | **R8.1 Contrato de secciones** | Tipos, slots, tokens, datos permitidos y presupuesto de rendimiento. | ⬜ |
| 84 | **R8.2 Renderer y presets** | Composición config-driven con fallback y previews; un tema migra verticalmente. | ⬜ |
| 85 | **R8.3 Migración de temas** | Los temas restantes adoptan secciones sin duplicar negocio. | ⬜ |
| 86 | **R8.4 Contenido estructurado** | Definiciones, entradas, referencias, traducciones y publicación. | ⬜ |
| 87 | **R8.5 Búsqueda escalable** | Índice, cursor, ranking, cero resultados y adaptador externo opcional. | ⬜ |
| 88 | **R8.6 Facetas y merchandising** | Atributos reales, URLs SEO-safe, fijar/impulsar/ocultar. | ⬜ |
| 89 | **R8.7 Recomendaciones** | Reglas editoriales y señales, fallback y medición. | ⬜ |
| 90 | **R8.8 Consolidación R8** | Rendimiento/a11y/SEO en presets y catálogo grande; guía de crear sección. | ⬜ |

## R9 — Integraciones y omnicanalidad

| Orden | Bloque de una sesión | Entregables y criterio específico | Estado |
|---:|---|---|---|
| 91 | **R9.1 SDK interno de adaptadores** | Pull/push, cursor, idempotencia, reconciliación, health y disconnect. | ⬜ |
| 92 | **R9.2 Panel de integraciones** | Estado y errores accionables; nunca secretos ni jerga innecesaria. | ⬜ |
| 93 | **R9.3 Transporte/etiquetas/tracking** | Un proveedor vertical con fallback CSV. | ⬜ |
| 94 | **R9.4 ERP/facturación** | Un proveedor vertical, mapeo y replay. | ⬜ |
| 95 | **R9.5 Marketplace** | Listings, stock, pedidos y devoluciones con reconciliación. | ⬜ |
| 96 | **R9.6 POS** | Elegir proveedor; catálogo/inventario/recogida/devolución; hardware/offline externos. | ⬜ |
| 97 | **R9.7 Portabilidad/importadores** | Dry-run y migración desde fuentes acordadas; informe de discrepancias. | ⬜ |
| 98 | **R9.8 Consolidación R9** | Simulación de caída/replay/reconciliación de cada adaptador y wiki honesta. | ⬜ |

## R10 — IA y comercio agéntico

R10 no empieza hasta que permisos, audit log, action gateway, catálogo
estructurado y observabilidad estén cerrados.

| Orden | Bloque de una sesión | Entregables y criterio específico | Estado |
|---:|---|---|---|
| 99 | **R10.1 Política y threat model de IA** | Datos permitidos, prompt injection, aprobación, logs, coste y retención. | ⬜ |
| 100 | **R10.2 Borradores de contenido** | Producto/email/SEO con fuentes y revisión humana. | ⬜ |
| 101 | **R10.3 Consultas analíticas** | NL→consulta permitida; definición, SQL/plan seguro y resultado trazable. | ⬜ |
| 102 | **R10.4 Action gateway** | Herramientas tipadas, scopes, dry-run, confirmación e idempotencia. | ⬜ |
| 103 | **R10.5 Copiloto admin** | Leer/explicar/proponer; escritura solo por gateway y aprobación. | ⬜ |
| 104 | **R10.6 Catálogo para agentes** | Feed/API semántica, políticas, disponibilidad, rate limit y analytics. | ⬜ |
| 105 | **R10.7 Carrito y checkout agéntico** | Sesión limitada y consentimiento; pagos permanecen alojados/compatibles. | ⬜ |
| 106 | **R10.8 Consolidación R10** | Red-team, costes, fallos, replay y documentación pública no especulativa. | ⬜ |

## R11 — Escala y madurez continua

| Orden | Bloque recurrente | Entregables y criterio específico | Estado |
|---:|---|---|---|
| 107 | **R11.1 Catálogo de prueba grande** | Generador reproducible, índices, cursor y presupuestos para 10/100k/1M referencias. | ⬜ |
| 108 | **R11.2 Load/concurrency suite** | Checkout, inventario, outbox, import, bulk y adaptadores con umbrales. | ⬜ |
| 109 | **R11.3 Restore/DR drill** | RPO/RTO, restauración, verificación y comunicación. | ⬜ |
| 110 | **R11.4 Seguridad y privacidad** | Threat model, dependencias, secretos, CSP, permisos, retención y respuesta. | ⬜ |
| 111 | **R11.5 SLO/alertas/runbooks** | Indicadores por recorrido y alerta accionable. | ⬜ |
| 112 | **R11.6 Presupuestos web en CI** | JS, imágenes, LCP, CLS, a11y y SEO por superficie. | ⬜ |
| 113 | **R11.7 Madurez trimestral** | Bugs, fricción, bulk, import/export, móvil, docs y eliminación de configuración muerta. | ⬜ recurrente |

## 4. Carril wiki paralelo

Cada bloque funcional produce una ficha interna desde el primer día. Solo pasa
a URL indexable cuando su estado sea `actual`, `conector` operativo o
`gestionado` con alcance y CTA claros. Las capacidades `pendiente` pueden
aparecer en una página de visión general, pero nunca como producto disponible.

El carril editorial no cambia el orden del backend. Publicar cien páginas antes
de tener evidencia crearía deuda reputacional y riesgo de contenido débil.

### Evidencia R1.1 — cerrado 2026-08-06

- inventario real, mapa objetivo y transición: [`arquitectura/README.md`](arquitectura/README.md);
- cinco decisiones aceptadas: [`adr/`](adr/);
- deuda exacta: 18 pares archivo/regla, sin comodines, en
  [`arquitectura/DEUDA.md`](arquitectura/DEUDA.md);
- check Vitest: módulos legacy clasificados, fronteras dominio/SDK/SQL, grafo
  permitido, allowlist no ampliable y cero ciclos estáticos;
- borrador wiki interno en `wiki/arquitectura-modular-ecommerce.md`;
- sin migración, dependencia, cambio de ruta/respuesta/UI/runtime ni deploy.

`MATRIZ_CAPACIDADES.md` no cambia: R1.1 aporta arquitectura y evidencia, pero no
convierte PLT-002/003/008 en capacidades operativas.

### Evidencia R1.2 — cerrado 2026-08-06

- fuente por despliegue en `platform.config.ts`, validada antes de componer;
- lifecycle exacto de seis estados, flags explícitos para rutas, navegación,
  jobs y efectos laterales, configuración tipada y referencias a secretos sin
  valores secretos;
- dependencias operativas y rechazo temprano de capacidades desconocidas,
  ciclos, estados/configuración incompatibles y demos con efectos comerciales;
- presets técnicos acumulativos `minimal`, `standard` y `advanced`, sin
  convertirlos en planes comerciales;
- composition root puro en `src/composition/create-platform.ts`, todavía sin
  elegir adaptadores ni modificar el runtime;
- 14 pruebas del manifest y 5 checks arquitectónicos; `pnpm check` verde con
  28 suites y 193 tests;
- sin migración, dependencia, ruta, navegación, UI, job, respuesta HTTP ni
  deploy.

PLT-002 pasa a `parcial`: ya existe una fuente y un contrato ejecutable, pero
R1.3 debe hacer que rutas y navegación los consuman. La allowlist permanece en
18 pares: retirar `src/lib/format.ts` en R1.2 habría exigido propagar contexto
de moneda por storefront/notificaciones o trasladar la misma deuda; se cierra
su salida en R1.12.

## 5. Bloque cerrado

### R1.3 — Navegación y rutas por capacidad — ✅ 2026-08-06

Entrega cerrada:

1. `runtimePlatform` es la única fachada Astro; middleware, panel, enlaces y
   acciones consultan una política tipada común;
2. capacidades no operativas desaparecen y responden 404; capacidades activas
   sin permiso de ruta responden 403; `degraded` conserva su fallback explícito;
3. los presets técnicos producen navegación y acceso distintos, mientras la
   demo usa una composición `custom` completa, de solo lectura y sin jobs ni
   efectos comerciales;
4. catálogo, pedidos (lectura), fulfillment, outbox y contacto salen de SQL en
   presentación hacia casos de uso y adaptadores D1; la allowlist baja de 18 a
   9 excepciones y `presentation-sql` de 13 a 4 archivos;
5. verificación: `pnpm check` (29 suites, 205 tests), E2E 27/27 local y remoto,
   auditoría del panel en 14 superficies con 0 errores/avisos y webhook demo
   cerrado con 410;
6. sin migraciones, dependencias, cambios de dinero/stock ni nueva promesa.

### R1.4 — Registro de módulos — ✅ 2026-08-06

Entrega cerrada:

1. registro canónico de 16 módulos con id, versión, capacidades, dependencias,
   permisos, eventos, jobs, healthchecks, wiki, navegación y rutas;
2. validación fail-fast de forma, ids, versiones, propietario único de cada
   capacidad, dependencias desconocidas, duplicados y ciclos;
3. el composition root resuelve únicamente módulos `active`/`degraded` y exige
   que sus dependencias también sean operativas;
4. navegación y política de rutas dejan sus listas manuales y se derivan del
   registro, con orden/prioridad deterministas;
5. el registro de escaparates pasa a `src/collections/index.ts` y el backup a
   caso de uso/adaptador D1; la allowlist baja de 9 a 7 y `presentation-sql` de
   4 a 3 archivos;
6. nueve pruebas específicas cubren invariantes, inmutabilidad y presets; el
   bloque no añade dependencias, migraciones ni infraestructura externa;
7. `events`, `jobs` y `healthchecks` permanecen declarados y vacíos hasta sus
   bloques propietarios R1.5, R1.11 y R1.10: no se inventan contratos futuros;
8. verificación: `pnpm check` (31 suites, 218 tests), E2E 27/27 y panel en 14
   superficies a 1440/375 con 0 errores y 0 avisos de accesibilidad.

### R1.5 — Sobre de eventos — ✅ 2026-08-06

Entrega cerrada:

1. sobre único y versionado en `src/shared-kernel/events.ts` con `event_id`,
   tipo, versión, `occurred_at`, actor, entidad, correlación, causación y clave
   de idempotencia; reloj y fuente de ids inyectados, validación fail-fast y
   decisión de **no transportar PII** ([ADR-0006](adr/0006-sobre-de-eventos.md));
2. los cinco hechos de pedido (`placed`, `paid`, `shipped`, `delivered`,
   `cancelled`) se emiten con sobre y la fila de `order_events` pasa a ser su
   **proyección**: mismas notas, mismos estados, mismo comportamiento —el seed
   de la demo redacta sus notas con esa misma función;
3. `notifications` deja de ser llamado por `orders` y pasa a **consumir el
   sobre**: reconoce tipos por nombre, lee el payload de forma defensiva y no
   importa nada del emisor; la unión la hace el composition root;
4. `order-operations.ts` compone las tres escrituras de pedido conservando la
   guarda de idempotencia (UPDATE guardado en solitario + una sola batch con
   timeline, stock y bandeja);
5. el webhook recibe un **evento de checkout normalizado** y las tres rutas de
   escritura pierden su SQL: la allowlist baja de 7 a **2 claves** y
   `presentation-sql` queda en **0 archivos**;
6. el registro de módulos declara `events`/`subscriptions` con emisor único,
   prefijo por módulo y rechazo de suscripciones a hechos que nadie emite;
7. verificación: `pnpm check` (35 suites, 244 tests, tipos y build en verde),
   E2E 27/27 contra `wrangler dev`, y prueba del motor real con `DEMO_MODE=false`
   —compra con pago simulado, timeline de tres entradas con las notas de
   siempre, stock decrementado, tres emails exactos y transición repetida
   devolviendo 422 sin segundo aviso—;
8. sin migración D1, sin dependencia nueva, sin cambio de respuestas HTTP ni de
   promesa comercial.

PLT-006 pasa a `parcial`: el contrato existe y es ejecutable, pero la
persistencia y la entrega reintentable son R1.6/R1.7. PLT-003 pasa a `parcial`
con eventos declarados; en ese cierre jobs y healthchecks quedaban asignados a
R1.11 y R1.10 respectivamente.

## 6. Bloques cerrados

### R1.6 — Diseño y aprobación del outbox — ✅ 2026-08-06

La propuesta está completa en [ADR-0007](adr/0007-outbox-transaccional-d1.md),
con SQL exacto fuera de `migrations/`, contrato ejecutable y pruebas sobre
SQLite. Wrangler D1 local ejecutó sus siete sentencias sin cambios. El diseño
fija dos tablas (hecho inmutable + entrega por consumidor), claim atómico de 25
filas con lease de 60 s, entrega at-least-once, siete backoffs y dead-letter al
octavo fallo, errores redacted y retención de entregados durante 30 días; los
pendientes y dead-letter nunca se purgan automáticamente.

Andreu aprobó la puerta al ordenar continuar el desarrollo. ADR-0007 pasa a
`accepted`; el DDL propuesto se conserva como evidencia y su copia exacta entra
en `migrations/0004_event_outbox.sql`.

### R1.7 — Outbox transaccional — ✅ 2026-08-06

1. Pedido, hecho y entregas se confirman en una sola `DB.batch()`. El evento se
   inserta condicionado al estado esperado y todos los efectos exigen su
   `event_id`; una carrera perdedora aplica cero cambios sin salir del lote.
2. El alta con id autogenerado reserva identidad antes del lote y materializa
   `order_id` desde la fila insertada. Un fallo posterior revierte pedido,
   líneas, timeline y evento.
3. El dispatcher reclama 25 entregas con lease de 60 s, recupera leases
   vencidas, aplica siete backoffs, dead-letter al octavo fallo, replay interno
   y limpieza por lotes tras 30 días. Errores persistidos siempre redacted.
4. Notificaciones materializa sus emails y confirma el ACK en la misma batch;
   un Worker con lease obsoleta inserta cero mensajes. La entrega es
   at-least-once y el efecto es idempotente.
5. `waitUntil` dispara tras cobro/envío y un cron de cinco minutos recupera
   retries en tiendas reales. En demo ambos quedan inertes por `DEMO_MODE` y
   los endpoints comerciales continúan cerrados.
6. Seed/reset y backup incluyen las tablas nuevas. La migración completa se
   ensayó con Wrangler en una D1 aislada y las pruebas usan SQLite real para
   atomicidad, carreras, rollback, retry, dead-letter, replay y recuperación.
7. Verificación final: `pnpm check` en verde (35 suites, 251 tests, tipos y
   build), migración `0004` aplicada a la D1 local y E2E 27/27 contra
   `wrangler dev` con el esquema migrado. Migración remota y despliegue
   `4578e360-b00d-460f-be0d-63a5a281b127` confirmados; E2E remoto 27/27.

PLT-006 y PLT-007 pasan a `actual`. No hay dependencia, ruta, pantalla, PII en
el sobre, coste fijo ni cambio en dinero/stock fuera de la unidad atómica.

### R1.8 — Audit log transversal — ✅ 2026-08-07

1. `audit_log` conserva actor técnico, acción, entidad, correlación, evento
   fuente y diff JSON en una migración aditiva con dos índices acotados.
2. Pedido, pago y transición admin se proyectan desde el hecho persistido en la
   misma batch; producto y tarifa usan snapshot completo y guarda optimista.
   Una carrera perdedora escribe cero negocio y cero evidencia.
3. Cada caso de uso declara campos permitidos y una denylist transversal
   redacta PII, sesiones, secretos y referencias de pago. El diff limita 50
   campos, 256 caracteres por valor y 4 KB totales.
4. Por instrucción explícita de Andreu, no existe export, lectura, página ni
   navegación HTTP. La demo rechaza antes de tocar D1 y el tráfico de lectura,
   login o rate limit no produce audit rows. El backup público tampoco incluye
   la tabla; la extracción operativa usa Cloudflare/Wrangler autorizado.
5. Producto y tarifas pierden sus writers no auditados: toda mutación HTTP pasa
   por la unidad de trabajo transversal. No se registran payloads ni errores.
6. Verificación: 37 suites y 259 tests en verde, con constraints SQLite,
   redacción, rollback, carreras de pago/admin y ausencia de superficie pública;
   migración aplicada con Wrangler en D1 local y remota, y E2E 27/27 en ambos
   entornos. Tras cada recorrido demo, `audit_log` conserva exactamente cero
   filas; `db:reset` reconstruye y siembra las cinco migraciones desde cero.
7. ADR-0008 y borrador wiki documentan la decisión. La matriz no cambia porque
   no contiene un ID de capacidad específico para audit log.
8. El reset descubrió y corrigió dos parameter properties incompatibles con el
   TypeScript strip-only de Node; seed y registro conservan el mismo contrato.

No hay dependencia, servicio, coste fijo, nueva ruta, JavaScript, trabajo por
visita ni superficie PCI. Despliegue confirmado:
`808274b4-ca86-432e-9816-7a01c337ecc1`.

### R1.9 — Observabilidad base — ✅ 2026-08-07

1. Un contrato cerrado define cuatro métricas y nueve códigos de error; no
   acepta campos arbitrarios ni conserva causa, stack o mensaje crudo.
2. Workers Logs recibe una línea JSON versionada por señal útil, con nivel,
   duración acotada y IDs técnicos validados. No hay tabla, endpoint, exportador,
   beacon, dependencia o proveedor nuevo.
3. Checkout devuelve `x-operation-id` y mide solo tras validar una compra real;
   el webhook hace lo mismo solo después de verificar la firma. Ambos excluyen
   PII, body, URL, IP, sesión y referencias de pago.
4. Outbox y email emiten conteos agregados únicamente cuando reclaman trabajo.
   Demo, peticiones inválidas, firmas inválidas, rechazos de negocio y crons
   vacíos quedan en silencio; el tráfico hostil no controla escrituras ni logs.
5. Los fallos de consumidor persisten únicamente código/mensaje seguro y emiten
   correlación; si falla el sink, la operación observada continúa.
6. El runbook documenta búsqueda por `operation_id`, `correlation_id` y
   `causation_id`, códigos y contención. ADR-0009 y el borrador wiki fijan los
   límites de seguridad.
7. Verificación: 40 suites, 268 tests, tipos y build en verde; pruebas con
   checkout simulado real y webhook Stripe firmado prueban ausencia de PII.
   E2E local y remoto 27/27 confirman demo inerte; después del recorrido remoto,
   `audit_log`, hechos y entregas pendientes conservan cero filas.
8. SEC-008 pasa a `parcial`: logs, métricas y correlación son reales; alertas y
   SLO permanecen honestamente en R11.5.

Producción confirmada: `46334b51-4236-42fa-b6c8-81c323b264ae`.

### R1.10 — Registro de integraciones — ✅ 2026-08-07

1. Un registro inmutable contiene únicamente los adaptadores reales de Stripe
   Checkout, Resend y exportación logística CSV; cada descriptor enlaza versión,
   capacidad, módulo propietario, healthcheck e implementación existente.
2. El registro modular valida propietario único para cada healthcheck; el de
   integraciones rechaza duplicados, ausencias, capacidades ajenas y checks sin
   dueño antes de componer.
3. Los snapshots separan estado, health local, configuración allowlisted,
   última sincronización y último error. Los errores solo admiten código cerrado
   y timestamp ISO; nunca mensaje, causa, stack o datos del comprador.
4. El único corte que ve secretos los reduce inmediatamente a booleanos de
   presencia. El registro no acepta credenciales, no escribe D1 y su
   serialización está probada contra fugas.
5. La demo mantiene Stripe y Resend inactivos y el CSV manual activo sobre
   fixtures. Un cliente con Stripe parcial o Resend sin clave queda degradado;
   no se presenta una configuración incompleta como sana.
6. El health de esta fase es local: no sondea proveedores al arrancar ni por
   petición. Permisos/latencia remotos y evidencia persistente mantienen
   `INT-007` en `parcial`; panel, replay y desconexión siguen posteriores.
7. ADR-0010, arquitectura y borrador wiki documentan el límite. No se añade
   migración, endpoint, navegación, job, dependencia, coste ni integración
   ficticia.
8. Verificación: 41 suites, 276 tests, tipos y build en verde. Al no cambiar
   compra, admin o UI, E2E/a11y/Lighthouse no aplican.

Producción confirmada: `a10992f2-aed0-4339-a5b1-a962b4e52b1d`; smoke 200 en
portada, arquitectura, tienda demo y sitemap.

### R1.11 — Contrato de jobs — ✅ 2026-08-07

1. El registro modular declara dos jobs reales con propietario único y un
   registro ejecutable valida id, módulo, capacidad, alcance, modo, trigger,
   timeout, intentos y backoffs antes de componer.
2. La migración aditiva `0006_platform_job_runs.sql`, autorizada por Andreu,
   crea una fila por ejecución deduplicada y tres índices para claim, lease e
   historial. No contiene payload, PII, secretos ni errores crudos.
3. Ejecuciones únicas y recurrentes comparten el runner. El claim D1 es
   atómico, la lease cerca el ACK por propietario y el timeout entrega
   `AbortSignal`; un Worker viejo no puede confirmar tras perder el lock.
4. Cuatro backoffs llevan el quinto fallo a `dead`. El replay interno reinicia
   intentos e incrementa evidencia; los éxitos se purgan a 30 días por lotes y
   dead-letter no se elimina automáticamente.
5. El reset de fixtures es mantenimiento de despliegue solo para `demo`; no
   activa flags comerciales. El barrido del outbox exige `AUT-002.jobs=true`
   y modo `client`. Manifest y `DEMO_MODE` deben coincidir o el cron falla
   cerrado sin crear una fila.
6. `src/worker.ts` deja de contener condicionales de cada cron y delega en el
   composition root. El reset conserva horario, seed completo e idempotencia;
   el historial operativo no se borra al reemplazar fixtures.
7. ADR-0011 fija at-least-once, límites y alternativas. No hay endpoint, panel,
   navegación, dependencia, servicio o coste mensual nuevo.
8. Verificación: migración Wrangler sobre D1 local y Cron Trigger real mediante
   `__scheduled` (200, ejecución `succeeded` al primer intento); `pnpm check`
   en verde con 43 suites, 288 tests, tipos y build. Compra/admin/UI no cambian,
   así que a11y/Lighthouse no aplican.

Migración remota aplicada y producción desplegada en
`a8f7a5e4-790b-40ad-9bbc-145e179a8de4`. Smoke 200 en portada, arquitectura,
tienda principal, ARGENT y sitemap; E2E remoto de aislamiento 27/27 en verde.
La tabla remota existe y parte con cero ejecuciones antes del siguiente tick.

### R1.12 — Consolidación R1 — ✅ 2026-08-07

1. La allowlist arquitectónica baja de 2 a **0**. `demo-catalog` recibe un
   contrato puro y composición conecta los seeds; `format` recibe divisa y
   notificaciones inyecta la configuración del despliegue.
2. Los checks impiden cualquier import runtime→seed fuera de composición. El
   cierre mide 0 excepciones, 0 SQL en presentación, 0 ciclos y 0 SDKs
   restringidos fuera de adaptadores/composición.
3. `platform-consolidation.test.ts` clona `minimal`, `standard` y `advanced`
   con dos identidades independientes, fija sus módulos, separa jobs cliente y
   demo, y prueba el fallo temprano de una combinación inválida.
4. Las pruebas R1 de manifiestos, registros, fallos, carreras, mismo tick,
   leases, retry/dead-letter, replay e idempotencia siguen ejecutándose juntas.
5. `CREAR_MODULO_Y_JOB.md` documenta el recorrido completo, puertas de decisión
   y evidencia mínima. La ficha wiki y el mapa arquitectónico ya describen el
   estado consolidado sin convertirlo en una promesa pública.
6. La auditoría confirma 11 dependencias directas y ningún paquete nuevo. El
   audit del lockfile sí registra 10 avisos altos transitivos/directos ligados a
   Astro 5, Wrangler/Miniflare, Sharp y JS-YAML; no se ocultan ni se fuerzan
   overrides. Una migración coordinada a Astro 6 queda como puerta técnica antes
   del siguiente despliegue.
7. `pnpm check` pasa con 44 suites, 294 tests, tipos y build. No cambian compra,
   admin, UI, esquema ni producción; E2E/a11y/Lighthouse y deploy no aplican.

PLT-002 sigue `parcial`: manifest, presets, rutas, navegación, jobs, efectos y
composición son reales, pero publicación/importación de configuración pertenece
a bloques posteriores. R1 queda cerrado sin declarar capacidades futuras.

### R2.1 — Modelo objetivo y plan de migración — ✅ 2026-08-07

1. ADR-0012 separa producto editorial de variante vendible, inventario de
   movimientos/balance, pago de pedido y fulfillment por cantidades. El pedido
   conserva snapshots; sus estados financieros y logísticos pasan a ser
   proyecciones, no una única verdad mutable.
2. El ERD objetivo fija opciones/valores, variantes, media/atributos, ledger y
   reservas de inventario, pagos/transacciones, reembolsos por líneas y
   fulfillments/items. R3.6 añadirá ubicaciones: R2 conserva balance global para
   no anticipar una interfaz multi-almacén vacía.
3. La transición es expand/backfill/shadow-read/doble escritura/contract. Las
   columnas legacy permanecen como espejos durante R2.14 y hasta una contracción autorizada; cada migración conserva
   su propia puerta, copia, preflight, reconciliación y rollback.
4. Los backfills son deterministas: variante `LEGACY-{product_id}`, movimiento
   de apertura idempotente y fulfillment total desde líneas. Un cancelado que
   antes estuvo pagado queda `requires_review`: el sistema actual no demuestra
   un reembolso del PSP y la migración no inventa dinero.
5. Seeds v1 se convierten en una variante default; el formato v2, backup y
   export incluyen relaciones nuevas sin romper el CSV logístico basado en
   snapshots. Las copias siguen excluyendo audit log y leads de la superficie
   HTTP pública.
6. Ensayo local no destructivo: export Wrangler restaurado en SQLite temporal,
   12 tablas, 18 índices y recuentos idénticos; 0 violaciones FK e integridad
   `ok` sobre 194 productos, 8 pedidos y 13 líneas. La red oficial falló dos
   veces, así que comandos remotos y recuperación adicional se revalidan antes
   de R2.2.
7. La matriz pasa únicamente a `especificado` las capacidades cuyo contrato
   queda fijado. No aparece ruta, UI, job, dependencia, SQL de migración ni
   promesa pública; el borrador wiki permanece interno.
8. `pnpm check` pasa con 44 suites y 294 tests, tipos y build. Compra, admin,
   esquema y producción no cambian; E2E/a11y/Lighthouse/deploy no aplican.

### R2.2 — Producto-variante: esquema — ✅ 2026-08-08

1. `0007_product_variants.sql` añade variante vendible, opciones, valores y
   relaciones con FKs compuestas; SKU es único sin distinguir mayúsculas,
   precio/compare-at conservan sus guardas y una firma canónica impide repetir
   combinaciones. `order_items` gana referencia y snapshots nullable sin retirar
   ninguna columna legacy ni activar un lector nuevo.
2. El backfill crea exactamente una variante `LEGACY-{product_id}` por producto,
   copia precio, compare-at, actividad y timestamps, y enlaza las líneas
   históricas. El seed v1 reconstruye las mismas filas y snapshots después de
   cada reset; dos resets consecutivos quedan idempotentes.
3. `rehearse-r2-product-variants.mjs` convierte el preflight de R2.1 en once
   guardas bloqueantes, restaura un export remoto fresco en SQLite aislada,
   aplica la migración, compara todas las columnas de las 12 tablas legacy y
   vuelve a restaurar el dump migrado.
4. Ensayo real: 194 productos → 194 variantes, 8 pedidos y 13 líneas; hashes
   legacy idénticos antes/después/restore, cero violaciones FK y `integrity_check
   = ok`. Wrangler aplicó `0007` y resembró la D1 local: 194/194 y cero líneas
   incompletas.
5. Verificación completa: 45 suites y 300 tests, tipos Astro y build en verde.
   No cambian ruta de compra, UI, inventario, pagos, fulfillment ni dependencias;
   E2E/a11y/Lighthouse no aplican.
6. Al cerrar R2.2 la D1 remota conservaba `0001`–`0006`: aplicar `0007` sin el
   seed compatible habría permitido que el Worker servido borrase el backfill.
   La puerta se superó el 2026-08-08 con upload sin tráfico, backup restaurado,
   migración remota y corte posterior del binario compatible.

### R2.3 — Producto-variante: dominio y lectura — ✅ 2026-08-08

1. `modules/catalog` separa producto editorial, variante vendible, selección de
   opciones y disponibilidad legacy transitoria. El constructor rechaza default
   ausente, dinero inválido, SKU/combinación duplicados, firma incoherente y un
   default no activo para un producto publicado; el agregado sale inmutable.
2. El repositorio D1 hidrata producto + todas sus variantes/opciones y proyecta
   storefront/quote desde la variante default. `products.stock` permanece como
   disponibilidad separada hasta R2.7; no se anticipa un ledger ficticio.
3. `CATALOG_READ_MODE=legacy|shadow|variant` permite rollback de binario. Shadow
   ejecuta ambos lectores, compara todos los campos servidos y el orden del
   catálogo, y lanza un error bloqueante ante cualquier diferencia. Variant
   corta al nuevo lector; legacy no consulta las tablas R2.
4. `/api/cart/quote` y `/api/checkout/session` resuelven el modo explícitamente.
   El contrato del navegador conserva solo `slug` + `qty`: Zod elimina un
   `price_cents` hostil y la quote usa el precio de la variante en D1.
5. El seed v1 completo reconcilia por shadow-read todos sus catálogos y slugs.
   Las pruebas fuerzan además una divergencia de precio y comprueban que shadow
   la bloquea mientras variant/legacy leen sus respectivas fuentes.
6. No cambian admin, seed v2, esquema, inventario, pagos, UI ni dependencias. La
   demo pública continúa con fixtures locales y endpoints 410; el storefront
   canónico pertenece al motor clonable, sin reconectar la muestra a D1.
7. Al cerrar R2.3 producción conservaba `0001`–`0006`. El 2026-08-08 se superó
   la puerta coordinada y se desplegó este binario junto con `0007`, conservando
   lectura reversible y seed compatible.
8. Verificación del bloque: 46 suites y 308 tests en la composición sin trabajo
   ajeno incompleto, Astro sin diagnósticos, build completo y E2E local 27/27.
   UI/a11y/Lighthouse y deploy no aplican.

### R2.4 — Producto-variante: admin y seed — ✅ 2026-08-08

**Corte local 1 (2026-08-08).** El PATCH administrativo sincroniza
precio, precio anterior, actividad/estado y metadatos de la variante default
con los espejos legacy dentro de la misma batch y evidencia optimista. `CAT-003`
gobierna las columnas avanzadas del panel: queda ausente en minimal/standard y
activo en advanced/demo. El seed v2 materializa opciones, valores, firmas y tres
tallas reales de `sum-shell-07`, mientras v1 conserva su default simple. El
backup marcado como esquema 2 exporta/restaura las cuatro tablas nuevas y sus
FKs.
Verificación del corte: 333 archivos Astro sin diagnósticos, 46 suites y **312
tests**, restore aislado con `foreign_key_check` limpio y build completo.

**Corte de producción (2026-08-08, cerrado).** Un export remoto fresco se
restauró antes de migrar (`integrity_check = ok`, cero FK; SHA-256
`447a1d3a44f606525c84be71b4b9223ec038c3c42792fd9b43e704a365d2ea90`).
Después de aplicar `0007`, D1 quedó en 194 productos/194 variantes default, 13
líneas completas, cero divergencias y cero SKU duplicados. La versión Worker
`193a5610-1b76-4534-92ce-a5ade571c732` (`release-0d9c447`) sirve el 100 % del
tráfico, con dominio y ambos cron sincronizados. E2E de producción 27/27 y
auditoría posterior sin escrituras ni violaciones FK. El despliegue no cierra
R2.4: solo publica de forma coherente el corte compatible ya terminado.

**Cierre funcional (2026-08-08).** El admin avanzado incorpora una ficha por
producto para crear, renombrar y retirar opciones/valores, mantener cualquier
combinación, SKU, GTIN/EAN, MPN, precio y estado, y cambiar el default. Default,
valores usados y variantes presentes en pedidos llevan guardas explícitas. Cada
mutación confirma snapshot, dato y audit log en una batch; la carrera de alta
de una combinación deja un ganador. La demo solo muestra fixtures deshabilitados
y `minimal`/`standard` no exponen página ni endpoints de `CAT-003`.

El reset local reconstruye 207 productos, 209 variantes y las tres tallas de
SUMMIT; el backup de esquema 2 restaura relaciones con FK limpia. `pnpm check`
pasa 47 suites y **321 tests**, tipos y build. E2E local **32/32**; editor en
1440/375 sin overflow ni consola; auditoría 2/2 sin errores ni avisos. No se
tocan esquema, media, stock, pagos o fulfillment.

**Despliegue funcional (2026-08-09).** El Worker
`0445b6cb-1619-43eb-aeaf-da0012f6b9f9` sirve el cierre R2.4. Tras materializar
el reset interno, D1 confirma 207 productos, 209 variantes, una opción, tres
valores y tres asociaciones. La ficha SUMMIT responde 200 con sus combinaciones,
las mutaciones públicas responden 403 y el E2E de producción pasa **32/32**.

### R2.5 — Media y atributos tipados — ✅ 2026-08-10

1. Andreu aprobó ADR-0013 y la migración aditiva `0008`; el rehearsal sobre un
   export remoto fresco produjo 207 medias, conservó hashes legacy/canónicos y
   pasó dump/restore con `foreign_key_check` vacío e `integrity_check = ok`.
2. `CAT-008` administra galería, orden, alt, foco y asociaciones de variante;
   `CAT-007` administra definiciones y valores `text|number|boolean|reference|list`
   con restricciones cerradas y override de variante.
3. Todas las escrituras pasan por casos de uso y batches optimistas con
   `audit_log`; el primer `image` se refleja en `products.image`, las bajas
   compactan posiciones y las carreras dejan un único ganador.
4. El seed compatible e idempotente deja 207 productos, 209 variantes, 208
   medias, dos asociaciones, cinco definiciones y seis valores. Backup de
   esquema 3 exporta/restaura las cuatro tablas nuevas.
5. La demo advanced enseña la ficha real SUMMIT en solo lectura; minimal y
   standard no exponen rutas ni controles. E2E prueba datos, backup y 403.
6. Verificación: 49 suites, **332 tests**, tipos/build, E2E local/remoto
   **37/37** y a11y/responsive **2/2** sin errores ni avisos.
7. Producción: D1 `0001`–`0008`, cero divergencias del espejo y cero FK; Worker
   `94d51142-49c3-444a-921c-3790227117e0` al 100 %.
8. No se tocaron inventario, pagos ni fulfillment; stock continúa global hasta
   R2.7.

## 7. Panel administrativo V2 — ✅ 2026-08-10

UIA.1–UIA.4 queda cerrado como un único corte coherente:

1. naming corregido a **Logic2B Gestión**, shell Logic2B UI con Poppins/Inter,
   navegación derivada de capacidades, espacio activo, salud y demo integrados;
2. pedidos con resumen, búsqueda y filtros combinables en URL, paginación,
   filas accionables, tarjetas móviles y detalle con timeline y riesgo separado;
3. productos con búsqueda, categoría, estado y paginación de 24 filas, miniatura,
   SKU/variantes y editor R2.5 con feedback persistente;
4. tarifas, emails con preview aislada, login y ayuda comparten jerarquía,
   estados vacíos/read-only, targets de 44 px y foco visible;
5. las consultas nuevas permanecen dentro de los puertos/adaptadores de pedidos
   y catálogo; presets y capability gates no cambian;
6. verificación local: `pnpm check` con **50 suites y 335 tests**, E2E **37/37**
   y auditoría admin **16/16** (1440/375) con 0 errores y 0 avisos;
7. sin migración, dependencia, cambio de dinero/stock, escritura nueva ni deploy.

## 8. R2.6 — Diseño del ledger de inventario — ✅ 2026-08-10

1. ADR-0014 fija variante como unidad, ledger append-only, balance versionado,
   `available = on_hand - reserved`, razones cerradas y espejo legacy asignado.
2. El contrato de dominio valida dirección, disponibilidad, ids/referencias y
   estados terminales de reserva; la guarda SQL optimista deja un ganador.
3. `0009_inventory_ledger.proposed.sql` define balance/movimiento para R2.7;
   `0010_inventory_reservations.proposed.sql` queda separado para R2.8.
4. Backfill, doble escritura, reconciliación, rollout y rollback quedan exactos;
   la apertura incluye stock cero y replica el dato legacy por variante según
   ADR-0012, sin inventar un reparto.
5. Seis pruebas SQLite ejecutan ambos DDL, constraints, dedupe, carrera de última
   unidad, suma=balance, reservas y ausencia de PII.
6. Verificación: `pnpm check` con **51 suites y 341 tests**, tipos y build.
7. Sin migración, runtime, dependencia, escritura viva ni deploy; la puerta de
   implementación sigue siendo R2.7.

## 9. R2.7 — Implementación del ledger de inventario — ✅ 2026-08-10

1. `migrations/0009_inventory_ledger.sql` crea balances y movimientos y abre
   todas las variantes, incluido stock cero, replicando el dato legacy.
2. El adaptador D1 aplica balance versionado, movimiento append-only y espejo
   default bajo la misma guarda de evento o auditoría.
3. Cobro, cancelación y ajuste admin abandonan la aritmética directa sobre
   `products.stock`; stock insuficiente revierte pedido, outbox y auditoría.
4. Las líneas nuevas congelan `variant_id`/SKU y el catálogo sirve
   `on_hand - reserved`; el panel expone disponibilidad y versión por variante.
5. Crear una variante abre su ledger. El historial impide borrarla: se archiva.
6. Seed y ensayo `rehearse-r2-inventory-ledger.mjs` verifican forward,
   reconciliación, hashes y dump/restore sin imprimir PII.
7. Verificación local: **52 suites, 344 tests**, tipos/build, E2E **37/37** y
   a11y admin **16/16** sin hallazgos. La D1 local reconcilia 209 balances,
   ledger, espejos y FKs a cero. Sin reservas, migración remota ni deploy;
   `0010` continúa reservado para R2.8.

## 10. R2.8 — Reservas y expiración — ✅ 2026-08-10

1. `0010_inventory_reservations.sql` separa `reservation_version` de la versión
   del ledger y crea cabecera, líneas e historiales append-only con triggers de
   guarda; el saldo físico no cambia al reservar.
2. El checkout reserva por variante default dentro de la misma batch que pedido,
   evento y auditoría. Consumir reduce `reserved` y `on_hand` y crea una única
   venta; liberar/expirar solo reduce `reserved`.
3. La expiración usa el runner durable R1.11 cada minuto, lotes de 100, TTL de
   31 minutos alineado con Stripe y replay idempotente.
4. `INV-004` está instalado pero sin flags en todos los presets: demo, clientes
   y jobs conservan el comportamiento R2.7 hasta un opt-in explícito.
5. Cinco pruebas SQLite cubren captura, doble confirmación, carrera de última
   unidad, TTL/job durable y ausencia de PII; el registro añade prueba de activación.
6. El rehearsal forward/dump/restore conserva 209 balances, ledger y espejo,
   crea cero holds al migrar y valida hashes canónico/esquema.
7. Verificación local: **53 suites, 350 tests**, tipos/build y E2E **37/37**.
   Sin migración remota, activación, navegación ni deploy.

## 11. R2.9 — Ledger de pagos — ✅ 2026-08-11

1. `0011_payment_ledger.sql` añade moneda expand/contract, intención,
   transacciones, reembolsos y asignaciones con FKs, estados cerrados, céntimos,
   idempotencia y guarda de saldo; los espejos `orders.stripe_*` siguen vivos.
2. `modules/payments` valida proveedor, moneda, importe y versión y ofrece una
   unidad D1 guardada por el mismo evento que pedido, inventario, timeline,
   auditoría y entregas.
3. Alta crea intención `pending`; webhook/simulado crea una sola captura y
   actualiza el espejo. Expiración cancela sin asiento y cancelar un pedido ya
   pagado marca `requires_review`, nunca reembolso ficticio.
4. El backfill se genera desde `shop.config.currency`, no congela EUR en clones.
   El rehearsal sobre export remoto fresco (409.232 bytes) llevó el corte
   `0008` a `0011` en copia: 8 pedidos, 8 pagos, 6 capturas, 0 revisiones,
   replay idempotente y dump/restore con hashes estables.
5. Seed, reset y backup de esquema 5 incluyen el ledger y restauran FKs; la D1
   local queda en 8/8/6 y cero reembolsos/divisas divergentes.
6. Verificación: **56 suites, 358 tests**, tipos/build y E2E local **38/38**.
   Sin dependencia, UI, superficie PCI ni dato sensible nuevo.
7. Producción cerrada el 2026-08-11: D1 `0001`–`0011`, backfill 8 pagos/6
   capturas para 8 pedidos, cero revisiones/divisas/FKs divergentes y Worker
   `08d0e8e3-dbfc-40b2-a277-6028b49e577b`. E2E remoto **38/38**. Wrangler
   4.111 requirió importar `0010`/`0011` por fichero debido a su parser de
   triggers compuestos; se verificó cada esquema antes de registrar la
   migración y el DDL quedó reformulado sin `CASE ... END` anidado.

## 12. R2.10 — Reembolso total — ✅ 2026-08-11

1. La acción administrativa exige confirmación, motivo y decisión explícita de
   reposición. El importe y las líneas se calculan siempre en servidor.
2. La intención y sus líneas quedan durables antes de invocar el PSP. Stripe y
   el simulador implementan un puerto común; proveedor, referencia, moneda e
   importe se contrastan antes de asentar el resultado.
3. El mismo `idempotency_key` llega al PSP y al ledger. Reintento tras timeout,
   replay y dos solicitudes concurrentes producen una sola devolución y una
   sola tanda de efectos internos.
4. El cierre confirmado agrupa evento `orders.order_refunded`, auditoría,
   notificación, transacción financiera, estados, cancelación del pedido,
   timeline y reposición opcional en una batch D1 guardada.
5. `pending`, `processing`, `failed` y `requires_review` permanecen visibles;
   los estados activos bloquean envío/cancelación manual sin crear eventos
   fantasma. La reconciliación es manual por reintento idempotente en R2.10.
6. Demo pública: ruta visible pero mutación 403 y cero efectos. Sin dependencia,
   migración, dato PCI, precio ni promesa comercial nueva.
7. Verificación local: **57 suites, 366 tests**, tipos/build, reset `0001`–`0011`,
   E2E **39/39** y a11y del pedido pagado **2/2** a 1440/375.
8. Producción: Worker `4a6892cd-6ddc-44e4-b098-57eb276fb1ac`, D1 conserva
   11 migraciones, 8 pedidos/8 pagos, cero reembolsos/asientos de devolución,
   cero estados activos y cero errores FK; E2E remoto **39/39** tras propagación.

## 13. Siguiente bloque

### R2.11 — Fulfillment por líneas — ✅ 2026-08-11

1. `0012_fulfillment_lines.sql` materializa grupos y asignaciones con FKs
   compuestas, estado/tracking coherentes, versión e idempotencia; no elimina
   columnas legacy.
2. El backfill bloquea historia incompleta, deriva timestamps del timeline y
   migra cada envío total a un grupo estable. Replay, dump y restore mantienen
   hashes legacy/canónico idénticos: 4 grupos, 7 asignaciones y 0 errores FK en
   la D1 local autorizada.
3. `paid → shipped` calcula todas las cantidades pendientes en servidor y
   confirma grupo, líneas, evento, auditoría, outbox, timeline y espejo en una
   batch. Dos solicitudes solapadas crean un solo grupo. `shipped → delivered`
   avanza la misma evidencia con versión esperada.
4. Seed y backup esquema 6 conservan fulfillment. El panel lee tracking y
   cantidades del grupo canónico con fallback legacy; la demo continúa inerte.
5. Verificación: 59 suites/381 tests, tipos y build, E2E 39/39 y a11y 2/2 a
   1440/375. Sin dependencia, coste ni superficie PCI nueva.
6. El corte coordinado posterior de R2.12 aplicó D1 `0012` y el backfill remoto:
   4 grupos, 7 asignaciones y cero errores FK.

### R2.12 — Fulfillment parcial — ✅ 2026-08-11

1. Un único servicio asigna cantidades positivas por línea sin superar el
   pendiente; la ausencia de selección conserva el envío total como acción
   rápida. Varios grupos tienen tracking, versión e identidad propios.
2. Cada salida confirma outbox, auditoría, grupo, líneas y proyección en una
   batch. La última cantidad mueve el pedido a `shipped`; varios grupos anulan
   el espejo `orders.tracking_*`. El pedido solo llega a `delivered` cuando
   todos los grupos activos están entregados.
3. La notificación del evento `fulfillment.fulfillment_shipped` contiene solo
   las líneas/cantidades de esa salida y el total aún pendiente. Replay con la
   misma clave y carreras con claves distintas no duplican grupo ni email.
4. El panel muestra enviado/total/pendiente por línea, una tarjeta por tracking,
   entrega por grupo, selección de cantidades y “Enviar todo lo pendiente”. La
   demo enseña la evidencia pero ambas APIs responden 403.
5. Para no reponer unidades físicamente enviadas, el reembolso total queda
   bloqueado tras cualquier grupo activo; R2.13 incorpora el cálculo parcial.
6. Verificación local: 61 suites/391 tests, tipos/build, E2E 42/42 y seis
   superficies de pedido a 1440/375 sin errores ni avisos. El corte productivo
   sirve Worker `6663a123-012f-4507-b120-384750876809`, D1 `0012`, E2E remoto
   42/42 y a11y 6/6. Sin esquema, dependencia, coste ni superficie PCI nuevos;
   la propuesta `0013` no se aplicó.

### R2.13 — Cancelación/reembolso parcial

Seleccionar cantidades cancelables, calcular dinero solo en servidor y separar
la decisión de reposición. Debe reutilizar los ledgers ya instalados, mantener
redondeo exacto e impedir que una carrera cancele o reembolse una unidad enviada.

**Cerrado y desplegado.** Andreu autorizó `0013` y eligió
el 2026-08-12 `merchandise-only` como política predeterminada, configurable por
propietario en `shop.config.ts`; la alternativa devuelve todo el envío solo al
cancelar la última mercancía antes de cualquier salida. El runtime calcula
dinero en servidor, reserva cantidades antes del PSP, acumula saldo, repone por
selección y cierra evento/auditoría/email/timeline en una batch. Carreras
refund/refund y refund/fulfillment tienen un único ganador. La demo muestra la
acción deshabilitada y la API responde 403. Evidencia local: 64 suites/412
tests, tipos/build, E2E completo y a11y 2/2 a 1440/375. Un export remoto fresco
de 510.914 bytes pasó el rehearsal, con 4 fulfillments, cero refunds y restore
coherente. D1 remota quedó en `0013` sin violaciones FK y el Worker
`52779fca-8202-4f4d-92d4-c1f64304cb71` pasó E2E remoto 44/44 y a11y 2/2.

### R2.14 — Consolidación R2

**Cerrado sin migración ni despliegue nuevos.**
`tests/r2-consolidation-runtime.test.ts` recorre un producto con dos variantes:
reserva y consumo de la default, captura, dos fulfillments, cancelación parcial
de las dos unidades pendientes, entrega global, cinco emails, siete hechos y
auditorías, reposición selectiva y backup/restore esquema 7 sin FKs. Una segunda
prueba ejecuta 16 carreras refund/fulfillment simultáneas; cada base termina con
un ganador, una unidad comprometida, como máximo una llamada PSP y cero FKs.

La guía `GUIA_MIGRACION_R2.md` consolida `0007`–`0013`, rehearsals,
configuración por despliegue, expand-first, restore y downgrade. R2.14 conserva
los espejos legacy: retirarlos sería DDL destructivo y queda tras una versión
estable observada, ADR/migración y autorización expresa. Gate final: 65
suites/414 tests, tipos y build. El siguiente bloque ejecutable es R3.1, índice
de pedidos escalable.

### R3.1 — Índice de pedidos escalable

**Cerrado y desplegado.** El lector reemplaza OFFSET por cursor bidireccional sobre `(fecha|importe, id)`,
limita a 100 filas y liga cada cursor al orden y los filtros exactos. El panel
combina estado, texto, rango de fechas e importes en una URL GET compartible,
ofrece cuatro órdenes estables y conserva tabla/esquema móvil, estados vacíos y
demo inerte.

La migración aditiva `0014` incorpora índices compuestos y una
proyección FTS5 de número, cliente y email mantenida por triggers. La batería
recorre 115 pedidos con empates sin omisiones/duplicados, vuelve hacia atrás,
rechaza cursores de otro ámbito, limita la página, prueba entrada hostil y fija
los planes de fecha/importe. Backup esquema 8 reconstruye FTS desde `orders`.
Runbook y rollback compatible: [`OPERACION_INDICE_PEDIDOS.md`](OPERACION_INDICE_PEDIDOS.md).

Gate: **66 suites/420 tests**, tipos/build, reset `0001`–`0014`, E2E completo y
a11y del listado **2/2** local y remoto. Un export remoto fresco de 512.752
bytes pasó restore/preflight: 8 pedidos, 8 filas FTS, cero duplicados/FKs,
triggers insert/update/delete y ambos planes indexados. Producción sirve D1
`0014` y Worker `e5a71c2e-ad48-42af-9acb-87bae4341889`.

El cierre siguiente documenta R3.2, notas, etiquetas y timeline unificado.

### R3.2 — Notas, etiquetas y timeline

**Cerrado y desplegado.** `ORD-004` incorpora notas internas o visibles al
cliente con proyección actual y revisiones inmutables, versión esperada y un
solo ganador bajo concurrencia. Las etiquetas usan slug normalizado,
asignación idempotente y filtro combinable ligado al cursor de R3.1. El detalle
compone estados legacy, revisiones y cambios de etiqueta en un timeline único
con actor y visibilidad, sin reescribir `order_events`.

La migración expand-only `0015` añade cinco tablas e índices. Cada mutación y su
auditoría comparten guarda SQL; el diff no conserva cuerpo de nota ni PII.
`ORD-004` está activo en advanced y la demo enseña fixtures inertes: elimina
formularios y las tres APIs nuevas responden `403`. Backup/restore sube a
esquema 9. ADR y runbook:
[`adr/0018-colaboracion-pedidos-timeline.md`](adr/0018-colaboracion-pedidos-timeline.md)
y [`OPERACION_COLABORACION_PEDIDOS.md`](OPERACION_COLABORACION_PEDIDOS.md).

Gate: **69 suites/427 tests**, tipos/build, reset `0001`–`0015`, E2E remoto
completo y a11y admin **16/16** con cero hallazgos. Un backup fresco de R3.1
pasó rehearsal con 8 pedidos/8 FTS/0 FKs; producción conserva 8 pedidos, 2
notas, 3 revisiones, 3 etiquetas, 3 asignaciones y 0 FKs. D1 sirve `0015` y el
Worker `593ecf57-afff-49f9-9d38-f31b5ff6cd05`. El smoke descubrió respuestas
admin obsoletas en caché compartida; todas las superficies privadas fijan ahora
`private, no-store` y `Vary: Cookie`.

### R3.3 — Edición segura de pedido

**Cerrado y desplegado.** `ORD-005` permite añadir o retirar variantes, cambiar
cantidades todavía no comprometidas y corregir la dirección antes del primer
fulfillment. Preview y confirmación recalculan desde D1 precio, portes, delta y
stock; `edit_version` resuelve carreras y cada intención conserva snapshots
antes/después sin PII en eventos ni auditoría.

La migración expand-only `0016` añade cantidad vigente, amendments y asignación
de reembolsos por captura. Los aumentos usan Stripe Checkout alojado más reserva
de inventario; las reducciones se concilian de forma durable contra una o más
capturas y las ediciones neutras se aplican sin PSP. Los reembolsos R2 también
usan ya esta asignación, por lo que siguen siendo correctos tras cobros
adicionales. Demo pública inerte y backup esquema 10. ADR/runbook:
[`adr/0019-edicion-segura-pedidos.md`](adr/0019-edicion-segura-pedidos.md) y
[`OPERACION_EDICION_PEDIDOS.md`](OPERACION_EDICION_PEDIDOS.md).

Gate: **73 suites/440 tests**, tipos/build, reset `0001`–`0016`, E2E remoto y
a11y admin en verde. El rehearsal sobre backup remoto de 484.732 bytes conservó
8 pedidos/13 líneas/0 reembolsos, hashes legacy/canónico y 0 FKs tras restore.
Producción sirve D1 `0016` y Worker `6e61c22a-8291-436f-bea3-fdc27e6bb2af`.

La ventana transversal F11.9 queda cerrada y servida el 2026-08-13 en el Worker
`97ef7414-df2e-4d36-9220-b47fd55e5bc6`: E2E remoto 67/67 y Lighthouse 100 en
todas las categorías salvo rendimiento móvil de portada a 99 (LCP 1,9 s,
CLS/TBT 0). `main` incluyó después `fa65ead`, que elimina la animación móvil del
título; ese ajuste quedó servido junto al corte R3.4 descrito a continuación.

### R3.4 — Holds e incidencias — ✅ 2026-08-13

`ORD-010` queda servido como estado operativo ortogonal: alta manual o
automática idempotente, varios holds por pedido, motivo tipado, responsable
reasignable, SLA UTC, resolución optimista e histórico inmutable. Eventos y
auditoría excluyen responsable, notas y PII; el texto libre continúa en las
notas internas de R3.2.

`0017_order_holds.sql` es expand-only y fue ensayada sobre el backup remoto
`0016` de 485.227 bytes: conservó 8 pedidos, hash legacy
`d7f147b15c38554bd076ce648b56e3ac6756c8b0f8dff464c566901dea996202`,
esquema canónico y restore íntegro. D1 demo sirve `0017`, 2 fixtures/3 eventos,
1 hold activo y cero fallos de FK. El guard transaccional impide preparar un
nuevo envío con cualquier hold activo, incluida la carrera de alta-vs-envío.

El índice filtra activas o SLA vencido; el detalle presenta responsable,
vencimiento, resolución y actividad. `DEMO_MODE` rechaza las mutaciones con
`403`. Gate: **77 suites/463 tests**, tipos/build, reset `0001–0017`, E2E remoto
**71/71** y a11y afectada **4/4**. Worker servido:
`5ec8b676-781c-4463-9a18-7aa8a597a8eb`. Backup esquema 11 y runbook en
`OPERACION_INCIDENCIAS_PEDIDOS.md`.

### R3.5 — acciones masivas seguras — ✅ cerrado 2026-08-14

ADR-0021 y `0018_order_bulk_actions.sql` materializan lotes tipados para añadir
o quitar etiquetas y crear holds; estado, fulfillment, dinero, inventario y
proveedores siguen excluidos. Hasta 500 ids se congelan con fingerprints
SHA-256 y preview puro de 15 minutos. El job procesa chunks de 25, revalida cada
pedido y conserva progreso, resultado y evidencia por fila.

`ORD-011` y `AUT-011` están servidas en el preset avanzado. La demo conserva
selección y dry-run, pero su manifest no contiene job/efectos y las mutaciones
responden `403`. El replay retoma solo fallos reintentables; una interrupción
`pending` o `dead` recupera el mismo run y nunca repite evidencia aplicada.
Backup esquema 12 y runbook en `OPERACION_ACCIONES_MASIVAS_PEDIDOS.md`.

Rehearsal local: 8 pedidos, hash legacy
`7b6b862a1830aec8b73c0d1de81cbb98476a60e5c31d200a115ac0c5e87ef499`,
dump/restore íntegro y cero fallos FK. Gates de superficie: E2E completo y
a11y `admin:pedidos` a 1440/375 en verde. Gate limpio aislado: **81 suites/487
tests**, tipos y build en verde; el cierre remoto se anota tras el rollout
coordinado.

### R3.6 — ubicaciones — ✅ cerrado local 2026-08-14

ADR-0022 y `0019_inventory_locations.sql` crean almacenes/tiendas versionados,
una única principal y balances/movimientos por ubicación. El backfill conserva
físico, reservado, versiones y los 282 movimientos existentes. Triggers
expand-only reflejan todas las escrituras del ledger global, de modo que un
Worker anterior sigue siendo compatible; las secundarias permanecen vacías
hasta las transferencias R3.7.

`INV-005` añade navegación, API y panel responsive; la demo muestra dos fixtures
y rechaza efectos. Las mutaciones cliente son auditadas y optimistas, y la
principal no puede desactivarse. Backup esquema 13 y runbook en
`OPERACION_UBICACIONES_INVENTARIO.md`. Rehearsal: hash legacy
`6c54acebbda791a1763488736ea453a3a97a796a1bf64a09b10765b00e0129b8`,
dump/restore íntegro. Gate limpio: **84 suites/494 tests**, tipos/build, E2E y
a11y escritorio/375 en verde. D1 remota sirve `0019`: 279 balances y 279
movimientos proyectados, 0 divergencias y 0 fallos FK. El Worker sigue pendiente
de autorización específica de producción.

### R3.7 — transferencias — ✅ cerrado local 2026-08-14

ADR-0023 y `0020_inventory_transfers.sql` materializan borradores versionados,
envío idempotente, recibos parciales, discrepancias y enlaces exactos al ledger
append-only por ubicación. El stock enviado queda fuera de balances hasta su
recepción; una discrepancia cierra unidades sin inventar una entrada. La
ubicación principal continúa idéntica al ledger global y es la única vendible
hasta el motor de asignación R3.9.

`INV-007` añade API, navegación y panel responsive; el preset avanzado admite
efectos y la demo pública solo muestra un borrador coherente. Creación, envío y
recepción se validan en servidor, se auditan en la misma batch y soportan replay
por idempotency key y carrera de versión. Backup esquema 14 y runbook en
`OPERACION_TRANSFERENCIAS_INVENTARIO.md`.

Rehearsal sobre la D1 local real en `0019`: 282 variantes, 2 ubicaciones, hash
previo `54b641c88eeb2728c197f59d98d0f3f1fe15a0852601c7610a10d759361829c6`,
dump/restore íntegro y cero fallos FK. `0020` y el fixture se aplicaron solo en
local. E2E completo y a11y `admin:transferencias` a 1440/375 están en verde;
la revisión visual real confirma 0 overflow horizontal. El gate compartido
queda en 501/504 por tres fallos exclusivos del tema Monte en curso; el corte
limpio aislado pasa **88 suites/504 tests**, tipos y build. Sin D1 remota ni
deploy de Worker.

### R3.8 — conteos y ajustes — ✅ cerrado local 2026-08-14

ADR-0024 y `0021_inventory_counts.sql` materializan sesiones por ubicación con
saldo y versión congelados, motivos cerrados, doble control opcional y enlace
exacto al movimiento append-only. Aplicar revalida la foto completa: cualquier
venta, reserva, transferencia u otro ajuste intermedio invalida la sesión sin
escribir parcialmente. Daño no aumenta stock y ninguna corrección puede dejar
el físico por debajo del reservado.

`INV-008` añade API, navegación y panel responsive. El flujo directo aplica al
someter; el flujo controlado exige un revisor distinto del contador. Creación,
envío a revisión y aprobación son versionados, idempotentes y auditados. La
principal sigue pasando por el ledger global; una secundaria no altera el stock
vendible antes de R3.9. Demo pública inerte y backup esquema 15; runbook en
`OPERACION_CONTEOS_INVENTARIO.md`.

Rehearsal sobre la D1 local real en `0020`: 282 variantes, 2 ubicaciones, 1
transferencia, hash previo
`f464f25cca2a6809138abf878bbfd18f6f3787eb094155c886854b93a2cbc8b6`,
dump de 458.354 bytes, restore íntegro y cero fallos FK. `0021` y 616 sentencias
de seed se aplicaron solo en local. E2E completo, demo inerte y a11y
`admin:conteos` a 1440/375 están en verde. La revisión visual corrigió el foco
horizontal de la navegación móvil sobre la sección activa y confirma 0 overflow.
El gate compartido queda en 511/514 por tres fallos exclusivos del tema Monte;
el corte limpio aislado pasa **92 suites/514 tests**, tipos y build. Sin D1
remota ni deploy de Worker.

### R3.9 — motor de asignación — ✅ cerrado local 2026-08-14

ADR-0025 y `0022_inventory_allocation.sql` vinculan cada fulfillment a una sola
ubicación capaz de cubrirlo completo. Mercado, canal y stock filtran; prioridad,
coste e ID desempatan de forma estable. La decisión congela versión, demanda y
motivo de cada descarte. Principal no vuelve a consumir la venta ya descontada;
si gana una secundaria, la misma batch libera principal/global y consume la
secundaria, conservando el total físico de red.

`INV-011` añade API, navegación y panel responsive. Las políticas se editan con
versión optimista y auditoría; la demo muestra una explicación realista y
rechaza efectos. Backup esquema 16 y runbook en
`OPERACION_ASIGNACION_INVENTARIO.md`. Una carrera por la última secundaria deja
un único ganador y revierte fulfillment, decisión y movimientos del perdedor.

Rehearsal sobre el dump real en `0021`: 282 variantes, 2 ubicaciones, 1
transferencia, 2 políticas, hash previo
`ba963f2f647992f4c9bc8806756fa557a40cdc773f567ebfaf4af7791d7684bf`, dump de
463.406 bytes, restore íntegro y cero fallos FK. `0022` y 620 sentencias de seed
se aplicaron solo en local. E2E completo y a11y `admin:asignacion` a 1440/375
están en verde; la revisión visual confirma 0 overflow y navegación móvil
centrada. El gate compartido queda en 522/525 por tres fallos exclusivos del
tema Monte; el corte limpio aislado pasa **96 suites/525 tests**, tipos y build.
Sin D1 remota ni deploy de Worker.

### R3.10 — devoluciones/RMA — ✅ cerrado local 2026-08-14

ADR-0026 y `0023_returns_rma.sql` separan la logística inversa de la
cancelación. Solo son elegibles unidades entregadas, no reclamadas y dentro de
30 días. Solicitud, autorización, tránsito, recepción, inspección y resolución
son versionadas e idempotentes, con eventos propios y FKs que demuestran pedido
y línea.

`FUL-011` añade API, navegación y panel responsive. El cierre agrupa evento,
auditoría, reembolso real por capturas, estado, reposición condicionada y cambio
pendiente en una única batch. Autorizar o recibir nunca mueve stock; solo una
línea inspeccionada como `restock` crea `return_restock` en la ubicación
receptora. La demo pública muestra un expediente recibido y rechaza efectos.
Backup esquema 17 y runbook en `OPERACION_DEVOLUCIONES_RMA.md`.

La reserva física y diferencia económica de un cambio permanecen explícitamente
pendientes en `FUL-012`; las reglas configurables por categoría, coste y
excepción permanecen parciales en `FUL-014`.

Rehearsal sobre el dump real en `0022`: 8 pedidos, 2 entregados, 4 fulfillments,
2 ubicaciones, hash previo
`663bee27f8a7ac8946467ef25138ba5cf9176061e0f5a96cb31bf9241399a7a7`, dump de
479.500 bytes, restore íntegro y cero expedientes inventados. `0023` y 625
sentencias de seed se aplicaron solo en local. E2E completo —incluido el rechazo
403 de alta y transición RMA— y a11y `admin:devoluciones` a 1440/375 están en
verde; la revisión visual confirma el layout responsive. El gate compartido
queda en 534/537 por tres fallos exclusivos del tema Monte en curso; el corte
limpio aislado pasa **100 suites/537 tests**, tipos y build. Sin D1 remota ni
deploy de Worker.

### R3.11 — documentos operativos — ✅ cerrado local 2026-08-14

ADR-0027 y `0024_order_documents.sql` separan dos responsabilidades: Logic2B
genera albaranes y etiquetas internas no fiscales, mientras facturas y
rectificativas solo registran referencias emitidas por un proveedor fiscal
externo. Los importes de esas referencias se recalculan desde pedido o
reembolso; el navegador nunca los decide y ningún artefacto fiscal se almacena
o renderiza aquí.

`ORD-012` añade API, navegación y panel responsive. Los documentos generados
son snapshots inmutables con plantilla, versión, checksum y artefacto HTML; una
sustitución crea una versión nueva y conserva el linaje. Las referencias
externas guardan proveedor, URL HTTPS y trazabilidad, pero no contenido local.
Alta, sustitución y anulación son versionadas, idempotentes y auditadas. La demo
muestra un albarán y una referencia de factura, y rechaza todos los efectos.
Backup esquema 18 y runbook en `OPERACION_DOCUMENTOS_PEDIDO.md`.

Rehearsal sobre el dump real en `0023`: 8 pedidos, 4 fulfillments y 0
devoluciones/reembolsos, hash previo
`dc08c070b9e8a990a497f16daea1bccd922375b36bfdf8702e8ae75a05a9aade`, dump de
489.234 bytes, restore íntegro y cero documentos inventados. `0024` y 629
sentencias de seed se aplicaron solo en local. E2E completo —incluido el rechazo
403 de alta y anulación— y a11y `admin:documentos` a 1440/375 están en verde;
la revisión visual confirma 0 overflow y que el artefacto no contiene importes.
El gate compartido queda en 547/550 por tres fallos exclusivos del tema Monte
en curso; el corte limpio aislado pasa **104 suites/550 tests**, tipos y build.
Sin D1 remota ni deploy de Worker.

### R3.12 — consolidación R3 — ✅ cerrado local 2026-08-14

`tests/r3-consolidation-runtime.test.ts` recorre en una única base la operación
vertical: transferencia principal→secundaria, pedido pagado con reserva, hold
que impide preparar, resolución versionada, asignación explicada a la
secundaria, entrega, RMA recibido e inspeccionado, reembolso, reposición en la
ubicación receptora y backup/restore esquema 18. El stock final de red vuelve a
ser coherente y `foreign_key_check` queda vacío antes y después del restore.

`GUIA_OPERACION_R3.md` consolida el corte `0014`–`0024`, las consultas de
reconciliación, la matriz de incidencias y la recuperación por replay o hecho
compensatorio. `SEC-015` pasa a parcial: contención, recuperación y evidencia
sin PII son reales; comunicación por cliente, RPO/RTO, alertas y postmortem
recurrente siguen en R11. La ficha
`wiki/operacion-pedidos-inventario-devoluciones.md` queda enlazada solo por los
módulos de pedidos, inventario y fulfillment, enumera capacidades actuales y
declara aparte las parciales, conectores y pendientes. No crea ruta indexable:
el publicador corresponde a R8.4.

El gate compartido queda en 549/552 por tres fallos exclusivos del tema Monte
en curso; el corte limpio aislado pasa **105 suites/552 tests**, tipos y build.
R3.12 no cambia D1, UI ni sitemap; E2E/a11y de las superficies R3 ya quedaron
verificados en sus bloques. Sin migración remota ni deploy de Worker. La cabeza
principal pasa a R4.1, motor de reglas de precio.

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
| R1 | Cimientos modulares y observables | 🟡 5/12 bloques cerrados |
| R2 | Núcleo transaccional profesional | ⬜ |
| R3 | Operación de pedidos, inventario y fulfillment | ⬜ |
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
| 6 | **R1.6 Diseño y aprobación de outbox** | ADR, SQL exacto, retención, claim/retry/dead-letter y compatibilidad D1; pruebas contractuales antes de migrar. Puerta de decisión de esquema. | 🟡 2026-08-06 — propuesta lista; espera aprobación |
| 7 | **R1.7 Outbox transaccional** | Migración aprobada, escritura atómica en mutaciones de pago/pedido y dispatcher idempotente; fallo del consumidor no revierte el negocio. | ⬜ |
| 8 | **R1.8 Audit log transversal** | Actor, acción, entidad, diff redacted y correlation id; pagos, pedidos, producto y admin cubiertos; export autenticado. | ⬜ |
| 9 | **R1.9 Observabilidad base** | Logger estructurado, errores tipados, métricas de checkout/webhook/outbox/email e IDs visibles en runbook; sin PII. | ⬜ |
| 10 | **R1.10 Registro de integraciones** | Estado/config no secreta/health/última sync/error; secretos fuera de D1; adaptadores actuales registrados. | ⬜ |
| 11 | **R1.11 Contrato de jobs** | Ejecución única/recurrente, lock, timeout, reintento y replay; cron de demo migra sin regresión. | ⬜ |
| 12 | **R1.12 Consolidación R1** | Tests de presets, fallos, concurrencia y clonabilidad; docs de crear módulo; ficha wiki de arquitectura; auditoría de dependencias. | ⬜ |

## R2 — Núcleo transaccional profesional

Esta ola cambia las primitivas de dinero, producto, inventario y fulfillment.
Cada migración se diseña y ensaya sobre una copia antes de tocar el esquema vivo.

| Orden | Bloque de una sesión | Entregables y criterio específico | Estado |
|---:|---|---|---|
| 13 | **R2.1 Modelo objetivo y plan de migración** | ERD/ADR para producto-variante, inventario, pago, fulfillment y reembolso; compatibilidad con seeds y export; cero código de escritura. | ⬜ |
| 14 | **R2.2 Producto-variante: esquema** | Migración aditiva, backfill 1:1, constraints/índices y restore rehearsal; producto simple sigue idéntico. | ⬜ |
| 15 | **R2.3 Producto-variante: dominio y lectura** | Repositorio y tipos canónicos; storefront y quote leen variante; guardarraíl prohíbe precio desde cliente. | ⬜ |
| 16 | **R2.4 Producto-variante: admin y seed** | CRUD de opciones/variantes/SKU/estado con validación; import/export y seed actual migrados. | ⬜ |
| 17 | **R2.5 Media y atributos tipados** | Galería, alt/foco/orden/asociación a variante; atributos con definición, valor y validación. | ⬜ |
| 18 | **R2.6 Ledger de inventario: diseño** | Movimientos, balance, razones, reservas y concurrencia; invariantes y SQL propuesto. | ⬜ |
| 19 | **R2.7 Ledger de inventario: implementación** | Migración, backfill del stock, escrituras append-only y proyección de disponible; doble webhook no duplica movimiento. | ⬜ |
| 20 | **R2.8 Reservas y expiración** | Reserva opcional por carrito/checkout, TTL, liberación, captura y carrera última unidad; feature apagada por defecto. | ⬜ |
| 21 | **R2.9 Ledger de pagos** | Payment/transaction/refund con proveedor, moneda, importe, status e idempotencia; pedido no usa un único string como contabilidad. | ⬜ |
| 22 | **R2.10 Reembolso total** | Acción admin → proveedor → ledger → evento → email → stock según política; retry seguro y estado visible. | ⬜ |
| 23 | **R2.11 Fulfillment por líneas** | Fulfillment y fulfillment_items; envío total actual se convierte en un caso simple. | ⬜ |
| 24 | **R2.12 Fulfillment parcial** | Cantidades parciales, múltiples trackings, email por envío y estados derivados sin perder histórico. | ⬜ |
| 25 | **R2.13 Cancelación/reembolso parcial** | Selección por cantidad, cálculo servidor, descuento/restitución correcta y pruebas de redondeo/concurrencia. | ⬜ |
| 26 | **R2.14 Consolidación R2** | E2E producto con variantes → reserva → pago → dos envíos → reembolso parcial; carga/concurrencia; guía de migración. | ⬜ |

## R3 — Operación profesional

| Orden | Bloque de una sesión | Entregables y criterio específico | Estado |
|---:|---|---|---|
| 27 | **R3.1 Índice de pedidos escalable** | Cursor, búsqueda, filtros combinables, sort estable y límites; URL compartible y consulta indexada. | ⬜ |
| 28 | **R3.2 Notas, etiquetas y timeline** | Visibilidad interna/cliente, actor, edición auditada y filtros. | ⬜ |
| 29 | **R3.3 Edición de pedido** | Añadir/quitar/cantidad/dirección con preview de delta, pago adicional o reembolso y stock. | ⬜ |
| 30 | **R3.4 Holds e incidencias** | Bloqueo manual/automático, motivo, responsable, SLA y desbloqueo; preparación no avanza en hold. | ⬜ |
| 31 | **R3.5 Acciones masivas** | Selección estable, dry-run, job, progreso, resultados por fila y replay seguro. | ⬜ |
| 32 | **R3.6 Ubicaciones** | Modelo y admin de almacenes/tiendas; inventario simple se backfillea a ubicación principal. | ⬜ |
| 33 | **R3.7 Transferencias** | Borrador→enviado→recibido parcial, discrepancias y movimientos de ledger. | ⬜ |
| 34 | **R3.8 Conteos y ajustes** | Conteo por ubicación, razón, doble control opcional y auditoría. | ⬜ |
| 35 | **R3.9 Motor de asignación** | Reglas deterministas por stock, prioridad, mercado/canal y coste; explicación guardada. | ⬜ |
| 36 | **R3.10 Devoluciones/RMA** | Solicitud, elegibilidad, recepción, inspección, resolución, reembolso/cambio y reposición. | ⬜ |
| 37 | **R3.11 Documentos operativos** | Albarán, factura/rectificativa mediante conector o plantilla, etiquetas internas y versionado. | ⬜ |
| 38 | **R3.12 Consolidación R3** | E2E multiubicación, fulfillment y devolución; runbooks de incidencias; wiki de operación publicada solo para capacidades reales. | ⬜ |

## R4 — Precios, promociones y modelos de venta

| Orden | Bloque de una sesión | Entregables y criterio específico | Estado |
|---:|---|---|---|
| 39 | **R4.1 Motor de reglas de precio** | Contexto, prioridad, vigencia y desglose; funciones puras y trazables. | ⬜ |
| 40 | **R4.2 Códigos promocionales** | Límites, scopes, uso, seguridad y devolución proporcional. | ⬜ |
| 41 | **R4.3 Descuentos automáticos** | Elegibilidad y motivo visible; conflicto con códigos resuelto por matriz. | ⬜ |
| 42 | **R4.4 Cantidad y compra X/Y** | Tramos, múltiplos, selección de líneas y casos de edición/devolución. | ⬜ |
| 43 | **R4.5 Combinabilidad** | Clases producto/pedido/envío, tope, prioridad y explicación en checkout/pedido. | ⬜ |
| 44 | **R4.6 Listas de precios** | Precio por mercado/canal/empresa con fallback y snapshot de origen. | ⬜ |
| 45 | **R4.7 Bundles** | Fijo y componible, stock de componentes, fulfillment y devolución. | ⬜ |
| 46 | **R4.8 Tarjeta regalo/crédito** | Ledger, emisión, uso parcial, saldo y reembolso; revisión legal por proyecto. | ⬜ |
| 47 | **R4.9 Preventa/backorder** | Promesa, asignación, cobro y comunicación. | ⬜ |
| 48 | **R4.10 Suscripciones por adaptador** | Contrato proveedor, eventos, cambio/pausa/cancelación, impago y portal. | ⬜ |
| 49 | **R4.11 Presupuestos y depósitos** | Draft order, caducidad, aprobación, enlace de pago y saldo. | ⬜ |
| 50 | **R4.12 Consolidación R4** | Matriz exhaustiva de reglas, property tests de dinero y wiki de cada modelo. | ⬜ |

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
con eventos declarados; jobs y healthchecks siguen pendientes de R1.11 y R1.10.

## 6. Puerta de decisión actual

### R1.6 — Diseño listo; aprobación pendiente

La propuesta está completa en [ADR-0007](adr/0007-outbox-transaccional-d1.md),
con SQL exacto fuera de `migrations/`, contrato ejecutable y pruebas sobre
SQLite. Wrangler D1 local ejecutó sus siete sentencias sin cambios. El diseño
fija dos tablas (hecho inmutable + entrega por consumidor), claim atómico de 25
filas con lease de 60 s, entrega at-least-once, siete backoffs y dead-letter al
octavo fallo, errores redacted y retención de entregados durante 30 días; los
pendientes y dead-letter nunca se purgan automáticamente.

**Esperando aprobación de Andreu.** No existe migración 0004, escritura,
dispatcher, cron ni cambio de runtime. Si se aprueba el esquema, se marca R1.6
cerrado y el siguiente bloque es **R1.7 — outbox transaccional**. Si cambia una
decisión estructural, se revisan primero ADR, SQL y contratos sin tocar D1.

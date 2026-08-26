# Architecture Decision Records

Los ADRs aceptados fijan decisiones mandatadas por F13/R1.1. Cambiar una exige
un ADR sucesor, actualización de checks y revisión del roadmap; editar el pasado
para ocultar una decisión no es válido.

| ADR | Decisión | Estado |
|---|---|---|
| [0001](0001-monolito-modular-y-aislamiento.md) | Monolito modular y aislamiento por despliegue | accepted |
| [0002](0002-limites-y-direccion-de-dependencias.md) | Límites y dirección de dependencias | accepted |
| [0003](0003-puertos-adaptadores-y-composition-root.md) | Puertos, adaptadores y composition root | accepted |
| [0004](0004-ciclo-de-vida-de-capacidades.md) | Ciclo de vida de capacidades | accepted |
| [0005](0005-transicion-incremental.md) | Transición incremental sin big-bang | accepted |
| [0006](0006-sobre-de-eventos.md) | Sobre de evento versionado | accepted |
| [0007](0007-outbox-transaccional-d1.md) | Outbox transaccional sobre D1 | accepted |
| [0008](0008-audit-log-seguro-d1.md) | Audit log seguro y sin superficie pública | accepted |
| [0009](0009-observabilidad-segura-workers-logs.md) | Observabilidad segura sobre Workers Logs | accepted |
| [0010](0010-registro-integraciones-seguro.md) | Registro de integraciones seguro y sin secretos | accepted |
| [0011](0011-jobs-duraderos-d1.md) | Jobs duraderos y bloqueados sobre D1 | accepted |
| [0012](0012-modelo-transaccional-r2.md) | Modelo producto-variante, ledgers y fulfillment incremental | accepted (diseño) |
| [0013](0013-media-y-atributos-tipados.md) | Galería por producto/variante y atributos tipados | accepted (puerta 2026-08-10) |
| [0014](0014-ledger-inventario-global.md) | Ledger global por variante, concurrencia y reservas opcionales | accepted; R2.7–R2.8 implementados localmente |
| [0015](0015-fulfillment-por-lineas.md) | Fulfillment por líneas y transición del envío total | accepted; R2.11–R2.12 implementados localmente |
| [0016](0016-cancelacion-reembolso-parcial.md) | Cancelación/reembolso parcial y reserva de cantidades | accepted |
| [0017](0017-indice-pedidos-cursor-fts.md) | Cursor estable, filtros combinables y búsqueda FTS de pedidos | accepted |
| [0018](0018-colaboracion-pedidos-timeline.md) | Notas versionadas, etiquetas idempotentes y timeline compuesto | accepted |
| [0019](0019-edicion-segura-pedidos.md) | Edición versionada, conciliación financiera y stock | accepted; R3.3 implementado |
| [0020](0020-holds-incidencias-pedidos.md) | Holds ortogonales, SLA y bloqueo de preparación | accepted; R3.4 servido |
| [0021](0021-acciones-masivas-seguras.md) | Selección congelada, preview sin efectos y replay por pedido | accepted; R3.5 implementado |
| [0022](0022-ubicaciones-inventario.md) | Ubicación principal compatible y transición desde ledger global | accepted; R3.6 implementado localmente |
| [0023](0023-transferencias-inventario.md) | Transferencias trazables sin adelantar asignación | accepted; R3.7 implementado localmente |
| [0024](0024-conteos-ajustes-inventario.md) | Conteos versionados, doble control y ajustes append-only | accepted; R3.8 implementado localmente |
| [0025](0025-asignacion-inventario.md) | Asignación determinista, vinculante y explicable | accepted; R3.9 implementado localmente |
| [0026](0026-devoluciones-rma.md) | RMA separado de cancelación y cierre transaccional | accepted; R3.10 implementado localmente |
| [0027](0027-documentos-operativos-no-fiscales.md) | Snapshots operativos propios y fiscalidad externa | accepted; R3.11 implementado localmente |
| [0028](0028-motor-reglas-precio.md) | Evaluación pura, ganador único y snapshot de precio por línea | accepted; R4.1 implementado localmente |
| [0029](0029-codigos-promocionales-seguros.md) | Hash, scope y reserva transaccional de usos promocionales | accepted; R4.2 implementado localmente |
| [0030](0030-descuentos-automaticos-y-precedencia.md) | Campaña automática única y precedencia global del código | accepted; R4.3 implementado localmente |
| [0031](0031-ofertas-cantidad-x-y.md) | Tramos, selección X/Y y prorrateo congelado a favor del comprador | accepted; R4.4 implementado localmente |
| [0032](0032-combinabilidad-explicita-descuentos.md) | Matrices explícitas, tope y aplicación canónica de descuentos | accepted; R4.5 implementado localmente |
| [0033](0033-listas-precios-contextuales.md) | Precio contextual antes de promociones y fallback por producto | accepted; R4.6 implementado localmente |
| [0034](0034-bundles-composicion-congelada.md) | Línea comercial con composición e inventario de componentes congelados | accepted; R4.7 implementado localmente |
| [0035](0035-valor-almacenado-ledger.md) | Ledger de tarjeta regalo/crédito, pago mixto y reembolso al medio original | accepted; R4.8 desplegado |
| [0036](0036-preventa-backorder-compromiso.md) | Compromiso diferido, cupo, FIFO y stock físico no negativo | accepted; R4.9 implementado localmente |
| [0037](0037-suscripciones-adaptador-verificado.md) | Suscripciones neutrales, hechos verificados, impago y portal alojado | accepted; R4.10 implementado localmente |
| [0038](0038-presupuestos-depositos-transiciones-explicitas.md) | Presupuesto, depósito/saldo y conversión explícita sin reservar antes de tiempo | accepted; R4.11 implementado localmente |
| [0039](0039-perfil-cliente-identidad-opaca.md) | Perfil deduplicable, guest intacto y snapshots de pedido inmutables | accepted; R5.1 implementado localmente |
| [0040](0040-consentimiento-evidencia-versionada.md) | Evidencia por canal/finalidad, retirada y preferencia separada | accepted; R5.2 implementado localmente |
| [0041](0041-derechos-datos-plan-verificable.md) | Solicitud verificada, plan dry-run por propietario y doble control | accepted; persistence implemented, execution gated |
| [0042](0042-autenticacion-passwordless-revocable.md) | Challenge de un uso y sesión opaca, rotatoria, revocable y anti-enumeración | accepted; local persistence and gated surface implemented |
| [0043](0043-superficie-passwordless-email-segura.md) | Magic link por Resend directo, origen/cookie/CSRF/CSP, rate limit y recuperación segura | accepted; R5.4d implemented locally, isolated rollout pending |
| [0044](0044-ownership-recursos-autoservicio.md) | Autenticación, permisos mínimos y ownership exacto por recurso | accepted; R5.5a domain contract installed, persistence and surfaces pending |
| [0045](0045-segmentos-calculados-observables.md) | Templates versionados, hechos honestos y recálculo observable | accepted; R5.6a contract installed, persistence pending |

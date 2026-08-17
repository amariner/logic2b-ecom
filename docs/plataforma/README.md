# Plataforma Logic2B Ecommerce

> Fuente de verdad de la evolución posterior al MVP. Esta carpeta convierte la
> visión «backend mínimo, capacidad máxima» en trabajo verificable por sesiones.

## La tesis

Logic2B Ecommerce no es un SaaS multiinquilino ni un panel universal. Cada
cliente recibe un despliegue aislado, una base sólida y únicamente los módulos
que necesita. La amplitud de la plataforma se conserva en el código compartido,
los contratos y los conectores; la complejidad que ve cada comercio se mantiene
proporcional a su negocio.

La paridad de capacidad no significa copiar todos los productos de una gran
plataforma. Significa poder resolver el mismo resultado comercial por una de
estas cuatro vías:

1. **Núcleo nativo**: imprescindible para toda tienda y mantenido por Logic2B.
2. **Módulo activable**: código compartido que solo se habilita donde aporta.
3. **Conector**: integración con un especialista externo mediante un contrato
   estable, observable y sustituible.
4. **Servicio gestionado**: operación o desarrollo a medida que no debe
   convertirse en configuración permanente del panel.

Una quinta clasificación, **fuera de alcance deliberado**, evita confundir
paridad comercial con fabricar bancos, redes publicitarias, hardware de punto de
venta o servicios logísticos propios.

## Documentos

- [`INVESTIGACION_EDICIONES_2022_2026.md`](INVESTIGACION_EDICIONES_2022_2026.md):
  lectura de las nueve ediciones, tendencias y consecuencias para el producto.
- [`MATRIZ_CAPACIDADES.md`](MATRIZ_CAPACIDADES.md): inventario canónico de
  dominios, capacidades, forma de entrega, prioridad y estado real.
- [`ROADMAP.md`](ROADMAP.md): orden de ejecución por bloques de una sesión,
  dependencias y criterios de cierre.
- [`WIKI_SEO.md`](WIKI_SEO.md): arquitectura editorial y técnica de la futura
  wiki pública de funcionalidades.
- [`arquitectura/README.md`](arquitectura/README.md): inventario real, mapa de
  módulos, dependencias permitidas y transición incremental fijados en R1.1.
- [`arquitectura/DEUDA.md`](arquitectura/DEUDA.md): allowlist exacta y bloques
  responsables de eliminarla.
- [`CREAR_MODULO_Y_JOB.md`](CREAR_MODULO_Y_JOB.md): recorrido operativo para
  declarar, componer, probar y documentar un módulo o trabajo nuevo.
- [`AUDITORIA_DEPENDENCIAS_R1.md`](AUDITORIA_DEPENDENCIAS_R1.md): inventario,
  imports y advisories del lockfile al cierre de R1.
- [`MODELO_TRANSACCIONAL_R2.md`](MODELO_TRANSACCIONAL_R2.md): ERD, invariantes,
  compatibilidad, backfills y ensayo de restore que gobiernan R2.2–R2.14.
- [`GUIA_MIGRACION_R2.md`](GUIA_MIGRACION_R2.md): secuencia expand-first,
  rehearsals, configuración, downgrade, restore y puerta futura de contracción
  consolidados en R2.14.
- [`adr/`](adr/): decisiones de arquitectura modular aceptadas y propuestas.
- [`sql/0004_event_outbox.proposed.sql`](sql/0004_event_outbox.proposed.sql):
  evidencia exacta de la propuesta R1.6 aprobada; la migración viva es
  [`../../migrations/0004_event_outbox.sql`](../../migrations/0004_event_outbox.sql).
- [`wiki/arquitectura-modular-ecommerce.md`](wiki/arquitectura-modular-ecommerce.md):
  borrador interno, no indexable, de la futura página de arquitectura.
- [`wiki/eventos-de-dominio-trazabilidad.md`](wiki/eventos-de-dominio-trazabilidad.md):
  borrador interno, no indexable, de la futura página de eventos y trazabilidad
  (R1.5–R1.7); la capacidad ya es operativa, publicación editorial pendiente.
- [`wiki/auditoria-operaciones-ecommerce.md`](wiki/auditoria-operaciones-ecommerce.md):
  borrador interno R1.8 sobre evidencia transaccional redactada y sin export
  desde el Worker público.
- [`OPERACION_OBSERVABILIDAD.md`](OPERACION_OBSERVABILIDAD.md): runbook R1.9
  para correlacionar checkout, webhook, outbox y email sin PII.
- [`wiki/observabilidad-operativa-ecommerce.md`](wiki/observabilidad-operativa-ecommerce.md):
  borrador interno R1.9; no promete alertas hasta que R11.5 las implemente.
- [`wiki/integraciones-observables.md`](wiki/integraciones-observables.md):
  borrador interno R1.10; distingue registro/health local de panel, replay y
  sondeos remotos todavía pendientes.
- [`wiki/nucleo-transaccional-ecommerce.md`](wiki/nucleo-transaccional-ecommerce.md):
  borrador interno actualizado en R2.13; variantes, ledgers, fulfillment y
  cancelación parcial tienen evidencia local/remota, con publicación editorial aún pendiente.
- [`adr/0011-jobs-duraderos-d1.md`](adr/0011-jobs-duraderos-d1.md): contrato
  R1.11 de identidad, lock, timeout, retry, dead-letter y replay sobre D1.
- [`adr/0012-modelo-transaccional-r2.md`](adr/0012-modelo-transaccional-r2.md):
  decisión de separación de producto/variante, inventario, pago, reembolso y
  fulfillment mediante transición incremental.
- [`../../migrations/0007_product_variants.sql`](../../migrations/0007_product_variants.sql):
  esquema aditivo R2.2, backfill default 1:1 y snapshots compatibles de línea.
- [`../../migrations/0008_product_media_attributes.sql`](../../migrations/0008_product_media_attributes.sql):
  esquema aditivo R2.5 para galería y atributos tipados con backfill de imagen.
- [`../../migrations/0009_inventory_ledger.sql`](../../migrations/0009_inventory_ledger.sql):
  ledger R2.7, balance por variante y apertura determinista desde stock legacy.
- [`adr/0014-ledger-inventario-global.md`](adr/0014-ledger-inventario-global.md):
  diseño R2.6 de movimientos, balances, concurrencia, backfill y reservas.
- [`sql/0009_inventory_ledger.proposed.sql`](sql/0009_inventory_ledger.proposed.sql):
  propuesta R2.6 conservada como evidencia; la migración viva es `0009`.
- [`sql/0010_inventory_reservations.proposed.sql`](sql/0010_inventory_reservations.proposed.sql):
  propuesta R2.6 conservada como evidencia; la migración viva R2.8 es `0010`.
- [`../../migrations/0011_payment_ledger.sql`](../../migrations/0011_payment_ledger.sql):
  esquema aditivo R2.9 para intención, asiento financiero y reembolso.
- [`OPERACION_LEDGER_PAGOS.md`](OPERACION_LEDGER_PAGOS.md): rehearsal,
  backfill por moneda, corte coordinado, rollback y recuperación R2.9.
- [`OPERACION_REEMBOLSOS.md`](OPERACION_REEMBOLSOS.md): contrato operativo,
  estados, retry/reconciliación y separación dinero-stock de R2.10.
- [`../../migrations/0012_fulfillment_lines.sql`](../../migrations/0012_fulfillment_lines.sql):
  esquema aditivo R2.11 de grupos y cantidades por línea.
- [`../../migrations/0013_partial_refund_guards.sql`](../../migrations/0013_partial_refund_guards.sql):
  esquema aditivo R2.13 que tipa la operación y reserva cantidades cancelables;
  materializado, ensayado y aplicado local/remotamente el 2026-08-12.
- [`adr/0017-indice-pedidos-cursor-fts.md`](adr/0017-indice-pedidos-cursor-fts.md):
  contrato R3.1 de cursor bidireccional, orden estable, filtros y búsqueda FTS.
- [`../../migrations/0014_order_list_indexes.sql`](../../migrations/0014_order_list_indexes.sql):
  índices compuestos y proyección FTS5 sincronizada del índice de pedidos.
- [`OPERACION_INDICE_PEDIDOS.md`](OPERACION_INDICE_PEDIDOS.md): preflight,
  planes de consulta, backup esquema 8, rollout y rollback compatibles.
- [`adr/0018-colaboracion-pedidos-timeline.md`](adr/0018-colaboracion-pedidos-timeline.md):
  separación entre hechos transaccionales y colaboración versionada R3.2.
- [`../../migrations/0015_order_collaboration.sql`](../../migrations/0015_order_collaboration.sql):
  notas/revisiones, etiquetas/asignaciones y actividad colaborativa aditivas.
- [`OPERACION_COLABORACION_PEDIDOS.md`](OPERACION_COLABORACION_PEDIDOS.md):
  preflight, concurrencia, backup esquema 9, rollout y rollback compatibles.
- [`adr/0019-edicion-segura-pedidos.md`](adr/0019-edicion-segura-pedidos.md):
  versión de pedido, cobro adicional, reembolso por captura y stock de R3.3.
- [`adr/0021-acciones-masivas-seguras.md`](adr/0021-acciones-masivas-seguras.md):
  selección congelada, preview sin efectos y replay por pedido de R3.5.
- [`../../migrations/0018_order_bulk_actions.sql`](../../migrations/0018_order_bulk_actions.sql):
  lotes tipados y selección/resultados congelados por pedido.
- [`OPERACION_ACCIONES_MASIVAS_PEDIDOS.md`](OPERACION_ACCIONES_MASIVAS_PEDIDOS.md):
  rehearsal, rollout, reanudación, purga y rollback expand-only de R3.5.
- [`adr/0022-ubicaciones-inventario.md`](adr/0022-ubicaciones-inventario.md):
  ubicación principal, backfill y transición compatible del ledger global.
- [`../../migrations/0019_inventory_locations.sql`](../../migrations/0019_inventory_locations.sql):
  ubicaciones, balances/movimientos proyectados y triggers de compatibilidad.
- [`OPERACION_UBICACIONES_INVENTARIO.md`](OPERACION_UBICACIONES_INVENTARIO.md):
  rehearsal, rollout, reconciliación y rollback de R3.6.
- [`adr/0023-transferencias-inventario.md`](adr/0023-transferencias-inventario.md):
  agregado versionado, stock en tránsito y compatibilidad de la principal R3.7.
- [`../../migrations/0020_inventory_transfers.sql`](../../migrations/0020_inventory_transfers.sql):
  borradores, líneas, recibos parciales y enlaces al ledger por ubicación.
- [`OPERACION_TRANSFERENCIAS_INVENTARIO.md`](OPERACION_TRANSFERENCIAS_INVENTARIO.md):
  ensayo, rollout, reconciliación, incidencias y rollback expand-only R3.7.
- [`adr/0024-conteos-ajustes-inventario.md`](adr/0024-conteos-ajustes-inventario.md):
  foto versionada, doble control y corrección append-only de R3.8.
- [`../../migrations/0021_inventory_counts.sql`](../../migrations/0021_inventory_counts.sql):
  sesiones, líneas congeladas y enlaces de ajuste al ledger por ubicación.
- [`OPERACION_CONTEOS_INVENTARIO.md`](OPERACION_CONTEOS_INVENTARIO.md):
  ensayo, rollout, reconciliación, incidencias y rollback expand-only R3.8.
- [`adr/0025-asignacion-inventario.md`](adr/0025-asignacion-inventario.md):
  selección determinista y traslado contable sin doble consumo de R3.9.
- [`../../migrations/0022_inventory_allocation.sql`](../../migrations/0022_inventory_allocation.sql):
  políticas versionadas, explicación vinculada y enlaces de movimiento.
- [`OPERACION_ASIGNACION_INVENTARIO.md`](OPERACION_ASIGNACION_INVENTARIO.md):
  ensayo, rollout, reconciliación, incidencias y rollback expand-only R3.9.
- [`adr/0026-devoluciones-rma.md`](adr/0026-devoluciones-rma.md):
  logística inversa separada y cierre transaccional de R3.10.
- [`../../migrations/0023_returns_rma.sql`](../../migrations/0023_returns_rma.sql):
  expedientes RMA, recepción, inspección, movimientos y cambios pendientes.
- [`OPERACION_DEVOLUCIONES_RMA.md`](OPERACION_DEVOLUCIONES_RMA.md):
  ensayo, rollout, conciliación, incidencias y rollback de devoluciones.
- [`adr/0027-documentos-operativos-no-fiscales.md`](adr/0027-documentos-operativos-no-fiscales.md):
  snapshots logísticos propios y frontera explícita con la emisión fiscal externa.
- [`../../migrations/0024_order_documents.sql`](../../migrations/0024_order_documents.sql):
  plantillas, versiones, artefactos, referencias externas, eventos y guardas de alcance.
- [`OPERACION_DOCUMENTOS_PEDIDO.md`](OPERACION_DOCUMENTOS_PEDIDO.md):
  rehearsal, rollout, reconciliación, incidencias y rollback documental R3.11.
- [`GUIA_OPERACION_R3.md`](GUIA_OPERACION_R3.md): corte `0014`–`0024`,
  reconciliación, matriz de incidencias, recuperación y evidencia vertical R3.12.
- [`wiki/operacion-pedidos-inventario-devoluciones.md`](wiki/operacion-pedidos-inventario-devoluciones.md):
  ficha operativa enlazada por pedidos, inventario y fulfillment; solo enumera
  capacidades actuales y conserva fuera las parciales, conectores y pendientes.
- [`adr/0028-motor-reglas-precio.md`](adr/0028-motor-reglas-precio.md):
  evaluación pura por contexto, prioridad estable y snapshot auditable por línea.
- [`../../migrations/0025_price_rule_snapshots.sql`](../../migrations/0025_price_rule_snapshots.sql):
  expansión compatible del precio base y desglose congelado de cada línea.
- [`OPERACION_REGLAS_PRECIO.md`](OPERACION_REGLAS_PRECIO.md): rehearsal,
  rollout, reconciliación y rollback expand-only del motor R4.1.
- [`wiki/reglas-precio-trazables.md`](wiki/reglas-precio-trazables.md):
  ficha interna enlazada solo desde `pricing`, sin ruta pública ni promesas de
  códigos, campañas o combinabilidad todavía inexistentes.
- [`adr/0029-codigos-promocionales-seguros.md`](adr/0029-codigos-promocionales-seguros.md):
  lookup sin texto claro, límites concurrentes y uso ligado al pedido R4.2.
- [`../../migrations/0026_promotion_codes.sql`](../../migrations/0026_promotion_codes.sql):
  configuración, scopes y reservas/consumos promocionales expand-only.
- [`OPERACION_CODIGOS_PROMOCIONALES.md`](OPERACION_CODIGOS_PROMOCIONALES.md):
  alta segura, rollout, reconciliación, incidencias y rollback de `PRC-004`.
- [`wiki/codigos-promocionales-seguros.md`](wiki/codigos-promocionales-seguros.md):
  ficha interna honesta sobre códigos, sin editor visual ni ruta pública.
- [`adr/0030-descuentos-automaticos-y-precedencia.md`](adr/0030-descuentos-automaticos-y-precedencia.md):
  campaña automática única, motivo público y precedencia global de código.
- [`../../migrations/0027_automatic_discounts.sql`](../../migrations/0027_automatic_discounts.sql):
  configuración, scopes, aplicación por pedido y guardas de fuente expand-only.
- [`OPERACION_DESCUENTOS_AUTOMATICOS.md`](OPERACION_DESCUENTOS_AUTOMATICOS.md):
  rollout, matriz, reconciliación, incidencias y rollback de `PRC-005`.
- [`wiki/descuentos-automaticos-trazables.md`](wiki/descuentos-automaticos-trazables.md):
  ficha interna de campañas y límites actuales, sin editor ni ruta pública.
- [`adr/0031-ofertas-cantidad-x-y.md`](adr/0031-ofertas-cantidad-x-y.md):
  tramos, selección X/Y, redondeo a favor del comprador y precio congelado.
- [`../../migrations/0028_quantity_offers.sql`](../../migrations/0028_quantity_offers.sql):
  configuración, tramos/scopes, aplicación por pedido y guardas de evidencia.
- [`OPERACION_OFERTAS_CANTIDAD.md`](OPERACION_OFERTAS_CANTIDAD.md):
  rollout, reconciliación, incidencias y rollback de `PRC-006/007`.
- [`wiki/ofertas-cantidad-x-y.md`](wiki/ofertas-cantidad-x-y.md):
  ficha interna de capacidad y límites actuales, sin combinabilidad ni editor.
- [`adr/0032-combinabilidad-explicita-descuentos.md`](adr/0032-combinabilidad-explicita-descuentos.md):
  matrices de fuentes/clases, tope agregado y aplicación canónica por pedido.
- [`../../migrations/0029_discount_combinations.sql`](../../migrations/0029_discount_combinations.sql):
  políticas, pares, aplicaciones y guardas de snapshot combinado.
- [`OPERACION_COMBINACION_DESCUENTOS.md`](OPERACION_COMBINACION_DESCUENTOS.md):
  rollout, reconciliación, incidencias y rollback de `PRC-008`.
- [`wiki/combinacion-descuentos-explicita.md`](wiki/combinacion-descuentos-explicita.md):
  ficha interna honesta sobre combinabilidad y límites actuales.
- [`adr/0033-listas-precios-contextuales.md`](adr/0033-listas-precios-contextuales.md):
  precio base contextual, identidad servidor y fallback por producto.
- [`../../migrations/0030_contextual_price_lists.sql`](../../migrations/0030_contextual_price_lists.sql):
  listas, scopes de producto/empresa y aplicaciones verificadas por pedido.
- [`OPERACION_LISTAS_PRECIOS.md`](OPERACION_LISTAS_PRECIOS.md):
  rollout, rehearsal, diagnóstico, rollback y reconciliación de `PRC-009`.
- [`wiki/listas-precios-contextuales.md`](wiki/listas-precios-contextuales.md):
  precedencia, trazabilidad y límites actuales de las listas contextuales.
- [`adr/0034-bundles-composicion-congelada.md`](adr/0034-bundles-composicion-congelada.md):
  unidad comercial, composición congelada e inventario por componentes.
- [`../../migrations/0031_bundles.sql`](../../migrations/0031_bundles.sql):
  definición fija/configurable, composición de pedido, aplicación y vínculos RMA.
- [`OPERACION_BUNDLES.md`](OPERACION_BUNDLES.md):
  rollout, rehearsal, diagnóstico, reconciliación y rollback de `PRC-012`.
- [`wiki/bundles-componentes.md`](wiki/bundles-componentes.md):
  recorrido funcional, trazabilidad y límites actuales de bundles.
- [`adr/0035-valor-almacenado-ledger.md`](adr/0035-valor-almacenado-ledger.md):
  saldo proyectado desde ledger, código hasheado, pago mixto y devolución al
  medio original de `PRC-010/011`.
- [`../../migrations/0032_stored_value.sql`](../../migrations/0032_stored_value.sql):
  expansión compatible de cuentas, reservas, aplicaciones, reembolsos y ledger.
- [`OPERACION_VALOR_ALMACENADO.md`](OPERACION_VALOR_ALMACENADO.md):
  rehearsal, rollout, reconciliación, incidencias y rollback de valor almacenado.
- [`wiki/tarjetas-regalo-credito-tienda.md`](wiki/tarjetas-regalo-credito-tienda.md):
  alcance, pago mixto y puertas legales por proyecto sin promesas públicas.
- [`adr/0036-preventa-backorder-compromiso.md`](adr/0036-preventa-backorder-compromiso.md):
  promesa versionada, cupo diferido, asignación FIFO y stock físico innegociable.
- [`../../migrations/0033_preorders_backorders.sql`](../../migrations/0033_preorders_backorders.sql):
  políticas, compromisos, eventos y asignaciones expand-only de `PRC-014`.
- [`OPERACION_PREVENTA_BACKORDER.md`](OPERACION_PREVENTA_BACKORDER.md):
  rollout, reconciliación, incidencias y rollback de preventa/backorder.
- [`wiki/preventa-backorder-explicita.md`](wiki/preventa-backorder-explicita.md):
  recorrido y límites honestos del modelo de venta diferida.
- [`adr/0037-suscripciones-adaptador-verificado.md`](adr/0037-suscripciones-adaptador-verificado.md):
  puerto neutral, hechos verificados, estados, impago y portal alojado.
- [`../../migrations/0034_provider_subscriptions.sql`](../../migrations/0034_provider_subscriptions.sql):
  planes, proyección, inbox idempotente, eventos y ciclos expand-only.
- [`OPERACION_SUSCRIPCIONES.md`](OPERACION_SUSCRIPCIONES.md):
  rollout, reconciliación, incidencias y rollback de `PRC-013`.
- [`wiki/suscripciones-por-adaptador.md`](wiki/suscripciones-por-adaptador.md):
  recorrido funcional y fronteras de seguridad/comercio de R4.10.
- [`adr/0038-presupuestos-depositos-transiciones-explicitas.md`](adr/0038-presupuestos-depositos-transiciones-explicitas.md):
  contrato R4.11 de borrador, vigencia, depósito/saldo, enlace alojado y
  conversión explícita implementado localmente.
- [`../../migrations/0035_preliminary_orders_deposits.sql`](../../migrations/0035_preliminary_orders_deposits.sql):
  presupuestos, líneas, enlaces, pagos y eventos expand-only de R4.11.
- [`OPERACION_PRESUPUESTOS_DEPOSITOS.md`](OPERACION_PRESUPUESTOS_DEPOSITOS.md):
  rollout, conciliación, incidencias y rollback de `ORD-008`/`CHK-011`.
- [`wiki/presupuestos-depositos.md`](wiki/presupuestos-depositos.md):
  recorrido funcional y fronteras de dinero, inventario y seguridad.
- [`../../migrations/0016_order_amendments.sql`](../../migrations/0016_order_amendments.sql):
  expansión de cantidades vigentes, amendments y asignaciones financieras.
- [`OPERACION_EDICION_PEDIDOS.md`](OPERACION_EDICION_PEDIDOS.md):
  preflight, rehearsal, conciliación, backup esquema 10 y rollback de R3.3.
- [`OPERACION_INCIDENCIAS_PEDIDOS.md`](OPERACION_INCIDENCIAS_PEDIDOS.md):
  holds múltiples, SLA, guard de preparación, rehearsal, backup esquema 11 y rollback de R3.4.
- [`../../src/modules/orders/domain/order-bulk-action.ts`](../../src/modules/orders/domain/order-bulk-action.ts):
  contrato puro R3.5 de límites, fingerprints, elegibilidad, progreso e idempotencia por fila.
- [`OPERACION_FULFILLMENT_LINEAS.md`](OPERACION_FULFILLMENT_LINEAS.md):
  preflight, backfill, replay, restore, corte R2.11 y operación parcial R2.12.
- [`../../scripts/rehearse-r2-fulfillment-lines.mjs`](../../scripts/rehearse-r2-fulfillment-lines.mjs):
  rehearsal aislado que compara hashes legacy y canónico sin imprimir PII.
- [`../../scripts/rehearse-r2-partial-refunds.mjs`](../../scripts/rehearse-r2-partial-refunds.mjs):
  rehearsal aislado de `0013`, guardas de pertenencia/cantidad y dump/restore.
- [`../../src/modules/payments/`](../../src/modules/payments/): contrato puro y
  adaptador D1 de intención, captura, cancelación financiera y reembolso total
  o por cantidades.
- [`../../src/modules/inventory/domain/inventory-ledger.ts`](../../src/modules/inventory/domain/inventory-ledger.ts):
  razones, direcciones, transiciones y guarda optimista del ledger.
- [`../../src/modules/inventory/infrastructure/d1-inventory-ledger.ts`](../../src/modules/inventory/infrastructure/d1-inventory-ledger.ts):
  unidad D1 versionada para balance, movimiento y espejo default.
- [`../../scripts/rehearse-r2-product-variants.mjs`](../../scripts/rehearse-r2-product-variants.mjs):
  preflight, forward, reconciliación legacy y restore aislado de R2.2.
- [`../../scripts/rehearse-r2-media-attributes.mjs`](../../scripts/rehearse-r2-media-attributes.mjs):
  preflight, hashes, forward y restore aislado de media/atributos R2.5.
- [`../../scripts/rehearse-r2-inventory-ledger.mjs`](../../scripts/rehearse-r2-inventory-ledger.mjs):
  preflight, reconciliación y dump/restore aislado del ledger R2.7.
- [`../../scripts/rehearse-r2-inventory-reservations.mjs`](../../scripts/rehearse-r2-inventory-reservations.mjs):
  forward, hashes y dump/restore aislado de reservas R2.8.
- [`../../src/modules/inventory/infrastructure/d1-inventory-reservations.ts`](../../src/modules/inventory/infrastructure/d1-inventory-reservations.ts):
  alta, consumo, liberación y expiración versionados por variante.
- [`../../src/modules/catalog/domain/product.ts`](../../src/modules/catalog/domain/product.ts):
  agregado R2.3 de producto editorial, variante vendible, opciones y guardas.
- [`../../src/modules/catalog/infrastructure/d1-catalog-repository.ts`](../../src/modules/catalog/infrastructure/d1-catalog-repository.ts):
  lector canónico D1 y proyección temporal de disponibilidad legacy.
- [`../../src/modules/catalog/application/catalog-reader.ts`](../../src/modules/catalog/application/catalog-reader.ts):
  rollout reversible `legacy|shadow|variant` y comparación bloqueante.
- [`../../src/composition/admin-operations.ts`](../../src/composition/admin-operations.ts):
  casos de uso R2.4–R2.5 para variantes, media y atributos con validación.
- [`../../src/platform/operations/infrastructure/d1-catalog-variant-audit.ts`](../../src/platform/operations/infrastructure/d1-catalog-variant-audit.ts):
  unidades D1 optimistas que confirman configuración y evidencia en una batch.
- [`../../src/platform/operations/infrastructure/d1-catalog-content-audit.ts`](../../src/platform/operations/infrastructure/d1-catalog-content-audit.ts):
  unidades auditadas de media/atributos, orden y sincronización del espejo.
- [`../../src/pages/demo/admin/productos/[id].astro`](../../src/pages/demo/admin/productos/[id].astro):
  editor de combinaciones condicionado por capacidad y de solo lectura en demo.
- [`wiki/productos-variantes-opciones.md`](wiki/productos-variantes-opciones.md):
  borrador interno R2.3; no publicable hasta completar escritura e inventario.
- [`../../platform.config.ts`](../../platform.config.ts): manifest del
  despliegue actual, basado en un preset técnico y sin valores secretos.
- [`../../src/platform/configuration/`](../../src/platform/configuration/):
  contrato ejecutable de estados, flags, dependencias, presets y política de
  acceso a rutas/navegación R1.2–R1.3.
- [`../../src/platform/configuration/module-registry.ts`](../../src/platform/configuration/module-registry.ts):
  registro canónico R1.4, validación de invariantes y resolución de módulos
  operativos por despliegue.
- [`../../src/composition/runtime-platform.ts`](../../src/composition/runtime-platform.ts):
  fachada única que conecta el manifest del despliegue con Astro.
- [`../../src/shared-kernel/events.ts`](../../src/shared-kernel/events.ts):
  sobre de evento versionado R1.5 —identidad, actor, entidad, correlación,
  causación e idempotencia— sin PII, sin configuración y sin I/O.
- [`../../src/platform/events/outbox-contract.ts`](../../src/platform/events/outbox-contract.ts):
  contrato ejecutable de estados, lease, lotes, retry y claim.
- [`../../src/platform/events/d1-event-outbox-repository.ts`](../../src/platform/events/d1-event-outbox-repository.ts):
  claim, recuperación de lease, retry/dead-letter, replay y retención D1.
- [`../../src/composition/outbox-dispatcher.ts`](../../src/composition/outbox-dispatcher.ts):
  dispatcher que materializa cada efecto y su ACK en una única batch.
- [`../../src/composition/order-operations.ts`](../../src/composition/order-operations.ts):
  casos de uso compuestos de escritura de pedido; único punto que une el hecho
  que emite `orders` con el consumidor de `notifications`.
- [`../../src/shared-kernel/audit.ts`](../../src/shared-kernel/audit.ts):
  contrato de diff con allowlist, denylist de PII y límites estrictos.
- [`../../src/platform/operations/infrastructure/d1-audit-log.ts`](../../src/platform/operations/infrastructure/d1-audit-log.ts):
  persistencia atómica de evidencia sin lecturas ni export HTTP.
- [`../../src/platform/operations/application/observability.ts`](../../src/platform/operations/application/observability.ts):
  contrato cerrado de métricas y errores operativos sin campos arbitrarios.
- [`../../src/platform/operations/infrastructure/console-observability.ts`](../../src/platform/operations/infrastructure/console-observability.ts):
  adaptador JSON a Workers Logs; no usa D1 ni expone endpoint.
- [`../../src/integrations/registry.ts`](../../src/integrations/registry.ts):
  registro R1.10 de Stripe, Resend y CSV con healthchecks y snapshots sin
  secretos, persistencia o superficie HTTP.
- [`../../src/platform/jobs/`](../../src/platform/jobs/): registro, contrato,
  repositorio D1 y runner R1.11 para ejecuciones únicas o recurrentes.
- [`../../src/composition/job-runner.ts`](../../src/composition/job-runner.ts):
  conecta los Cron Triggers existentes con el reset demo y el outbox cliente
  según manifest, sin rutas ni configuración visible.
- [`../../src/composition/demo-catalog.ts`](../../src/composition/demo-catalog.ts):
  conecta los fixtures versionados con el catálogo público simulado sin que el
  runtime importe seeds.

## Reglas de verdad

- El estado de una capacidad lo manda `MATRIZ_CAPACIDADES.md`, no el copy.
- La próxima sesión la manda la sección «Siguiente bloque» de `ROADMAP.md`.
- Una página pública nunca puede decir «disponible» si no existe una prueba
  automatizada y una ruta operativa real.
- «Integrable» exige contrato, tratamiento de errores, reintentos, trazabilidad
  y procedimiento de desconexión; una mención comercial no basta.
- «A medida» describe una capacidad de servicio, no una función ya construida.
- Cada módulo nuevo debe poder permanecer desactivado sin añadir navegación,
  tablas inútiles, JavaScript ni carga cognitiva a un cliente que no lo use.

## Identificadores y estados

Cada capacidad usa un identificador estable `DOM-NNN`, por ejemplo `ORD-010`.
Los estados permitidos son:

| Estado | Significado verificable |
|---|---|
| `actual` | Funciona hoy en el motor real y está cubierto por pruebas. |
| `parcial` | Existe una base útil, pero falta parte del resultado prometido. |
| `especificado` | Contrato y criterios escritos; aún no debe venderse como disponible. |
| `pendiente` | Capacidad identificada, todavía sin especificación ejecutable. |
| `conector` | Se resuelve integrando un proveedor; requiere adaptador operativo. |
| `gestionado` | Lo ejecuta el equipo como servicio o desarrollo por proyecto. |
| `excluido` | No se construirá como producto propio salvo nueva decisión estratégica. |

## Definición de paridad

La plataforma alcanza paridad para un caso de negocio cuando se cumplen las
cinco condiciones siguientes:

1. El resultado se resuelve de extremo a extremo por una vía documentada.
2. Dinero, stock, impuestos y permisos se deciden en servidor.
3. Existe recuperación ante duplicados, fallos parciales y reintentos.
4. El comercio solo ve las acciones que realmente necesita.
5. La wiki explica con precisión qué hace Logic2B, qué hace un tercero y qué se
   configura a medida.

La cantidad bruta de botones o ajustes nunca es una métrica de paridad.

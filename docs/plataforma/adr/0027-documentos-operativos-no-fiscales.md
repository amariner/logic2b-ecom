# ADR-0027 — snapshots operativos propios y fiscalidad externa

- Estado: **aceptado para implementación**
- Fecha: 2026-08-14
- Bloque: R3.11
- Decisión de esquema: cubierta por la autorización general de migraciones del 2026-08-14

## Contexto

Preparación y expedición necesitan albaranes y etiquetas reproducibles. Factura
y rectificativa, en cambio, están sujetas a numeración, fiscalidad y normativa
que el kit no implementa ni promete. Generar un PDF con aspecto de factura no
sería paridad: convertiría una ayuda visual en una afirmación fiscal falsa y
contradiría el posicionamiento público sobre VeriFactu.

## Decisión

`ORD-012` separa dos fuentes explícitas:

1. `generated`: albarán y etiqueta interna, sin importes, renderizados desde un
   snapshot del pedido y fulfillment con plantilla y checksum congelados;
2. `external`: factura o rectificativa ya emitida por gestoría, ERP u otra
   herramienta fiscal; Logic2B solo registra proveedor, referencia, enlace y el
   importe esperado recalculado desde pedido o reembolso confirmado.

Cada alcance conserva una única versión activa. Reexpedir crea otra fila,
marca la anterior como sustituida y conserva artefacto y eventos. Anular afecta
al registro de Logic2B, no declara anulada una factura en el proveedor. La
operación completa es idempotente, optimista y auditada.

## Invariantes

1. un documento generado pertenece a un fulfillment no cancelado del pedido;
2. una plantilla solo sirve a su tipo exacto y su versión queda congelada;
3. albarán y etiqueta nunca incluyen precios ni se presentan como factura;
4. una factura externa toma pedido, moneda e importe de D1;
5. una rectificativa externa exige un reembolso `succeeded` del mismo pedido;
6. no existe artefacto local para tipos fiscales externos;
7. solo hay una versión activa por pedido, tipo y alcance;
8. reexpedición, anulación, eventos y auditoría comparten una batch;
9. checksum y snapshot sobreviven a cambios posteriores del pedido o plantilla.

## Rollback

`0024` es expand-only. Desactivar `ORD-012` retira navegación, rutas y efectos
sin tocar pedidos, fulfillments, refunds ni documentos históricos. No se
eliminan artefactos ni referencias. La herramienta fiscal externa continúa
siendo la fuente de verdad legal antes, durante y después del rollback.

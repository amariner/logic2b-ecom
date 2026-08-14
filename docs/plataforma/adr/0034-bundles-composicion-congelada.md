# ADR-0034 — Bundles como línea comercial con composición congelada

- Estado: accepted; R4.7 implementado localmente
- Fecha: 2026-08-14
- Capacidad: `PRC-012`

## Contexto

Un kit debe cobrarse como producto reconocible sin reservar el stock ficticio
de su carcasa. Los componentes pueden cambiar en catálogo después de la compra,
por lo que pedido, pago, cancelación y devolución necesitan una composición
histórica propia. El navegador tampoco puede decidir IDs, precios ni cantidades
de inventario autoritativas.

## Decisión

1. El bundle es una línea comercial cuyo producto aporta el precio base. R4.7
   no suma precios de componentes ni acepta un importe cliente.
2. Un bundle `fixed` declara componentes directos. Uno `configurable` declara
   grupos, mínimos/máximos, opciones y defaults; la selección cliente usa slugs
   que el servidor resuelve a productos activos.
3. La disponibilidad es el mínimo entero de `disponible / cantidad por bundle`
   entre los componentes seleccionados. Reserva, pago, cancelación y reposición
   operan sobre sus variantes default, nunca sobre el stock de la carcasa.
4. El pedido congela bundle, versión, selección y cantidades en el snapshot de
   precio, `order_bundle_components` y una aplicación canónica verificada.
5. Fulfillment expresa unidades comerciales del bundle y conserva su
   composición mediante esa relación. RMA y cancelación expanden cada unidad a
   componentes; sus movimientos quedan correlacionados por variante.
6. La edición puede modificar otros elementos o la dirección, pero no cantidad
   ni composición de una línea bundle. Reconfigurar exige cancelar/devolver y
   crear una compra nueva.
7. Definición y transiciones se administran por API auditada. Una composición
   creada es inmutable; los cambios comerciales se publican como otro bundle.

## Consecuencias

- Una opción no seleccionada no consume stock ni aparece en el pedido.
- R4.7 solo admite variantes default como componentes. Opciones de variante,
  precios por suma/suplemento y fulfillment físico por pieza quedan para un ADR
  posterior si aparecen requisitos reales.
- Archivar o desactivar una definición no altera pedidos históricos.
- El backup debe restaurar configuración, composición de pedido, aplicaciones y
  vínculos de movimientos RMA; corresponde al esquema 25.

## Rollback

Desactivar rutas y efectos de `PRC-012`. Quote vuelve a tratar las carcasas como
productos ordinarios; antes hay que desactivar esos productos si no tienen stock
propio. No contraer `0031` ni borrar snapshots o aplicaciones históricas.

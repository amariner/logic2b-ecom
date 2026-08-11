# Núcleo transaccional de un ecommerce que puede crecer

> Borrador interno actualizado en R2.12. Estado editorial: **no publicable**.
> FUL-004/005 ya tienen implementación y evidencia local, pero el corte remoto
> y la cancelación/reembolso parcial siguen pendientes. Esta ficha no genera
> ruta, sitemap ni promesa comercial.

## Intención futura

Explicar por qué una tienda que empieza con productos simples necesita separar
producto, variante, stock, pago y envío antes de añadir operaciones complejas.
La respuesta debe ser útil al comercio y a una agencia: crecer sin migrar de
motor no significa activar cien controles desde el primer día, sino conservar
un núcleo que no confunde hechos distintos.

## Respuesta honesta hoy

Logic2B Ecommerce ya separa variantes, inventario, pagos y fulfillment en
ledgers auditables. El flujo local admite reembolso total idempotente, envío por
cantidades, varios trackings y avisos por salida. La demo pública solo permite
inspección; producción aún no ha recibido la migración `0012` ni este binario,
y el reembolso parcial continúa en R2.13.

## Estructura de la futura guía

1. Producto y variante: lo que se describe frente a lo que se vende.
2. Stock como movimientos: saber por qué cambió, no solo cuánto queda.
3. Pago separado del pedido: captura, devolución y saldo sin estados ambiguos.
4. Preparación por cantidades: uno o varios envíos sin perder líneas.
5. Cómo se activa por etapas para que una tienda pequeña siga viendo un panel
   mínimo.

## Evidencia requerida antes de publicar

- migraciones R2 aplicadas y restore ensayado sobre copia aislada;
- tests de variante simple/múltiple, última unidad e idempotencia;
- reembolso total real por adaptador con ledger, evento y stock coherentes;
- fulfillment total y parcial por líneas;
- rutas operativas y estados de matriz en `actual`/`activable`;
- revisión editorial sin nombres del benchmark ni promesas de roadmap.

## Destinos SEO previstos

No se crea una URL genérica para este borrador. Cuando haya evidencia, alimenta
las fichas ya planificadas de producto/variantes, stock por variante,
reembolsos y preparación parcial definidas en `WIKI_SEO.md`.

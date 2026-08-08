# Núcleo transaccional de un ecommerce que puede crecer

> Borrador interno actualizado en R2.3. Estado editorial: **no publicable**. Las capacidades
> CAT-003/004, INV-002/003/004, ORD-007 y FUL-004/005 están especificadas, no
> disponibles. Esta ficha no genera ruta, sitemap ni promesa comercial.

## Intención futura

Explicar por qué una tienda que empieza con productos simples necesita separar
producto, variante, stock, pago y envío antes de añadir operaciones complejas.
La respuesta debe ser útil al comercio y a una agencia: crecer sin migrar de
motor no significa activar cien controles desde el primer día, sino conservar
un núcleo que no confunde hechos distintos.

## Respuesta honesta hoy

Logic2B Ecommerce ya recalcula precios y stock en servidor, congela líneas de
pedido, protege webhooks duplicados y registra eventos/auditoría. R2.3 añade el
dominio y lector canónicos de producto-variante con shadow-read reversible, pero
todavía no ofrece CRUD de variantes, ledger de inventario/pagos, reembolso del
PSP ni preparación parcial como capacidades operativas.

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

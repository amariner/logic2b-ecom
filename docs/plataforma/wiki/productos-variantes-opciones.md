# Productos, variantes y opciones sin duplicar el catálogo

> Borrador interno actualizado en R2.4. Estado editorial: **no publicable**.
> CAT-003, CAT-004 y CAT-005 siguen `parcial`: la administración ya es real,
> pero el storefront todavía sirve el default y el inventario no se contabiliza
> por variante.

## Intención futura

Responder cómo modelar talla, color, formato o SKU sin convertir cada opción en
un producto duplicado ni enseñar complejidad a una tienda que solo vende
productos simples.

## Respuesta honesta hoy

El motor separa ya el contenido editorial del producto y la unidad vendible de
la variante. Un repositorio tipado lee SKU, GTIN, MPN, precio, estado y valores
de opción; exige una variante default y bloquea combinaciones incoherentes. El
panel avanzado crea, edita y elimina opciones, valores y combinaciones con
validación en servidor, audit log y control optimista de carreras. Cambiar el
default sincroniza precio, precio anterior y actividad con `products` en la
misma transacción compatible.

La lectura puede volver a `products` con un flag y compara ambas fuentes antes
del corte. El seed v2 y el backup SQL v2 conservan las relaciones y sus FKs.
Todavía no se puede presentar como funcionalidad completa: la tienda pública
sirve la variante por defecto y `products.stock` sigue siendo la proyección
temporal de disponibilidad hasta el ledger R2.7.

## Qué verá el comercio al completarse

- Un producto simple seguirá teniendo una única variante sin opciones visibles.
- Talla, color u otra opción aparecerán solo cuando el catálogo las necesite.
- Cada combinación tendrá SKU, estado y precio propios validados en servidor.
- Archivar una variante no borrará las líneas ni snapshots de pedidos pasados.

## Evidencia actual

- agregado inmutable y guardas en `modules/catalog/domain/product.ts`;
- repositorio D1 en `modules/catalog/infrastructure/d1-catalog-repository.ts`;
- rollout `legacy|shadow|variant` con divergencia bloqueante;
- CRUD auditado con protección del default y de variantes presentes en pedidos;
- serialización de altas concurrentes y unicidad de SKU/combinación;
- seed v2 y backup/restore con opciones, valores, variantes y asociaciones;
- editor condicionado por `CAT-003`, ausente en `minimal` y `standard`;
- quote autoritativa: un precio enviado por el navegador se descarta.

## Evidencia pendiente antes de publicar

- selección de variante en storefront y snapshots de pedido completos;
- stock por variante con ledger y concurrencia (R2.7–R2.8);
- pruebas E2E de producto con varias combinaciones;
- estado `actual`/`activable` en la matriz y revisión editorial/SEO de W2.

## Destino SEO previsto

`/funcionalidades/productos-variantes-opciones/`, definido en `WIKI_SEO.md`.
No genera ruta, canonical, sitemap ni CTA mientras permanezca borrador.

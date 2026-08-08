# Productos, variantes y opciones sin duplicar el catálogo

> Borrador interno R2.3. Estado editorial: **no publicable**. CAT-003, CAT-004
> y CAT-005 siguen `parcial`: existe lectura canónica, pero falta escritura
> administrativa y el inventario todavía no se contabiliza por variante.

## Intención futura

Responder cómo modelar talla, color, formato o SKU sin convertir cada opción en
un producto duplicado ni enseñar complejidad a una tienda que solo vende
productos simples.

## Respuesta honesta hoy

El motor separa ya el contenido editorial del producto y la unidad vendible de
la variante. Un repositorio tipado lee SKU, GTIN, MPN, precio, estado y valores
de opción; exige una variante default y bloquea combinaciones incoherentes. La
lectura puede volver a `products` con un flag y compara ambas fuentes antes del
corte.

Todavía no se puede presentar como funcionalidad disponible: el admin y el
seed v2 no crean ni editan opciones/variantes, y `products.stock` sigue siendo
la proyección temporal de disponibilidad hasta el ledger R2.7.

## Qué verá el comercio al completarse

- Un producto simple seguirá teniendo una única variante sin opciones visibles.
- Talla, color u otra opción aparecerán solo cuando el catálogo las necesite.
- Cada combinación tendrá SKU, estado y precio propios validados en servidor.
- Archivar una variante no borrará las líneas ni snapshots de pedidos pasados.

## Evidencia actual

- agregado inmutable y guardas en `modules/catalog/domain/product.ts`;
- repositorio D1 en `modules/catalog/infrastructure/d1-catalog-repository.ts`;
- rollout `legacy|shadow|variant` con divergencia bloqueante;
- reconciliación automatizada de todos los productos del seed v1;
- quote autoritativa: un precio enviado por el navegador se descarta.

## Evidencia pendiente antes de publicar

- CRUD y seed/import/export v2 con doble escritura restaurable (R2.4);
- selección de variante en storefront y snapshots de pedido completos;
- stock por variante con ledger y concurrencia (R2.7–R2.8);
- pruebas E2E de producto con varias combinaciones;
- estado `actual`/`activable` en la matriz y revisión editorial/SEO de W2.

## Destino SEO previsto

`/funcionalidades/productos-variantes-opciones/`, definido en `WIKI_SEO.md`.
No genera ruta, canonical, sitemap ni CTA mientras permanezca borrador.

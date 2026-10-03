# ADR-0048 — Publicación por mercado, producto, variante y canal

- Estado: accepted; R5.9a implementado y verificado localmente, sin activación.
- Fecha: 2026-10-03
- Bloque: R5.9a
- Propietario: `markets`
- Capacidad: MKT-004, parcial e instalada/inactiva en avanzado y demo.
- Dependencias de capacidad: MKT-003 y CAT-003.

`markets` 1.1.0 posee MKT-003 y MKT-004; su dependencia de módulo permanece
`platform-configuration`. MKT-003 por sí sola debe funcionar sin catálogo.
La exigencia de CAT-003 se aplica al activar MKT-004, no a resolver un mercado.

## Contexto

R5.8b está integrada en PR #18 (`ec353f6`): la demo de mercados e idiomas se
verifica en el repositorio, sin despliegue. Resolver un mercado o disponer de
contenido traducido no determina qué producto y qué variantes se publican
en cada canal. El catálogo conserva `product.active` y variantes `draft`,
`active` o `archived`; los precios y el inventario tienen autoridad separada.

El lector compatible actual proyecta la variante predeterminada. Filtrar sus
variantes y reutilizar esa proyección podría mostrar un precio/default no
publicado o romper el agregado. R5.9a construye un preview separado, sin
modificar lectores runtime, quote, checkout, catálogo servido ni pedidos.

MKT-005 permanece pendiente: PRC-009 calcula precios por producto, con fallback
empresa → general → catálogo. Tener un precio nunca acredita publicación,
y este corte no resuelve precios específicos por variante ni FX.

## Decisión

### Snapshot mínimo con procedencia declarada

`defineMarketPublicationSnapshot(unknown)` valida y congela:

```ts
{
  schemaVersion: 1,
  ref: string,
  capturedAt: string,
  products: Array<{
    id: number,
    active: boolean,
    variants: Array<{
      id: number,
      productId: number,
      status: 'draft' | 'active' | 'archived'
    }>
  }>
}
```

IDs positivos seguros, propiedad producto/variante coherente y referencias
sin duplicados. La colección de productos puede estar vacía; cada producto
declarado tiene al menos una variante. No contiene precio, stock, moneda,
variante predeterminada, contenido editorial ni versiones de producto que el
catálogo no ofrece.

`ref` y `capturedAt` se aportan explícitamente. Describen la entrada que el
llamador presenta; no acreditan una lectura atómica de D1, un hash, una
captura histórica reproducible ni autenticidad. El contrato puro no mantiene
un registro que impida reutilizar una referencia con otro contenido.

### Política explícita por tupla

`defineMarketPublicationPolicy(unknown)` acepta:

```ts
{
  schemaVersion: 1,
  id: string,
  version: number,
  channels: string[],
  rules: Array<{
    marketId: string,
    channel: string,
    productId: number,
    state: 'published' | 'unpublished',
    variantIds: number[]
  }>
}
```

Cada tupla `(marketId, channel, productId)` es única. `published` exige una
selección explícita no vacía de variantes; `unpublished` exige lista vacía.
Los canales son IDs canónicos en minúsculas, de dos a 40 caracteres, con
gramática `[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*`. No se admiten comodines,
normalización implícita de mayúsculas, condiciones arbitrarias ni prioridades.

La ausencia de tupla significa `unconfigured`, distinta de una decisión
explícita `unpublished`. No hay publicación por defecto ni herencia desde
otro mercado/canal. Una variante añadida al snapshot no entra automáticamente
en una selección anterior. Solo la política tiene versión: no se inventan
versiones independientes de regla ni CAS durable por producto.

El documento puede versionarse en Git e inyectarse con fixtures. Este alcance
no necesita D1, migración, repositorio, historial persistente ni editor real.

### Preview explicable sin efectos

`previewMarketPublication(unknown)` recibe exactamente:

```ts
{
  markets: MarketCatalog,
  catalog: MarketPublicationSnapshot,
  policy: MarketPublicationPolicy,
  context: { marketId: string, channel: string }
}
```

Revalida las tres entradas y el contexto, incluidas **todas** las reglas,
aunque pertenezcan a otro mercado o canal. Mercado/producto/variante
desconocidos, propiedad incorrecta y demás referencias inválidas producen
`MarketPublicationContractError`, no un preview parcial. El contexto nombra
un mercado exacto; esta función no infiere país, dominio, selector confiable
ni autorización comercial.

La respuesta conserva `markets: { id, version }`,
`catalog: { ref, capturedAt }`, `policy: { id, version }`, contexto y productos:

```ts
{
  productId: number,
  publication: 'published' | 'unpublished' | 'unconfigured',
  visible: boolean,
  reasons: string[],
  visibleVariantIds: number[],
  variants: Array<{
    variantId: number,
    selected: boolean,
    visible: boolean,
    reasons: string[]
  }>
}
```

`publication` conserva la decisión configurada, aunque un estado del catálogo
impida mostrarla. `selected` expresa la selección de la regla; `visible`
requiere producto activo y variante seleccionada activa. Un producto solo es
visible cuando hay al menos una variante visible. No existe `purchasable`.

| Nivel | Motivos cerrados |
|---|---|
| Producto | `product_inactive`, `unconfigured`, `unpublished`, `no_visible_variants`. |
| Variante | `product_inactive`, `unconfigured`, `unpublished`, `variant_not_selected`, `variant_draft`, `variant_archived`. |

Los motivos se acumulan en orden determinista. `no_visible_variants` aparece
solo cuando el producto está activo y configurado como publicado, pero ninguna
variante seleccionada está activa. La selección nunca reabre un producto
inactivo ni una variante borrador/archivada.

Snapshot, política y preview validan objetos de datos estrictos, crean copias
ordenadas y congeladas y no ejecutan I/O. Los límites técnicos exportados en
`MARKET_PUBLICATION_LIMITS` son 1.000 productos, 100 variantes por producto,
10.000 variantes totales, 20 canales y 10.000 reglas. Un exceso se rechaza;
no se trunca la población. No se promete volumen comercial por estos límites.

## Composición desde el catálogo existente

`projectMarketPublicationSnapshot({ ref, capturedAt, entries })` recibe
`readonly CatalogEntry[]` mediante el contrato público de catálogo. Proyecta
`product.id`, `active` y **todas** las variantes, con `id`,
`productId: product_id` y `status`, sin filtrar por default ni estado.
`defineMarketPublicationSnapshot` valida el resultado.

La composición comprueba estructura y propiedades de datos necesarias para
proyectar; no revalida un CMS, precios o inventario. No acepta la fila reducida
`StorefrontProductRow` como sustituto de `CatalogEntry` completo. Tampoco
ejecuta el reader ni promete que sus datos procedan de una transacción D1.
Proyectar es una operación pura, separada de adquirir el catálogo.

El dominio `markets` no importa internals de catálogo: la composición conecta
su API pública y los contratos de publicación. Ninguna capacidad se activa al
declarar o previsualizar una política. Publicación, precio, disponibilidad,
envío, jurisdicción y contenido traducido siguen siendo decisiones distintas.

## Verificación y alcance

Implementación y QA cerradas. `pnpm check` termina con 901 archivos sin
diagnósticos, 229 suites/2.175 pruebas, build y guardas de 44 HTML, 44
formularios cerrados a envíos y cero crons. Focales: 102 de dominio, 48 de
proyección y seis de arquitectura. La revisión independiente pasa 485 aserciones
y no deja P1/P2. [Informe del cierre](../../audits/r5-9a/verification-report.json).

La validación nueva comprueba referencias y reglas fuera del contexto,
selección parcial, ausencia/configuración negativa, estados inactivos,
inmutabilidad, límites, proyección completa y motivos deterministas.

E2E 160/160, navegador 120/120, ocho superficies a11y sin hallazgos y hash QA
intacto de 143 tablas/353 filas pertenecen a R5.8b/PR #18 (`ec353f6`): son evidencia heredada,
no nuevas ejecuciones de R5.9a. El corte puro no modifica UI, lectores runtime,
D1, rutas ni efectos externos. MKT-004 sigue instalada/inactiva y MKT-005
pendiente. Sin DDL, persistencia, activación ni despliegue.

## Siguiente: R5.9b — Demo local de publicación

Orientación aprobada: página separada `/demo/admin/publicacion`, «Publicación
del catálogo», bajo Internacional. Contextos ES/FR y canales
`storefront`/`professional`, con tres productos sintéticos. Edición de cada
tupla en memoria y aplicación explícita, preview con motivos, comparación
antes/después y reset/recarga al estado inicial.

Los fixtures mostrarán la variante predeterminada oculta y otra activa visible,
variantes `draft`/`archived` seleccionadas pero bloqueadas, producto inactivo
y tuplas sin configurar. El detalle distingue producto, variante y referencia;
nunca afirma compra posible ni usa un precio como autorización.

La demo visual sigue pendiente: no se presenta como disponible. Será una
superficie noindex sin I/O ni persistencia, con capacidades inactivas. No se
necesita una migración; se verificarán los efectos del navegador al construirla.

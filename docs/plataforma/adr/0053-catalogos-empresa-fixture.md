# ADR-0053 — Catálogos y precios por empresa con fixtures

- Estado: accepted; R6.2a implementado y verificado localmente. Integración pendiente; sin activación ni despliegue.
- Fecha: 2026-10-04
- Bloque: R6.2a, contrato puro de catálogo y precios por empresa.
- Propietario: módulo `companies` 1.1.0.
- Capacidad: B2B-002, parcial e instalada/inactiva en avanzado y demo; dependencia B2B-001.
- Composición: APIs públicas puras de `companies`, `markets` y `pricing`.
- Demo visual: R6.2b con diseño aprobado; implementación y QA propias pendientes.

## Contexto

R6.1b está integrada en PR #28 (`861b34ff`), sin despliegue. El
[directorio de empresas](0052-directorio-empresas-fixture.md) describe sedes,
contactos y roles; no autentica al visitante ni decide qué puede comprar.
R6.2 necesita ensayar la restricción de catálogo por empresa y explicar el
precio resultante sin convertir esas declaraciones en permisos reales.

El [ADR-0048](0048-publicacion-por-mercado.md) ya distingue publicación por
mercado/canal de disponibilidad para compra. El
[ADR-0033](0033-listas-precios-contextuales.md) resuelve listas por producto,
con fallback empresa→general→catálogo. Este corte compone ambas decisiones,
conservando sus autoridades y sin modificar quote, checkout, pagos o pedidos.

## Decisión

### Snapshot completo y política de restricciones

El snapshot de catálogo es explícito, inmutable y `source: 'fixture'`, con
referencia, instante declarado, moneda base EUR, productos y todas sus
variantes. Cada producto conserva su estado activo y cada variante su ID,
propietario, estado y `priceCents`. No se proyecta solo la variante
predeterminada ni se descartan variantes draft, archivadas o no seleccionadas.
Referencia e instante son metadatos aportados por el llamador, no prueba de
lectura de D1, autenticidad o autoridad comercial.

La política versionada es global por empresa/producto. Una regla incluida
selecciona variantes explícitas; una regla excluida lleva selección vacía.
La ausencia se expresa como sin configurar y no abre visibilidad. Mercado
y canal continúan perteneciendo a la política de publicación de `markets`;
no se duplican como una segunda política empresarial por contexto.

La referencia de directorio conserva exactamente `{ id, version, capturedAt }`.
La referencia de catálogo conserva `{ ref, capturedAt }`. Toda referencia y
propiedad se contrasta contra los snapshots completos, también en reglas de
otras empresas y variantes no seleccionadas. Un dato ajeno corrupto no se
oculta por seleccionar un contexto distinto.

### APIs y límites del dominio

El dominio expone `defineCompanyCatalogSnapshot(unknown)`,
`defineCompanyCatalogPolicy(unknown)` y `defineCompanyPricingBindings(unknown)`.
Todos los artefactos son estrictos, llevan `schemaVersion: 1` y
`source: 'fixture'`, se copian, ordenan determinísticamente y congelan.
Sus formas son:

```ts
// Snapshot
{
  schemaVersion: 1, source: 'fixture', ref, capturedAt, currency: 'EUR',
  products: [{ id, active, variants: [{ id, productId, status, priceCents }] }]
}
// Política
{
  schemaVersion: 1, source: 'fixture', id, version,
  directoryRef: { id, version, capturedAt }, catalogRef: { ref, capturedAt },
  rules: [{ companyId, productId, state: 'included' | 'excluded', variantIds }]
}
// Vinculaciones de precios
{
  schemaVersion: 1, source: 'fixture', id, version,
  directoryRef: { id, version, capturedAt },
  bindings: [{ companyId, companyKeyHash }]
}
```

`COMPANY_CATALOG_LIMITS` fija 1.000 productos, 100 variantes por producto,
10.000 variantes totales, 10.000 reglas, 100.000 referencias a variantes entre
reglas y 100 bindings. Un snapshot vacío es válido; cada producto declarado
necesita al menos una variante. Los precios de variante son enteros de cero
a 10.000.000 céntimos; se rechazan `-0` y valores no seguros. Los IDs de
producto y propietarios quedan entre uno y 2.147.483.647, conforme a pricing;
los IDs de variante son enteros positivos seguros.

Los IDs opacos de artefacto/empresa y las referencias de snapshot tienen hasta
100 caracteres y gramática `^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$`. Versiones
enteras positivas seguras; metadata temporal UTC canónica de 24 caracteres,
con fecha real. Las claves de binding son 64 caracteres hexadecimales en
minúsculas. Duplicados de producto/variante, tupla empresa/producto, variante
en una regla o empresa en bindings son errores, sin truncamiento ni deduplicado
silencioso.

`previewCompanyCatalogRestrictions({ directory, catalog, policy, companyId })`
revalida todos los artefactos y referencias y devuelve la empresa, referencias
y restricciones de cada producto/variante. `restriction` distingue `included`,
`excluded` y `unconfigured`; `eligible` solo expresa la restricción de empresa
y su allowlist, no lifecycle del catálogo ni publicación de mercado. Por eso
una variante draft seleccionada puede ser elegible aquí y quedar invisible
al intersectar después con `markets`. Los motivos son `company_inactive`,
`company_unconfigured`, `company_excluded` y, en variantes no seleccionadas,
`company_variant_not_selected`.

`selectCompanyPricingBinding({ directory, bindings, companyId })` valida todas
las vinculaciones y devuelve la referencia del documento y `binding` o nulo.
No filtra bindings por empresa inactiva: ese bloqueo pertenece al preview de
precios. Tampoco convierte ausencia en una vinculación general.

`CompanyCatalogContractError` usa código `company_catalog_contract_invalid`
y motivos cerrados: `invalid_data`, `duplicate_id`, `duplicate_rule`,
`unknown_reference`, `cross_product_reference`, `reference_mismatch` y
`unknown_company`. Sus mensajes no interpolan datos ni conservan causas ajenas.
Las fábricas validan forma; los previews/selectores contrastan las referencias
contra los snapshots completos, también fuera de la selección solicitada.

### Visibilidad completa y precio de variante explícita

El preview de catálogo combina por intersección la publicación del mercado y
las restricciones de la empresa. Nunca recupera productos o variantes
excluidos por el mercado, inactivos, draft o archivados. Conserva el conjunto
completo para explicar las exclusiones, en vez de presentar un catálogo
filtrado que pierda los motivos.

Una empresa inactiva bloquea el preview comercial. Esto no altera el selector
descriptivo de R6.1: sus sedes, contactos y asignaciones siguen siendo datos
visibles del fixture seleccionado. Estado comercial, descripción del
directorio y autenticación siguen siendo decisiones distintas.

El preview de precios admite entre cero y 100 selecciones, cada una con
`productId` y `variantId` explícitos, como máximo una variante por producto.
La base de catálogo procede de esa variante. No se elige automáticamente la
predeterminada ni se admiten líneas ambiguas repetidas del mismo producto.
No hay cantidad ni totales.

Las listas existentes conservan su override por producto, no por variante.
Si una lista sustituye el precio de un producto, ese importe se aplica a la
variante seleccionada de ese producto; el resultado conserva la base de esa
variante y el origen del precio para explicar la diferencia. No se presenta
como una nueva política de tarifas por variante.

### Composición y proyección del catálogo

`previewCompanyCatalogContext(input: unknown)` recibe exactamente
`{ directory, markets, catalog, companyPolicy, publicationPolicy, context }`,
con `context: { companyId, marketId, channel }`. Deriva el snapshot utilizado
por publicación de mercado desde el mismo catálogo de empresa EUR completo;
no acepta un segundo snapshot de catálogo de mercado que pueda divergir.

Devuelve `source: 'fixture'`, `directoryRef`, `catalogRef`, `companyPolicyRef`,
`publicationPolicyRef`, `marketsRef`, contexto, empresa `{ id, state }`,
mercado `{ id, currency }`, `currency: 'EUR'` y todos los productos/variantes.
Mantiene separadas elegibilidad de empresa y visibilidad de mercado, sus
selecciones y motivos, antes de calcular `visible`. Conserva ID, propietario,
estado y precio de cada variante. Si ambos productos pasan sus políticas por
separado pero no comparten ninguna variante visible, el producto explica
`intersectionReason: 'no_common_variants'`; en los demás casos es nulo.

`projectCompanyCatalogSnapshot({ ref, capturedAt, currency: 'EUR', entries })`
proyecta entradas completas de la API pública de catálogo. Usa
`variant.price_cents` propio de todas las variantes, sin inferir precios desde
la predeterminada, el precio legacy del producto, stock o campos CMS.
La proyección no realiza lecturas ni acredita la procedencia del snapshot.

### Vinculación explícita a las listas

Un documento separado y versionado vincula `companyId` con `companyKeyHash`
y conserva la referencia completa del directorio. La empresa es única dentro
de sus bindings; varias empresas pueden compartir una clave si se declara
expresamente. La clave no se deriva de VAT, país, nombre, perfil, hash de email,
roles o identificador de empresa.

Sin binding, la selección queda bloqueada y el precio es nulo. No se convierte
esa ausencia en contexto general. Con binding válido se reutiliza el fallback
existente empresa→general→catálogo, incluyendo prioridad e ID estables del
resolutor público de listas. El binding es un dato fixture; no demuestra que
el solicitante pertenezca a la empresa o tenga derecho a la tarifa. Los campos selectores `companyKeyHash`/`companyKeyHashes` no se devuelven
en el resultado público de precios. `origin.label` conserva la etiqueta
aportada por la lista, conforme al motor existente: no es un sanitizador de
texto arbitrario ni una garantía de eliminar valores incrustados en etiquetas.

### Frontera estricta antes de pricing

La composición recibe `unknown`, valida y copia todos los datos antes de
invocar la API tipada de precios. Incluye todos los precios de variante,
listas, referencias y scopes, aunque sean inactivos, de otro contexto o no se
seleccionen para precio. Las salidas quedan congeladas y no conservan objetos
mutables proporcionados por el llamador.

La base admite EUR. Un mercado con otra moneda bloquea precio; no se cambia
la etiqueta del importe ni se llama a FX. Una lista con otra moneda canónica
se valida completa y queda como `excluded_context` en las evaluaciones del
resolutor existente cuando se calcula un precio válido. No se descarta antes
de validar ni se la convierte implícitamente en EUR.

`at` y las fechas de las listas son explícitos. Se conserva la gramática UTC
existente de pricing, con segundos o milisegundos, sin normalizar formatos ni
introducir un reloj real. Este corte no redefine la validez temporal de las
listas ni recalcula precios históricos de pedidos.

### Composición de precios

La API acordada es `previewCompanyPrices(input: unknown)` con entrada exacta:

```ts
{
  catalogContext: {
    directory, markets, catalog, companyPolicy, publicationPolicy,
    context: { companyId, marketId, channel }
  },
  bindings,
  priceLists,
  at,
  lines: Array<{ productId, variantId }>
}
```

Devuelve `source: 'fixture'`, el preview completo en `catalog`,
`bindingsRef: { id, version }`, `at` y las líneas. Cada línea conserva
`productId`, `variantId`, `outcome: 'priced' | 'blocked'`, motivos acumulados,
`price` y `evaluations`. El precio contiene `catalogUnitPriceCents`,
`baseUnitPriceCents` y `origin`, o es nulo. Los motivos de bloqueo son
`company_inactive`, `pricing_binding_missing`, `currency_mismatch` y
`variant_not_visible`; una línea bloqueada devuelve evaluaciones vacías.

La validación estructural o referencial fallida es un error de contrato, no
un resultado comercial negativo silencioso. La política de listas existente
no se modifica ni se integra con el checkout mediante este preview.

## Módulo y fronteras

`companies` 1.1.0 conserva la dependencia de módulo `platform-configuration`.
B2B-002 depende de B2B-001 y se instala inactiva en avanzado/demo. Componer APIs
públicas puras de `markets` y `pricing` no activa sus rutas, persistencia,
proveedores o capacidades operativas; respeta los
[ADR-0002](0002-limites-y-direccion-de-dependencias.md) y
[ADR-0003](0003-puertos-adaptadores-y-composition-root.md).

No se añaden DDL, D1, repositorios, red, reloj implícito, endpoints, jobs,
formularios ni efectos de demo. B2B-009, autorización y pertenencia efectiva
siguen pendientes. Tampoco se resuelven stock, promociones, impuestos, FX,
crédito, cantidades, checkout, cobro, reembolso o conciliación. Los permisos y
precios operativos de un despliegue real continúan requiriendo autoridad de
servidor; el fixture no la sustituye.

## Verificación y estado

[Verificación final R6.2a](../../audits/r6-2a/verification-report.json), 2026-10-04:
`pnpm check` pasa 957 archivos sin diagnósticos, 251 suites/3.210 pruebas,
44 HTML, 44 formularios locales y cero crons. Focales: 28 de catálogo,
18 de bindings, 35 de proyección/contexto y 51 de pricing, 132 en total;
seis de arquitectura, 82 de registry/manifest (19/63) y regresión de 93
pruebas del directorio. Revisión independiente de 12.478 aserciones y 300
combinaciones, sin P1/P2, getters ejecutados, efectos ni reloj implícito.

Corte puro: no se ejecutan Worker, HTTP, navegador, a11y o comprobación de base
nuevos. E2E 176/176, navegador 601/601, ocho superficies a11y sin hallazgos,
ocho capturas y base QA 143 tablas/353 filas intacta se heredan de PR #28.
La SHA-256 de aquella verificación es
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`;
no se presenta como una medición nueva de R6.2a.

Bundles de diagnóstico minificados: `companies`, 14.371 B/dos fuentes;
proyección, 5.685 B/tres fuentes; contexto, 27.081 B/cinco fuentes; precios,
38.098 B/siete fuentes. Sin imports externos u operativos. Son bundles para
revisar dependencias puras, no tamaños de assets UI ni mediciones de navegador.
El diagnóstico de la demo Empresas existente conserva 22.326 B/seis fuentes.
El contraste nuevo del build confirma que su grafo cliente conserva nombres,
bytes y gzip de R6.1b: entrada `B2Ch4nkX`, 21.053 B/6.262 B gzip, y compartido
`Ow_zwmVh`, 5.749 B/2.053 B gzip; total 26.802 B/8.315 B gzip por archivo.
Cero imports externos y efectos en la sonda de arranque sin raíz: una consulta
DOM y diez fechas explícitas. El contrato nuevo no entra en ese cliente.
Esta comprobación no repite la interacción de navegador ni implementa UI nueva.

La [verificación de R6.1b](../../audits/r6-1b/verification-report.json), integrada
en PR #28, es heredada: 948 archivos sin diagnósticos, 246 suites/3.077 pruebas,
44 HTML/44 formularios/cero crons, navegador 601/601, E2E 176/176 y ocho superficies
a11y sin hallazgos. Ocho capturas revisadas; base QA de 143 tablas/353 filas
intacta. No son nuevas ejecuciones de este contrato sin UI.

## Siguiente corte

El siguiente corte aprobado es **R6.2b**, demo inerte en
`/demo/admin/catalogos-empresa`, dentro de Clientes. Usará cuatro empresas
sintéticas: Workshop y Studio activas con políticas/precios distintos, Unbound
activa sin binding y Closed inactiva. Contextos ES/FR, canal `professional`
fijo y tres productos con variantes activas. La selección inicial 11/21/31
será explícita, sin inferir una variante predeterminada, y se conservará al
cambiar contexto.
El estado inicial mostrará los tres orígenes de precio: lista de empresa,
lista general y catálogo. Sin totales, hashes o referencias técnicas en la UI.

Implementación visual y QA todavía pendientes. Se prevén ocho capturas:
estado inicial, intersección sin variantes comunes, binding ausente y empresa
inactiva, en dos tamaños. Son casos planificados, no evidencia producida.
No se añaden permisos reales, DDL, persistencia, cron, formularios o cobros.

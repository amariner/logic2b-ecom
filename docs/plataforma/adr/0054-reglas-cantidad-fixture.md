# ADR-0054 — Reglas de cantidad por variante con fixtures

- Estado: accepted; R6.3a implementado y verificado localmente. Integración pendiente; sin activación ni despliegue.
- Fecha: 2026-10-04
- Bloque: R6.3a, mínimo, máximo, múltiplo y caja.
- Propietario: módulo `companies`, versión 1.2.0.
- Capacidad: B2B-005, parcial e instalada/inactiva en avanzado/demo, dependencia B2B-002.
- Composición: `previewCompanyQuantities`, mediante contratos públicos puros y el contexto de catálogo existente.
- Demo visual: R6.3b con diseño aprobado; implementación y QA propias pendientes.

## Contexto

R6.2b está integrada en PR #30 (`6305b823`), sin despliegue. El
[ADR-0053](0053-catalogos-empresa-fixture.md) permite explicar visibilidad por
empresa/mercado y precio unitario de una variante seleccionada. No modela una
cantidad solicitada ni concede permiso de compra. Este corte añade una
explicación de mínimos, máximos, múltiplos y cajas, conservando esas fronteras.

Las ofertas por cantidad de `pricing/quantity-offer` calculan descuentos por
tramos o compra X/Y; no son restricciones de cantidad de compra. Tampoco se
reinterpretan los límites operativos existentes: quote recibe cantidades de
1–99, agrega por slug y limita duplicados a 99; los contratos de precio/oferta
por cantidad conservan sus límites. Este corte no modifica esas rutas ni
convierte su validación fixture en una integración con checkout.

## Decisión

### Catálogo neutro de identidad y política global

`defineQuantityCatalogSnapshot(input: unknown)` define un snapshot inmutable
con únicamente identidad de productos/variantes y propiedad:

```ts
{
  schemaVersion: 1,
  source: 'fixture',
  ref,
  capturedAt,
  products: [{ id, variants: [{ id, productId }] }]
}
```

No contiene precios, stock, lifecycle, empresa, mercado o permisos. Esos
contextos pertenecen a sus contratos existentes. Referencia e instante son
metadatos declarados; no acreditan una lectura de D1 o la autenticidad de los
datos. La composición deriva este snapshot desde el mismo catálogo completo
normalizado de R6.2, sin aceptar un segundo catálogo independiente.

`defineVariantQuantityPolicy(input: unknown)` recibe exactamente:

```ts
{
  schemaVersion: 1,
  source: 'fixture',
  id,
  version,
  catalogRef: { ref, capturedAt },
  rules: [{
    productId,
    variantId,
    orderUnit: 'unit' | 'box',
    unitsPerBox,
    minUnits,
    maxUnits,
    multipleUnits
  }]
}
```

La política es global por variante; no hay reglas de empresa, prioridades,
herencia o fallback entre contextos. La propiedad `productId` debe coincidir
con el catálogo y cada variante solo puede tener una regla. Ausencia de regla
significa `unconfigured`, no venta libre ni factor uno implícito.

La regla fija la unidad de pedido. `unit` exige `unitsPerBox === 1`; `box`
exige un factor entero de al menos dos. No se deduce el embalaje de SKU, título,
variante predeterminada, dimensiones o bundle. La caja representa unidades
canónicas de una variante; no modela un paquete de productos distintos,
embalaje logístico, bultos o composición de stock.

Mínimo y máximo son inclusivos y se expresan en unidades canónicas, igual que
el múltiplo absoluto desde cero. El múltiplo no empieza en el mínimo. Cada
regla se aplica a una línea de variante; no establece un mínimo agregado del
carrito, importe, producto con variantes mezcladas o empresa.

### Petición ligada a una interpretación de unidad

`defineVariantQuantityRequest(input: unknown)` recibe:

```ts
{
  schemaVersion: 1,
  id,
  catalogRef: { ref, capturedAt },
  policyRef: { id, version },
  lines: [{ productId, variantId, requestedCount }]
}
```

La petición no puede elegir otra unidad o factor. `requestedCount` cuenta la
unidad de pedido fijada por la regla: unidades o cajas. La referencia exacta
al catálogo y a la versión declarada de política rechaza una interpretación
correspondiente a otra revisión. No detecta que el llamador cambie el contenido
conservando los mismos ID/versión. Esta correlación de datos no autentica el
snapshot ni ofrece una firma o autorización.

Se conserva una variante explícita por producto. Las líneas duplicadas del
mismo producto son error, aunque seleccionen variantes distintas; no se suman,
recortan ni ordenan para ocultar ambigüedades. Cero es una entrada diagnóstica
válida: con regla conocida produce cero unidades y `below_minimum`. No elimina
la línea. `-0`, valores negativos, fracciones o coerciones son inválidos.

### Conversión y factibilidad exactas

La conversión usa enteros `BigInt`:

```text
quantityUnits = requestedCount × unitsPerBox
step = lcm(multipleUnits, unitsPerBox)
firstFeasible = ceil(minUnits / step) × step
```

La regla solo es válida si `firstFeasible <= maxUnits`. Este cálculo incorpora
la caja: que exista un múltiplo dentro del intervalo no basta si no equivale a
un número entero de cajas. El mínimo común múltiplo se calcula con el máximo
común divisor y aritmética exacta, sin floats ni desbordamientos intermedios.

Una conversión mayor que `Number.MAX_SAFE_INTEGER` produce
`quantity_overflow`; una regla sin cantidad posible produce `infeasible_rule`.
No hay redondeo, límite automático a 99, ajuste a la siguiente caja ni
corrección silenciosa de la solicitud. La conversión se valida también cuando
la empresa o variante resultaría invisible en el contexto comercial.

| Regla | Solicitud | Diagnóstico |
|---|---|---|
| Unidad, mínimo 5, máximo 17, múltiplo 4 | 5 unidades | `not_multiple`; cantidades conformes 8, 12 y 16 |
| Caja de 6, mínimo 6, máximo 18, múltiplo 4 | 1, 2 o 3 cajas | 6 y 18 no cumplen el múltiplo; 12 sí |
| Caja de 6, mínimo 6, máximo 11, múltiplo 4 | Cualquier solicitud | Política inviable: el primer múltiplo común es 12 |
| Regla configurada con mínimo positivo | 0 | Cero unidades, `below_minimum`; no elimina la línea |
| Sin regla | Cualquier contador válido | `unconfigured`; unidad, factor y cantidad canónica nulos |

### Validación completa y diagnóstico del dominio

`previewVariantQuantities({ catalog, policy, request }: unknown)` normaliza
los tres artefactos y contrasta todas las referencias y propiedades, incluidas
las reglas ajenas a las líneas solicitadas. Una referencia desconocida, de
otro producto o con versión/instante diferentes es error. No se convierte un
artefacto corrupto en un bloqueo comercial normal.

La salida contiene `source: 'fixture'`, `catalogRef`, `policyRef`, `requestId`
y líneas con:

```ts
{
  productId,
  variantId,
  requestedCount,
  orderUnit: 'unit' | 'box' | null,
  unitsPerBox: number | null,
  quantityUnits: number | null,
  rule: VariantQuantityRule | null,
  outcome: 'satisfied' | 'blocked',
  reasons: Array<'unconfigured' | 'below_minimum' | 'above_maximum' | 'not_multiple'>
}
```

Se preservan motivos acumulados y datos solicitados. `satisfied` solo indica
conformidad con esta regla fixture. `unconfigured` conserva regla, unidad,
factor y cantidad canónica nulos; no calcula una conversión sin la declaración
necesaria. La salida no contiene dinero ni un permiso `purchasable`.

Los límites de `VARIANT_QUANTITY_LIMITS` son 1.000 productos, 100 variantes por producto,
10.000 variantes totales, de cero a 10.000 reglas únicas por variante y de cero
a 100 líneas con producto único. Los IDs de producto están entre uno y
2.147.483.647 y los de variante son enteros positivos seguros. Mínimo, máximo,
múltiplo y factor son enteros positivos seguros, con mínimo menor o igual que
máximo y las condiciones de unidad/caja anteriores. El contador solicitado
admite cero hasta el máximo entero seguro. El snapshot admite cero productos;
cada producto declarado contiene al menos una variante. Los productos y
variantes se ordenan por ID, reglas por producto/variante y líneas por producto.

IDs opacos y referencias tienen hasta 100 caracteres, con gramática
`^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$`; versiones positivas seguras y fechas UTC
canónicas de 24 caracteres con calendario válido. No se añade `at` ni un
instante de evaluación implícito.

`VariantQuantityContractError` usa código `variant_quantity_contract_invalid`,
motivos cerrados y mensajes fijos:
`invalid_data`, `duplicate_rule`, `duplicate_line`, `unknown_reference`,
`cross_product_reference`, `reference_mismatch`, `infeasible_rule` y
`quantity_overflow`. No devuelve valores de entrada, mensajes ajenos, `cause`
o datos privados. Registros estrictos y arrays densos de propiedades de datos;
no se ejecutan getters, se copian entradas y se congelan salidas. No se lee un
reloj implícito.

### Composición aditiva con visibilidad

`previewCompanyQuantities(input: unknown)` recibe exactamente:

```ts
{
  catalogContext: {
    directory, markets, catalog, companyPolicy, publicationPolicy,
    context: { companyId, marketId, channel }
  },
  policy,
  request
}
```

Reutiliza el preview de catálogo completo de R6.2, con sus datos ya validados,
y deriva internamente el snapshot neutro de identidad. No acepta dos catálogos
que puedan discrepar ni elimina precios corruptos antes de validar el catálogo
original. La validación de cantidades y overflow se completa antes de construir
los resultados de bloqueo por visibilidad.

Devuelve `source: 'fixture'`, referencias de directorio/catálogo/política de
empresa/publicación/mercados/política de cantidad, `requestId`, contexto,
empresa `{ id, state }` y líneas. Cada línea conserva producto/variante,
`quantity` con el diagnóstico completo del dominio y `visibility` con
`visible`, `companyReasons`, `marketReasons` e `intersectionReason`. El resultado
final solo es `satisfied` si cantidad y visibilidad son conformes; de lo
contrario es `blocked`, con motivos de cantidad y `variant_not_visible` cuando
corresponda. Se conservan ambas dimensiones para explicar cada bloqueo.

Esto no recupera una variante excluida, activa una empresa ni consulta bindings
de precio. La salida no expone el snapshot monetario del catálogo, precios,
totales o stock. Una cantidad conforme y una variante visible no garantizan
que se pueda comprar, que exista crédito o que el visitante pertenezca a la
empresa seleccionada.

La composición conserva los motivos de cantidades, traduce empresa ausente a
`unknown_reference` y reconstruye errores ajenos con mensajes fijos, sin
conservar `cause` o valores recibidos. Un fallo de catálogo no se presenta
como ausencia de regla o cantidad bloqueada normal.

## Módulo y fronteras

La configuración es `companies` 1.2.0, dependencia de
módulo `platform-configuration`, y B2B-005 dependiente únicamente de B2B-002.
Instalada/inactiva en avanzado y demo, ausente en mínimo y estándar, con
superficies operativas vacías. B2B-005 queda parcial e inactiva; el contrato
verificado no declara integración con checkout u operación real.

Sin imports de `quantity-offer`, `price-rule` o quote para evaluar cantidades.
Sin DDL, repositorios, endpoints, cron, proveedores, escrituras durables o nueva
UI. El límite operativo 1–99 y el tratamiento de duplicados del carrito se
mantienen. Tampoco se introducen precio, descuento, impuestos, embalaje
logístico, reserva de stock, autorización o correcciones automáticas.
Los [ADR-0002](0002-limites-y-direccion-de-dependencias.md) y
[ADR-0003](0003-puertos-adaptadores-y-composition-root.md) mantienen la separación
entre APIs públicas puras y activación de servicios operativos.

## Verificación y estado

[Verificación final R6.3a](../../audits/r6-3a/verification-report.json), 2026-10-04:
`pnpm check` pasa 965 archivos sin diagnósticos, 254 suites/3.376 pruebas,
44 HTML, 44 formularios locales y cero crons. Focales propias: 57 de dominio
y 55 de composición, 112 en total; seis de arquitectura y 117 de
registry/manifest/acceso (19/68/30). Oráculo independiente: 78.223
comprobaciones, 3.234 políticas, 1.738 factibles, 12.372 cantidades y 900
intersecciones, sin P1/P2, getters, efectos o reloj implícito.

La revisión del build confirma que los grafos, nombres, SHA, bytes y gzip de
Catálogo por empresa, Empresas y guía son idénticos a PR #30; el nuevo contrato
no entra en esas interfaces. Corte puro, sin nuevas ejecuciones de Worker,
HTTP, navegador, a11y o base QA. E2E 180/180, navegador 3.614/64 visitas, ocho
superficies a11y sin hallazgos, ocho capturas y base QA de 143 tablas/353 filas se
heredan de R6.2b/PR #30. Su hash es
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`;
no es una nueva medición de este contrato. Integración pendiente, sin despliegue.

Bundles de diagnóstico minificados: API pública de cantidades desde el barrel,
7.728 B/dos fuentes puras, incluidos 718 B de constantes históricas del
directorio; composición, 35.934 B/siete fuentes. Cero imports externos u
operativos. Son sondas de contrato, no nuevos assets de UI.

La comparación del build por SHA, grafo, nombres, bytes y gzip contra PR #30
conserva Catálogo (`Ca5BI841`, 60.244 B/18.532 B gzip), Empresas (`tUOZl7at`,
26.856 B/8.818 B gzip) y guía (`DrLAblic`, 15.143 B/6.297 B gzip). Los contratos
nuevos no entran en estos clientes. Es una comprobación nueva del build,
diferente de la QA de interacción heredada.

La [verificación de R6.2b](../../audits/r6-2b/verification-report.json), integrada
en PR #30, es heredada: 961 archivos sin diagnósticos, 252 suites/3.259 pruebas,
44 HTML/44 formularios/cero crons, navegador 3.614 comprobaciones/64 visitas,
E2E 180/180, ocho superficies a11y sin hallazgos y ocho capturas aprobadas.
La base QA conservó 143 tablas/353 filas y SHA-256
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
No son nuevas ejecuciones del contrato de cantidades.

## Siguiente corte

El siguiente corte aprobado es **R6.3b**, demo inerte en
`/demo/admin/cantidades`, «Mínimos, múltiplos y cajas», dentro de Clientes,
después de Catálogo por empresa. Una empresa activa y canal `professional`
fijos, mercados ES/FR y una única línea de variante seleccionada. Cada variante
conserva su contador en memoria: 11 empieza en 8, 12 en 2 y 21 en 1.

Variante 11: unidades, factor uno, mínimo 5, máximo 17 y múltiplo 4. Variante
12: cajas de seis, mínimo 6, máximo 18 y múltiplo 4. Variante 21: sin regla,
con unidad/factor/cantidad canónica nulos incluso al solicitar cero. ES muestra
las tres; FR oculta la 11. Cantidad conforme y visibilidad se explicarán por
separado, sin precios, stock, totales, autorización o ajustes automáticos.

Diseño aprobado, implementación y QA pendientes. Se prevén 36 estados por
tamaño: contadores 0, 2, 4, 5, 8, 12, 16, 17, 19 y 20 para unidades; 0–4 para
cajas; 0–2 sin regla, en ES/FR. Ocho capturas previstas: unidad conforme, una
caja que incumple el múltiplo, ausencia de regla y ocho unidades ocultas, en
1.440/375 px. Son casos planificados, no evidencia visual producida.

El cierre fixture de a/b deja pendiente la integración autorizada con catálogo,
carrito, checkout y operación real. No exige DDL o proveedor para ensayar la
demostración local ni convierte una cantidad conforme en autorización.

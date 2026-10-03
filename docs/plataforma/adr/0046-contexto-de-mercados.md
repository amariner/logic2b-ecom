# ADR-0046 — Contexto de mercados explícito y resolución pura

- Estado: accepted; R5.7a–b implementado y verificado en QA local, sin activación.
- Fecha: 2026-10-03
- Bloque: R5.7a–b
- Capacidad: MKT-003

## Contexto

Las listas de precios ya admiten un contexto de mercado. Falta un contrato
propietario que explique de dónde procede ese mercado, qué versión de
configuración se utilizó y qué significa no poder resolverlo. Inferirlo de
una moneda, aceptar un ID desconocido como mercado por defecto o confundir
el idioma preferido con contenido publicado ocultaría decisiones comerciales.

Este corte construye un modelo y una composición puros, probados en QA con
datos sintéticos. MKT-003 queda parcial, instalada e inactiva en el preset
avanzado. No incorpora DDL, persistencia, rutas, endpoints, jobs, proveedor,
conversión monetaria, traducciones ni activación. La demo visual de mercados
permanece pendiente; la demo de segmentos R5.6d sí está verificada en el
repositorio e integrada en PR #15 (`71d5263`), sin despliegue.

## Decisión

### Catálogo explícito, versionado y sin almacenamiento obligatorio

`defineMarketCatalog(unknown): MarketCatalog` valida, normaliza y devuelve una
copia congelada del catálogo. Su forma es cerrada:

```ts
{
  schemaVersion: 1,
  id: string,
  version: number,
  markets: Array<{
    id: string,
    countryCodes: string[],
    defaultLocale: string,
    currency: string,
    domains: string[]
  }>,
  fallback: { strategy: 'none' }
    | { strategy: 'market', marketId: string }
}
```

El proyecto puede conservar este documento en Git e inyectarlo en la
composición. Una versión positiva identifica el documento usado; el proceso
de versionado debe conservar su contenido y no reutilizarla para otras reglas.
La función pura no mantiene un registro de versiones anteriores y sus reglas
no dependen de una fila de D1. Una futura necesidad de edición operativa,
historia durable o publicación concurrente deberá justificar su propio
almacenamiento. Este contrato no lo exige ni simula una persistencia existente.

El catálogo admite de uno a 100 mercados, de uno a 250 países por mercado y
de cero a 20 dominios por mercado. El ID de catálogo es opaco, canónico en
minúsculas, de uno a 100 caracteres; el de mercado es canónico en mayúsculas,
de dos a 40. La versión es un entero positivo seguro. Los dominios son únicos
en todo el catálogo; varios mercados sí pueden declarar el mismo país.

País y moneda admiten códigos de dos y tres letras mayúsculas respectivamente.
La comprobación es sintáctica: no certifica pertenencia a un registro ISO,
cobertura de un transportista, jurisdicción fiscal ni disponibilidad de cobro.
`defaultLocale` usa forma canónica de `Intl`, sin extensiones ni etiquetas de
uso privado, con un máximo de 100 caracteres antes y después de canonicalizar.
Es un valor de contexto, no una
lista de idiomas publicados ni evidencia de traducciones.

Los hosts usan DNS ASCII exacto, al menos dos etiquetas, máximo 253 caracteres
y 63 por etiqueta; se normalizan a minúsculas. Se rechazan URL completa,
puerto, wildcard, IP y punto final. Registrar un host no crea DNS, certificado,
propiedad de dominio, redirección ni ruta servida.

Los arrays se ordenan canónicamente sin depender de `localeCompare`. Las
entradas son objetos de datos estrictos, sin accessors ejecutables ni campos
extra. El resultado no comparte estructuras mutables con el input.

### Resolución de un selector, sin precedencia implícita

`resolveMarket(catalogInput, selectorInput): MarketResolution` revalida ambas
entradas. El selector es exactamente una de estas variantes:

```ts
{ by: 'id', marketId: string }
{ by: 'domain', hostname: string }
{ by: 'country', countryCode: string }
{ by: 'none' }
```

No combina señales de IP, cookie, cabecera, dominio y dirección ni fija una
precedencia entre ellas. El llamador debe decidir qué contexto fiable utiliza;
este bloque no conecta selectores del navegador al precio de un checkout.

Cada resultado incluye `catalogId`, `catalogVersion` y el selector normalizado:

| Resultado | Significado |
|---|---|
| `matched` | Un mercado coincide; contiene `matchedBy` y el mercado normalizado. |
| `fallback` | Se aplica el mercado configurado con razón `no_context`, `domain_not_matched` o `country_not_matched`. |
| `unresolved` | `unknown_market_id`, `ambiguous_country` o `fallback_disabled`; no se inventa un mercado. |

Un ID explícito desconocido no activa fallback. Si varios mercados comparten
el país seleccionado, el resultado es ambiguo aunque exista un fallback.
Ausencia de contexto o dominio/país sin coincidencia solo pueden usar la
política de fallback declarada. Datos inválidos producen
`MarketContextContractError`, código `market_context_contract_invalid`, sin
degradarse a una resolución válida.

Un fallback de contexto no demuestra disponibilidad de envío, jurisdicción,
consentimiento, publicación de producto ni autorización de venta. Esas
decisiones pertenecen a sus contratos y proyectos correspondientes.

### Composición pura con precios

`resolveMarketPricingContext(input: unknown)`, en `market-pricing-context`,
acepta exactamente `{ catalog, selector, baseCurrency, at, channel }`. Resuelve
el mercado internamente; no acepta una resolución calculada por el llamador.
La moneda base se aporta explícitamente, se normaliza a tres letras mayúsculas
y debe coincidir con la moneda del mercado resuelto. `at` es una fecha ISO UTC
explícita, sin leer el reloj; `channel` conserva las mayúsculas/minúsculas del
contrato de precios.

Un resultado `resolved` incluye `baseCurrency`, la resolución y un
`PriceRuleContext` con `{ at, currency, market, channel }`. Un resultado
`blocked` conserva `baseCurrency` y la resolución, con `context: null` y razón
`market_unresolved` o `currency_mismatch`. Los errores estructurales lanzan
`MarketPricingContextContractError` con código `market_pricing_context_contract_invalid`;
los errores del catálogo o selector conservan `MarketContextContractError`.
No son fallback. Todo el resultado es inmutable.
No convierte importes, renombra monedas ni conecta la resolución al quote,
checkout o pedido real.

El contrato de catálogo puede describir distintos códigos de moneda; eso no
habilita multidivisa. La composición de R5.7b se limita a la moneda base y
rechaza cualquier combinación incompatible. Las pruebas usan catálogos
inyectados y datos sintéticos, sin red, D1 ni estado compartido de la demo.

## Verificación y estado

Implementación terminada: 119 pruebas del contrato y 25 de la composición,
incluido el límite de locale después de canonicalizar. La revisión independiente
no encuentra P1/P2 pendientes. Se verifican entradas hostiles, copias inmutables,
resolución determinista, ambigüedad, fallback explícito y rechazo de mezcla de
monedas, además de las fronteras de módulo.

`pnpm check` pasa 888 archivos sin diagnósticos, 224 suites/1.876 pruebas,
build y guardas de 44 HTML/44 formularios cerrados a envíos. La repetición final
de tipos tras la regresión de locale confirma 888 archivos y cero errores,
avisos o hints. E2E local: 156/156. La base QA conserva 143 tablas y 353 filas,
con SHA-256 antes y después
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Servidor de QA detenido. [Informe del cierre](../../audits/r5-7/verification-report.json).
No se atribuyen a este corte las pruebas de navegador de R5.6d ni se declara
una demo visual de mercados disponible. No hay despliegue.

## Consecuencias y siguiente bloque

- MKT-003 permanece parcial e inactiva: todavía no modifica ninguna compra.
- Git e inyección explícita bastan para el alcance puro; no existe un gate
  artificial de migración para terminarlo.
- G3/G4 de despliegue y uso real siguen separados y no bloquean el contrato
  ni su composición de QA.
- La demo visual de mercados queda pendiente; no se anuncia como demostrable.
- Cerrado R5.7a–b, sigue R5.8a: ADR y contrato puro de contenido
  localizado, estado editorial y plan de URLs. Canonical, hreflang y entradas
  de sitemap se derivarán solo de locales y páginas publicados explícitamente;
  `defaultLocale` o un fallback no inventan una traducción publicada.
- R5.8a puede probarse con fixtures y configuración versionada, sin DDL,
  servicios de traducción, endpoints ni modificaciones del render, las rutas
  o el sitemap servido. La publicación por mercado conserva el alcance R5.9.

# ADR-0047 — Contenido localizado y planificación de URLs

- Estado: accepted; R5.8a implementado y verificado localmente, sin activación.
- Fecha: 2026-10-03
- Bloque: R5.8a
- Propietario: `localization`
- Capacidades: MKT-006 y MKT-007, instaladas e inactivas en avanzado y demo.

## Contexto

R5.7a–b, integrada mediante PR #16 (`13cd79d`), resuelve un contexto de mercado
sin activar una compra. Su `defaultLocale` no demuestra que haya contenido
traducido ni publicado. Tampoco un fallback editorial permite anunciar una URL
como traducción existente. Hace falta separar documento, edición de trabajo,
publicación y representación SEO, sin introducir un CMS antes de necesitarlo.

MKT-006 depende de PLT-004; MKT-007 depende de MKT-006. Su instalación no abre
superficies, rutas, endpoints ni jobs. El alcance es puro y admite documentos
explícitos versionados en Git o inyectados en QA. No añade D1, persistencia,
editor operativo, traducción externa, activación ni despliegue. La evidencia
visual de mercados y traducciones sigue pendiente.

## Decisión: contenido editorial puro

### Documento y publicaciones independientes

`defineLocalizedContent(unknown)` valida, normaliza y congela un documento:

```ts
{
  schemaVersion: 1,
  id: string,
  version: number,
  updatedAt: string,
  sourceLocale: string,
  editions: Array<{
    locale: string,
    draft: {
      revision: number,
      sourceRevision: number | null,
      fields: { title: string, summary: string, bodyPlainText: string },
      status: 'draft' | 'review'
    } | null,
    published: {
      revision: number,
      sourceRevision: number | null,
      fields: { title: string, summary: string, bodyPlainText: string },
      publishedAt: string
    } | null
  }>
}
```

La publicación es independiente del borrador: editar o enviar a revisión
conserva la última publicación. `unpublish` deja `published: null`; no existe
un estado adicional `withdrawn`. `sourceRevision` es nula solo en el idioma
fuente. Una traducción identifica la revisión publicada de la fuente que usó.
Un nuevo borrador fuente no vuelve obsoletas las traducciones existentes;
publicar una revisión fuente distinta sí cambia su vigencia.

Máximo de 20 ediciones por contenido, ID opaco canónico en minúsculas de hasta
100 caracteres y locales `Intl` canónicos, sin extensiones, con un máximo de
100 caracteres antes y después de canonicalizar. Los campos son texto plano:
`title` hasta 200 caracteres, `summary` hasta 1.000 y `bodyPlainText` hasta
20.000. Un borrador puede estar incompleto; revisión y publicación exigen los
tres campos no vacíos. El contrato no interpreta HTML ni ejecuta contenido.

### Comandos versionados, sin efectos durables

`applyLocalizedContentCommand(contentInput, commandInput)` recibe un comando
cerrado, una versión esperada y `occurredAt` UTC explícito en todos los casos:

| Comando | Datos específicos |
|---|---|
| `save_draft` | `expectedVersion`, `locale`, `sourceRevision`, `fields`. |
| `submit_review` | `expectedVersion`, `locale`. |
| `publish` | `expectedVersion`, `locale`; `publishedAt` se deriva de `occurredAt`. |
| `unpublish` | `expectedVersion`, `locale`. |

`occurredAt` no puede ser anterior a `content.updatedAt`; las publicaciones
no pueden quedar después de `updatedAt`. Un resultado aplicado actualiza
versión y `updatedAt`; conflicto o bloqueo conserva el documento. No se lee
`Date.now` ni se admite una fecha de publicación independiente del comando.

Devuelve `applied`, `conflict` o `blocked`, con el contenido resultante y
diagnósticos cerrados según el caso. Una publicación de un borrador traducido
obsoleto no está permitida. El control de versión es una transición pura sobre
el documento recibido: no acredita una escritura concurrente de D1, un registro
durable de auditoría ni identidad o permiso del editor. Esas fronteras no se
simulan como si estuvieran implementadas.

### Selección publicada y fallback explícito

`resolveLocalizedContent(contentInput, optionsInput)` exige:

```ts
{
  requestedLocale: string,
  fallback: { strategy: 'none' } | { strategy: 'locale', locale: string },
  staleTranslations: 'include' | 'exclude'
}
```

El resultado conserva `contentId`, `contentVersion` y `requestedLocale`.
`matched` y `fallback` incluyen `resolvedLocale`, publicación y vigencia
`current` o `stale`. El fallback explica `not_published`, `stale` o
`source_unpublished`; `unresolved` conserva razón y diagnóstico del fallback.
No se sustituye un fallo estructural por contenido vacío ni se decide una
política editorial por defecto.

Sin fuente publicada no se resuelven sus traducciones, incluso al permitir
traducciones obsoletas. Un contenido devuelto por fallback mantiene su locale
real; no se presenta como publicación del locale solicitado.

## Decisión: plan internacional de URLs

`planInternationalUrls(input: unknown)` recibe exactamente:

```ts
{
  contents: LocalizedContent[],
  routes: Array<{ locale: string, origin: string, pathPrefix: string, hreflang: string }>,
  bindings: Array<{ contentId: string, locale: string, publishedRevision: number, slug: string }>,
  xDefaults: Array<{ contentId: string, locale: string }>,
  staleTranslations: 'include' | 'exclude'
}
```

Revalida los documentos y resuelve cada edición con fallback desactivado y
la política de obsolescencia aportada. Un binding a borrador o revisión
publicada incorrecta es un error. Excluir una traducción obsoleta o con fuente
sin publicar produce diagnóstico, nunca una URL de sustitución. El slug
pertenece al binding de contenido/locale/revisión, separado del texto editorial.

Los orígenes son HTTPS canónicos exactos, sin puerto, credenciales, ruta,
query ni fragmento. `pathPrefix` es `/` o una ruta absoluta sin barra final.
El slug es un segmento literal NFC, sin `%`, puntos, barras ni controles;
el vacío representa el inicio del prefijo y el resto se codifica de forma
segura. Se rechazan colisiones globales de URL.

`hreflang` es explícito y usa `INTERNATIONAL_HREFLANG_PROFILE`, identidad
`iso-alpha2-script-subset-v1`: vocabularios estáticos de 184 idiomas ISO 639-1
y 249 regiones ISO 3166-1 alfa-2. Admite únicamente los scripts explícitos
`Arab`, `Cyrl`, `Hans`, `Hant` y `Latn`; no implementa todo ISO 15924.
Rechaza regiones como `EU`, `UN`, `XX` o `XK` y scripts inventados como `Abcd`;
por ejemplo, `en-EU` es inválido.

Comparte el idioma base de la edición, con normalización explícita de alias:
`fil` de `Intl` se representa como `tl` en SEO y `UK` se canonicaliza a `GB`.
No se copia ciegamente cualquier locale `Intl`; un locale `es-419` requiere un
mapeo admitido explícito como `es`. No se permiten hreflang duplicados dentro
del mismo contenido. El perfil es una restricción técnica de este contrato,
no una promesa de idiomas traducidos, países atendidos ni jurisdicciones.

El plan devuelve páginas con referencia de contenido/publicación, URL,
canonical propio, `lastmod`, vigencia y alternates; sitemaps agrupados por
origen, con entradas `loc`/`lastmod`; y exclusiones con referencia y razón
`stale` o `source_unpublished`. Los alternates incluyen la propia página y
son recíprocos entre las ediciones incluidas del mismo contenido.
`lastmod` procede de `publishedAt`, nunca del reloj de ejecución o del borrador.

`x-default` es opt-in por contenido y debe señalar una edición incluida.
Si la política la excluye, falla la configuración; no se elige otra de forma
implícita. El resultado es un DTO: no emite XML, etiquetas HTML, archivos,
redirecciones, DNS ni publicaciones.

Límites técnicos: 100 contenidos, 50 rutas de locale, 1.000 bindings y 100
x-defaults. Origen de hasta 300 caracteres con host DNS de hasta 253; segmento
de hasta 200, prefijo de hasta 500 y URL final de hasta 2.048. Superar un límite
rechaza la entrada; no se trunca el plan ni se publica una parte silenciosamente.

## Frontera SEO y operación

El mapa actual permanece intacto: las páginas comerciales indexables no cambian
y todo `/demo/*` sigue `noindex,follow`, fuera del sitemap. Una futura muestra
puede enseñar canonical/hreflang como datos ilustrativos; no debe insertarlos
como metadatos reales de la demo ni publicar las URLs planeadas.

Este contrato no habilita idiomas ni mercados, no demuestra disponibilidad
de envío o jurisdicción y no publica productos. MKT-004 y la publicación por
mercado conservan R5.9. Git e inyección bastan para ensayar el contrato;
cualquier necesidad futura de CMS, historia durable o edición concurrente
deberá justificarse por su alcance, sin convertir D1 en requisito previo.

## Verificación y siguiente bloque

Implementación y QA cerradas: `pnpm check` pasa 893 archivos sin diagnósticos,
226 suites/1.999 pruebas, build y guardas de 44 HTML/44 formularios cerrados a
envíos. Incluye 53 pruebas editoriales y 67 del planificador. La revisión
independiente no deja P1/P2; los vocabularios de 184 idiomas, 249 regiones y
cinco scripts están contrastados. [Informe del cierre](../../audits/r5-8a/verification-report.json).

Se verifican validación estricta e inmutabilidad, comandos/versiones,
borrador/publicación separados, vigencia/fallback, colisiones de URL,
alternates recíprocos, x-default explícito y ausencia de efectos.
R5.8a no cambia compra, pedidos, panel, render ni D1. La validación nueva es
check global, focales editoriales/SEO y revisión; no se repiten navegador o
E2E sin cambios de runtime. E2E 156/156 y la base QA de 143 tablas/353 filas
con hash intacto pertenecen al corte R5.7 integrado en PR #16; se conservan
como regresión heredada, sin presentarlos como nuevas ejecuciones de R5.8a.

Después sigue **R5.8b: composición y demo inerte integrada de mercados,
contenido y plan de URLs**, sobre fixtures y moneda base. Orientación aprobada:
`/demo/admin/mercados`, «Mercados e idiomas», con vista visitante ES/FR,
idioma/fallback y dos contenidos con ES/CA publicados, EN borrador y FR ausente.
Edición, revisión y publicación inglesa se simulan solo en memoria; reset y
recarga recuperan el estado inicial. Comparación del plan en dominios `.test`
como datos sin enlaces. Exige manifest demo **y** `DEMO_MODE=true`.

Cierra la evidencia visual pendiente sin CMS, API operativa, D1, persistencia,
cron ni activación. La superficie demo permanece noindex; el SEO servido no
se modifica. QA en escritorio/móvil, teclado, sin JavaScript, movimiento
reducido y cero peticiones operativas o beacons. Después, R5.9a puede modelar
producto/variante/canal, preview y explicación de publicación por mercado
mediante un contrato puro, sin exigir una migración para definirlo.

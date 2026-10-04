# ADR-0052 — Directorio de empresas con fixtures

- Estado: accepted; R6.1a implementado, verificado e integrado en PR #27 (`9b78e69a`). R6.1b verificado localmente, disponible en repo e integrado en PR #28 (`861b34ff`). Sin activación ni despliegue.
- Fecha: 2026-10-04
- Bloques: R6.1a, contrato de empresas, sedes, contactos, roles y VAT ID; R6.1b, demo inerte.
- Propietario: módulo `companies`.
- Composición: `company-vat-context`, mediante APIs públicas de `companies` y `taxes`.
- Capacidad: B2B-001, parcial e instalada/inactiva en avanzado y demo; dependencia PLT-004.
- Fuera de este corte: delegación efectiva B2B-009, autenticación, precios, crédito y cobro.

## Contexto

R5.12 está integrada en PR #26 (`9dd23909`), sin despliegue. Sus contratos
separan identidad, contexto de mercado, publicación, fiscalidad, presentación
de divisas y métodos sintéticos. La siguiente ola empieza por la estructura
B2B de empresas, sedes y contactos, antes de los catálogos/precios por empresa,
condiciones de pago, crédito y aprobaciones.

Un perfil de cliente no acredita pertenencia a una empresa ni derecho a ver
recursos. El [ADR-0039](0039-perfil-cliente-identidad-opaca.md) mantiene esa
frontera. Del mismo modo, `companyKeyHash` de las listas de precios es un
selector de reglas, no una prueba de identidad o de autorización. Este corte
no deriva esa clave ni modifica la resolución de precios.

La evidencia VAT del [ADR-0049](0049-contrato-fiscal-fixture.md) ya expresa una
consulta explícita, adaptador y vigencia. Se puede componer con una declaración
de empresa sin consultar un proveedor ni convertir un VAT válido en permiso,
tratamiento B2B o exención.

## Decisión

### Directorio versionado y referencias explícitas

`defineCompanyDirectory(input: unknown): CompanyDirectory` normaliza un
directorio fixture versionado en `companies`. Contiene empresas, sedes,
contactos, roles descriptivos y sus asignaciones.
La propiedad de cada sede y contacto se declara; no se infiere de un dominio
de email, país, nombre o VAT. Las asignaciones identifican empresa, contacto,
rol y alcance de empresa o sede mediante referencias íntegras.

La normalización rechaza duplicados, referencias huérfanas y cruces de
propiedad incompatibles. El selector revalida el snapshot completo, incluidas
entidades ajenas al contexto solicitado. No convierte un directorio corrupto
en un resultado vacío o una aparente ausencia de la empresa seleccionada.

Los estados activo/inactivo describen empresas, sedes y contactos; las
asignaciones no tienen ese campo. No equivalen a permisos ni habilitan una
sesión, acceso a recursos, presupuesto, crédito o
compra. Seleccionar una entidad inactiva no la activa ni la oculta mediante
un filtro comercial implícito. Los roles son nombres descriptivos declarados;
no llevan concesiones de acceso ni una política de delegación operativa.

Datos estrictos, copias independientes, orden determinista y resultados
inmutables permiten revisar y repetir fixtures. IDs/versiones son referencias
declaradas, no firmas, persistencia ni prueba de procedencia. No se incorpora
un reloj real, identidad autenticada, repositorio o sincronización CRM.

La forma exacta es:

```ts
{
  schemaVersion: 1,
  source: 'fixture',
  id: string,
  version: number,
  capturedAt: string,
  companies: Array<{
    id: string,
    displayName: string,
    state: 'active' | 'inactive',
    vatId: { countryCode: string, identifier: string } | null
  }>,
  sites: Array<{
    id: string,
    companyId: string,
    label: string,
    state: 'active' | 'inactive',
    countryCode: string | null
  }>,
  contacts: Array<{
    id: string,
    companyId: string,
    displayName: string,
    state: 'active' | 'inactive',
    identityRef:
      | { kind: 'customer_profile', profileId: string }
      | { kind: 'email_identity', emailIdentityHash: string }
      | null
  }>,
  roles: Array<{ id: string, label: string }>,
  assignments: Array<{
    companyId: string,
    contactId: string,
    roleId: string,
    scope: { type: 'company' } | { type: 'site', siteId: string }
  }>
}
```

Los límites de `COMPANY_DIRECTORY_LIMITS` son 100 empresas, 1.000 sedes,
2.000 contactos, 100 roles y 10.000 asignaciones. Todos los arrays admiten cero
elementos; el directorio vacío es válido. No se trunca información. Los IDs
son opacos, canónicos en minúsculas y de hasta 100 caracteres, con gramática
`^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$`. La versión es un entero seguro positivo.
`capturedAt` exige UTC canónica de 24 caracteres y una fecha válida, aportada
por el llamador; no demuestra que se capturara un sistema real en ese instante.

`displayName` y `label` tienen entre uno y 160 caracteres, sin controles ni
espacios sobrantes en los extremos; se rechazan en vez de recortarse. Los
países son dos letras ASCII mayúsculas y el identificador VAT de una a 32
letras mayúsculas o dígitos. Es validación estructural, no certificación ISO,
existencia jurídica o validez fiscal. El país de una sede puede ser nulo;
no se completa desde otra entidad ni se convierte en una dirección postal.

Los IDs son únicos dentro de cada colección. Una asignación es única por
empresa/contacto/rol/tipo de alcance/sede. Debe referenciar entidades existentes
y tanto el contacto como la sede seleccionada deben pertenecer a su empresa.
El mismo rol puede estar declarado en alcance empresa y en una sede: son
asignaciones distintas, sin expandir ni deducir permisos o herencia.

Los registros admiten únicamente sus campos de datos explícitos; se rechazan
extras, getters, símbolos, propiedades ocultas, prototipos ajenos y arrays
dispersos. La copia normalizada queda profundamente congelada. Las colecciones
con ID y las claves de asignación se ordenan de forma determinista sin depender
de un locale.

### Selección descriptiva y errores

`selectCompanyDirectoryEntry(input: unknown): CompanyDirectoryEntry` recibe
exactamente `{ directory, companyId }`. Revalida el directorio completo antes
de seleccionar y devuelve:

```ts
{
  directoryRef: { id: string, version: number, capturedAt: string },
  company: Company,
  sites: readonly CompanySite[],
  contacts: readonly CompanyContact[],
  roles: readonly CompanyRole[],
  assignments: readonly CompanyRoleAssignment[]
}
```

Incluye todas las sedes, contactos y asignaciones propios, también entidades
inactivas, y solo los roles utilizados por esas asignaciones. No filtra según
una supuesta elegibilidad comercial ni expande roles de empresa a sus sedes.
Una empresa válida sintácticamente pero ausente produce `unknown_company`.
Referencias corruptas en otra empresa siguen siendo error; no se ocultan por
seleccionar un contexto distinto.

`CompanyDirectoryContractError` conserva código
`company_directory_contract_invalid` y un motivo cerrado:
`invalid_data`, `duplicate_id`, `duplicate_assignment`, `unknown_reference`,
`cross_company_reference`, `unknown_company`, `vat_declaration_missing` o
`vat_evidence_invalid`. El constructor recibe únicamente el motivo y usa
mensajes fijos. El límite público reconstruye errores, incluso fallos de
introspección de entradas hostiles, sin conservar valores, mensajes ni `cause`
aportados por el llamador.

### Referencias externas y privacidad

Un contacto tiene `identityRef` nulo o una referencia externa de perfil o de
hash de identidad de email, como alternativas excluyentes. No admite ambos
tipos a la vez. Son metadatos: no se incorpora email en claro ni se ejecuta
una búsqueda, deduplicación o enlace automático con el módulo `customers`.

`profileId` conserva la gramática sintáctica de perfiles existente: hasta 200
caracteres, minúsculas y separadores `_`, `:` o `-` con al menos un separador.
No se hace lookup ni se crea una FK. `emailIdentityHash` exige 64 caracteres
hexadecimales en minúsculas; el contrato no comprueba cómo se calculó ese hash.

El hash de email de 64 caracteres puede ser un dato pseudónimo; no demuestra
anonimización ni privacidad por sí solo. Puede repetirse en contactos de
distintas empresas y no concede pertenencia, identidad verificada o permiso.
La referencia de perfil tampoco acredita que ese perfil exista, pertenezca al
contacto declarado o tenga una sesión válida. Errores y diagnósticos no deben
reproducir VAT, hash o referencias privadas recibidas.

### Composición de VAT separada

La declaración VAT de una empresa es opcional y estructural. No acredita que
una entidad legal exista ni decide tratamiento fiscal.

`evaluateCompanyVatEvidence(input: unknown)`, en `company-vat-context`, acepta
exactamente `{ directory, companyId, assessment }`. `assessment` es nulo o
`{ expectedAdapterId, at, response }`, con instante y respuesta fixture
explícitos. La selección usa `selectCompanyDirectoryEntry` y revalida el
directorio completo. La consulta deriva su ID de `company.id` y usa el país
e identificador VAT declarados. La API pública de `taxes` comprueba coincidencia
exacta de consulta y adaptador, además de su ventana `[checkedAt, expiresAt)`.

La salida congelada conserva `directoryRef: { id, version, capturedAt }`,
`companyId`, `companyState`, `status`, `query` y `evaluation`:

| Estado | Significado | Consulta y evaluación |
|---|---|---|
| `not_declared` | La empresa no declara VAT y `assessment` es nulo | Ambas nulas; no fabrica consulta |
| `not_checked` | Hay declaración pero `assessment` es nulo | Consulta canónica, evaluación nula; sin inventar adaptador o fechas |
| `evaluated` | Se aportó una evaluación estructuralmente válida y correlacionada | Consulta y resultado de `evaluateVatIdEvidence`, que puede ser usable o no usable |

`evaluated` no significa VAT válido: conserva también los resultados negativos,
caducados o indisponibles del contrato fiscal. Aportar evaluación sin declaración
es `vat_declaration_missing`. Una estructura de entrada no admitida es
`invalid_data`; evidencia fiscal inválida o ajena se convierte en
`vat_evidence_invalid`. Se usan motivos cerrados de
`CompanyDirectoryContractError`, sin propagar valores, mensajes o causas de
errores fiscales. Los errores de selección del directorio conservan su motivo.

Empresas con IDs distintos no pueden intercambiar respuestas aunque declaren
el mismo VAT. Una respuesta ajena o corrupta es error de contrato, no un VAT
negativo ni una ausencia silenciosa. Evidencia futura, caducada, indisponible
o no soportada no se transforma en validación positiva o exención.

La consulta VAT no incluye la referencia del directorio. Si se conservan
`company.id`, país e identificador, una versión editorial nueva o un directorio
declarativo con esa misma identidad puede reutilizar evidencia vigente. Esto
correlaciona datos y consulta; no autentica el snapshot, su autor o la identidad
legal de la empresa. La versión del directorio no renueva fechas de evidencia.

El resultado mantiene separadas la declaración y su evaluación. VAT válido
no concede condición B2B, exención, jurisdicción, crédito o autorización para
comprar. No se conecta la evaluación con precios, impuestos aplicados,
checkout, pagos o pedidos.

### Dependencias y manifest

`companies` es propietario de B2B-001 y depende de `platform-configuration`;
la capacidad depende de PLT-004. El dominio no importa internals de clientes,
impuestos, precios o pagos. La composición consume las APIs públicas de
`companies` y `taxes`, conforme al
[ADR-0002](0002-limites-y-direccion-de-dependencias.md).

Reutilizar el evaluador VAT puro no crea una dependencia operativa del módulo
con `taxes`, activa MKT-010 ni exige proveedor. B2B-001 se instala inactiva en
avanzado y demo, sin rutas, navegación, jobs o efectos; B2B-009 sigue pendiente.
No se cambian las capacidades activas existentes de otros módulos.

## Fronteras

- Sin DDL, persistencia, CRM, red, credenciales, invitaciones o emails.
- Sin autenticación, autorización efectiva, delegación o acceso a recursos.
- Sin derivación de `companyKeyHash`, catálogos o precios por empresa; R6.2 conserva ese alcance.
- Sin mínimos, múltiplos, condiciones de pago, crédito, presupuestos o cobro.
- Sin exención automática, proveedor VAT o decisión fiscal real.
- R6.1a no añade UI; R6.1b muestra una demo inerte de dos empresas, sin activación operativa.

No se necesita una migración o decisión de proveedor para ensayar el contrato
con fixtures. Persistencia, identidad, políticas comerciales y uso real deben
quedar definidos en sus cortes correspondientes; no se consideran resueltos
por este directorio.

## Verificación y estado

[Verificación final](../../audits/r6-1a/verification-report.json), 2026-10-04:
`pnpm check` pasa 944 archivos sin diagnósticos, 245 suites/3.054 pruebas,
44 HTML, 44 formularios locales y cero crons. Implementado y verificado
localmente, integrado en PR #27 (`9b78e69a`), sin despliegue ni activación.

Focales aprobadas: 93 pruebas de dominio, 24 de
composición VAT, seis de arquitectura y 81 de registry/manifest. Se contrastan
estructura/límites, duplicados, propiedad, referencias, estados inactivos,
selección ausente, validación completa, inmutabilidad y errores sin PII. La
composición cubre ausencia, correlación, vigencia, reutilización editorial y
rechazo de evidencia ajena.

Revisión independiente de 11.249 aserciones: 9.700 de directorio con 171
selecciones y 1.549 de VAT con 48 escenarios, sin P1/P2, getters ejecutados,
efectos ni reloj implícito. Bundles de diagnóstico minificados: directorio
6.474 B/dos fuentes y composición VAT 11.957 B/cuatro fuentes contribuyentes,
sin imports externos o runtime operativo. Estos bundles son de diagnóstico,
no de una nueva interfaz ni una prueba de navegador.

Las cifras de [R5.12](../../audits/r5-12/verification-report.json) son heredadas:
939 archivos, 243 suites/2.935 pruebas, auditoría de 4.554 comprobaciones y 163
GET/HEAD, E2E 172/172 y base QA de 143 tablas/353 filas intacta. No son nuevas
ejecuciones de R6.1a. Este corte no modifica UI ni lectores runtime. La demo
visual B2B y su evidencia propia corresponden a R6.1b, descrito a continuación.
Navegador 2.030/2.030, ocho superficies a11y y ocho capturas pertenecen a PR #25;
tampoco se repiten en este corte puro.

## R6.1b — Demo de empresas y sedes, verificada localmente

R6.1b implementa `/demo/admin/empresas`, «Empresas y sedes», bajo Clientes.
Dos empresas sintéticas: A activa con VAT ficticio y B inactiva sin VAT;
sedes, contactos y roles descriptivos. Cinco estados VAT en A, empezando por
`not_checked`; cambiar de empresa restablece esa selección y B conserva
`not_declared`. Reset y recarga restituyen el estado inicial. Interacción en
memoria, sin I/O del módulo, persistencia, permisos o activación operativa.
Demo verificada localmente y disponible en el repositorio; integrada
en PR #28 (`861b34ff`), sin despliegue. B2B-001 sigue parcial e instalada/inactiva y
B2B-009 pendiente.

[Verificación final R6.1b](../../audits/r6-1b/verification-report.json), 2026-10-04:
`pnpm check` pasa 948 archivos sin diagnósticos, 246 suites/3.077 pruebas,
44 HTML, 44 formularios locales y cero crons; 23 pruebas de modelo y seis de
arquitectura. Revisión independiente: 1.532 aserciones, seis estados y 38
transiciones, sin P1/P2, getters, efectos o reloj implícito.

QA nueva: navegador 601/601, E2E 176/176, ocho superficies a11y sin errores ni
avisos y ocho capturas aprobadas por frontend y root. El módulo no genera HTTP,
escrituras de almacenamiento, timers, beacons, ventanas ni errores JavaScript;
las escrituras de la guía compartida y el rAF del layout se identifican aparte.
La base QA conserva 143 tablas/353 filas y SHA-256 antes/después idéntico:
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Worker detenido. Son comprobaciones de R6.1b, separadas de la evidencia heredada
del contrato R6.1a.

El cliente real consta de dos archivos: entrada de 21.053 B/6.262 B gzip y
compartido de 5.749 B/2.053 B gzip; suma 26.802 B/8.315 B gzip, comprimidos por
archivo, sin imports externos u operativos. La sonda de arranque sin raíz de
demo registra una consulta DOM, diez fechas explícitas, cero efectos y cero
lecturas de reloj implícito. Es una comprobación distinta de la interacción de
navegador anterior; el bundle diagnóstico del modelo no se usa como tamaño de
cliente.

La ruta exige manifest demo y `DEMO_MODE=true`. Conserva respuesta inicial
completa sin JavaScript y controles inertes. GET/HEAD anónimos redirigen al
acceso guiado; la respuesta privada usa `no-store`, `Vary: Cookie` y `noindex`,
sin canonical ni hreflang. La vista y el DOM no muestran identificadores VAT,
referencias de perfil o hashes de email. Los fixtures del bundle son públicos;
mostrar solo el directorio seleccionado no acredita aislamiento entre empresas
reales ni autorización. No se añaden formularios, proveedores, jobs o crons.

## Continuidad tras R6.1b: R6.2a

**R6.2a: catálogo y precios B2B con fixtures** está implementado y verificado
localmente e integrado en PR #29 (`4d7a30a9`); su contrato y evidencia están en el
[ADR-0053](0053-catalogos-empresa-fixture.md). Intersecta restricciones de empresa
con publicación de mercado y calcula precio de una variante explícita por
producto, con binding versionado y sin totales. El selector descriptivo de
este ADR conserva sus estados y registros; el bloqueo comercial de empresa
inactiva pertenece al nuevo preview.

B2B-002 permanece parcial e instalada/inactiva, sin autorización real, DDL,
activación, stock, impuestos o cambios de checkout. R6.2b añade la demo
verificada localmente y disponible en repo, integrada en PR #30 (`6305b823`), sin despliegue.

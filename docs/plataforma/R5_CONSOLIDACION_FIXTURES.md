# R5.12 — Consolidación local con fixtures

Estado: **realizada y verificada localmente**, 2026-10-04, rama
`codex/r5-fixture-consolidation`; integrada en PR #26 (`9dd23909`), sin despliegue.
R5.11c está integrada en PR #25 (`46dbe905`), sin despliegue. Las métricas de
ese corte son evidencia anterior. R5.12 aporta check global, revisión
independiente, auditoría GET/HEAD, E2E y comparación de hash propios aprobados.

## Alcance y criterio de cierre

Este corte contrasta contratos y superficies existentes. No añade UI, rutas,
DDL, cron, proveedores ni capacidades activas. La demo conserva fixtures de
solo lectura e interacciones locales, sin pedidos reales, formularios enviados
o escrituras operativas. No se presenta como una compra internacional completa
ni como validación legal de un cliente.

El alcance autorizado comprende nueve pruebas de compatibilidad ES/FR mediante
APIs públicas, una matriz del manifest demo, protección de cabeceras en
respuestas tempranas de administración/cuenta y auditoría local de privacidad
y SEO con GET/HEAD sobre el build final. El cierre requiere resultados propios
identificados, límites explícitos y documentación coherente; no reutiliza las
métricas heredadas como si se hubieran ejecutado de nuevo.

## Capacidades y superficies

La fuente de estados y flags es el
[preset y manifest de demo](../../src/platform/configuration/presets.ts);
las dependencias están en
[capability-definitions](../../src/platform/configuration/capability-definitions.ts).
`installed` no equivale a capacidad activa ni a permiso para invocar su runtime.
La [prueba de R5.12](../../tests/r5-capability-isolation.test.ts) contrasta las
entradas completas, sin inferir el estado de un módulo a partir de una sola capacidad.

| Capacidades | Estado en la demo | Contrato y evidencia previa | Superficie y límite |
|---|---|---|---|
| CUS-001 | Activa como base guest; efectos/jobs demo apagados | [Asociación guest opcional](../../tests/customer-profile-domain.test.ts) | Un perfil o una cuenta no son requisito; la demo no crea una compra real |
| CUS-002 | Instalada/inactiva | [Perfil e identidad](adr/0039-perfil-cliente-identidad-opaca.md), pruebas de dominio y persistencia sintética | No crea perfiles desde la demo; un perfil no acredita sesión ni pertenencia B2B |
| CUS-007 | Instalada/inactiva | [Consentimiento versionado](../../tests/customer-consent-domain.test.ts) | Preferencia y consentimiento son distintos; no captura aceptación ni envía comunicaciones |
| CUS-008 | Instalada/inactiva | [Derechos de datos](../../tests/customer-data-rights-domain.test.ts) | Identidad, revisión y plan explícitos; no exporta ni borra datos reales |
| CUS-003/004/005/006 | Instaladas/inactivas, sin flags de rutas o efectos | [Guardas de cuenta](../../tests/customer-account-middleware.test.ts), [factorías runtime](../../tests/runtime-customer-account.test.ts) | Cuenta opcional ausente en la demo; pedidos, direcciones y devoluciones no se habilitan por navegar |
| CUS-009 | Instalada/inactiva operativamente | [Ejecución de segmentación](EJECUCION_SEGMENTACION.md), [QA de demo R5.6d](../audits/r5-6d/verification-report.json) | `/demo/admin/segmentos`: evaluación local de perfiles sintéticos; no recálculo D1 ni jobs |
| MKT-003/006/007 | Instaladas/inactivas | [Mercados](adr/0046-contexto-de-mercados.md), [contenido/URLs](adr/0047-contenido-localizado-urls.md), [QA R5.8b](../audits/r5-8b/verification-report.json) | `/demo/admin/mercados`: idioma y fallback explícitos; las URLs `.test` son datos, no páginas publicadas |
| MKT-004 | Instalada/inactiva | [Publicación exacta](adr/0048-publicacion-por-mercado.md), [QA R5.9b](../audits/r5-9b/verification-report.json) | `/demo/admin/publicacion`: visibilidad por tupla y variante, sin permiso de compra |
| MKT-009/010 | Instaladas/inactivas | [Fiscalidad fixture](adr/0049-contrato-fiscal-fixture.md), [QA R5.10b](../audits/r5-10b/verification-report.json) | `/demo/admin/impuestos`: decisiones y evidencia VAT sintéticas; VAT válido no concede exención |
| MKT-008/CHK-010 | Instaladas/inactivas | [Divisas](adr/0050-presentacion-divisas-fixture.md), [métodos](adr/0051-metodos-locales-fixture.md), [QA R5.11c](../audits/r5-11c/verification-report.json) | `/demo/admin/divisas`: presentación y métodos sobre el original; no inicia pagos. Las otras capacidades de `payments` conservan su estado |
| MKT-005, CHK-006 | Pendientes; este corte no las implementa | [Matriz de capacidades](MATRIZ_CAPACIDADES.md) | Precios por mercado y determinación fiscal integrada en checkout no quedan resueltos por los previews |

Los ensayos anteriores de repositorios y migraciones pertenecen a QA aislada.
No autorizan modificar la base servida, activar cuentas, publicar traducciones
o ejecutar políticas de segmentación en el proyecto público.

## Compatibilidad ES/FR

La [prueba nueva](../../tests/international-contracts-integration.test.ts)
utiliza fixtures privados del test con catálogos versionados compartidos. No crea un agregador de producción ni obliga a que todas las demos
usen el mismo catálogo. Cada dominio conserva su autoridad:

- El mercado explícito aporta contexto; país, idioma y moneda nominal no
  certifican envío, jurisdicción, publicación o fiscalidad.
- La composición de precios acepta EUR como moneda base explícita. No recibe
  una conversión FX para autorizar precios en otra moneda.
- La resolución editorial y el plan de URLs conservan publicaciones,
  canonical, alternates y `lastmod`. Un fallback a español no fabrica una
  edición francesa ni una URL; editar el borrador no reemplaza la publicación.
- Publicación exige regla exacta mercado/canal/producto y variantes elegidas.
  Una tupla ausente sigue sin configurar; una variante predeterminada, nueva,
  draft o archivada no obtiene visibilidad por herencia.
- Impuestos requieren decisiones sintéticas explícitas sobre importes EUR
  postdescuento. No se deducen tasas de ES/FR, idioma o VAT. Una línea sin
  determinación deja el total sin resolver; VAT válido no cambia el tratamiento.
- FX afecta al importe presentado. Los métodos conservan el importe original,
  referencias ID/versión y exponente del catálogo, incluso ante evidencia FX
  ausente o caducada. Se validan también reglas deshabilitadas o de otro contexto.

Las referencias solo se correlacionan donde el contrato existente las declara.
No se inventa una firma global, procedencia D1 o autenticidad de los importes.
La prueba no debe crear pedidos, sesiones de pago ni un resultado global de
«compra permitida».

## Privacidad, cuenta opcional y SEO

La protección se verifica antes de acceder a D1, secretos o proveedores:
redirección de administración sin sesión y respuestas 404 de cuenta ausente
mantienen su semántica y reciben las cabeceras privadas correspondientes. El
endurecimiento no concede acceso, crea sesiones ni activa una capacidad.

La auditoría nueva se limita a GET/HEAD y artefactos del build. Contrasta
cabeceras y robots/noindex de superficies R5, exclusiones de `/demo`, `/api` y
`/cuenta` en robots y sitemap, y ausencia de URLs ficticias en enlaces o metas
reales. Revisa datos fixture, respuestas y artefactos por exposición de datos
personales; comprobar que no aparece `@` por sí solo no demuestra privacidad.

El [E2E general](../../scripts/e2e.mjs) incluye peticiones POST/PATCH de rechazo.
Se ejecuta aparte, como regresión requerida por el cambio de middleware/admin,
solo contra QA sintética aislada para comprobar comandos rechazados sin
escrituras. Pasa 172/172 como ejecución nueva; no sustituye la auditoría
estrictamente GET/HEAD. Los tests de middleware modelan solicitudes en memoria
sin emitir HTTP. Las
pruebas de contratos y guardas no envían magic links, consentimientos, formularios
ni operaciones de derechos de datos.

La guía existente usa almacenamiento local de recorrido y el shell tiene un
rAF visual identificado; se separan de la ausencia de efectos de los módulos.
No se afirma que el navegador completo carezca de almacenamiento o que esta
revisión sustituya un análisis legal por proyecto.

## Evidencia propia y heredada

[Verificación final R5.12](../audits/r5-12/verification-report.json), 2026-10-04:
`pnpm check` pasa 939 archivos sin diagnósticos, 243 suites/2.935 pruebas,
44 HTML, 44 formularios y cero crons. Nueve pruebas de compatibilidad ES/FR,
siete de capacidades y 32 de cabeceras privadas; el contrato HTTP passwordless
suma siete. Revisión independiente de 1.114 aserciones en 127 casos, sin P1/P2,
accesos a entorno/bindings trampa, cuerpos leídos, escrituras de cookies ni
`waitUntil` en los casos protegidos.

La auditoría nueva pasa 4.554 comprobaciones mediante 163 solicitudes GET/HEAD
y contrasta 40 URLs del sitemap. El E2E global nuevo pasa 172/172: se ejecuta
aparte por el cambio de middleware/admin y comprueba rechazos en QA aislada
sintética, sin escrituras. No se confunde con la auditoría estricta GET/HEAD.
La base conserva 143 tablas y 353 filas; SHA-256 antes/después idéntico:
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Worker detenido. Navegador 2.030/2.030, a11y de ocho superficies y ocho capturas
son evidencia heredada de PR #25, no nuevas ejecuciones de R5.12.

Consolidación fixture realizada y verificada localmente; integrada en PR #26 (`9dd23909`),
sin despliegue, nuevas activaciones ni declaración de operación real completa.

| Evidencia | Procedencia | Estado para R5.12 |
|---|---|---|
| Nueve pruebas de compatibilidad ES/FR | [Nuevo test](../../tests/international-contracts-integration.test.ts), contratos existentes | 9/9 aprobadas |
| Manifest demo, capacidades instaladas y flags | [Nueva matriz de tests](../../tests/r5-capability-isolation.test.ts), configuración actual | 7/7 aprobadas |
| Cabeceras de respuestas tempranas admin/cuenta | [Tests puros](../../tests/private-surface-headers.test.ts) y [HTTP passwordless](../../tests/customer-passwordless-http.test.ts) | 32/32 y 7/7 aprobadas |
| Auditoría GET/HEAD, robots, sitemap y privacidad | [Informe HTTP](../audits/r5-12/http-report.json), nuevo corte sobre build final | 4.554 comprobaciones, 163 GET/HEAD y 40 URLs del sitemap |
| `pnpm check` y revisión independiente | Nuevo corte | 939 archivos sin diagnósticos, 243 suites/2.935 pruebas, 44 HTML/44 formularios/cero cron; revisión 1.114 aserciones/127 casos sin P1/P2 ni efectos |
| E2E global de regresión | Nuevo corte por cambio middleware/admin, QA aislada | 172/172 aprobado; distinto de la auditoría GET/HEAD |
| Comparación de base QA | Nuevo corte, antes/después del Worker ya detenido | 143 tablas/353 filas, SHA-256 idéntico `9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca` |
| R5.11c: 936 archivos, 240 suites/2.885 pruebas; navegador 2.030/2.030, E2E 172/172, ocho superficies a11y 0/0 y ocho capturas aprobadas | [Informe R5.11c](../audits/r5-11c/verification-report.json), PR #25 | Heredada, no nueva ejecución de R5.12 |
| R5.11c: 143 tablas/353 filas, SHA-256 antes/después `9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca` | Mismo informe | Baseline anterior; una nueva comparación debe identificarse como tal |

## Pendientes reales y siguiente bloque

El cierre de R5.12 se limita al alcance fixture. No declara R5 operativo en su
conjunto ni resuelve despliegue, captura/cobro, reembolsos, conciliación, política
fiscal, proveedor, retención o activación de cuentas/privacidad. G3 de rollout
remoto y G4 de productor/uso real de segmentación mantienen sus condiciones en
[la propuesta de persistencia](PROPUESTA_SEGMENTACION_PERSISTENTE.md); no se
marcan completos ni se convierten en prerrequisitos ficticios de pruebas puras.

Después corresponde **R6.1: empresas, sedes, contactos, roles y VAT ID**,
según [el roadmap](ROADMAP.md#r6--b2b) y
[la ruta continua](../RUTA_DESARROLLO_CONTINUO.md#11-b2b-r6).
El siguiente corte aceptado es **R6.1a**, ADR y contrato puro `companies` para
B2B-001. Directorio versionado de empresas, sedes, contactos, roles descriptivos
y asignaciones con propiedad/referencias explícitas. Rechaza duplicados,
referencias huérfanas y relaciones de sede/empresa incompatibles. El selector
valida el snapshot completo, incluidas entidades ajenas al contexto elegido;
activa/inactiva es descriptivo y no equivale a permiso o concesión de acceso.
Los resultados son inmutables y los errores no exponen PII.

Referencias externas de perfil y hash de email de 64 caracteres son metadatos.
No incorpora email en claro ni deduce identidad, autenticación o pertenencia
desde esos campos. Los roles se declaran y asignan por alcance; no constituyen
una política efectiva de permisos ni completan B2B-009. `companyKeyHash` de
las listas de precios sigue siendo un selector de reglas, no prueba de
pertenencia; su composición pertenece a R6.2.

La declaración VAT es opcional. La composición `company-vat-context` y
`evaluateCompanyVatEvidence` aceptan `assessment` nulo o adaptador esperado,
instante y respuesta; reutilizan la API pública de `taxes`. La consulta deriva
su ID de `company.id` y exige país/identificador coincidentes, evitando aplicar
una respuesta de otra empresa. Cambiar solo la versión editorial del directorio
con la misma declaración permite reutilizar evidencia vigente; la referencia
del directorio no acredita autenticidad o procedencia del snapshot. VAT válido
no concede condición B2B, exención, crédito o permiso de compra.

B2B-001 continúa pendiente hasta su implementación; entonces quedará instalada
inactiva, sin rutas ni jobs. Sin DDL, CRM, autenticación, cobros, crédito, UI,
invitaciones o emails. R6.1b mostrará después dos empresas en una demo inerte.
Delegación efectiva B2B-009, catálogos/precios por empresa R6.2, cantidades
R6.3, condiciones de pago R6.4 y crédito/aprobaciones R6.5 conservan su alcance
posterior. Las decisiones reales de operación no se convierten en obstáculos
para este modelo fixture ni quedan resueltas por él.

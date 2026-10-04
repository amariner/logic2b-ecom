# Plataforma Logic2B Ecommerce

> Fuente de verdad de la evolución posterior al MVP. Esta carpeta convierte la
> visión «backend mínimo, capacidad máxima» en trabajo verificable por sesiones.

## La tesis

Logic2B Ecommerce no es un SaaS ni una plantilla cerrada. Es la infraestructura
tecnológica propia con la que Logic2B crea y gestiona proyectos de comercio
electrónico a medida, según la definición canónica de
[`../POSICIONAMIENTO.md`](../POSICIONAMIENTO.md).

Cada cliente recibe un despliegue aislado, un ecommerce adaptado, un panel
sencillo y únicamente los módulos que necesita. La amplitud de la plataforma se
conserva en el código compartido, los contratos y los conectores; Logic2B asume
la complejidad técnica, el mantenimiento y la evolución para que la inversión
del proyecto se concentre en el negocio y su experiencia propia.

La paridad de capacidad no significa copiar todos los productos de una gran
plataforma. Significa poder resolver el mismo resultado comercial por una de
estas cuatro vías:

1. **Núcleo nativo**: imprescindible para toda tienda y mantenido por Logic2B.
2. **Módulo activable**: código compartido que solo se habilita donde aporta.
3. **Conector**: integración con un especialista externo mediante un contrato
   estable, observable y sustituible.
4. **Servicio gestionado**: operación o desarrollo a medida que no debe
   convertirse en configuración permanente del panel.

Una quinta clasificación, **fuera de alcance deliberado**, evita confundir
paridad comercial con fabricar bancos, redes publicitarias, hardware de punto de
venta o servicios logísticos propios.

## Demo verificada localmente y contratos integrados

**R6.8d — Demo «Listas y repetición» está implementada y verificada localmente**, rama
`codex/company-quick-order-demo`, según la extensión del
[ADR-0065](adr/0065-historico-pedido-rapido-fixture.md). Ruta `/demo/admin/listas-sku`, grupo Clientes:
diez ejemplos cerrados de SKU, lista, texto CSV e intención histórica, un selector
«Ejemplo» y «Restablecer ejemplo». Dos zonas muestran la entrada y sus resultados
por fila. Reinicio y recarga restauran el ejemplo inicial; no hay edición libre,
archivos, formularios, persistencia, red ni reloj implícito.

La composición delega en las APIs reales de a+b+c. Un CSV inválido conserva los
diagnósticos que devuelve el parser, con lista nula y sin identificar filas por
separado. El histórico compara la variante aportada y el SKU de origen de forma
independiente; nunca crea otra lista o completa una identidad ausente. SKU,
espacios, duplicados y cero se conservan. Los nombres humanos proceden de parejas
explícitas y la vista omite IDs/referencias técnicos. No se calculan precios,
stock, visibilidad, cajas, cantidades comerciales o permisos de compra.

R6.8c está integrado en PR #47 (`372dd221`), sin despliegue;
[informe del contrato](../audits/r6-8c/verification-report.json). B2B-008 permanece parcial e instalada/inactiva,
con dependencia B2B-002. La página de demostración requiere modo demo y
`DEMO_MODE='true'`; no activa operaciones.

Validación local final del 2026-10-04: `pnpm check` verde, 1.016 archivos sin
diagnósticos, 272 suites/4.159 pruebas; build de las 06:52:48 UTC, 44 HTML y
44 formularios locales, sin envíos/beacon/cron. Focales: 25 de modelo, seis de
arquitectura y ocho de acceso guiado. Revisión independiente: 18.665 aserciones,
97 de delegación y tres de gate contadas por separado, sin P1/P2. Cliente real:
un archivo de 39.594 B/10.636 gzip, sin imports externos ni efectos de arranque
sin raíz; esa sonda se distingue de la interacción del navegador.

Navegador nuevo: 1.994 comprobaciones/20 visitas; veinte superficies a11y sin
hallazgos y ocho PNG aprobadas por frontend, cuatro contrastadas por raíz.
E2E nuevo 204/204. Worker y Chrome detenidos. Hash fresco antes de las 06:52:47
y después de las 06:55:54 UTC idéntico: 143 tablas/353 filas,
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Sin escrituras operativas ni preparación nueva de DB atribuida a la demo.

Siete grafos de negocio anteriores permanecen idénticos a PR #47 y los seis
archivos de contratos a+b+c, helper, barrel y registro conservan sus fuentes. Guía separada: 15.230 B/6.333 gzip,
único cambio de allowlist `|listas-sku` (+11 B/+8 gzip). Dieciocho CSS emitidos
siguen iguales; el global añade ocho utilidades (+430 B) conservando las reglas
anteriores. Nuevo modelo/página y navegación explican el delta del Worker;
no se afirma igualdad SSR completa o equivalencia visual de todas las páginas.
[Informe final R6.8d](../audits/r6-8d/verification-report.json).

**Implementada y verificada localmente, disponible en el repositorio; integración
pendiente.** El despliegue está expresamente autorizado, pero todavía no realizado:
Cloudflare no está autenticado en este entorno y falta habilitar la credencial
segura; el usuario está informado. No requiere DDL nueva. **R6.9 queda pospuesto**,
sin implementación y sin bloquear esta entrega.

**R6.8c — Intención histórica de pedido rápido está implementada y verificada localmente**, rama
`codex/company-quick-order-history-fixtures`, contrato exacto aceptado en el
[ADR-0065](adr/0065-historico-pedido-rapido-fixture.md). Dos APIs puras conservan un origen íntegro y filas con
pareja producto/variante explícita o nula; comparan por separado esa identidad
y el SKU literal frente a otro catálogo completo.

La relación `same_declared_space` es un supuesto explícito del fixture, no prueba
de continuidad real. Ref/fecha/versión no acreditan autenticidad o vigencia;
un SKU único nunca completa identidad histórica nula ni sustituye la pareja.
Cantidad cero/MAX_SAFE, repetidas y orden se conservan sin suma. No lista nueva,
pedido recuperado, precio, stock, cajas, permiso, CSV operativo o UI.

companies 1.13.0 conserva B2B-008 parcial instalada/inactiva y dependencia
B2B-002, sin superficies. Registro/manifiesto/acceso: 122/122 verdes (19/73/30).
35 focales históricas y seis de arquitectura verdes;
TypeScript focal en dos archivos sin diagnósticos. Revisión independiente:
176.040 aserciones sobre 312 casos/914 filas/71 rechazos, 2.202 de delegación y
966 de frontera sobre 115 casos, contadas por separado. Sin P1/P2, efectos,
getters o reloj implícito. Bundle diagnóstico de cuatro exports: 11.093 B/3.306
gzip, con 1.184 B de constantes históricas puras; sin CSV ni runtime operativo,
distinto de un asset emitido. La inicialización de límites se encapsuló en una
IIFE anotada pura para evitar retención innecesaria, sin cambiar API o valores.
El diagnóstico de los cuatro exports conserva exactamente bytes y SHA anteriores;
se revalidó importación/llamada dirigida, sin atribuir otra ejecución del oráculo.
Check global final posterior a la corrección verde: 1.012 archivos sin diagnósticos,
271 suites/4.134 pruebas; build del 2026-10-04 a las 06:09:55 UTC,
44 HTML/44 formularios locales/cero cron. Comparación final frente al PR #46
original: ocho grafos completos, 361 fuentes seleccionadas, 19 CSS y 62 JS
públicos idénticos en nombres, imports, SHA, bytes y gzip (432.002 B/138.864 gzip).
Retención de cliente resuelta, delta público cero. Worker de 282 archivos:
+63 B/−281 gzip; 280 iguales tras mapear 24 nombres. Solo companies 1.13.0 y
ADR0065 en runtime-platform, más metadata generada de manifest separada;
sin equivalencia SSR completa ni nueva QA runtime.
**Verificado localmente e integrado en PR #47 (`372dd221`), sin despliegue.**
[Informe final R6.8c](../audits/r6-8c/verification-report.json). R6.8b integrado en PR #46 (`09161255`), sin despliegue.
Interacción heredada de PR #44: navegador 5.076/108, ocho a11y/PNG, E2E 200 y
hash QA 143/353; ninguna ejecución nueva de c.

R6.8d está verificada localmente según la extensión del ADR-0065: diez escenarios,
un selector y reset; 4.159 pruebas/E2E 204, integración pendiente. A+b+c bastan,
sin composición comercial obligatoria ni operación real. Despliegue autorizado,
pendiente de autenticación de Cloudflare.

## Contrato verificado localmente

**R6.8b — Entrada CSV de pedido rápido está implementada y verificada localmente**, rama
`codex/company-quick-order-csv-fixtures`, contrato exacto aceptado en el
[ADR-0064](adr/0064-entrada-csv-pedido-rapido-fixture.md). Una API pura recibe texto fixture y metadata explícita;
produce la lista real de a solo cuando toda la entrada es válida. Sin catálogo,
resolución SKU, archivo real, importación operativa, pedido o UI.

Cabecera decodificada exacta, quoting/BOM/LF/CRLF y posiciones UTF-16 definidos;
límites de 65.536 unidades/bytes, 101 registros y 100 filas. Campos literales,
cero y duplicados conservados, sin coerción, suma, corrección o lista parcial.
Un fallo fatal no devuelve prefijo; campos inválidos tras parse íntegro permiten
corrección con `list:null`, sin intención utilizable. Parser válido no significa
SKU identificado, visible, cantidad satisfecha o compra permitida.

companies 1.12.0 conserva B2B-008 parcial instalada/inactiva y dependencia
B2B-002, sin nuevas capacidades, presets o superficies. Registro/manifiesto/
acceso: 122 pruebas verdes (19/73/30). Fuente y pruebas congeladas: 66 focales
CSV, 63 de regresión de a y seis de arquitectura verdes; TypeScript focal en
cuatro archivos sin diagnósticos. Check global final verde: 1.010 archivos sin
diagnósticos, 270 suites/4.099 pruebas; build del 2026-10-04 a las 05:51:48 UTC,
44 HTML/44 formularios locales/cero cron. Revisión independiente: 35.917
aserciones sobre 976 CSV y 76 casos hostiles, 1.997 de delegación y 55.894 de
regresión de a, separadas; scanner auxiliar 269 aserciones y cuatro sondas,
sin sumar categorías. Sin P1/P2, getters, efectos o reloj implícito. Bundle
diagnóstico de ocho exports: 13.408 B/4.269 gzip, incluidas 1.184 B de constantes
históricas puras; sin operativo y distinto de un asset emitido.
Comparación final frente a PR #45: ocho grafos completos, 361 fuentes
seleccionadas, 19 CSS y 62 JavaScript públicos idénticos en nombres, imports,
SHA, bytes y gzip; los JS suman 432.002 B/138.864 gzip. Worker de 282 archivos:
+65 B/+280 gzip, 280 idénticos tras mapear 24 nombres. El cambio exacto de
companies 1.12.0 y ADR0064 explica runtime-platform; metadata generada del
manifest aparte, sin equivalencia SSR completa. No hubo nueva QA runtime.
**Verificado localmente e integrado en PR #46 (`09161255`), sin despliegue.**
[Informe final R6.8b](../audits/r6-8b/verification-report.json).
R6.8a integrado en PR #45 (`4cfef237`), sin despliegue. Navegador 5.076/108,
ocho a11y/PNG, E2E 200 y hash QA 143/353 proceden de PR #44, no de una ejecución b.

R6.8c histórico está integrado en PR #47 (`372dd221`): identidad explícita y
snapshot íntegro de origen, sin restaurar una compra mediante un SKU reutilizado.
R6.8d está verificada localmente como demo inerte de a+b+c; integración pendiente,
sin composición comercial obligatoria ni operación real.

## Contrato verificado localmente

**R6.8a — Lista estructurada e identidad de SKU está implementada y verificada localmente**, rama
`codex/company-quick-order-fixtures`, con contrato exacto aceptado en el
[ADR-0063](adr/0063-lista-identidad-sku-fixture.md). Tres APIs puras sobre un único snapshot completo de
identidad/SKU y una lista versionada: conservan cada fila, su orden, SKU literal
y cantidad en unidades, incluida cero, sin sumar o elegir variante predeterminada.
Una coincidencia devuelve identidad; ninguna o varias conservan la fila como
no encontrada/ambigua. Repetición de SKU y variantes distintas del mismo producto
son diagnósticos independientes, sin resultado agregado de compra o elegibilidad.

Perfil literal de hasta 100 unidades UTF-16, sensible a mayúsculas, espacios y
composición Unicode; límites explícitos de 1.000 productos, 10.000 variantes y
100 filas. Ref/fecha y versión son metadatos declarados, no autenticidad o vigencia.
Sin dinero, precio, stock, visibilidad, CSV, histórico, operación o cambios de
quote 1–99. B2B-008 es parcial, instalada/inactiva en avanzado/demo, dependencia
B2B-002; companies 1.11.0 conserva `platform-configuration` y superficies vacías.

Fuente congelada: 63 focales de dominio y seis de arquitectura verdes;
TypeScript focal en dos archivos sin diagnósticos. Registro/manifiesto/acceso:
122 pruebas (19/73/30). Revisión independiente: 55.894 aserciones, 123 casos,
1.131 filas, 194 SKU y 60 entradas hostiles, además de máximos; sin P1/P2,
efectos, getters o reloj implícito. Bundle diagnóstico público: 7.049 B/2.566 gzip,
con 1.183 B de constantes históricas y sin runtime operativo; no es asset emitido.
Check global final verde: 1.007 archivos sin diagnósticos, 269 suites/4.033
pruebas; build del 2026-10-04 a las 05:36:26 UTC, 44 HTML/44 formularios locales
y cero cron. Comparación estática final frente a PR #44: ocho grafos completos,
361 fuentes seleccionadas, 19 CSS y 62 JavaScript públicos idénticos en nombres,
imports, SHA, bytes y gzip. Worker de 282 archivos: +294 B/+164 gzip explicados
por registro B2B-008/companies 1.11.0/ADR0063 y metadata generada separada;
280 archivos iguales tras mapear 24 nombres, sin equivalencia SSR completa.
**Verificado localmente e integrado en PR #45 (`4cfef237`), sin despliegue.**
[Informe final R6.8a](../audits/r6-8a/verification-report.json). R6.7c está integrado en PR #44 (`6aade364`), [informe](../audits/r6-7c/verification-report.json),
sin despliegue: navegador 5.076/108 visitas, ocho a11y/PNG, E2E 200 y hash de
143 tablas/353 filas son evidencia heredada, no ejecuciones nuevas de a.
R6.8b está implementado y verificado localmente como parser CSV puro,
integrado en PR #46 (`09161255`) y sin despliegue. El histórico R6.8c está
integrado en PR #47 (`372dd221`) y la demo R6.8d está verificada localmente, pendiente de integración;
resolver un SKU reutilizado no reconstruye una compra antigua.

## Demo verificada localmente

**R6.7c — Demo «Referencias y documentos» está implementada y verificada localmente**, rama
`codex/company-document-demo`, según el [ADR-0062](adr/0062-evidencia-documental-fixture.md).
Ruta `/demo/admin/documentos-empresa`, Clientes después de Ofertas y presupuesto.
Dieciocho ejemplos cerrados y tres evaluaciones UTC explícitas; dos selectores
independientes y reset, sin inputs libres, formularios o archivos. Cambiar
momento conserva la misma evidencia; recarga restaura el ejemplo inicial.

La referencia aportada y el documento observado se comparan por campo, sin
éxito global. Empresa observada significa compradora; soporte PO y referencia
documental son distintos. Importe observado, diferencia y fecha monetaria solo
se proyectan cuando el contrato los considera comparables; cifras ajenas no
llegan a View/DOM. Metadatos futuros/incompletos no son documento utilizable;
cero explícito se distingue de desconocido. Sin factura, pago o autoridad.

R6.7b está integrado en PR #43 (`feff0a27`), sin despliegue. B2B-007 sigue parcial
instalada/inactiva. Check global final del 2026-10-04 verde: 1.005 archivos sin
diagnósticos, 268 suites/3.969 pruebas; build a las 05:21:46 UTC con 44 HTML,
44 formularios locales y cero cron. Modelo: 71 focales, seis de arquitectura y
ocho de autenticación; los dos archivos del autor sin diagnósticos TypeScript.
Revisión independiente: 7.132 aserciones del oráculo y 589 de delegación,
contadas por separado, sin P1/P2, efectos, getters o reloj implícito. Bundle
diagnóstico del modelo: 49.778 B/11.697 gzip; no es el cliente emitido.
Cliente real: cuatro archivos, 60.721 B/17.405 gzip, entrada 36.029 B/8.813 gzip;
sin imports externos. Sonda sin raíz: una consulta DOM, 2.098 fechas explícitas
y cero efectos, separada de la interacción real. Guía aparte: 15.219 B/6.325 gzip,
único incremento +19 B/+4 gzip por allowlist de la ruta.
Navegador: 5.076 comprobaciones y 108 visitas (54 a 1440 y 54 a 375), cero
efectos del módulo, errores, overflow o fallos de hit-test; guía contabilizada
aparte. Ocho superficies a11y sin errores/avisos y ocho capturas definitivas
revisadas por frontend, cuatro contrastadas por raíz, sin hallazgos.
E2E nuevo 200/200, Worker y Chrome cerrados. Base QA sin cambios: 143 tablas,
353 filas y SHA-256 `9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`
idéntico en las capturas frescas de 05:13:54 y 05:24:45 UTC; sin nueva preparación,
siembra o migración. **Verificada localmente, disponible en repo e integrada
en PR #44 (`6aade364`), sin despliegue.** [Informe final R6.7c](../audits/r6-7c/verification-report.json). Tras c,
el siguiente bloque canónico es R6.8, pedido rápido/repetición por SKU, CSV,
listas y pedido anterior. R6.8a está implementado y verificado localmente:
lista/identidad sin dinero sobre un único snapshot completo con SKUs,
integrado en PR #45 (`4cfef237`) y sin despliegue. R6.8b parser CSV puro tiene
contrato exacto implementado y verificado localmente, integrado en PR #46
(`09161255`); R6.8c histórico está integrado en PR #47 (`372dd221`) y la demo
R6.8d está verificada localmente, pendiente de integración. Las operaciones siguen
pendientes de diseño separado.

## Contrato verificado localmente

**R6.7b — Evidencia documental comercial está implementada y verificada localmente**, rama
`codex/company-document-evidence-fixtures`, según el [ADR-0062](adr/0062-evidencia-documental-fixture.md).
Consulta con declaración PO completa, puerto/adaptador fixture y observación
histórica explícita. La envolvente ajena es error; empresa compradora/PO distintas
en el documento son diagnósticos. Comparar dinero exige ambas coincidencias y
magnitud comercial EUR declarada; ausencia o base desconocida conservan `null`,
sin reutilizar total fiscal ni acreditar factura, saldo o cobro.

`companies` 1.10.0 conserva B2B-007 parcial instalada/inactiva y dependencia
B2B-006, sin nuevas capacidades ni superficies. Fuente congelada: 23 focales
de dominio, 26 de regresión PO y seis arquitectura; factory 34 y registro 121
verdes. Revisión independiente final: 28.509 aserciones de dominio, 6.726 de
regresión PO y 14.534 de factory, contadas por separado; sin P1/P2.
Bundle diagnóstico con factory: 30.809 B/7.774 gzip, sin efectos al importar.
Check final: 1.001 archivos sin diagnósticos, 267 suites/3.898 pruebas,
44 HTML/44 formularios locales/cero cron. Comparación estática final frente a R6.7a/PR #42: siete grafos completos,
358 fuentes seleccionadas, 19 CSS y 60 JavaScript públicos idénticos; estos
últimos suman 395.809 B/128.833 gzip. Worker +61 B por companies 1.10.0 y enlace
ADR0062; metadata generada separada, sin equivalencia SSR completa. No hubo
nueva ejecución HTTP/navegador/DB.
**Implementado y verificado localmente; integrado en PR #43 (`feff0a27`), sin despliegue.**
[Informe final R6.7b](../audits/r6-7b/verification-report.json). R6.7a está integrado en PR #42
(`1b783473`), sin despliegue. Navegador 9.068/a11y 8/PNG 8/E2E 196/hash de 143 tablas/353
filas siguen heredados de PR #41, no son QA nueva de b. Demo R6.7c implementada y verificada localmente, integrada en PR #44 (`6aade364`); no hay pedido, factura fiscal, proveedor o conciliación reales.

## Contrato verificado localmente

**R6.7a — Referencia PO declarada está implementada y verificada localmente**, rama
`codex/company-purchase-order-fixtures`, según el [ADR-0061](adr/0061-referencia-po-fixture.md).
Asocia una declaración versionada a la negociación completa y una oferta
histórica explícita. Número legible y token documental opaco, o ausencia
`not_provided`; correlación íntegra incluso sin referencia, emisor exacto y
fecha declarada de asociación. Sin aritmética propia, factura, pago, pedido,
autoridad o durabilidad. La versión no acredita un historial real.

`companies` 1.9.0 incorpora el contrato parcial B2B-007, instalada/inactiva en
avanzado/demo, dependencia B2B-006 y sin superficies operativas. Fuente congelada:
26 focales de contrato/seis arquitectura y 121 de registro/manifest/acceso verdes.
Revisión independiente: 6.726 aserciones, sin P1/P2, efectos, getters o reloj
implícito; diagnóstico público 21.746 B/5.869 gzip, no cliente emitido. Check
global final: 995 archivos sin diagnósticos, 265 suites/3.841 pruebas,
44 HTML/44 formularios locales y cero cron. Comparación estática final frente a PR #41: siete grafos, 358 fuentes
seleccionadas, 19 CSS y los 60 JavaScript públicos idénticos; estos últimos
suman 395.809 B/128.833 gzip. Worker +296 B explicados por registro B2B-007,
dependencia/instalación y descriptor companies 1.9.0/ADR0061. No se acredita
equivalencia SSR completa ni nueva ejecución HTTP/navegador/DB.
**Implementado y verificado localmente; integrado en PR #42 (`1b783473`), sin despliegue.**
[Informe final R6.7a](../audits/r6-7a/verification-report.json). La demo R6.6c está integrada
en PR #41 (`424123fe`), sin despliegue: sus 9.068 comprobaciones de navegador,
a11y 8/PNG 8, E2E 196 y hash de 143 tablas/353 filas son evidencia histórica heredada,
no ejecuciones de R6.7a. R6.7b documental está verificado localmente y R6.7c visual está verificada localmente e integrada en PR #44 (`6aade364`); no cierran facturación, ERP o conciliación operativos.

## Demo y contratos verificados localmente

**R6.6c — Demo «Ofertas y presupuesto» está implementada y verificada localmente**,
rama `codex/company-negotiation-demo`, según el [ADR-0060](adr/0060-artefacto-preliminar-fixture.md).
Ruta `/demo/admin/presupuestos-empresa`, grupo Clientes después de Crédito.
Dos zonas separan comparar revisiones de simular un presupuesto: tres pares
de comparación, tres ofertas y cuatro momentos UTC cerrados. La comparación
no cambia el presupuesto; elegir otra oferta lo elimina y exige crear otro
borrador. Cambiar fecha conserva historia y nunca aplica una transición.

Términos fijos visibles: anticipo ilustrativo de 20,00 € y condición declarada
de conversión por anticipo, sin cobros ni conversión. Crear borrador es explícito;
«Simular emisión/aprobación/caducidad/cancelación» usa las APIs reales de b.
Disponibilidad calculada con probes descartados, sin tabla alternativa de
estados. Sin entradas libres de dinero, cantidades, PII o IDs; proyección
sin artefacto/contexto/refs privados, memoria local y reset/recarga al inicio.

R6.6b está integrado en PR #40 (`ce295c6`), sin despliegue. B2B-006 sigue
parcial instalada/inactiva; operación de pedido, pago y conversión pendientes.
Fuente congelada: 25 pruebas de modelo y seis de arquitectura verdes;
regresión de auth ocho. Revisión independiente final: 105.487 comprobaciones,
1.008 vistas estructurales, 150 historiales, 4.032 acciones, 2.016 cambios de
oferta y 276 retrocesos; cero P1/P2. Bundle de diagnóstico 47.337 B/12.394 gzip,
no cliente emitido. Check global final: 993 archivos sin diagnósticos,
264 suites/3.814 pruebas, 44 HTML/44 formularios locales y cero cron.
QA final nueva: navegador 9.068 comprobaciones, 72 visitas iniciales
(36 por tamaño), 24 creaciones (12 por tamaño) y recorridos adicionales;
ocho superficies a11y sin errores/avisos, ocho PNG revisadas y E2E 196/196.
Las 1.008 vistas estructurales de la sonda son una medición separada.
Cliente emitido: cuatro archivos, 57.551 B/17.134 gzip; entrada 43.149 B/11.944 gzip,
sin imports externos. Inicio sin raíz: cero efectos, una consulta DOM y
56 fechas explícitas; no sustituye la interacción de navegador. Guía separada:
15.200 B/6.321 gzip, incremento de 21 B/7 gzip por la ruta en su allowlist.
El módulo no efectúa peticiones, escrituras, timers, beacons ni abre ventanas;
los efectos propios de la guía y el rAF del shell están contabilizados aparte.
Worker/Chrome detenidos; hash nuevo antes/después idéntico de 143 tablas/353 filas:
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
**Disponible y verificada localmente en el repositorio; integrada en PR #41 (`424123fe`),
sin despliegue ni activación operativa.** [Informe final R6.6c](../audits/r6-6c/verification-report.json).

**R6.6b — Artefacto preliminar fixture está implementado y verificado localmente**,
rama `codex/company-preliminary-fixtures`, según el [ADR-0060](adr/0060-artefacto-preliminar-fixture.md).
Congela negociación completa, revisión histórica explícita y términos de
presupuesto; reconstruye estado y versión exclusivamente con los reducers
públicos ORD-008. Hasta tres acciones declaradas emitir/aprobar/caducar/cancelar,
con fechas UTC explícitas, replay y comparación íntegra antes de conflictos.
La edición de oferta, el corte de negociación y la versión del ciclo son distintos.

Cambiar oferta o términos exige nuevo artefacto, sin trasladar aprobación.
`unpaid`/cero describe el borrador simulado, no dinero real o impago; no hay
pago, conversión, reserva o autorización. `companies` 1.8.0 mantiene B2B-006
parcial instalada/inactiva y dependencia B2B-002; usar APIs puras no activa ORD-008.
R6.6a está integrado en PR #39 (`108480f8`), sin despliegue. Check final de b:
989 archivos sin diagnósticos, 263 suites/3.789 pruebas; 44 de composición,
50 de regresión de negociación, seis de arquitectura y 120 de registro.
Build con 44 HTML/44 formularios locales y cero cron. Revisión independiente:
9.093 comprobaciones sin P1/P2, efectos, getters o reloj implícito. Bundle de
diagnóstico 31.399 B/8.356 gzip, sin factories de contexto de eventos ni
funciones D1; conserva pequeñas constantes históricas, incluidas algunas de
archivos de infraestructura. Dos anotaciones PURE permiten eliminar factories
no usadas; sonda de importación posterior con cero efectos, separada del oráculo.
Los 58 JavaScript públicos, seis grafos completos, 355 fuentes y 19 CSS son
idénticos a PR #39. Los clientes suman 352.473 B/116.299 gzip. El Worker
conserva ambas factories y 19 consumidores: +92 B explicados por las dos
anotaciones PURE (+32) y registro/ADR0060 (+60), sin equivalencia SSR completa.
**Implementado y verificado localmente; integrado en PR #40 (`ce295c6`) y sin despliegue.**
[Informe final R6.6b](../audits/r6-6b/verification-report.json). Navegador 6.368/108 visitas, E2E192, a11y 8/capturas8 y
hash de 143 tablas/353 filas siguen heredados de PR #38, sin nueva ejecución
HTTP/Worker/navegador/DB. R6.6c está implementada y verificada localmente, según el [ADR-0060](adr/0060-artefacto-preliminar-fixture.md),
en `/demo/admin/presupuestos-empresa`: comparación y presupuesto independientes,
selección histórica explícita, términos fijos, fechas cerradas y acciones
«Simular…». Cambiar oferta exige nuevo borrador; cambiar momento no aplica
transición. Proyección privada y todo en memoria, sin pago o conversión.
Focales 25 modelo/seis arquitectura y regresión auth ocho verdes; revisión
independiente 105.487 comprobaciones sin P1/P2. Check global final: 993
archivos sin diagnósticos, 264 suites/3.814 pruebas y 44 HTML/44 formularios
locales/cero cron. QA final nueva: navegador 9.068 comprobaciones, 72 visitas
iniciales y 24 creaciones, más recorridos; a11y ocho superficies sin hallazgos,
ocho PNG revisadas y E2E 196/196. Cliente real 57.551 B/17.134 gzip; Worker/Chrome
cerrados y hash antes/después idéntico de 143 tablas/353 filas. Disponible en repo,
integrada en PR #41 (`424123fe`) y sin despliegue. [Informe final R6.6c](../audits/r6-6c/verification-report.json). R6.7a está implementado y verificado localmente: referencia PO declarada ligada a negociación
completa y oferta histórica explícita; focales/revisión/check global verdes (995 archivos/265 suites/3.841 pruebas), assets verificados frente a PR #41 e integrado en PR #42 (`1b783473`); número legible y token documental opcional, presencia
`declared`/`not_provided`, sin dinero propio, factura, pago o pedido operativo.

**R6.6a — Contrato de solicitudes B2B y revisiones completas de oferta está implementado y verificado localmente**,
rama `codex/company-negotiation-fixtures`, según el [ADR-0059](adr/0059-solicitudes-ofertas-fixture.md).
Solicitud sin dinero, contexto íntegro de empresa/contacto/catálogo y hasta
veinte ofertas completas EUR, con predecesor explícito, replay y diff estructural.
Precio ofertado entre cero y 1.000.000.000 céntimos; total positivo hasta ese
máximo calculado con BigInt, sin heredar el límite del precio de catálogo.

`companies` 1.7.0, B2B-006 parcial e instalada/inactiva en avanzado/demo,
dependencia única B2B-002 y superficies operativas vacías. No duplica estados
comerciales o pagos de ORD-008 ni concede permiso por conservar una oferta.
R6.5c está integrada en PR #38 (`5cdb5bb`), sin despliegue. Check final de a:
987 archivos sin diagnósticos, 262 suites/3.745 pruebas; cincuenta de dominio,
seis de arquitectura y 120 de registro/manifest/acceso. Build con 44 HTML,
44 formularios locales y cero cron. Revisión independiente: 10.245 comprobaciones,
sin P1/P2, efectos, getters o reloj implícito. Diagnóstico público 20.138 B/5.659
gzip, incluidas constantes históricas de 113 B/168 B; no cliente Astro.
Seis grafos JavaScript y 355 fuentes de superficie son idénticos a PR #38.
De 19 CSS, 18 son idénticos: el global añade únicamente `.ordinal`, utilidad sin
consumidor en esas fuentes, +175 B/+7 gzip. Al retirarla se recupera el SHA
anterior exacto. Es comparación estática, no una nueva prueba HTTP/SSR o de
interacción. **Implementado y verificado localmente; integrado en PR #39 (`108480f8`) y sin despliegue.**
[Informe final R6.6a](../audits/r6-6a/verification-report.json).
No añade UI, DDL, Worker o acciones sobre DB. Navegador 6.368/108 visitas,
E2E192, a11y 8/capturas8 y hash de 143 tablas/353 filas son evidencia heredada
de PR #38, no nuevas ejecuciones.

**R6.5c — Demo de límites y revisión de crédito está implementada y verificada localmente**,
rama `codex/company-credit-review-demo`. R6.5b está integrada en PR #37
(`16caef3`), sin despliegue. `/demo/admin/credito`, «Límites y revisión de crédito»,
en Clientes después de condiciones de pago, según el [ADR-0058](adr/0058-revision-credito-fixture.md).
Quince contextos cerrados y apertura explícita de una revisión local; selector
de contacto, aceptación/rechazo declarados y reset. No se conceden crédito,
identidad autenticada, reservas o autorización de compra.

Los tres diagnósticos numéricos conservan cero, diferencias negativas,
ausencias y observación `asOf`; el expediente conserva su historial separado.
Un cambio real de escenario descarta la revisión local de esta vista y exige
otra apertura sin votos; seleccionar de nuevo el mismo escenario conserva el
expediente. La terminalidad deshabilita respuestas aunque queden contactos
sin responder. Memoria local, gate manifest demo AND `DEMO_MODE=true`, SSR
inicial completo y controles inertes sin JavaScript. B2B-004 sigue parcial e
instalada/inactiva; sin capacidades operativas nuevas.

**Implementada y verificada localmente, disponible en el repositorio;
integrada en PR #38 (`5cdb5bb`) y sin despliegue.**
[Verificación final R6.5c](../audits/r6-5c/verification-report.json), 2026-10-04:
`pnpm check` pasa 985 archivos sin diagnósticos, 261 suites/3.694
pruebas; 41 del modelo, seis de arquitectura y ocho de autenticación. Build de
44 HTML/44 formularios locales, con cero crons. Revisión independiente: 129.333
comprobaciones, 630 vistas estructurales, 1.260 respuestas, 630 aperturas,
450 transiciones y 16 gates; cero P1/P2, efectos, getters o reloj implícito.
Las vistas estructurales incluyen selecciones programáticas con controles de
UI deshabilitados: no son visitas de navegador. Diagnóstico del modelo:
40.364 B/10.440 B gzip, separado del cliente emitido.

Cliente real: tres archivos, 46.662 B/13.177 B gzip; entrada 40.084 B/10.724
gzip, sin imports externos. Sonda sin raíz: una consulta DOM, 88 fechas
explícitas y cero efectos/reloj implícito; no acredita interacción de navegador.
Guía medida aparte: 15.179 B/6.314 gzip, único incremento de 8 B/5 gzip por
`|credito` en su allowlist, sin cambios en sus dos helpers. Sus efectos propios
interactivos no se atribuyen al módulo ni a la sonda sin raíz.

QA nueva de c: navegador 6.368 comprobaciones, 108 visitas principales
(54 por tamaño) y guardas adicionales; ocho superficies a11y sin errores ni
avisos. Ocho PNG revisadas por frontend y cuatro por root. E2E nuevo 192/192;
Worker y Chrome detenidos. La base QA conserva 143 tablas/353 filas y el hash
antes/después es idéntico:
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.

Navegador confirma cero peticiones, escrituras/storage, timers, beacons,
ventanas o errores del módulo. La guía y el `requestAnimationFrame` del shell
se contabilizan aparte: tres escrituras de preparación y dos de recarga de
la guía por tamaño, más ocho escrituras propias en su prueba móvil. Los cuatro
grafos de demos anteriores permanecen idénticos. La evidencia de a/b conserva
su corte histórico y la interacción heredada de PR #35; c tiene validación
propia. Sin nuevas operaciones B2B ni despliegue.

**R6.5b — Expediente de revisión de crédito con fixtures está implementado y verificado localmente**,
rama `codex/company-credit-review`, según el [ADR-0058](adr/0058-revision-credito-fixture.md).
Política explícita de hasta veinte contactos revisores, separación del comprador
y quórum; contexto completo, estado reconstruido desde historia y replay que
conserva el snapshot actual. `accepted` describe el quórum de una simulación,
sin conceder crédito ni autorizar compras. Un contacto no acredita una persona.

`companies` 1.6.0 mantiene B2B-004 parcial e instalada/inactiva, sin nuevas
capacidades, dependencias o superficies operativas. R6.5a está integrada en
PR #36 (`787a9e73`), sin despliegue.

**Implementado y verificado localmente; integrado en PR #37 (`16caef3`), sin despliegue.**
[Verificación final R6.5b](../audits/r6-5b/verification-report.json), 2026-10-04:
`pnpm check` pasa 981 archivos sin diagnósticos, 260 suites/3.653 pruebas;
48 de dominio, seis de arquitectura y 119 de registry/manifest/acceso.
Build de 44 HTML y 44 formularios locales, con cero crons.
Revisión independiente: 33.973 comprobaciones, 128 historiales, 4.512
transiciones (120 aplicadas, 1.416 bloqueadas y 2.976 conflictos), 240 replays,
114 cambios de contexto y 22 historiales corruptos; cero P1/P2, efectos,
getters o reloj implícito. Bundle público de diagnóstico: 24.218 B/6.199 B gzip,
con una constante histórica de 113 B, sin dependencias operativas. Es distinto
del asset real emitido por Astro.

Comparación nueva contra PR #36: cinco grafos cliente completos idénticos en
nombres, imports, SHA-256, bytes y gzip; 352 fuentes de superficie explícitas y
19 CSS sin cambios. Condiciones/cobros 31.812 B/9.612 gzip, Cantidades
53.687/17.349, Catálogo por empresa 60.527/19.836, Directorio 26.856/8.818 y guía
15.171/6.309. No es una medición del grafo transitivo SSR completo ni una
interacción HTTP, navegador o DB.

Navegador 2.660 comprobaciones/72 visitas, E2E 188/188, ocho superficies a11y
sin hallazgos, ocho PNG y base QA de 143 tablas/353 filas son **heredados de
PR #35**, sin nuevas ejecuciones runtime. Hash histórico antes/después:
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
R6.5c está verificada localmente y disponible en repo, integrada en PR #38 (`5cdb5bb`) y sin despliegue.

**R6.5a está implementado y verificado localmente**, rama `codex/company-credit-fixtures`,
con diseño aceptado en el [ADR-0057](adr/0057-limites-credito-fixture.md). Las tres colecciones de límites
son independientes: exposición empresarial más solicitud, importe por solicitud
de empresa e importe por solicitud del comprador. La exposición es declarada,
completa y correlacionada con la solicitud excluida; los diagnósticos numéricos
no conceden crédito ni autorizan compras. B2B-004 permanece parcial e
instalada/inactiva; el workflow humano y la demo visual están verificados localmente, sin operación real.

**Implementado y verificado localmente; integrado en PR #36 (`787a9e73`), sin despliegue.**
[Verificación final R6.5a](../audits/r6-5a/verification-report.json), 2026-10-04:
`pnpm check` pasa 979 archivos sin diagnósticos, 259 suites/3.605 pruebas;
44 de dominio, seis de arquitectura y 119 de registry/manifest/acceso
(19/70/30). Build de 44 HTML/44 formularios locales, sin envío, beacon ni cron.
Revisión independiente: 51.363 comprobaciones, 4.375 casos monetarios Python
(2.813 válidos/1.562 overflow) y 160 contextos; cero P1/P2, efectos, getters o
reloj implícito. Bundle público de diagnóstico: 15.266 B/4.277 B gzip;
directorio/crédito y una constante histórica de R6.4 de 113 B retenida por el
barrel, sin cálculo R6.4 ni imports operativos. No es un asset de UI.

Comparación nueva contra PR #35: cinco grafos cliente idénticos en nombres,
imports, archivos, bytes, gzip y SHA-256. También permanecen iguales las
352 fuentes de superficie explícitamente inventariadas y los 19 CSS emitidos.
Los grafos son Condiciones/cobros (31.812 B/9.612 gzip), Cantidades
(53.687/17.349), Catálogo por empresa (60.527/19.836), Directorio
(26.856/8.818) y guía (15.171/6.309). La comparación no cubre todo el grafo
transitivo SSR ni equivale a una ejecución runtime.

Navegador 2.660 comprobaciones/72 visitas, E2E 188/188, ocho superficies a11y
sin hallazgos, ocho PNG y base QA de 143 tablas/353 filas son evidencia
**heredada de PR #35**, sin nuevas ejecuciones de Worker, HTTP, navegador,
a11y, E2E o DB en este corte puro. Hash histórico antes/después:
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
El workflow humano R6.5b está verificado localmente, integrado en PR #37 (`16caef3`); la demo visual R6.5c está verificada localmente, integrada en PR #38 (`5cdb5bb`) y sin despliegue.

**R6.4c — Demo conjunta de condiciones y cobros está implementada y verificada localmente**, rama
`codex/company-collection-demo`. R6.4b está integrada en PR #34 (`2d72d2f0`),
sin despliegue. `/demo/admin/condiciones-pago`, «Condiciones y cobros de ejemplo»,
en Clientes después de Cantidades; dos selectores cerrados y dos diagnósticos
independientes de calendario e importes observados, conforme al
[ADR-0056](adr/0056-evidencia-cobro-fixture.md).

Doce casos y tres evaluaciones explícitas; aplicación parcial/en vencimiento
como estado inicial. Cambiar caso conserva evaluación y cambiar evaluación
conserva obligación/evidencia. `asOf` acompaña los importes; las ramas desconocidas
retiran valores derivados sin inventar ceros. Condición ausente y empresa
inactiva siguen siendo descriptivas. Reset/recarga, memoria local, SSR completo
y controles inertes sin JavaScript; gate manifest demo AND `DEMO_MODE=true`.

**Implementada y verificada localmente, disponible en el repositorio.**
Integrada en PR #35 (`b1bf0d2a`), sin despliegue. B2B-003 permanece parcial e instalada/inactiva.
[Verificación final R6.4c](../audits/r6-4c/verification-report.json), 2026-10-04: `pnpm check` pasa
977 archivos sin diagnósticos, 258 suites/3.560 pruebas, 50 del modelo y seis
de arquitectura; build de 44 HTML/44 formularios locales, sin envíos, beacons
o crons. Revisión independiente: 23.857 comprobaciones, 36 estados y 540
transiciones, sin P1/P2, efectos, getters o reloj implícito. Matriz: 28 estados
con observación y ocho desconocidos, 33 calendarios configurados y tres sin
condición; los importes no se convierten en indicadores de autorización.

QA nueva: navegador 2.660 comprobaciones/72 visitas, ocho superficies a11y sin
hallazgos y ocho PNG revisadas por frontend; root contrastó cuatro. E2E nuevo
188/188 y Worker cerrado. La base QA conserva 143 tablas/353 filas con SHA-256
antes/después idéntico:
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Estas ejecuciones corresponden a c; los checks de a/b y la interacción de
PR #32 conservan sus cortes históricos.

Cliente real: tres archivos, 31.812 B/9.612 B gzip, sin imports externos;
arranque sin raíz con una consulta DOM, 82 fechas explícitas y cero efectos.
Es una sonda diferente de la interacción de navegador. El diagnóstico del
modelo ocupa 26.964 B/7.341 B gzip, cuatro fuentes puras. La guía, medida por
separado, ocupa 15.171 B/6.309 B gzip; el incremento de 17 B/9 B gzip se limita
a añadir `condiciones-pago` a la lista de rutas permitidas. Su sonda sin raíz
no atribuye ausencia de efectos a las interacciones propias de la guía.

**R6.5a — Límites de crédito declarados con fixtures está implementado y verificado localmente**,
según el [ADR-0057](adr/0057-limites-credito-fixture.md). Perfil `company-credit-eur-cents-v1`:
política versionada con `companyExposureLimits`, `companyRequestLimits` y
`buyerLimits` independientes; solicitud EUR completa y evidencia de exposición
`asOf` que excluye exactamente esa solicitud. Los límites de solicitud de
empresa y comprador comparan solo su importe, sin acumulados por periodo.

Tres diagnósticos separados, con diferencia firmada: ausencia de regla es
`unconfigured`; exposición ausente, futura o incompleta es `unknown`, sin
inventar cero. Las comparaciones conocidas por solicitud permanecen disponibles
aunque falte exposición. No existe resultado agregado de aprobación o compra.
`companies` 1.5.0, B2B-004 parcial e instalada/inactiva en avanzado/demo,
dependencia única B2B-001 y superficies operativas vacías. No se reutilizan saldo
regalo, `differenceCents` de R6.4 o roles descriptivos como crédito o permiso.

**Implementado y verificado localmente; integrado en PR #36 (`787a9e73`), sin despliegue.**
Check final: 979 archivos sin diagnósticos, 259 suites/3.605 pruebas; revisión
independiente de 51.363 comprobaciones sin P1/P2. Cinco grafos cliente,
352 fuentes de superficie y 19 CSS permanecen iguales a PR #35. La interacción,
a11y, E2E y base QA son heredados de PR #35, sin nuevas ejecuciones.
[Informe final](../audits/r6-5a/verification-report.json).

**R6.5b está implementado y verificado localmente**, según el [ADR-0058](adr/0058-revision-credito-fixture.md):
expediente fixture con contexto íntegro, política explícita de contactos y
quórum, estado derivado del historial, versión `1+n`, terminalidad y replay
sobre el snapshot actual. La igualdad de contexto precede replay/conflictos;
solo las decisiones aplicadas registran ID. No hay concurrencia durable.
Aceptación declarada no equivale a crédito concedido; contacto no equivale a
persona y los diagnósticos financieros desconocidos o excedidos no cambian.
`companies` 1.6.0 conserva B2B-004 parcial e instalada/inactiva.
Implementado y verificado localmente, integrado en PR #37 (`16caef3`)/sin despliegue:
981 archivos sin diagnósticos, 260 suites/3.653 pruebas, 48 dominio/seis
arquitectura/119 registro y revisión de 33.973 comprobaciones sin P1/P2.
Cinco grafos, 352 fuentes de superficie y 19 CSS iguales a PR #36; interacción
y base QA heredadas de PR #35. [Informe final](../audits/r6-5b/verification-report.json).

**R6.5c está implementada y verificada localmente**, según el [ADR-0058](adr/0058-revision-credito-fixture.md).
`/demo/admin/credito`, «Límites y revisión de crédito», en Clientes: quince
contextos cerrados, incluidas las tres colecciones configuradas por separado;
apertura explícita, selector de contacto, aceptación/rechazo declarados y reset.
Se conservan diagnóstico numérico e historial como dimensiones separadas,
sin controles técnicos de CAS ni traslado de votos al cambiar contexto.
El mismo escenario conserva la revisión; otro escenario exige nueva apertura.
Terminalidad bloquea respuestas incluso con contactos sin responder.
**Implementada y verificada localmente, disponible en repo; integrada en PR #38 (`5cdb5bb`)
y sin despliegue.** Check 985 archivos/261 suites/3.694 pruebas,
41 del modelo y revisión independiente 129.333 sin P1/P2; navegador 6.368/108
visitas principales, ocho superficies a11y sin hallazgos, ocho PNG aprobadas,
E2E nuevo 192/192 y hash QA de 143 tablas/353 filas intacto. Cliente real tres archivos
46.662 B/13.177 gzip; guía medida aparte. [Informe final](../audits/r6-5c/verification-report.json).
Sin autorización comercial, DDL, reserva ni cambios de checkout/ledger.

**R6.6a está implementado y verificado localmente**, según el [ADR-0059](adr/0059-solicitudes-ofertas-fixture.md).
Solicitud sin dinero, contexto completo de empresa/contacto/catálogo, ofertas
EUR declaradas e historial íntegro de hasta veinte revisiones. Una variante
explícita por producto, 1–100 líneas, unidades 1–10.000, precio ofertado 0–1.000.000.000
céntimos y total positivo hasta 1.000.000.000 con BigInt. Cada revisión tiene
caducidad propia y diff estructural; no agrega estados comerciales de ORD-008.
Otro contexto exige nueva negociación sin heredar aceptación, pagos o crédito.
B2B-006 parcial e instalada/inactiva. Check final: 987 archivos sin diagnósticos,
262 suites/3.745 pruebas; cincuenta de dominio, seis de arquitectura y 120 de
registro/manifest/acceso. Revisión independiente 10.245 comprobaciones sin
P1/P2, efectos, getters o reloj implícito; 44 HTML/44 formularios locales y cero
cron. Seis grafos JS y 355 fuentes iguales a PR #38; 18/19 CSS iguales y única
utilidad `.ordinal` sin consumidor (+175 B/+7 gzip), con SHA previo recuperable
al retirarla. Comparación estática, sin afirmar ejecución SSR completa.
Implementado y verificado localmente; integrado en PR #39 (`108480f8`)/sin despliegue.
[Informe final R6.6a](../audits/r6-6a/verification-report.json).
Navegador/E2E192/a11y 8/capturas8/hash de 143 tablas/353 filas son heredados de PR #38,
sin UI o ejecución runtime/DB nuevas.

**R6.6b está implementado y verificado localmente**, según el [ADR-0060](adr/0060-artefacto-preliminar-fixture.md):
artefacto histórico íntegro, oferta seleccionada explícitamente y términos
congelados; estado/versión reconstruidos solo por los reducers ORD-008.
Hasta tres acciones declaradas con fechas UTC, replay y binding completo antes
de conflictos. Nuevo contexto/oferta/términos exige otro artefacto, sin heredar
aprobación; una negociación posterior no retargetea el corte histórico.
`unpaid`/cero es dato de simulación, no dinero observado o permiso comercial.
B2B-006 parcial instalada/inactiva, companies 1.8.0; import público puro no
activa ORD-008. Check final: 989 archivos sin diagnósticos, 263 suites/3.789
pruebas; 44 composición, 50 regresión de negociación, seis arquitectura y 120
registro. Revisión 9.093 sin P1/P2, efectos, getters o reloj implícito; diagnóstico
31.399 B/8.356 gzip sin factories de eventos ni funciones D1, con constantes
históricas de datos. 44 HTML/44 formularios locales/cero cron. Los 58 JS públicos, seis grafos completos, 355 fuentes y 19 CSS permanecen
iguales a PR #39. Worker +92 B por PURE/registro, con ambas factories y 19
consumidores conservados; no es prueba de equivalencia SSR completa.
Implementado y verificado localmente; integrado en PR #40 (`ce295c6`)/sin despliegue.
[Informe final R6.6b](../audits/r6-6b/verification-report.json).
Interacción/base QA heredadas de PR #38, sin nuevo HTTP/Worker/navegador/DB.
Sin pago, conversión, reserva o enlaces alojados. R6.6c está implementada y verificada localmente, según el [ADR-0060](adr/0060-artefacto-preliminar-fixture.md),
en `/demo/admin/presupuestos-empresa`: comparación y presupuesto independientes,
selección histórica explícita, términos fijos, fechas cerradas y acciones
«Simular…». Cambiar oferta exige nuevo borrador; cambiar momento no aplica
transición. Proyección privada y todo en memoria, sin pago o conversión.
Focales 25 modelo/seis arquitectura y regresión auth ocho verdes; revisión
independiente 105.487 comprobaciones sin P1/P2. Check global final: 993
archivos sin diagnósticos, 264 suites/3.814 pruebas y 44 HTML/44 formularios
locales/cero cron. QA final nueva: navegador 9.068 comprobaciones, 72 visitas
iniciales y 24 creaciones, más recorridos; a11y ocho superficies sin hallazgos,
ocho PNG revisadas y E2E 196/196. Cliente real 57.551 B/17.134 gzip; Worker/Chrome
cerrados y hash antes/después idéntico de 143 tablas/353 filas. Disponible en repo,
integrada en PR #41 (`424123fe`) y sin despliegue. [Informe final R6.6c](../audits/r6-6c/verification-report.json). R6.7a está implementado y verificado localmente: referencia PO declarada ligada a negociación
completa y oferta histórica explícita; focales/revisión/check global verdes (995 archivos/265 suites/3.841 pruebas), assets verificados frente a PR #41 e integrado en PR #42 (`1b783473`); número legible y token documental opcional, presencia
`declared`/`not_provided`, sin dinero propio, factura, pago o pedido operativo.


**R6.4b — Evidencia de cobro con fixtures está implementado y verificado localmente**, rama
`codex/company-collection-evidence`, según el
[ADR-0056](adr/0056-evidencia-cobro-fixture.md). Perfil `company-applied-eur-cents-v1`: una obligación EUR
completa/versionada y un snapshot aplicado/revertido correlacionado con todos
sus campos. El importe esperado es declarado, no una deuda legal o fiscal.
`companies` 1.4.0 conserva B2B-003 parcial e instalada/inactiva, dependencia
B2B-001 y superficies operativas vacías.

Evidencia completa compara el neto aplicado con el importe declarado y conserva
la diferencia firmada, incluido exceso. Revertido mayor que aplicado es error;
0/0 no prueba pago. Ausencia, observación futura o evidencia incompleta producen
`unknown` sin importes observados. `asOf` conserva la fecha de observación;
sin TTL ni garantía de saldo actual, y sin convertir antigüedad en caducidad.

El preview combinado llama al calendario existente desde datos ya normalizados,
sin aceptar vencimientos externos ni duplicar aritmética. Condición ausente o
empresa inactiva no ocultan evidencia descriptiva; ninguna salida concede
permisos o activa operaciones. No hay ledger, DDL, rutas, UI, proveedores,
notificaciones, crédito o cambios de checkout.

**Implementado y verificado localmente; integrado en PR #34 (`2d72d2f0`), sin despliegue.**
[Verificación final R6.4b](../audits/r6-4b/verification-report.json), 2026-10-04: `pnpm check` pasa
973 archivos sin diagnósticos, 257 suites/3.510 pruebas, 44 HTML,
44 formularios locales y cero crons. Focales: 37 de dominio, seis de arquitectura
y 118 de registry/manifest/acceso (19/69/30) de la ejecución de registro de este
corte. Revisión independiente: 22.216 comprobaciones, 3.944 casos monetarios
(2.093 válidos y 1.851 inconsistencias rechazadas) y 300 integraciones con
calendario (150 `observed`, 150 `unknown`); sin P1/P2, efectos, getters o reloj
implícito. Bundle público de diagnóstico: 18.153 B/4.925 B gzip, tres fuentes
puras, directorio/calendario/evidencia, sin imports externos; no es un asset UI.

Comparación nueva contra PR #33: cuatro grafos cliente iguales en nombres,
archivos, aristas, specifiers, SHA-256, bytes y gzip, sin imports externos.
También permanecen iguales las 349 fuentes de superficie y 19 CSS emitidos,
sin añadidos, eliminaciones o cambios. No se ejecutaron Worker, HTTP,
navegador, a11y, E2E o DB para este corte puro.

Navegador 2.084 comprobaciones/72 visitas, E2E 184/184, ocho superficies a11y
sin hallazgos, ocho capturas y base QA de 143 tablas/353 filas se heredan de
PR #32. Hash histórico, sin nueva lectura en b:
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
El check de a/PR #33 (971 archivos/256 suites/3.473 pruebas) conserva su propio
corte. B2B-003 y R6.4 siguen parciales, sin activación u operación financiera.

**R6.4c está implementada y verificada localmente**, disponible en el
repositorio, integrada en PR #35 (`b1bf0d2a`) y sin despliegue. Ruta `/demo/admin/condiciones-pago`, «Condiciones y cobros de
ejemplo», en Clientes después de Cantidades. Dos selectores cerrados: 12 casos
y tres instantes de evaluación, con dos diagnósticos separados de calendario
e importes observados. Estado inicial: aplicación parcial y evaluación en el
día del vencimiento. Cambiar caso conserva evaluación; cambiar evaluación
conserva obligación/evidencia del caso. Reset/recarga al inicio, sin edición,
buffers, reloj o acciones financieras.

Casos incluidos: parcial, ausente, incompleto, futuro, aplicado cero, inmediato
con igualdad, exceso, reversión parcial/total, declarado cero, sin condición
y empresa inactiva. Los importes muestran su observación `asOf`; unknown
elimina importes/atributos derivados y no inventa ceros. Igualdad numérica
no se etiqueta como pago ni calendario como impago. Calendario sin condición
conserva derivados nulos aunque haya evidencia observada.

La demo consume los contratos públicos, con SSR inicial completo, controles
inertes sin JavaScript y gate manifest demo AND `DEMO_MODE=true`; privada/noindex,
solo memoria y sin I/O. Verificados 36 estados por tamaño, 72 visitas en
1.440/375 px, ocho capturas y ocho superficies a11y (parcial/en vencimiento,
sin evidencia/después, exceso y sin condición). La operación real permanece
fuera de este corte.


**R6.4a implementado y verificado localmente**, rama
`codex/company-payment-terms`, integrado en PR #33 (`cb3493ec`), sin despliegue.
El [ADR-0055](adr/0055-condiciones-pago-fixture.md) delimita el contrato puro
fixture de condición de pago y calendario por empresa. Companies 1.3.0 posee
B2B-003 parcial e instalada/inactiva en avanzado y demo, ausente en
mínimo/estándar, con dependencia de capacidad única B2B-001 y de módulo
`platform-configuration`; sin superficies operativas. No depende de catálogo,
cantidades, precios, ledger ni proveedores.

Condición explícita y versionada `immediate`/`net_days`, sin herencia ni fallback.
Calendario `utc-civil-days-v1`, fechas civiles UTC `YYYY-MM-DD` exactas entre
0001 y 9999; base y evaluación explícitas, sin inferirlas del reloj ni de
`capturedAt`. Immediate vence en la base y net_days suma días civiles; sin
festivos, días laborales, intereses ni ajustes automáticos. La evaluación
puede preceder la base. Referencias completas de directorio/política y
validación íntegra antes de seleccionar o responder ausencia; overflow de
vencimiento o cualquier hito rechaza el resultado completo.

Empresa existente sin asignación devuelve `unconfigured` y derivados null,
sin hitos; empresa desconocida es error. La inactiva conserva la lectura
descriptiva de la condición declarada en esta revisión y su calendario, sin
permisos ni cambios en los bloqueos comerciales existentes. Los recordatorios
son hitos por offsets explícitos, sin destinatarios, envíos, jobs ni crons.
Pasar la fecha solo produce una posición temporal: no acredita impago, saldo,
captura ni pago completo. Sin importes, crédito, aprobaciones, fiscalidad,
persistencia, UI ni cambios de checkout/ledger. El estado de cobro necesita
un contrato posterior de evidencia completa y correlacionada; R6.4 no se
considera completo por calcular fechas.

Check final con salida 0: 971 archivos sin diagnósticos, 256 suites/3.473
pruebas; 44 HTML/44 formularios/cero crons. Evidencia focal: 46 de dominio,
seis de arquitectura y 118 de registry/manifest/access (19 + 69 + 30).
Revisión independiente de 21.702 comprobaciones/15.090 casos, 336 fechas base,
14.327 resultados y 763 rechazos por overflow; 96 fechas inválidas contrastadas
en 192 comprobaciones. Sin P1/P2, efectos, ejecución de getters ni reloj
implícito. Bundle de diagnóstico: 12.249 B/3.802 B gzip, dos fuentes puras;
no representa un asset de UI. La revisión del build confirma igualdad íntegra
con PR #32 en Cantidades, Catálogo de empresa, Directorio y Guía: nombres,
grafos, aristas, specifiers, SHA-256, bytes y gzip; sin imports externos.
Es análisis de assets existentes, sin nuevas ejecuciones HTTP, navegador o DB.
[Informe final](../audits/r6-4a/verification-report.json).

Navegador 2.084/72 visitas, E2E 184/184, ocho superficies a11y, ocho PNG y hash
143 tablas/353 filas son evidencia heredada de PR #32, sin nuevas ejecuciones
en R6.4a.

R6.4b amplía este calendario con evidencia de importes correlacionados según el
[ADR-0056](adr/0056-evidencia-cobro-fixture.md), verificado localmente y con
integración en PR #34 (`2d72d2f0`). La demo conjunta R6.4c está verificada localmente e integrada en PR #35 (`b1bf0d2a`), sin despliegue.

## Última demo verificada

**R6.3b implementada y verificada localmente, disponible en el repositorio**,
rama `codex/variant-quantity-demo`, integrada en
[PR #32](https://github.com/amariner/logic2b-ecom/pull/32), commit `04d5f9a9`,
sin despliegue.
`/demo/admin/cantidades`, «Mínimos, múltiplos y cajas», está en Clientes,
tras Catálogo de empresa, con dos zonas: «Prueba una cantidad» y «Comprueba la
regla». Empresa activa y canal `professional` fijos; ES/FR, una sola línea
seleccionada y selectores cerrados de variante/cantidad. La memoria de cantidad
por variante comienza en 11→8, 12→2 y 21→1, y se conserva al cambiar variante
o mercado, sin reinterpretación ni autoajuste.

Variante 11: unidad/factor 1, mínimo 5, máximo 17 y múltiplo 4; variante 12:
caja/factor 6, mínimo 6, máximo 18 y múltiplo 4; variante 21 sin regla.
ES publica las tres y FR oculta la 11. El diagnóstico de cantidad se separa
de la visibilidad: una cantidad conforme oculta sigue bloqueada. Sin regla,
el count permanece pero unidad, factor y conversión son null, incluso con
count 0; con regla, count 0 conserva cantidad canónica cero y `below_minimum`.
El modelo consume el preview existente sin duplicar su aritmética.

Interacción en memoria con reset/recarga, sin precios, totales, stock, permisos,
I/O, DB, storage ni temporizadores. SSR inicial completo y controles/reset
deshabilitados sin JavaScript; gate manifest demo AND `DEMO_MODE=true`, ruta
privada/noindex y guía en cabecera. B2B-005 sigue parcial e instalada/inactiva.

Check final: 969 archivos sin diagnósticos, 255 suites/3.426 pruebas,
50 del modelo y seis de arquitectura; 44 HTML/44 formularios/cero crons.
Revisión independiente: 39.967 comprobaciones, 36 estados, 484 transiciones,
150 combinaciones de memoria y 900 vistas; ocho estados con cantidad conforme,
cinco conformes tras considerar visibilidad, 31 bloqueados y seis con conversión
null. Sin P1/P2, efectos, ejecución de getters ni reloj implícito.

Cliente real: cinco archivos, 53.687 B/17.349 B gzip, sin imports externos u
operativos. La sonda de arranque sin raíz registra una consulta DOM, cinco
fechas explícitas y cero efectos; la interacción se acredita por separado en
navegador. La guía se mide aparte: 15.154 B/6.300 B gzip, con 11 B adicionales
por incluir Cantidades en su lista de rutas admitidas. Sus efectos se separan
de los del módulo.

QA final nueva: navegador 2.084 comprobaciones/72 visitas, ocho superficies
a11y sin hallazgos y E2E 184/184. Ocho PNG aprobados por frontend y cuatro por
revisión principal. Base QA antes/después intacta, 143 tablas/353 filas,
hash `9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
[Informe final](../audits/r6-3b/verification-report.json).
Las verificaciones R6.3a/PR #31 y la evidencia anterior de PR #30 conservan
su procedencia histórica en los apartados siguientes.

## Contrato anterior verificado

**R6.3a implementado y verificado localmente**, rama
`codex/variant-quantity-rules`, integrado en
[PR #31](https://github.com/amariner/logic2b-ecom/pull/31), commit `7ac42e67`,
sin despliegue.
El [ADR-0054](adr/0054-reglas-cantidad-fixture.md) delimita el contrato puro
fixture de cantidades. Companies 1.2.0 posee B2B-005 parcial e
instalada/inactiva en avanzado y demo, ausente en mínimo/estándar, con
dependencia de capacidad única B2B-002 y dependencia de módulo
`platform-configuration`; sin superficies operativas.

Política global por variante, sin sustituciones por empresa ni precedencia.
La regla define `orderUnit` unit/box y factor 1/al menos 2 respectivamente;
mínimo/máximo inclusivos y múltiplo absoluto desde cero en unidades canónicas.
`requestedCount` se correlaciona con `policyRef` y `catalogRef` completos y
exactos; cero se conserva como diagnóstico `below_minimum` cuando hay regla,
y -0 se rechaza. Multiplicación, mínimo común múltiplo y factibilidad exactos
con BigInt; overflow rechazado incluso para variantes ocultas o inactivas,
sin redondeo, clamp ni autoajuste. Regla ausente produce `unconfigured` con
unidad, factor y cantidad canónica null. Se valida toda la política, incluidas
las referencias y pertenencias ajenas a la selección.

La composición deriva únicamente la identidad del mismo catálogo de empresa
completamente normalizado que utiliza el contexto; no acepta un segundo
catálogo. Añade el diagnóstico a la visibilidad, con una variante explícita
por producto, sin búsqueda de vínculos de precio, imports de pricing ni salida
de precios/totales, autorización o stock. El runtime y quote 1..99 permanecen
intactos.

Check final: 965 archivos sin diagnósticos, 254 suites/3.376 pruebas,
44 HTML/44 formularios/cero crons. Evidencia focal: 112 propias (57 dominio y
55 composición), seis de arquitectura y 117 de registry/manifest/access
(19 + 68 + 30). Oráculo independiente: 78.223 comprobaciones, 3.234 políticas,
1.738 factibles, 12.372 cantidades y 900 intersecciones, sin P1/P2, efectos,
ejecución de getters ni reloj implícito. Bundles diagnósticos minificados:
API de cantidades 7.728 B/dos fuentes (incluye 718 B de constantes del
directorio) y composición 35.934 B/siete fuentes, sin imports externos u
operativos; no son assets de UI. La revisión de los clientes reales confirma
grafo, nombres, SHA y tamaños/gzip idénticos a PR #30: Catálogo
60.244 B/18.532 B gzip, Directorio 26.856 B/8.818 B gzip y Guía
15.143 B/6.297 B gzip. Las fuentes nuevas de cantidades no entran en la UI.
[Informe final](../audits/r6-3a/verification-report.json).

No hay nuevo Worker ni ejecuciones HTTP, navegador, E2E o hash. Navegador
3.614/64 visitas, E2E 180/180, ocho superficies a11y, ocho PNG y hash de
143 tablas/353 filas son evidencia heredada de R6.2b/PR #30.

## Demo anterior verificada

**R6.2b implementada y verificada localmente, disponible en el repositorio**,
rama `codex/company-catalog-demo`, integrada en
[PR #30](https://github.com/amariner/logic2b-ecom/pull/30), commit `6305b823`,
sin despliegue. `/demo/admin/catalogos-empresa`, dentro de Clientes,
muestra Workshop y Studio activas, Unbound activa sin vinculación de precios
y Closed inactiva; ES/FR y canal `professional` fijo. Tres productos y variantes
activos con selección inicial explícita 11/21/31, sin inferir default; cambiar
contexto conserva esa selección. El caso inicial muestra precios de lista de
empresa, lista general y catálogo. Interacción en memoria con reset, sin
totales, hashes ni referencias técnicas en UI, I/O, DDL u operación comercial
real. B2B-002 sigue parcial e instalada/inactiva; B2B-009 pendiente.

Check final: 961 archivos sin diagnósticos, 252 suites/3.259 pruebas,
44 HTML/44 formularios/cero crons; 49 pruebas del modelo y seis de arquitectura.
Revisión independiente de 14.638 comprobaciones, 32 estados y 416 transiciones,
sin P1/P2, efectos, ejecución de getters ni reloj implícito; 16 resultados con
precio y 80 bloqueados.

El cliente real de Catálogos contiene cinco archivos, 60.244 B/18.532 B gzip
(entrada 37.386/10.361 B). La guía se mide por separado: tres archivos,
15.143 B/6.297 B gzip. Ambas sondas de arranque sin raíz registran una consulta
DOM y cero efectos, imports externos o reloj implícito; Catálogos construye
cinco fechas explícitas y la guía ninguna. El bundle de diagnóstico del modelo,
53.231 B/diez fuentes, no es un asset de UI ni sustituye la prueba de navegador.

QA final nueva: navegador 3.614 comprobaciones en 64 visitas, 32 por tamaño
1440/375; ocho superficies a11y sin hallazgos y E2E 180/180 con salida 0.
Ocho capturas regeneradas aprobadas por frontend y cuatro por revisión
principal, sin nuevos defectos; Empresa queda despejada en las cuatro vistas
móviles, sin overflow. La guía móvil usa un disparador
de 44 px en cabecera; foco, cierre, Escape, resize 375↔1024 y anchura 320 sin
overflow verificados. El módulo no produce efectos; las ocho escrituras
adicionales de la guía en sessionStorage se contabilizan aparte de las tres de
preparación y dos de recarga.

Base QA intacta, 143 tablas/353 filas y hash idéntico antes/después
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Worker detenido. [Informe final](../audits/r6-2b/verification-report.json).
Los resultados R6.2a y anteriores conservan su procedencia.

## Contrato anterior verificado

**R6.2a implementado y verificado localmente**, rama
`codex/company-catalog-contract`, integrado en
[PR #29](https://github.com/amariner/logic2b-ecom/pull/29), commit `4d7a30a9`,
sin despliegue.
El [ADR-0053](adr/0053-catalogos-empresa-fixture.md) delimita el contrato fixture
para catálogos de empresa. `companies` v1.1 posee B2B-002, parcial e
instalada/inactiva en avanzado y demo, con dependencia de capacidad única
B2B-001. El módulo conserva su dependencia de `platform-configuration`;
la composición pura con `markets` y `pricing` no activa consumidores operativos.
B2B-009 permanece pendiente.

La implementación usa snapshot EUR con todas las variantes y precios,
restricciones globales empresa/producto intersectadas con publicación por
mercado/canal, vínculos de precio explícitos y una variante seleccionada por
producto. Check final: 957 archivos sin diagnósticos, 251 suites/3.210 pruebas,
44 HTML/44 formularios/cero crons. Evidencia focal: 132 pruebas (28 de catálogo,
18 de vínculos, 35 de proyección/contexto y 51 de precios), seis de arquitectura,
82 de registry/manifest (19 + 63) y regresión de 93 del directorio. Revisión
independiente: 12.478 aserciones/300 combinaciones sin P1/P2, ejecución de
getters, efectos ni reloj implícito.

Bundles diagnósticos minificados: companies 14.371 B/dos fuentes, proyección
5.685 B/tres, contexto 27.081 B/cinco y precios 38.098 B/siete, sin imports
externos u operativos; no son assets de UI. El grafo del cliente existente de
Empresas conserva sus archivos y tamaños; el nuevo contrato no entra en él.
[Informe final](../audits/r6-2a/verification-report.json).

Este contrato puro no añadió Worker, auditoría HTTP, navegador, a11y ni
verificación de DB. E2E 176/176, navegador 601, ocho superficies a11y, ocho
capturas y hash QA de 143 tablas/353 filas pertenecen a R6.1b, integrado en
PR #28; son evidencia heredada, sin nuevas ejecuciones en R6.2a.
R6.2b aporta la demo verificada localmente, integrada en PR #30 sin despliegue.

## Demo anterior verificada

**R6.1b implementada y verificada localmente, disponible en el repositorio**,
rama `codex/company-directory-demo`, integrada en
[PR #28](https://github.com/amariner/logic2b-ecom/pull/28), commit `861b34ff`,
sin despliegue.
`/demo/admin/empresas`, «Empresas y sedes», dentro de Clientes, muestra empresa
A activa con VAT ficticio y empresa B inactiva sin VAT, con sedes, contactos y
roles descriptivos. Cinco estados VAT, inicialmente `not_checked`; al cambiar
de empresa se reinicia la selección y vuelve a `not_checked`.

B2B-001 permanece parcial e instalada/inactiva; B2B-009 sigue pendiente.
La demo no concede permisos ni incorpora autenticación, precios, crédito o I/O.
Check final: 948 archivos sin diagnósticos, 246 suites/3.077 pruebas, incluidas
23 del modelo y seis de arquitectura; 44 HTML/44 formularios/cero crons.
Revisión independiente de 1.532 comprobaciones, seis estados y 38 transiciones,
sin P1/P2, efectos, ejecución de getters ni reloj implícito.

Cliente real: 26.802 B/8.315 B gzip en dos archivos, entrada de 21.053/6.262 B
y compartido de 5.749/2.053 B, sin imports externos u operativos. La sonda de
arranque sin raíz demo registra una consulta DOM, diez fechas explícitas y
cero efectos o reloj implícito; las interacciones se acreditan por separado
en navegador, no por esa sonda.

QA nueva: navegador 601 comprobaciones aprobadas, E2E 176/176 y ocho superficies
a11y sin errores ni avisos. Ocho capturas aprobadas por frontend y revisión
principal. El módulo no genera HTTP, escrituras de almacenamiento, temporizadores,
beacons, ventanas ni errores JS; guía y requestAnimationFrame del shell se
verifican aparte. Base QA intacta: 143 tablas/353 filas y hash antes/después
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Worker cerrado. [Informe final](../audits/r6-1b/verification-report.json).
Las verificaciones del contrato R6.1a y las pruebas anteriores citadas a
continuación conservan su procedencia.

## Contrato anterior verificado

**R6.1a implementado y verificado localmente**, rama
`codex/company-fixture-directory`, integrado en
[PR #27](https://github.com/amariner/logic2b-ecom/pull/27), commit `9b78e69a`,
sin despliegue.
El [ADR-0052](adr/0052-directorio-empresas-fixture.md) delimita el directorio
puro fixture del módulo `companies`: empresas, sedes, contactos, roles
meramente descriptivos y asignaciones con referencias de pertenencia.
B2B-001 permanece parcial e instalada/inactiva en avanzado y demo, con dependencia
única PLT-004. La evidencia VAT se evalúa mediante composición con `taxes`,
sin convertirlo en dependencia operativa del módulo `companies`.
B2B-009 permanece pendiente.

Evidencia focal aprobada: 93 pruebas de dominio, 24 de composición VAT,
seis de arquitectura y 81 de registry/manifest. La revisión independiente
cubre 11.249 aserciones: 9.700 del directorio sobre 171 selecciones y 1.549 VAT
sobre 48 escenarios, sin P1/P2, ejecución de getters, efectos ni reloj implícito.
Bundles diagnósticos minificados: directorio 6.474 B/dos fuentes y composición
VAT 11.957 B/cuatro fuentes contribuyentes, sin imports externos ni runtime.
Check final con salida 0: 944 archivos sin diagnósticos, 245 suites/3.054
pruebas, 44 HTML/44 formularios/cero crons.
[Informe final](../audits/r6-1a/verification-report.json).

R6.1a no añadió UI. El check de 939 archivos/243 suites/2.935 pruebas y el auditor
HTTP 4.554/163 GET/HEAD/40 URLs,
E2E 172/172 y hash QA de 143 tablas/353 filas son evidencia anterior de
R5.12, integrada en PR #26. Navegador 2.030/2.030, ocho superficies a11y y
ocho capturas siguen siendo evidencia heredada de PR #25, sin nuevas
ejecuciones en ese corte. R6.1b aporta ahora la demo verificada localmente
y disponible en el repositorio, sin despliegue.

## Consolidación local verificada

**R5.12 realizada y verificada localmente con fixtures**, rama
`codex/r5-fixture-consolidation`, integrada en
[PR #26](https://github.com/amariner/logic2b-ecom/pull/26), commit `9dd23909`,
sin despliegue.
La [consolidación de R5 con fixtures](R5_CONSOLIDACION_FIXTURES.md) reúne
nueve pruebas entre contratos ES/FR, la matriz de capacidades instaladas e
inactivas y el refuerzo de cabeceras de privacidad en las respuestas tempranas
302 de administración y 404 de cuenta. Check técnico completo verde: 939
archivos sin diagnósticos, 243 suites/2.935 pruebas, 44 HTML/44 formularios y
cero crons. Nuevas focales: nueve entre contratos, siete de capacidades y 32
de cabeceras privadas; las de cabeceras passwordless suman ahora siete.
La revisión independiente cubre 1.114 aserciones y 127 casos sin P1/P2 ni
accesos a getters de entorno, cuerpos, cookies o waitUntil en los casos protegidos.

La auditoría HTTP de privacidad y SEO completa 4.554 comprobaciones sobre
163 solicitudes estrictamente GET/HEAD y 40 URLs de sitemap del build final.
El E2E global propio pasa 172/172 con salida 0, separado del auditor: comprueba
comandos rechazados solo en QA aislada y sintética. La base conserva 143 tablas
y 353 filas, con hash idéntico antes/después:
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Worker de QA cerrado. [Informe final](../audits/r5-12/verification-report.json).
Navegador 2.030/2.030, ocho superficies a11y y ocho capturas son evidencia
heredada de PR #25; no son nuevas ejecuciones de R5.12.

Sin nuevas interfaces, DDL, activación, formularios enviados ni escrituras de
base de datos desde las demos. El alcance no convierte R5 en operación real
ni completa los gates G3/G4. La evidencia de R5.11c que sigue pertenece a ese
corte anterior.

## Última demo verificada

**R5.11c implementada y verificada localmente, disponible en el repositorio**,
rama `codex/currency-methods-demo`, integrada en
[PR #25](https://github.com/amariner/logic2b-ecom/pull/25), commit `46dbe905`,
sin despliegue.
`/demo/admin/divisas` reúne mercados, divisas y métodos fixture.
El diseño aprobado usa mercados ES/FR/JP/KW, importes nominales cerrados y
destinos EUR/JPY/KWD, con evidencia FX vigente, caducada o indisponible;
la identidad no necesita evidencia. Los métodos se evalúan sobre el importe
original y permanecen invariantes al cambiar FX. El formato es exacto con
`BigInt` y la muestra contempla 32 respuestas fixture.

La interacción se resuelve en memoria, con reset/recarga al estado inicial,
bajo manifest demo **y** `DEMO_MODE=true`. Sin I/O, almacenamiento, reloj,
API, DDL, cron, pagos ni proveedor. MKT-008 y CHK-010 permanecen parciales e
instaladas/inactivas; `payments` conserva sus otras capacidades activas.

Check técnico final de R5.11c verde: 936 archivos sin diagnósticos, 240 suites
y 2.885 pruebas, con 206 del modelo y seis de arquitectura; 44 HTML,
44 formularios y cero crons. La revisión independiente cubre 4.634
comprobaciones, 126 estados y 32 evidencias, sin P1/P2, efectos ni ejecución
de getters. El bundle cliente real suma 36.482 B, 10.886 B gzip, en dos
chunks: entrada de 30.287/8.662 B y markets de 6.195/2.224 B. La sonda de
arranque observa cero imports externos y efectos. El bundle de prueba del
modelo, 48.518 B sin minificar, es una medida distinta.

QA nueva de R5.11c: navegador 2.030/2.030, E2E 172/172 y ocho superficies
a11y con cero errores y cero avisos. Ocho capturas revisadas por frontend y
UX/UI sin bloqueantes. Base QA intacta, 143 tablas/353 filas, con hash idéntico
antes/después: `9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
El navegador registra cero efectos del módulo; el almacenamiento de la guía
y requestAnimationFrame del shell se contabilizan por separado. Worker cerrado.
[Informe final](../audits/r5-11c/verification-report.json).

Los 932 archivos, 239 suites y 2.679 pruebas pertenecen al corte anterior
R5.11b, integrado en PR #24 (`a44923c`). E2E 168/168,
navegador 340/340, ocho superficies a11y y base QA de 143 tablas/353 filas con
hash `9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`
son evidencia heredada de PR #22 (`93bc3bd`), distinta de la nueva QA de
R5.11c. La demo no habilita cobro, reembolso ni conciliación operativos.

## Último contrato verificado

**R5.11b implementado y verificado localmente el 2026-10-04**, rama
`codex/local-methods-fixture-contract`, integrado en
[PR #24](https://github.com/amariner/logic2b-ecom/pull/24), commit `a44923c`,
sin despliegue.
El [ADR-0051](adr/0051-metodos-locales-fixture.md) delimita el contrato puro
`payments/domain/local-payment-methods.ts` y la composición
`composition/local-payment-methods-context.ts`. CHK-010 permanece parcial e
instalada/inactiva en avanzado y demo, con dependencia PLT-004. El módulo
`payments` conserva sus otras capacidades activas.

La política de origen fixture define reglas exactas método/mercado/moneda.
Política y solicitud incluyen referencias completas id/version de ambos
catálogos; la composición exige `original.currency = market.currency` y el
exponente correcto. Valida todas las reglas, incluidas las deshabilitadas y
las de otros contextos, con rangos inclusivos en unidades menores y enteros
seguros. Distingue `available_in_fixture` de motivos de ausencia, deshabilitación
o límites, sin conceder permiso real para pagar.

No acepta importes FX ni añade fallback, I/O, relojes, DDL, rutas, jobs o
healthchecks; tampoco cambia ledger, precios, checkout ni pagos operativos.
Check final: 932 archivos sin diagnósticos, 239 suites/2.679 pruebas y build
con 44 HTML/44 formularios/cero crons. Focales: 86 de dominio, 30 de composición,
seis de arquitectura y 79 de registry/manifest. Revisión independiente de
6.366 aserciones sin P1/P2, efectos ni ejecución de getters. Bundle de
composición de 25.741 B sin ledger, D1, Stripe, checkout, config, preview FX
ni adaptador FX efectivo; retiene una constante pura de `markets` de 142 B.
[Informe final](../audits/r5-11b/verification-report.json).

E2E 168/168, navegador 340/340, ocho
superficies a11y y base QA de 143 tablas/353 filas con hash
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`
son evidencia heredada de R5.10b, PR #22 (`93bc3bd`), sin nuevas ejecuciones
en R5.11b. Ese corte no implementó UI; R5.11c aporta ahora la demo visual
verificada localmente y disponible en el repositorio, sin despliegue.

## Último contrato verificado

**R5.11a implementado y verificado localmente el 2026-10-04 UTC**, rama
`codex/currency-fixture-contract`, integrado en
[PR #23](https://github.com/amariner/logic2b-ecom/pull/23), commit `c928ef9`,
sin despliegue.
El [ADR-0050](adr/0050-presentacion-divisas-fixture.md) define el módulo
separado `currencies` y su contrato puro de importe presentado y evidencia FX
fixture. MKT-008 permanece parcial e instalada/inactiva en avanzado y demo, con
dependencia PLT-004; ese corte no modificó CHK-010. La demo visual de divisas
está disponible y verificada localmente en R5.11c, sin despliegue.

El perfil `minor-unit-presentment-half-up-v1` usa un catálogo completo y
versionado, con exponentes 0/2/3 explícitos, tasas racionales dirigidas
base→target en unidades principales y cálculo `BigInt` con redondeo half-up.
La identidad es explícita, sin una tasa ficticia. La evidencia se correlaciona
con la solicitud completa, el adaptador y su vigencia; FX ausente, futura o
caducada deja el importe presentado en `null`.

El catálogo no se declara certificado ISO ni habilita monedas operativas.
El contrato no incorpora I/O, reloj, DDL o proveedor ni modifica
`formatCurrencyCents`, checkout, ledger o impuestos EUR. Esta ola no resuelve
cobro, reembolso ni conciliación operativos.

Check final: 928 archivos sin diagnósticos, 237 suites/2.561 pruebas y build
con 44 HTML/44 formularios/cero crons. Focales: 107 de dominio, 25 del adaptador
FX fixture, seis de arquitectura y 77 de registry/manifest. Revisión independiente
de 8.823 aserciones sin P1/P2, efectos ni ejecución de getters; bundle público
de tres fuentes/12.910 B sin importaciones de runtime operativo.
[Informe final](../audits/r5-11a/verification-report.json).

E2E 168/168, navegador 340/340, ocho superficies a11y y base QA de 143 tablas/353
filas con hash `9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`
son evidencia heredada de R5.10b, integrada en PR #22 (`93bc3bd`), no nuevas
ejecuciones de R5.11a. No hay nueva UI ni ejecución E2E, a11y, navegador o hash
en este corte. Los resultados anteriores se conservan a continuación.

## Última demo verificada

**R5.10b verificada y disponible en el repositorio, sin desplegar**, rama
`codex/tax-fixture-demo`, integrada en
[PR #22](https://github.com/amariner/logic2b-ecom/pull/22), commit `93bc3bd`.
`/demo/admin/impuestos`,
«Impuestos y totales», separa «Preparar ejemplo» y «Comprobar desglose». Ofrece cinco casos
cerrados: dos tipos con portes, céntimos y redondeo, cero y exención, portes
pendientes y ausencia de respuesta fiscal, con selector incluido/excluido.
La evidencia VAT positiva, negativa, caducada o indisponible es independiente
y nunca cambia el tratamiento fiscal del ejemplo.

Los importes postdescuento son de solo lectura: la selección recalcula en
memoria y reset/recarga recuperan el estado inicial. No hay buffers, guardar,
campos libres de NIF, país o importes, ni envío. La ruta exige manifest demo
**y** `DEMO_MODE=true`, conserva noindex y no habilita operación fiscal.
MKT-009/010 permanecen parciales e instaladas/inactivas; CHK-006 sigue pendiente.
Verificación técnica completada: `pnpm check` pasa 921 archivos sin diagnósticos,
235 suites/2.427 pruebas, incluidas 36 del modelo y seis de arquitectura;
build y guardas de 44 HTML, 44 formularios y cero crons. Revisión independiente:
496 comprobaciones sin P1/P2; modelo de seis fuentes/30.148 B y cliente de
ocho fuentes/23.091 B, sin runtime operativo ni efectos.

QA final de R5.10b: navegador 340/340, E2E nuevo 168/168, ocho superficies
a11y con cero errores y cero avisos, y ocho capturas revisadas sin bloqueantes.
La base QA conserva 143 tablas y 353 filas, con hash idéntico antes/después:
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
El módulo produce cero peticiones HTTP, escrituras o eventos de mutación de
almacenamiento, temporizadores, beacons, aperturas externas y errores JavaScript.
La inicialización/recarga de la guía en sessionStorage y el punto exacto de
requestAnimationFrame de WhatsAppContact en el shell se verifican y registran
por separado. Worker y Chrome de QA están detenidos.
[Informe final](../audits/r5-10b/verification-report.json).
Los apartados siguientes conservan evidencia de sus cortes anteriores.

## Último contrato verificado

**R5.10a implementado y verificado localmente**, rama
`codex/tax-fixture-contract`. El
[ADR-0049](adr/0049-contrato-fiscal-fixture.md) delimita un módulo `taxes`
separado de `markets`, con contrato puro y puerto/adaptador únicamente fixture.
MKT-009/010 pasan a parciales e instaladas/inactivas en avanzado y demo, con
dependencia PLT-004; CHK-006 sigue pendiente. Sin despliegue ni activación.

El perfil `eur-line-tax-half-up-v1` trabaja en EUR postdescuento, por línea,
separando `goods` y `shipping`. Declara jurisdicción, tratamiento, tasa y precio
con impuestos incluidos/excluidos; calcula con `BigInt` y redondeo half-up,
conserva `net + tax = gross` y rechaza desbordamientos. Distingue `taxable`,
`zero_rate`, `exempt`, evidencia y casos `unresolved`; una línea sin resolver
deja `totals: null`, sin producir un importe utilizable como total fiscal.
Las entradas corruptas o ajenas a la consulta se rechazan como error de contrato.
El subtotal previo a descuentos no se trata como base imponible.

La respuesta del adaptador debe corresponder a la solicitud completa y al
adaptador esperado. Solo una respuesta `assessed` vigente genera snapshot;
`unavailable`, evidencia caducada o futura no lo generan. La evidencia VAT se
correlaciona con consulta, adaptador e instante explícitos: un VAT válido no
concede exención. El contrato no infiere fiscalidad de mercado, código postal
o NIF, no fija una fiscalidad universal ni añade DDL; tampoco conecta quote,
checkout, pagos, reembolsos, D1, red, reloj, caché durable o proveedor.

Check final con salida 0: 917 archivos sin diagnósticos, 234 suites/2.391
pruebas y build con 44 HTML/44 formularios/cero crons. Focales: 96 fiscales
(82+14), 70 VAT (55+15), seis de arquitectura y 75 de registry/manifest.
La revisión independiente cubre 5.616 aserciones (5.420 fiscales y 196 VAT),
sin P1/P2 ni efectos; el bundle público de `taxes` contiene cinco fuentes puras.
[Informe](../audits/r5-10a/verification-report.json). Integrado en
[PR #21](https://github.com/amariner/logic2b-ecom/pull/21), commit `5f9e3e2`, sin
despliegue. Estos resultados son evidencia anterior de R5.10a, no de R5.10b.

E2E 164/164,
navegador 188/188, ocho superficies a11y y hash de 143 tablas/353 filas
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`
son evidencia heredada de R5.9b, integrada en PR #20 (`7a0926e`), no nuevas
ejecuciones de R5.10a ni de R5.10b.

## Alcance consolidado de R5.12

**R5.12: consolidación local de contratos y demos con fixtures**. Matriz trazable de capacidades y evidencias, compatibilidad
ES/FR entre catálogos/idiomas/publicación/moneda original/FX/impuestos/métodos,
y casos negativos sin convertir el preview en autorización de compra.
Privacidad y cuenta opcional se contrastan con fixtures y guardas, manteniendo
guest checkout; no se envían accesos, consentimientos o formularios ni se
escriben datos desde las demos. Revisión de noindex/sitemap, PII, seguridad,
navegación/a11y, efectos y hash QA de superficies servidas cuando corresponda;
las pruebas heredadas conservan su procedencia.

El cierre se limita al alcance con fixtures, sin reclamar E2E operativo. R5
conserva pendientes de cobro, reembolso, conciliación, decisiones fiscales y
de proveedor, cuentas/privacidad reales y activación por proyecto. Esos
pendientes no exigen DDL, proveedor o nuevas rutas para ensayar la
consolidación local ni se dan por resueltos por mostrar una demo.

## Alcance implementado de R6.1a

El directorio `companies` es versionado y su selección valida el snapshot
completo. Solo empresas, sedes y contactos tienen estados activo/inactivo;
las asignaciones y relaciones no tienen estado. Esos estados y los roles
descriptivos no conceden permisos. `identityRef` admite, de forma excluyente,
una referencia de perfil, un hash de email de 64 caracteres o null. Son
metadatos potencialmente seudónimos, no anonimización: pueden repetirse entre
empresas y no acreditan pertenencia. Sin email en claro, autenticación
ni derivación de claves para precios.

VAT es opcional y declarativo. La composición con `taxes` correlaciona la
consulta con la empresa, el país y el VAT declarado; una declaración idéntica
puede reutilizar evidencia vigente tras una nueva versión editorial. El
directorio no acredita autorización ni concede exención fiscal. Sin DDL, CRM,
autenticación, cobro o crédito; B2B-001 permanece instalada/inactiva y sin
rutas ni jobs. B2B-009 sigue pendiente.

**R6.1b verificada localmente y disponible en repo, sin desplegar**: `/demo/admin/empresas`,
«Empresas y sedes», dentro del grupo Clientes. Empresa A activa con VAT ficticio
frente a empresa B inactiva sin VAT; sedes, contactos y roles descriptivos.
Cinco estados VAT, inicialmente `not_checked`; cambiar de empresa reinicia
ese estado. Ocho capturas revisadas sin bloqueantes;
[evidencia final](../audits/r6-1b/verification-report.json). Integrada en PR #28
(`861b34ff`), sin despliegue.

## Alcance de R6.2a verificado

Snapshot EUR con todas las variantes y sus precios. Preview completo de
visibilidad separado del precio de una única variante explícita por producto,
hasta 100 selecciones: la base procede de esa variante, nunca de la default.
Se conserva y declara la sustitución de precio de las listas existentes
por producto. La política de empresa es global por empresa/producto; mercado
y canal pertenecen a la publicación por mercado. Ambas restricciones se
intersectan sin revivir excluidos. Empresa inactiva cierra el preview comercial
sin alterar el selector descriptivo del directorio.

Una vinculación versionada explícita relaciona `companyId` con `companyKeyHash`;
un hash puede compartirse explícitamente entre empresas. Su ausencia produce
precio null, sin convertirse en contexto general ni derivar claves de otros
datos. Se correlacionan `directoryRef` completo (id/version/capturedAt) y
`catalogRef` (ref/capturedAt). La base es EUR; listas canónicas de otra moneda
se validan completas y conservan el resultado `excluded_context`. La frontera
`unknown` valida y copia todos los datos y referencias, incluidos los ajenos
a la selección, antes de la API tipada de precios. Sin totales, autorización
real, DDL ni activación; B2B-002 permanece parcial e instalada/inactiva y
B2B-009 pendiente.

**R6.2b verificada localmente y disponible en repo**, integrada en PR #30
(`6305b823`) sin despliegue: `/demo/admin/catalogos-empresa`, dentro de Clientes. Workshop
y Studio activas, Unbound activa sin vinculación y Closed inactiva; ES/FR y
`professional` fijo. Tres productos y variantes activos, selección inicial
explícita 11/21/31 preservada al cambiar contexto y los tres orígenes de precio
visibles en el caso inicial. Memoria y reset, sin totales ni operación real.
Check final 961 archivos/252 suites/3.259 pruebas; revisión de 32 estados y
416 transiciones. Navegador final 3.614 comprobaciones/64 visitas, ocho
superficies a11y sin hallazgos, E2E nuevo 180/180 y hash de 143 tablas/353 filas
intacto. Ocho capturas regeneradas aprobadas por frontend, sin nuevos defectos.
[Informe final](../audits/r6-2b/verification-report.json).

## Demo verificada

**R5.9b implementada y verificada, disponible en repo sin desplegar**, rama
`codex/market-publication-demo`. Incluye
`/demo/admin/publicacion`, «Publicación del catálogo», bajo Internacional:
mercados ES/FR, canales `storefront`/`professional` y tres productos sintéticos.
La muestra mantiene borradores en memoria para las 12 tuplas, con aplicación
explícita, preview de motivos y selección preparada separada del resultado
aplicado. Incluye variante
default oculta con otra activa visible, variantes `draft`/`archived` bloqueadas,
producto inactivo, configuración ausente y reset/recarga al estado inicial.

Las acciones son locales, sin I/O, D1, cron, persistencia ni editor real;
la ruta es noindex y no autoriza compra. MKT-004 conserva estado parcial e
instalada/inactiva; MKT-005 sigue pendiente.

[Check final](../audits/r5-9b/verification-report.json): 905 archivos sin
diagnósticos, 230 suites/2.222 pruebas, 44 HTML/44 formularios/cero crons;
47 del modelo, seis de arquitectura y revisión de 453 aserciones sin P1/P2.
E2E nuevo: 164/164. [Navegador](../audits/r5-9b/report.json): 188/188 y ocho
PNG aprobados; [a11y](../audits/r5-9b/a11y-report.json): ocho superficies, cero
errores/avisos. El módulo no genera HTTP, storage, timers, beacons, ventanas
ni errores JS; guía y rAF visual de WhatsApp se contabilizan aparte. Base QA
intacta: 143 tablas, 353 filas, SHA-256 antes/después
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Worker detenido. Integrada en
[PR #20](https://github.com/amariner/logic2b-ecom/pull/20), commit `7a0926e`, sin
despliegue.

## Último contrato verificado

**R5.9a implementado y verificado localmente**, rama
`codex/market-publication-contract`. Incluye el contrato puro
`markets/market-publication` y la composición
`projectMarketPublicationSnapshot` a partir de `CatalogEntry` completo.
El [ADR-0048](adr/0048-publicacion-por-mercado.md) fija tuplas exactas
mercado/canal/producto y selección explícita de
variantes; la ausencia de configuración devuelve `unconfigured`. Publicación,
precio, stock y compra posible conservan decisiones separadas.

La referencia y fecha del snapshot identifican la entrada proporcionada;
no acreditan por sí solas una lectura D1. No se inventan versiones por producto
o regla. El alcance no añade DDL, lectores de runtime, UI, persistencia ni
activación. MKT-004 pasa a parcial, instalada/inactiva en avanzado y demo,
propietario `markets`, dependencias MKT-003 y CAT-003; MKT-005 sigue pendiente.

Check final: 901 archivos sin diagnósticos, 229 suites/2.175 pruebas,
44 HTML/44 formularios/cero crons. Focales: 102 de dominio, 48 de proyección,
seis de arquitectura; revisión independiente de 485 aserciones sin P1/P2.
[Informe](../audits/r5-9a/verification-report.json). Integrado en
[PR #19](https://github.com/amariner/logic2b-ecom/pull/19), commit `1c801d8`, sin
despliegue. E2E 160/160,
navegador 120/120, ocho superficies a11y y hash de 143 tablas/353 filas son
evidencia heredada de R5.8b, no ejecuciones nuevas de R5.9a ni de R5.9b.

## Demo verificada

**R5.8b implementada y verificada, disponible en repo sin desplegar**, rama
`codex/markets-localized-content-demo`. Incluye la composición
`market-content-demo`, el componente `MarketContentDemo.astro` y la muestra
`/demo/admin/mercados`: mercados ES/FR, contenidos ES/CA publicados en los
fixtures, EN en borrador y FR ausente. La edición inglesa es solo en memoria;
el plan usa dominios `.test` sin enlaces, con reset y recarga al estado inicial.

La muestra exige simultáneamente manifest demo y `DEMO_MODE=true`; no habilita
API, DDL, CMS, persistencia ni edición o publicación editorial operativas.
Canonical, hreflang y sitemap se muestran como datos ilustrativos, sin cambiar
el SEO real. MKT-003/006/007 conservan estado parcial e instalada/inactiva.
Check final: 897 archivos sin diagnósticos, 227 suites/2.023 pruebas (24 del
modelo), build/guardas de 44 HTML/44 formularios; E2E nuevo 160/160.
[Navegador](../audits/r5-8b/report.json): 120/120 y ocho capturas, cero HTTP,
almacenamiento propio, beacons o errores del módulo; almacenamiento de la guía
existente separado. [A11y](../audits/r5-8b/a11y-report.json): ocho superficies
sin hallazgos. Revisión visual/código sin P1/P2. Base QA intacta: 143 tablas,
353 filas, SHA-256 antes/después
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Worker detenido; [informe agregado](../audits/r5-8b/verification-report.json).
Integrada en [PR #18](https://github.com/amariner/logic2b-ecom/pull/18), commit
`ec353f6`, sin despliegue.

## Último bloque verificado

**R5.8a implementado y verificado localmente**, rama `codex/localized-content-contract`:
[ADR-0047](adr/0047-contenido-localizado-urls.md), contrato editorial puro y
`planInternationalUrls` para canonical, hreflang y sitemap derivados de
revisiones publicadas explícitas. Fallback y tratamiento de traducciones
obsoletas se declaran; no convierten un idioma configurado en contenido publicado.
MKT-006/007 quedan parciales e instaladas/inactivas en avanzado y demo, con demo
visual verificada después en R5.8b. Check final de R5.8a: 893 archivos sin diagnósticos, 226 suites/1.999
pruebas, build y guardas de 44 HTML/44 formularios cerrados a envíos. Incluye
53 pruebas editoriales y 67 del planificador; revisión sin P1/P2 y perfil
hreflang contrastado (184 idiomas, 249 regiones, cinco scripts).
[Informe](../audits/r5-8a/verification-report.json). Integrado en
[PR #17](https://github.com/amariner/logic2b-ecom/pull/17), commit `6eadc3b`, sin
despliegue.

Catálogo Git/inyección y fixtures bastan: sin DDL, CMS, persistencia, editor
operativo, traducción externa, rutas ni endpoints. El plan no modifica HTML,
sitemap ni mapa de indexación servidos; `/demo/*` conserva noindex. Sin
activación ni despliegue.

Validado con check global, focales editoriales/SEO y revisión. El E2E 156/156
y hash QA 143 tablas/353 filas de PR #16 son evidencia heredada; no se presentan
como nuevas ejecuciones de R5.8a ni de R5.8b.

## Último contrato verificado

**R5.7a–b implementado y verificado en QA local**, en
`codex/market-context-contract`: contrato puro `defineMarketCatalog` /
`resolveMarket` y composición `market-pricing-context` en QA. El catálogo de
mercados es explícito, versionado en Git e inyectado, con moneda base. Este
corte no añade DDL, rutas, jobs, endpoints, FX, traducciones ni activación.
MKT-003 pasa a parcial e instalada/inactiva en el preset avanzado; la demo
visual de mercados se verifica después en R5.8b, sin despliegue.

Check global aprobado: 888 archivos sin diagnósticos, 224 suites/1.876 pruebas,
build y guardas de 44 HTML/44 formularios cerrados a envíos. Incluye 119 pruebas
del contrato y 25 de composición; revisión independiente sin P1/P2. Tipos
finales: 888 archivos sin errores/avisos/hints; E2E local: 156/156. Base QA
intacta: 143 tablas, 353 filas y SHA-256 antes/después
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Servidor detenido; [informe](../audits/r5-7/verification-report.json). Integrado
en [PR #16](https://github.com/amariner/logic2b-ecom/pull/16), commit `13cd79d`,
sin despliegue.

`defaultLocale` no acredita idiomas publicados; el fallback de contexto no
acredita disponibilidad de envío ni jurisdicción. Detalle en
[ADR-0046](adr/0046-contexto-de-mercados.md).

R5.8a aporta el contrato de contenido localizado y plan de URLs puros, y R5.8b
su demo integrada. R5.9a aporta el contrato de publicación por mercado y R5.9b
prepara su demo local, descrita arriba.
Los gates G3/G4 de uso real siguen pendientes y no bloquean el contrato puro.

## Último corte local

**R5.6d implementada y verificada, disponible en el repositorio sin despliegue.**
La muestra de `/demo/admin/segmentos` incluye 12 perfiles sintéticos, cuatro hechos, tres templates
y lotes de tres, con evaluación pura en el navegador sobre fixtures. No usa
API, cron ni persistencia.
CUS-009 conserva el estado parcial e instalada/inactiva operativamente, sin
habilitar flags, handlers ni jobs. R5.6d quedó integrada en
[PR #15](https://github.com/amariner/logic2b-ecom/pull/15), commit `71d5263`, sin
despliegue.

R5.6c.3 quedó integrado en [PR #14](https://github.com/amariner/logic2b-ecom/pull/14),
commit `9b3a8ab`, sin despliegue.

[Validación final](../audits/r5-6d/verification-report.json): 883 archivos sin
diagnósticos, 222 suites/1.730 pruebas, 44 HTML y 44 formularios cerrados a envíos;
E2E 156/156. [Navegador](../audits/r5-6d/report.json): 119/119 comprobaciones,
ocho capturas, incluido sin JavaScript, cero APIs, mutaciones, beacons y errores.
[Accesibilidad](../audits/r5-6d/a11y-report.json): ocho superficies a 1440/375,
estados inicial/completado/inválido y movimiento reducido, cero errores y avisos.
Base QA sin cambios: 143 tablas y 353 filas, SHA-256 antes/después
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.

## Documentos

- [`INVESTIGACION_EDICIONES_2022_2026.md`](INVESTIGACION_EDICIONES_2022_2026.md):
  lectura de las nueve ediciones, tendencias y consecuencias para el producto.
- [`MATRIZ_CAPACIDADES.md`](MATRIZ_CAPACIDADES.md): inventario canónico de
  dominios, capacidades, forma de entrega, prioridad y estado real.
- [`ESTADO_DOCUMENTAL.md`](ESTADO_DOCUMENTAL.md): traducción gobernada entre el
  estado técnico, la ruta de desarrollo y la comunicación a comercio/agencia.
- [`ROADMAP.md`](ROADMAP.md): orden de ejecución por bloques de una sesión,
  dependencias y criterios de cierre.
- [`WIKI_SEO.md`](WIKI_SEO.md): arquitectura editorial y técnica de la futura
  wiki pública de funcionalidades.
- [`arquitectura/README.md`](arquitectura/README.md): inventario real, mapa de
  módulos, dependencias permitidas y transición incremental fijados en R1.1.
- [`arquitectura/DEUDA.md`](arquitectura/DEUDA.md): allowlist exacta y bloques
  responsables de eliminarla.
- [`CREAR_MODULO_Y_JOB.md`](CREAR_MODULO_Y_JOB.md): recorrido operativo para
  declarar, componer, probar y documentar un módulo o trabajo nuevo.
- [`AUDITORIA_DEPENDENCIAS_R1.md`](AUDITORIA_DEPENDENCIAS_R1.md): inventario,
  imports y advisories del lockfile al cierre de R1.
- [`MODELO_TRANSACCIONAL_R2.md`](MODELO_TRANSACCIONAL_R2.md): ERD, invariantes,
  compatibilidad, backfills y ensayo de restore que gobiernan R2.2–R2.14.
- [`GUIA_MIGRACION_R2.md`](GUIA_MIGRACION_R2.md): secuencia expand-first,
  rehearsals, configuración, downgrade, restore y puerta futura de contracción
  consolidados en R2.14.
- [`adr/`](adr/): decisiones de arquitectura modular aceptadas y propuestas.
- [`sql/0004_event_outbox.proposed.sql`](sql/0004_event_outbox.proposed.sql):
  evidencia exacta de la propuesta R1.6 aprobada; la migración viva es
  [`../../migrations/0004_event_outbox.sql`](../../migrations/0004_event_outbox.sql).
- [`wiki/arquitectura-modular-ecommerce.md`](wiki/arquitectura-modular-ecommerce.md):
  borrador interno, no indexable, de la futura página de arquitectura.
- [`wiki/eventos-de-dominio-trazabilidad.md`](wiki/eventos-de-dominio-trazabilidad.md):
  borrador interno, no indexable, de la futura página de eventos y trazabilidad
  (R1.5–R1.7); la capacidad ya es operativa, publicación editorial pendiente.
- [`wiki/auditoria-operaciones-ecommerce.md`](wiki/auditoria-operaciones-ecommerce.md):
  borrador interno R1.8 sobre evidencia transaccional redactada y sin export
  desde el Worker público.
- [`OPERACION_OBSERVABILIDAD.md`](OPERACION_OBSERVABILIDAD.md): runbook R1.9
  para correlacionar checkout, webhook, outbox y email sin PII.
- [`OPERACION_SEGMENTACION.md`](OPERACION_SEGMENTACION.md): políticas de hechos,
  captura consistente, cálculos versionados y restore de R5.6; capacidad
  instalada e inactiva, activación pendiente y demo visual R5.6d verificada
  en el repositorio, sin despliegue.
- [`EJECUCION_SEGMENTACION.md`](EJECUCION_SEGMENTACION.md): coordinador interno
  implementado, reanudación por revisión y publicación explícita de R5.6c.2.
- [`PROPUESTA_EJECUCION_SEGMENTACION.md`](PROPUESTA_EJECUCION_SEGMENTACION.md):
  alcance de R5.6c.3 implementado con autorización local: 0046, políticas,
  planes, intenciones y backup 39 verificados en QA sintética; sin activación.
- [`wiki/observabilidad-operativa-ecommerce.md`](wiki/observabilidad-operativa-ecommerce.md):
  borrador interno R1.9; no promete alertas hasta que R11.5 las implemente.
- [`wiki/integraciones-observables.md`](wiki/integraciones-observables.md):
  borrador interno R1.10; distingue registro/health local de panel, replay y
  sondeos remotos todavía pendientes.
- [`wiki/nucleo-transaccional-ecommerce.md`](wiki/nucleo-transaccional-ecommerce.md):
  borrador interno actualizado en R2.13; variantes, ledgers, fulfillment y
  cancelación parcial tienen evidencia local/remota, con publicación editorial aún pendiente.
- [`adr/0011-jobs-duraderos-d1.md`](adr/0011-jobs-duraderos-d1.md): contrato
  R1.11 de identidad, lock, timeout, retry, dead-letter y replay sobre D1.
- [`adr/0012-modelo-transaccional-r2.md`](adr/0012-modelo-transaccional-r2.md):
  decisión de separación de producto/variante, inventario, pago, reembolso y
  fulfillment mediante transición incremental.
- [`../../migrations/0007_product_variants.sql`](../../migrations/0007_product_variants.sql):
  esquema aditivo R2.2, backfill default 1:1 y snapshots compatibles de línea.
- [`../../migrations/0008_product_media_attributes.sql`](../../migrations/0008_product_media_attributes.sql):
  esquema aditivo R2.5 para galería y atributos tipados con backfill de imagen.
- [`../../migrations/0009_inventory_ledger.sql`](../../migrations/0009_inventory_ledger.sql):
  ledger R2.7, balance por variante y apertura determinista desde stock legacy.
- [`adr/0014-ledger-inventario-global.md`](adr/0014-ledger-inventario-global.md):
  diseño R2.6 de movimientos, balances, concurrencia, backfill y reservas.
- [`sql/0009_inventory_ledger.proposed.sql`](sql/0009_inventory_ledger.proposed.sql):
  propuesta R2.6 conservada como evidencia; la migración viva es `0009`.
- [`sql/0010_inventory_reservations.proposed.sql`](sql/0010_inventory_reservations.proposed.sql):
  propuesta R2.6 conservada como evidencia; la migración viva R2.8 es `0010`.
- [`../../migrations/0011_payment_ledger.sql`](../../migrations/0011_payment_ledger.sql):
  esquema aditivo R2.9 para intención, asiento financiero y reembolso.
- [`OPERACION_LEDGER_PAGOS.md`](OPERACION_LEDGER_PAGOS.md): rehearsal,
  backfill por moneda, corte coordinado, rollback y recuperación R2.9.
- [`OPERACION_REEMBOLSOS.md`](OPERACION_REEMBOLSOS.md): contrato operativo,
  estados, retry/reconciliación y separación dinero-stock de R2.10.
- [`../../migrations/0012_fulfillment_lines.sql`](../../migrations/0012_fulfillment_lines.sql):
  esquema aditivo R2.11 de grupos y cantidades por línea.
- [`../../migrations/0013_partial_refund_guards.sql`](../../migrations/0013_partial_refund_guards.sql):
  esquema aditivo R2.13 que tipa la operación y reserva cantidades cancelables;
  materializado, ensayado y aplicado local/remotamente el 2026-08-12.
- [`adr/0017-indice-pedidos-cursor-fts.md`](adr/0017-indice-pedidos-cursor-fts.md):
  contrato R3.1 de cursor bidireccional, orden estable, filtros y búsqueda FTS.
- [`../../migrations/0014_order_list_indexes.sql`](../../migrations/0014_order_list_indexes.sql):
  índices compuestos y proyección FTS5 sincronizada del índice de pedidos.
- [`OPERACION_INDICE_PEDIDOS.md`](OPERACION_INDICE_PEDIDOS.md): preflight,
  planes de consulta, backup esquema 8, rollout y rollback compatibles.
- [`adr/0018-colaboracion-pedidos-timeline.md`](adr/0018-colaboracion-pedidos-timeline.md):
  separación entre hechos transaccionales y colaboración versionada R3.2.
- [`../../migrations/0015_order_collaboration.sql`](../../migrations/0015_order_collaboration.sql):
  notas/revisiones, etiquetas/asignaciones y actividad colaborativa aditivas.
- [`OPERACION_COLABORACION_PEDIDOS.md`](OPERACION_COLABORACION_PEDIDOS.md):
  preflight, concurrencia, backup esquema 9, rollout y rollback compatibles.
- [`adr/0019-edicion-segura-pedidos.md`](adr/0019-edicion-segura-pedidos.md):
  versión de pedido, cobro adicional, reembolso por captura y stock de R3.3.
- [`adr/0021-acciones-masivas-seguras.md`](adr/0021-acciones-masivas-seguras.md):
  selección congelada, preview sin efectos y replay por pedido de R3.5.
- [`../../migrations/0018_order_bulk_actions.sql`](../../migrations/0018_order_bulk_actions.sql):
  lotes tipados y selección/resultados congelados por pedido.
- [`OPERACION_ACCIONES_MASIVAS_PEDIDOS.md`](OPERACION_ACCIONES_MASIVAS_PEDIDOS.md):
  rehearsal, rollout, reanudación, purga y rollback expand-only de R3.5.
- [`adr/0022-ubicaciones-inventario.md`](adr/0022-ubicaciones-inventario.md):
  ubicación principal, backfill y transición compatible del ledger global.
- [`../../migrations/0019_inventory_locations.sql`](../../migrations/0019_inventory_locations.sql):
  ubicaciones, balances/movimientos proyectados y triggers de compatibilidad.
- [`OPERACION_UBICACIONES_INVENTARIO.md`](OPERACION_UBICACIONES_INVENTARIO.md):
  rehearsal, rollout, reconciliación y rollback de R3.6.
- [`adr/0023-transferencias-inventario.md`](adr/0023-transferencias-inventario.md):
  agregado versionado, stock en tránsito y compatibilidad de la principal R3.7.
- [`../../migrations/0020_inventory_transfers.sql`](../../migrations/0020_inventory_transfers.sql):
  borradores, líneas, recibos parciales y enlaces al ledger por ubicación.
- [`OPERACION_TRANSFERENCIAS_INVENTARIO.md`](OPERACION_TRANSFERENCIAS_INVENTARIO.md):
  ensayo, rollout, reconciliación, incidencias y rollback expand-only R3.7.
- [`adr/0024-conteos-ajustes-inventario.md`](adr/0024-conteos-ajustes-inventario.md):
  foto versionada, doble control y corrección append-only de R3.8.
- [`../../migrations/0021_inventory_counts.sql`](../../migrations/0021_inventory_counts.sql):
  sesiones, líneas congeladas y enlaces de ajuste al ledger por ubicación.
- [`OPERACION_CONTEOS_INVENTARIO.md`](OPERACION_CONTEOS_INVENTARIO.md):
  ensayo, rollout, reconciliación, incidencias y rollback expand-only R3.8.
- [`adr/0025-asignacion-inventario.md`](adr/0025-asignacion-inventario.md):
  selección determinista y traslado contable sin doble consumo de R3.9.
- [`../../migrations/0022_inventory_allocation.sql`](../../migrations/0022_inventory_allocation.sql):
  políticas versionadas, explicación vinculada y enlaces de movimiento.
- [`OPERACION_ASIGNACION_INVENTARIO.md`](OPERACION_ASIGNACION_INVENTARIO.md):
  ensayo, rollout, reconciliación, incidencias y rollback expand-only R3.9.
- [`adr/0026-devoluciones-rma.md`](adr/0026-devoluciones-rma.md):
  logística inversa separada y cierre transaccional de R3.10.
- [`../../migrations/0023_returns_rma.sql`](../../migrations/0023_returns_rma.sql):
  expedientes RMA, recepción, inspección, movimientos y cambios pendientes.
- [`OPERACION_DEVOLUCIONES_RMA.md`](OPERACION_DEVOLUCIONES_RMA.md):
  ensayo, rollout, conciliación, incidencias y rollback de devoluciones.
- [`../../migrations/0044_customer_return_requests.sql`](../../migrations/0044_customer_return_requests.sql):
  selector público y evidencia owner-only expand-only para solicitudes de cliente.
- [`OPERACION_AUTOSERVICIO_DEVOLUCIONES.md`](OPERACION_AUTOSERVICIO_DEVOLUCIONES.md):
  frontera CUS-005/FUL-010, invariantes, rehearsal, reconciliación y rollback R5.5g.
- [`adr/0027-documentos-operativos-no-fiscales.md`](adr/0027-documentos-operativos-no-fiscales.md):
  snapshots logísticos propios y frontera explícita con la emisión fiscal externa.
- [`../../migrations/0024_order_documents.sql`](../../migrations/0024_order_documents.sql):
  plantillas, versiones, artefactos, referencias externas, eventos y guardas de alcance.
- [`OPERACION_DOCUMENTOS_PEDIDO.md`](OPERACION_DOCUMENTOS_PEDIDO.md):
  rehearsal, rollout, reconciliación, incidencias y rollback documental R3.11.
- [`GUIA_OPERACION_R3.md`](GUIA_OPERACION_R3.md): corte `0014`–`0024`,
  reconciliación, matriz de incidencias, recuperación y evidencia vertical R3.12.
- [`wiki/operacion-pedidos-inventario-devoluciones.md`](wiki/operacion-pedidos-inventario-devoluciones.md):
  ficha operativa enlazada por pedidos, inventario y fulfillment; solo enumera
  capacidades actuales y conserva fuera las parciales, conectores y pendientes.
- [`adr/0028-motor-reglas-precio.md`](adr/0028-motor-reglas-precio.md):
  evaluación pura por contexto, prioridad estable y snapshot auditable por línea.
- [`../../migrations/0025_price_rule_snapshots.sql`](../../migrations/0025_price_rule_snapshots.sql):
  expansión compatible del precio base y desglose congelado de cada línea.
- [`OPERACION_REGLAS_PRECIO.md`](OPERACION_REGLAS_PRECIO.md): rehearsal,
  rollout, reconciliación y rollback expand-only del motor R4.1.
- [`wiki/reglas-precio-trazables.md`](wiki/reglas-precio-trazables.md):
  ficha interna enlazada solo desde `pricing`, sin ruta pública ni promesas de
  códigos, campañas o combinabilidad todavía inexistentes.
- [`adr/0029-codigos-promocionales-seguros.md`](adr/0029-codigos-promocionales-seguros.md):
  lookup sin texto claro, límites concurrentes y uso ligado al pedido R4.2.
- [`../../migrations/0026_promotion_codes.sql`](../../migrations/0026_promotion_codes.sql):
  configuración, scopes y reservas/consumos promocionales expand-only.
- [`OPERACION_CODIGOS_PROMOCIONALES.md`](OPERACION_CODIGOS_PROMOCIONALES.md):
  alta segura, rollout, reconciliación, incidencias y rollback de `PRC-004`.
- [`wiki/codigos-promocionales-seguros.md`](wiki/codigos-promocionales-seguros.md):
  ficha interna honesta sobre códigos, sin editor visual ni ruta pública.
- [`adr/0030-descuentos-automaticos-y-precedencia.md`](adr/0030-descuentos-automaticos-y-precedencia.md):
  campaña automática única, motivo público y precedencia global de código.
- [`../../migrations/0027_automatic_discounts.sql`](../../migrations/0027_automatic_discounts.sql):
  configuración, scopes, aplicación por pedido y guardas de fuente expand-only.
- [`OPERACION_DESCUENTOS_AUTOMATICOS.md`](OPERACION_DESCUENTOS_AUTOMATICOS.md):
  rollout, matriz, reconciliación, incidencias y rollback de `PRC-005`.
- [`wiki/descuentos-automaticos-trazables.md`](wiki/descuentos-automaticos-trazables.md):
  ficha interna de campañas y límites actuales, sin editor ni ruta pública.
- [`adr/0031-ofertas-cantidad-x-y.md`](adr/0031-ofertas-cantidad-x-y.md):
  tramos, selección X/Y, redondeo a favor del comprador y precio congelado.
- [`../../migrations/0028_quantity_offers.sql`](../../migrations/0028_quantity_offers.sql):
  configuración, tramos/scopes, aplicación por pedido y guardas de evidencia.
- [`OPERACION_OFERTAS_CANTIDAD.md`](OPERACION_OFERTAS_CANTIDAD.md):
  rollout, reconciliación, incidencias y rollback de `PRC-006/007`.
- [`wiki/ofertas-cantidad-x-y.md`](wiki/ofertas-cantidad-x-y.md):
  ficha interna de capacidad y límites actuales, sin combinabilidad ni editor.
- [`adr/0032-combinabilidad-explicita-descuentos.md`](adr/0032-combinabilidad-explicita-descuentos.md):
  matrices de fuentes/clases, tope agregado y aplicación canónica por pedido.
- [`../../migrations/0029_discount_combinations.sql`](../../migrations/0029_discount_combinations.sql):
  políticas, pares, aplicaciones y guardas de snapshot combinado.
- [`OPERACION_COMBINACION_DESCUENTOS.md`](OPERACION_COMBINACION_DESCUENTOS.md):
  rollout, reconciliación, incidencias y rollback de `PRC-008`.
- [`wiki/combinacion-descuentos-explicita.md`](wiki/combinacion-descuentos-explicita.md):
  ficha interna honesta sobre combinabilidad y límites actuales.
- [`adr/0033-listas-precios-contextuales.md`](adr/0033-listas-precios-contextuales.md):
  precio base contextual, identidad servidor y fallback por producto.
- [`../../migrations/0030_contextual_price_lists.sql`](../../migrations/0030_contextual_price_lists.sql):
  listas, scopes de producto/empresa y aplicaciones verificadas por pedido.
- [`OPERACION_LISTAS_PRECIOS.md`](OPERACION_LISTAS_PRECIOS.md):
  rollout, rehearsal, diagnóstico, rollback y reconciliación de `PRC-009`.
- [`wiki/listas-precios-contextuales.md`](wiki/listas-precios-contextuales.md):
  precedencia, trazabilidad y límites actuales de las listas contextuales.
- [`adr/0034-bundles-composicion-congelada.md`](adr/0034-bundles-composicion-congelada.md):
  unidad comercial, composición congelada e inventario por componentes.
- [`../../migrations/0031_bundles.sql`](../../migrations/0031_bundles.sql):
  definición fija/configurable, composición de pedido, aplicación y vínculos RMA.
- [`OPERACION_BUNDLES.md`](OPERACION_BUNDLES.md):
  rollout, rehearsal, diagnóstico, reconciliación y rollback de `PRC-012`.
- [`wiki/bundles-componentes.md`](wiki/bundles-componentes.md):
  recorrido funcional, trazabilidad y límites actuales de bundles.
- [`adr/0035-valor-almacenado-ledger.md`](adr/0035-valor-almacenado-ledger.md):
  saldo proyectado desde ledger, código hasheado, pago mixto y devolución al
  medio original de `PRC-010/011`.
- [`../../migrations/0032_stored_value.sql`](../../migrations/0032_stored_value.sql):
  expansión compatible de cuentas, reservas, aplicaciones, reembolsos y ledger.
- [`OPERACION_VALOR_ALMACENADO.md`](OPERACION_VALOR_ALMACENADO.md):
  rehearsal, rollout, reconciliación, incidencias y rollback de valor almacenado.
- [`wiki/tarjetas-regalo-credito-tienda.md`](wiki/tarjetas-regalo-credito-tienda.md):
  alcance, pago mixto y puertas legales por proyecto sin promesas públicas.
- [`adr/0036-preventa-backorder-compromiso.md`](adr/0036-preventa-backorder-compromiso.md):
  promesa versionada, cupo diferido, asignación FIFO y stock físico innegociable.
- [`../../migrations/0033_preorders_backorders.sql`](../../migrations/0033_preorders_backorders.sql):
  políticas, compromisos, eventos y asignaciones expand-only de `PRC-014`.
- [`OPERACION_PREVENTA_BACKORDER.md`](OPERACION_PREVENTA_BACKORDER.md):
  rollout, reconciliación, incidencias y rollback de preventa/backorder.
- [`wiki/preventa-backorder-explicita.md`](wiki/preventa-backorder-explicita.md):
  recorrido y límites honestos del modelo de venta diferida.
- [`adr/0037-suscripciones-adaptador-verificado.md`](adr/0037-suscripciones-adaptador-verificado.md):
  puerto neutral, hechos verificados, estados, impago y portal alojado.
- [`../../migrations/0034_provider_subscriptions.sql`](../../migrations/0034_provider_subscriptions.sql):
  planes, proyección, inbox idempotente, eventos y ciclos expand-only.
- [`OPERACION_SUSCRIPCIONES.md`](OPERACION_SUSCRIPCIONES.md):
  rollout, reconciliación, incidencias y rollback de `PRC-013`.
- [`wiki/suscripciones-por-adaptador.md`](wiki/suscripciones-por-adaptador.md):
  recorrido funcional y fronteras de seguridad/comercio de R4.10.
- [`adr/0038-presupuestos-depositos-transiciones-explicitas.md`](adr/0038-presupuestos-depositos-transiciones-explicitas.md):
  contrato R4.11 de borrador, vigencia, depósito/saldo, enlace alojado y
  conversión explícita implementado localmente.
- [`../../migrations/0035_preliminary_orders_deposits.sql`](../../migrations/0035_preliminary_orders_deposits.sql):
  presupuestos, líneas, enlaces, pagos y eventos expand-only de R4.11.
- [`OPERACION_PRESUPUESTOS_DEPOSITOS.md`](OPERACION_PRESUPUESTOS_DEPOSITOS.md):
  rollout, conciliación, incidencias y rollback de `ORD-008`/`CHK-011`.
- [`wiki/presupuestos-depositos.md`](wiki/presupuestos-depositos.md):
  recorrido funcional y fronteras de dinero, inventario y seguridad.
- [`MATRIZ_MODELOS_VENTA_R4.md`](MATRIZ_MODELOS_VENTA_R4.md):
  contrato ejecutable de los once modelos, sus 66 parejas y evidencia durable.
- [`wiki/modelos-venta-r4.md`](wiki/modelos-venta-r4.md):
  índice funcional de R4 y orden común de precio, descuento, venta y pago.
- [`adr/0039-perfil-cliente-identidad-opaca.md`](adr/0039-perfil-cliente-identidad-opaca.md):
  identidad HMAC, guest checkout, revisiones de dirección, merge explícito y
  snapshots históricos inmutables de R5.1.
- [`adr/0040-consentimiento-evidencia-versionada.md`](adr/0040-consentimiento-evidencia-versionada.md):
  alcance por canal/finalidad, grant explícito, retirada append-only,
  preferencia separada y frontera de comunicaciones transaccionales de R5.2.
- [`adr/0041-derechos-datos-plan-verificable.md`](adr/0041-derechos-datos-plan-verificable.md):
  solicitud verificada, plan dry-run por propietario, fingerprint, doble
  control y frontera explícita entre persistencia y ejecución de R5.3.
- [`../../migrations/0038_data_rights_evidence.sql`](../../migrations/0038_data_rights_evidence.sql):
  evidencia por solicitud, decisiones y referencias opacas normalizadas con
  guards de versión, contexto, tiempo e inmutabilidad.
- [`OPERACION_DERECHOS_DATOS.md`](OPERACION_DERECHOS_DATOS.md): rehearsal,
  concurrencia, backup 32, gates de activación, reconciliación y rollback.
- [`adr/0042-autenticacion-passwordless-revocable.md`](adr/0042-autenticacion-passwordless-revocable.md):
  identidad autenticable separada, challenge de un uso, sesión opaca rotatoria,
  revocación, scopes mínimos y threat model anti-enumeración de R5.4a.
- [`adr/0043-superficie-passwordless-email-segura.md`](adr/0043-superficie-passwordless-email-segura.md):
  contrato R5.4c–d de magic link por Resend directo, orden
  `prepare → persist → deliver`, origen/cookie/CSRF/CSP, rate limit por capas y
  recuperación sin bypass; proveedor, HTTP/UI y gates durables implementados
  localmente sin activar la demo.
- [`adr/0044-ownership-recursos-autoservicio.md`](adr/0044-ownership-recursos-autoservicio.md):
  autenticación, permiso y owner separados; scopes mínimos, referencias opacas,
  CAS transaccional y forma pública anti-enumeración para pedidos, RMA y
  direcciones.
- [`../../migrations/0039_customer_passwordless_auth.sql`](../../migrations/0039_customer_passwordless_auth.sql):
  identidades, challenges y familias/sesiones expand-only de R5.4b.
- [`../../migrations/0040_customer_passwordless_security.sql`](../../migrations/0040_customer_passwordless_security.sql):
  throttle efímero, confirmación de entrega, auditoría/revocación y transición
  durable fail-closed de `CUS-003`, sin activar la capacidad al aplicarla.
- [`../../migrations/0041_customer_order_access.sql`](../../migrations/0041_customer_order_access.sql):
  referencia pública aleatoria y versión de ownership por pedido, backfill sin
  reclamar historia guest y generación atómica para altas nuevas; backup 34,
  authorizer y lectura HTTP owner-only instalados sin activar `CUS-004`.
- [`../../src/pages/api/customer/orders/[ref].ts`](../../src/pages/api/customer/orders/[ref].ts):
  detalle mínimo por referencia opaca con sesión, capability, scope y owner
  exactos; respuesta 404 uniforme, cache privada y telemetría sin PII.
- [`../../src/pages/cuenta/pedidos/index.astro`](../../src/pages/cuenta/pedidos/index.astro):
  historial SSR paginado por cursor owner-only, con vacío/error, navegación y
  detalle responsive sin JavaScript; permanece ausente con `CUS-004 installed`.
- [`../../scripts/audit-customer-account-local.mjs`](../../scripts/audit-customer-account-local.mjs):
  arnés cliente aislado de cuenta, historial y seguimiento; comprueba demo,
  preflight, HTTP y a11y 1440/375 sin DB, secretos ni proveedor en el modo visual.
- [`OPERACION_PASSWORDLESS.md`](OPERACION_PASSWORDLESS.md): rehearsal, backup
  33, concurrencia, transporte fragmento→POST, preflight/activación aislados,
  reconciliación, recuperación y rollback de R5.4d.
- [`../../migrations/0037_consent_evidence.sql`](../../migrations/0037_consent_evidence.sql):
  evidencia versionada, índices por sujeto/alcance y guards de append/retirada.
- [`OPERACION_CONSENTIMIENTOS.md`](OPERACION_CONSENTIMIENTOS.md): rollout,
  reconciliación, backup 31, rehearsal y rollback de `CUS-007`.
- [`../../migrations/0036_customer_profiles.sql`](../../migrations/0036_customer_profiles.sql):
  perfiles, revisiones, merges y relación nullable de pedido expand-only.
- [`OPERACION_PERFILES_CLIENTE.md`](OPERACION_PERFILES_CLIENTE.md): rehearsal,
  activación, reconciliación, secreto por despliegue y rollback de `CUS-002`.
- [`../../migrations/0016_order_amendments.sql`](../../migrations/0016_order_amendments.sql):
  expansión de cantidades vigentes, amendments y asignaciones financieras.
- [`OPERACION_EDICION_PEDIDOS.md`](OPERACION_EDICION_PEDIDOS.md):
  preflight, rehearsal, conciliación, backup esquema 10 y rollback de R3.3.
- [`OPERACION_INCIDENCIAS_PEDIDOS.md`](OPERACION_INCIDENCIAS_PEDIDOS.md):
  holds múltiples, SLA, guard de preparación, rehearsal, backup esquema 11 y rollback de R3.4.
- [`../../src/modules/orders/domain/order-bulk-action.ts`](../../src/modules/orders/domain/order-bulk-action.ts):
  contrato puro R3.5 de límites, fingerprints, elegibilidad, progreso e idempotencia por fila.
- [`OPERACION_FULFILLMENT_LINEAS.md`](OPERACION_FULFILLMENT_LINEAS.md):
  preflight, backfill, replay, restore, corte R2.11 y operación parcial R2.12.
- [`../../scripts/rehearse-r2-fulfillment-lines.mjs`](../../scripts/rehearse-r2-fulfillment-lines.mjs):
  rehearsal aislado que compara hashes legacy y canónico sin imprimir PII.
- [`../../scripts/rehearse-r2-partial-refunds.mjs`](../../scripts/rehearse-r2-partial-refunds.mjs):
  rehearsal aislado de `0013`, guardas de pertenencia/cantidad y dump/restore.
- [`../../src/modules/payments/`](../../src/modules/payments/): contrato puro y
  adaptador D1 de intención, captura, cancelación financiera y reembolso total
  o por cantidades.
- [`../../src/modules/inventory/domain/inventory-ledger.ts`](../../src/modules/inventory/domain/inventory-ledger.ts):
  razones, direcciones, transiciones y guarda optimista del ledger.
- [`../../src/modules/inventory/infrastructure/d1-inventory-ledger.ts`](../../src/modules/inventory/infrastructure/d1-inventory-ledger.ts):
  unidad D1 versionada para balance, movimiento y espejo default.
- [`../../scripts/rehearse-r2-product-variants.mjs`](../../scripts/rehearse-r2-product-variants.mjs):
  preflight, forward, reconciliación legacy y restore aislado de R2.2.
- [`../../scripts/rehearse-r2-media-attributes.mjs`](../../scripts/rehearse-r2-media-attributes.mjs):
  preflight, hashes, forward y restore aislado de media/atributos R2.5.
- [`../../scripts/rehearse-r2-inventory-ledger.mjs`](../../scripts/rehearse-r2-inventory-ledger.mjs):
  preflight, reconciliación y dump/restore aislado del ledger R2.7.
- [`../../scripts/rehearse-r2-inventory-reservations.mjs`](../../scripts/rehearse-r2-inventory-reservations.mjs):
  forward, hashes y dump/restore aislado de reservas R2.8.
- [`../../src/modules/inventory/infrastructure/d1-inventory-reservations.ts`](../../src/modules/inventory/infrastructure/d1-inventory-reservations.ts):
  alta, consumo, liberación y expiración versionados por variante.
- [`../../src/modules/catalog/domain/product.ts`](../../src/modules/catalog/domain/product.ts):
  agregado R2.3 de producto editorial, variante vendible, opciones y guardas.
- [`../../src/modules/catalog/infrastructure/d1-catalog-repository.ts`](../../src/modules/catalog/infrastructure/d1-catalog-repository.ts):
  lector canónico D1 y proyección temporal de disponibilidad legacy.
- [`../../src/modules/catalog/application/catalog-reader.ts`](../../src/modules/catalog/application/catalog-reader.ts):
  rollout reversible `legacy|shadow|variant` y comparación bloqueante.
- [`../../src/composition/admin-operations.ts`](../../src/composition/admin-operations.ts):
  casos de uso R2.4–R2.5 para variantes, media y atributos con validación.
- [`../../src/platform/operations/infrastructure/d1-catalog-variant-audit.ts`](../../src/platform/operations/infrastructure/d1-catalog-variant-audit.ts):
  unidades D1 optimistas que confirman configuración y evidencia en una batch.
- [`../../src/platform/operations/infrastructure/d1-catalog-content-audit.ts`](../../src/platform/operations/infrastructure/d1-catalog-content-audit.ts):
  unidades auditadas de media/atributos, orden y sincronización del espejo.
- [`../../src/pages/demo/admin/productos/[id].astro`](../../src/pages/demo/admin/productos/[id].astro):
  editor de combinaciones condicionado por capacidad y de solo lectura en demo.
- [`wiki/productos-variantes-opciones.md`](wiki/productos-variantes-opciones.md):
  borrador interno R2.3; no publicable hasta completar escritura e inventario.
- [`../../platform.config.ts`](../../platform.config.ts): manifest del
  despliegue actual, basado en un preset técnico y sin valores secretos.
- [`../../src/platform/configuration/`](../../src/platform/configuration/):
  contrato ejecutable de estados, flags, dependencias, presets y política de
  acceso a rutas/navegación R1.2–R1.3.
- [`../../src/platform/configuration/module-registry.ts`](../../src/platform/configuration/module-registry.ts):
  registro canónico R1.4, validación de invariantes y resolución de módulos
  operativos por despliegue.
- [`../../src/composition/runtime-platform.ts`](../../src/composition/runtime-platform.ts):
  fachada única que conecta el manifest del despliegue con Astro.
- [`../../src/shared-kernel/events.ts`](../../src/shared-kernel/events.ts):
  sobre de evento versionado R1.5 —identidad, actor, entidad, correlación,
  causación e idempotencia— sin PII, sin configuración y sin I/O.
- [`../../src/platform/events/outbox-contract.ts`](../../src/platform/events/outbox-contract.ts):
  contrato ejecutable de estados, lease, lotes, retry y claim.
- [`../../src/platform/events/d1-event-outbox-repository.ts`](../../src/platform/events/d1-event-outbox-repository.ts):
  claim, recuperación de lease, retry/dead-letter, replay y retención D1.
- [`../../src/composition/outbox-dispatcher.ts`](../../src/composition/outbox-dispatcher.ts):
  dispatcher que materializa cada efecto y su ACK en una única batch.
- [`../../src/composition/order-operations.ts`](../../src/composition/order-operations.ts):
  casos de uso compuestos de escritura de pedido; único punto que une el hecho
  que emite `orders` con el consumidor de `notifications`.
- [`../../src/shared-kernel/audit.ts`](../../src/shared-kernel/audit.ts):
  contrato de diff con allowlist, denylist de PII y límites estrictos.
- [`../../src/platform/operations/infrastructure/d1-audit-log.ts`](../../src/platform/operations/infrastructure/d1-audit-log.ts):
  persistencia atómica de evidencia sin lecturas ni export HTTP.
- [`../../src/platform/operations/application/observability.ts`](../../src/platform/operations/application/observability.ts):
  contrato cerrado de métricas y errores operativos sin campos arbitrarios.
- [`../../src/platform/operations/infrastructure/console-observability.ts`](../../src/platform/operations/infrastructure/console-observability.ts):
  adaptador JSON a Workers Logs; no usa D1 ni expone endpoint.
- [`../../src/integrations/registry.ts`](../../src/integrations/registry.ts):
  registro R1.10 de Stripe, Resend y CSV con healthchecks y snapshots sin
  secretos, persistencia o superficie HTTP.
- [`../../src/platform/jobs/`](../../src/platform/jobs/): registro, contrato,
  repositorio D1 y runner R1.11 para ejecuciones únicas o recurrentes.
- [`../../src/composition/job-runner.ts`](../../src/composition/job-runner.ts):
  conecta los Cron Triggers con el refresco semanal y acotado de pedidos demo
  y el outbox cliente según manifest, sin rutas ni configuración visible.
- [`../../src/composition/demo-catalog.ts`](../../src/composition/demo-catalog.ts):
  conecta los fixtures versionados con el catálogo público simulado sin que el
  runtime importe seeds.

## Reglas de verdad

- El estado de una capacidad lo manda `MATRIZ_CAPACIDADES.md`, no el copy.
- La explicación para comercio y agencias parte de
  [`../CAPACIDADES_CLIENTE.md`](../CAPACIDADES_CLIENTE.md) y usa el mapeo de
  [`ESTADO_DOCUMENTAL.md`](ESTADO_DOCUMENTAL.md); nunca sustituye a la matriz.
- La próxima sesión la manda la última sección canónica «Siguiente bloque» de
  `ROADMAP.md`; la sección numerada 13 conserva solo el historial R2/R3. El
  estado integrado se replica en `../ROADMAP.md` bajo «Próxima sesión».
- Una página pública nunca puede decir «disponible» si no existe una prueba
  automatizada y una ruta operativa real.
- «Integrable» exige contrato, tratamiento de errores, reintentos, trazabilidad
  y procedimiento de desconexión; una mención comercial no basta.
- «A medida» describe una capacidad de servicio, no una función ya construida.
- Cada módulo nuevo debe poder permanecer desactivado sin añadir navegación,
  tablas inútiles, JavaScript ni carga cognitiva a un cliente que no lo use.

## Identificadores y estados

Cada capacidad usa un identificador estable `DOM-NNN`, por ejemplo `ORD-010`.
Los estados permitidos son:

| Estado | Significado verificable |
|---|---|
| `actual` | Funciona hoy en el motor real y está cubierto por pruebas. |
| `parcial` | Existe una base útil, pero falta parte del resultado prometido. |
| `especificado` | Contrato y criterios escritos; aún no debe venderse como disponible. |
| `pendiente` | Capacidad identificada, todavía sin especificación ejecutable. |
| `conector` | Se resuelve integrando un proveedor; requiere adaptador operativo. |
| `gestionado` | Lo ejecuta el equipo como servicio o desarrollo por proyecto. |
| `excluido` | No se construirá como producto propio salvo nueva decisión estratégica. |

## Definición de paridad

La plataforma alcanza paridad para un caso de negocio cuando se cumplen las
cinco condiciones siguientes:

1. El resultado se resuelve de extremo a extremo por una vía documentada.
2. Dinero, stock, impuestos y permisos se deciden en servidor.
3. Existe recuperación ante duplicados, fallos parciales y reintentos.
4. El comercio solo ve las acciones que realmente necesita.
5. La wiki explica con precisión qué hace Logic2B, qué hace un tercero y qué se
   configura a medida.

La cantidad bruta de botones o ajustes nunca es una métrica de paridad.

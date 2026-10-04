# Matriz canónica de capacidades

> Inventario vivo. Fecha base: **2026-08-06**. Una fila expresa un resultado
> comprobable, no una pantalla ni un argumento comercial.

## Cómo leerla

- **P0** protege dinero, datos y arquitectura; bloquea el resto.
- **P1** completa una operación ecommerce profesional.
- **P2** habilita crecimiento o un segmento concreto.
- **P3** es especialización, escala avanzada o ventaja futura.
- **Vía** indica `núcleo`, `módulo`, `conector`, `gestionado` o `excluido`.
- **Estado** usa el vocabulario definido en [`README.md`](README.md).

La prioridad no autoriza activación automática. Cada cliente recibe solo lo que
su alcance requiera.

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
integración pendiente y sin despliegue.**
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
R6.5c está verificada localmente y disponible en repo, con integración pendiente y sin despliegue.

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
El workflow humano R6.5b está verificado localmente, integrado en PR #37 (`16caef3`); la demo visual R6.5c está verificada localmente, con integración pendiente y sin despliegue.

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
**Implementada y verificada localmente, disponible en repo; integración
pendiente y sin despliegue.** Check 985 archivos/261 suites/3.694 pruebas,
41 del modelo y revisión independiente 129.333 sin P1/P2; navegador 6.368/108
visitas principales, ocho superficies a11y sin hallazgos, ocho PNG aprobadas,
E2E nuevo 192/192 y hash QA de 143 tablas/353 filas intacto. Cliente real tres archivos
46.662 B/13.177 gzip; guía medida aparte. [Informe final](../audits/r6-5c/verification-report.json).
Sin autorización comercial, DDL, reserva ni cambios de checkout/ledger.

**Siguiente: R6.6a, solicitud B2B y revisiones completas de oferta con fixtures.**
Diseño exacto revisado y pendiente de implementación: solicitud sin dinero,
contexto íntegro de empresa/contacto/catálogo y ofertas EUR declaradas con
historial inmutable y comparación estructural. Una variante explícita por
producto, 1–100 líneas, unidades 1–10.000 y total positivo hasta 1.000.000.000
céntimos calculado con BigInt; caducidad propia de cada revisión, sin lifecycle
comercial. No hereda aceptación, pagos o revisión de crédito al cambiar contexto.
R6.6b compondrá después con ORD-008 existente y R6.6c aportará demo: ninguna
conversión de pedido, reserva o cobro se declara implementada por este diseño.


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

**R6.2a implementado y verificado localmente**, rama
`codex/company-catalog-contract`, integrado en PR #29 (`4d7a30a9`),
sin despliegue.
[ADR-0053](adr/0053-catalogos-empresa-fixture.md), contrato fixture de catálogos
de empresa. `companies` v1.1 posee B2B-002 parcial e instalada/inactiva en
avanzado y demo, con dependencia de capacidad única B2B-001; el módulo conserva
su dependencia de `platform-configuration`. Composición pura con markets/pricing,
sin activación operativa. B2B-009 pendiente.
Check final: 957 archivos sin diagnósticos, 251 suites/3.210 pruebas,
44 HTML/44 formularios/cero crons. Focal: 132 pruebas (28 catálogo, 18 vínculos,
35 proyección/contexto, 51 precios), seis de arquitectura, 82 de registry/manifest
(19 + 63) y regresión de 93 del directorio. Revisión: 12.478 aserciones/300
combinaciones sin P1/P2, getters, efectos ni reloj implícito. Bundles diagnósticos
minificados companies 14.371 B/dos fuentes, proyección 5.685 B/tres, contexto
27.081 B/cinco y precios 38.098 B/siete; sin imports externos u operativos,
no assets de UI. [Informe final](../audits/r6-2a/verification-report.json).
Sin nuevo Worker, HTTP, navegador, a11y o comprobación DB: E2E 176/176,
navegador 601, ocho superficies a11y, ocho capturas y hash de 143 tablas/353 filas
son evidencia heredada de R6.1b/PR #28, sin nuevas ejecuciones en este contrato.
R6.2b aporta la demo verificada localmente, integrada en PR #30 sin despliegue.

**R6.1b implementada y verificada localmente, disponible en repo**, rama
`codex/company-directory-demo`, integrada en PR #28 (`861b34ff`), sin despliegue:
`/demo/admin/empresas`, «Empresas y sedes», dentro de Clientes. Empresa A activa
con VAT ficticio y B inactiva sin VAT; sedes/contactos/roles descriptivos y cinco
estados VAT inicialmente `not_checked`, reiniciado al cambiar empresa.
Check final: 948 archivos sin diagnósticos, 246 suites/3.077 pruebas, 23 del
modelo y seis de arquitectura; 44 HTML/44 formularios/cero crons. Revisión de
1.532 comprobaciones, seis estados y 38 transiciones sin P1/P2, efectos,
getters o reloj implícito. Cliente real de 26.802 B/8.315 B gzip en dos archivos
(entrada 21.053/6.262 B y compartido 5.749/2.053 B), sin imports externos u
operativos; sonda de arranque sin raíz demo: una consulta DOM, diez fechas
explícitas, cero efectos/reloj implícito, separada de la interacción en navegador.
QA nueva: navegador 601, E2E 176/176, ocho superficies a11y sin errores/avisos
y ocho capturas aprobadas. Base intacta, 143 tablas/353 filas, hash antes/después
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Cero efectos del módulo en navegador; guía y rAF del shell separados. Worker
cerrado; [informe final](../audits/r6-1b/verification-report.json). B2B-001 parcial
e instalada/inactiva; B2B-009 pendiente. Sin permisos, autenticación, precios,
crédito ni I/O. Los resultados de cortes siguientes son evidencia anterior.

**R6.1a implementado y verificado localmente**, rama
`codex/company-fixture-directory`, integrado en PR #27 (`9b78e69a`), sin despliegue:
[ADR-0052](adr/0052-directorio-empresas-fixture.md), directorio puro fixture
`companies` para B2B-001 parcial e instalada/inactiva en avanzado y demo,
con dependencia única PLT-004. VAT se relaciona mediante composición con
`taxes`, sin dependencia operativa de ese módulo; B2B-009 pendiente.
Evidencia focal aprobada: 93 pruebas de dominio, 24 de composición VAT, seis
de arquitectura y 81 de registry/manifest. Revisión independiente de 11.249
aserciones (9.700 del directorio/171 selecciones y 1.549 VAT/48 escenarios),
sin P1/P2, ejecución de getters, efectos ni reloj implícito. Bundles diagnósticos
minificados: directorio 6.474 B/dos fuentes y VAT 11.957 B/cuatro fuentes
contribuyentes, sin imports externos ni runtime. Check final con salida 0:
944 archivos sin diagnósticos, 245 suites/3.054 pruebas, 44 HTML/44 formularios
y cero crons; [informe final](../audits/r6-1a/verification-report.json).
R6.1a no añadió UI; R6.1b aporta la demo verificada localmente. HTTP
4.554/163 GET/HEAD, E2E 172/172 y hash de 143 tablas/353 filas de PR #26,
así como navegador 2.030/2.030, ocho superficies a11y y ocho capturas de PR #25,
son evidencia heredada, sin nuevas ejecuciones en este corte.

**R5.12 realizada y verificada localmente con fixtures**, rama
`codex/r5-fixture-consolidation`, integrada en PR #26 (`9dd23909`), sin despliegue:
[consolidación local con fixtures](R5_CONSOLIDACION_FIXTURES.md), nueve pruebas
entre contratos ES/FR, matriz de capacidades instaladas/inactivas y refuerzo
de cabeceras privadas para las respuestas tempranas admin 302/cuenta 404.
Check técnico completo verde: 939 archivos sin diagnósticos, 243 suites/2.935
pruebas, 44 HTML/44 formularios/cero crons. Focales nuevas: nueve entre contratos,
siete de capacidades y 32 de cabeceras privadas; siete pruebas de cabeceras
passwordless en total. Revisión de 1.114 aserciones y 127 casos sin P1/P2 ni
accesos a getters de entorno, cuerpos, cookies o waitUntil en los casos protegidos.
Auditoría HTTP de privacidad/SEO: 4.554 comprobaciones, 163 solicitudes solo
GET/HEAD y 40 URLs de sitemap del build final. E2E global nuevo 172/172,
salida 0, separado del auditor: comandos rechazados en QA aislada sintética.
Base intacta, 143 tablas/353 filas y hash antes/después idéntico
`9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.
Worker cerrado; [informe final](../audits/r5-12/verification-report.json).
Navegador 2.030/2.030, ocho superficies a11y y ocho capturas son evidencia heredada
de PR #25. Sin nuevas interfaces, DDL ni activación; el cierre fixture no declara
R5 operativo completo y mantiene G3/G4 pendientes.

## PLT — Plataforma y extensibilidad

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| PLT-001 | Despliegue aislado por cliente | núcleo | P0 | parcial | Código compartido; base, secretos, dominio y observabilidad aislados. |
| PLT-002 | Manifest de capacidades | núcleo | P0 | parcial | Fuente tipada que gobierna rutas, navegación, jobs, efectos y composición; presets clonables probados, faltan publicación/importación de configuración. |
| PLT-003 | Registro de módulos y dependencias | núcleo | P0 | actual | Registro ejecutable con propietario único de capacidades, eventos, jobs y healthchecks; dependencias, permisos y superficies validadas al componer. |
| PLT-004 | Configuración validada por entorno | núcleo | P0 | parcial | Esquema tipado, valores por cliente y fallo temprano ante combinaciones inválidas. |
| PLT-005 | Migraciones reproducibles y reversibles | núcleo | P0 | parcial | Export/restore base ensayado con esquema, recuentos, FKs e integridad; cada forward migration conserva copia, preflight y rollback propio. |
| PLT-006 | Eventos de dominio versionados | núcleo | P0 | actual | Los cinco hechos de pedido se emiten, persisten sin PII y conservan identidad, versión, causa, correlación e idempotencia. |
| PLT-007 | Outbox transaccional | núcleo | P0 | actual | Negocio, evento y entregas se confirman en una batch; claim con lease, retry/dead-letter, replay interno y dispatcher idempotente sobre D1. |
| PLT-008 | Adaptadores sustituibles | núcleo | P0 | especificado | Pagos, email, transporte, impuestos y feeds detrás de interfaces. |
| PLT-009 | Configuración con borrador y publicación | módulo | P1 | pendiente | Preview, diff, publicación atómica y rollback. |
| PLT-010 | Importación/exportación de configuración | núcleo | P1 | pendiente | Reproducir un proyecto sin copiar secretos ni datos personales. |
| PLT-011 | API administrativa versionada | módulo | P2 | pendiente | Contratos estables, scopes, rate limit e idempotencia. |
| PLT-012 | Webhooks salientes firmados | módulo | P2 | pendiente | Suscripciones, reintentos, dead-letter y replay controlado. |
| PLT-013 | Funciones/reglas conectables | módulo | P2 | pendiente | Puntos de extensión tipados sin ejecutar código arbitrario del cliente. |
| PLT-014 | App store pública | excluido | P3 | excluido | Se sustituye por catálogo interno de conectores auditados. |

## CAT — Catálogo y producto

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| CAT-001 | Producto básico | núcleo | P0 | actual | Nombre, slug, descripción, precio, stock, imagen, categoría y actividad. |
| CAT-002 | Colecciones/catálogos separados | núcleo | P0 | actual | Catálogos visuales aislados sobre contratos compartidos. |
| CAT-003 | Producto y variante separados | núcleo | P0 | parcial | Esquema, lectura reversible, CRUD auditado y stock por variante existen; falta selección storefront. |
| CAT-004 | Opciones y valores | núcleo | P0 | parcial | CRUD administrativo, FKs, lectura y seed v2 con combinaciones reales existen; el storefront todavía sirve la variante default. |
| CAT-005 | SKU, GTIN/EAN, MPN y marca | núcleo | P1 | parcial | SKU/GTIN/MPN tienen lectura y escritura validada en cualquier variante; falta la marca editorial tipada. |
| CAT-006 | Taxonomía y categoría normalizada | módulo | P1 | pendiente | Categoría interna + mapeos externos versionados. |
| CAT-007 | Atributos tipados por categoría | módulo | P1 | actual | Definición por colección/categoría, cinco tipos, restricciones, valores y override de variante con CRUD auditado. |
| CAT-008 | Galería multimedia | núcleo | P1 | actual | Varias imágenes/vídeo, alt, foco, orden, espejo legacy y asociación a variante con CRUD auditado. |
| CAT-009 | Archivos y media reutilizables | módulo | P2 | pendiente | Biblioteca con metadatos, derivados, uso y eliminación segura. |
| CAT-010 | Estado borrador/activo/archivado/no listado | núcleo | P1 | parcial | Borrador/activo/archivado se administran sin borrar historial; falta «no listado». |
| CAT-011 | Publicación programada | módulo | P2 | pendiente | Ventanas temporales con timezone y rollback. |
| CAT-012 | Edición masiva | módulo | P1 | pendiente | Selección, preview, validación y resultado por fila. |
| CAT-013 | Importación CSV robusta | módulo | P1 | pendiente | Dry-run, errores por fila, idempotencia y mapeo de campos. |
| CAT-014 | Exportación completa | módulo | P1 | actual | El backup SQL v3 conserva producto, opciones, variantes, media, asociaciones, definiciones y valores tipados. |
| CAT-015 | Productos combinados | módulo | P3 | pendiente | Agrupar productos relacionados sin perder URLs/variantes independientes. |
| CAT-016 | Productos digitales y servicios | módulo | P3 | pendiente | Tipo sin envío, entrega segura y reglas fiscales propias. |
| CAT-017 | Catálogo de hasta gran escala | núcleo | P2 | parcial | Paginación por cursor, índices, búsqueda externa opcional y pruebas de carga. |

## INV — Inventario y ubicaciones

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| INV-001 | Stock simple por producto | núcleo | P0 | actual | Descuento en pago confirmado y restitución al cancelar pagado. |
| INV-002 | Stock por variante | núcleo | P0 | actual | Balance por unidad vendible proyectado íntegramente en la ubicación principal sin alterar pedidos. |
| INV-003 | Movimientos de inventario | núcleo | P0 | actual | Ledger append-only idempotente, balance reconstruible y correcciones como nuevos movimientos. |
| INV-004 | Reservas de stock | módulo | P1 | actual | Cabecera/líneas, TTL, captura/liberación/expiración y job idempotentes; instalada y apagada por defecto. |
| INV-005 | Múltiples ubicaciones | módulo | P1 | actual | Almacenes/tiendas versionados; principal backfilleada y sincronizada con el ledger global; secundarias vacías hasta transferencias R3.7. |
| INV-006 | Disponible, comprometido, entrante y dañado | módulo | P1 | pendiente | Estados contables distintos, no una única cifra editable. |
| INV-007 | Transferencias entre ubicaciones | módulo | P2 | actual | Borrador, envío idempotente, recepción parcial, discrepancias y movimientos enlazados; secundarias fuera del checkout hasta R3.9. |
| INV-008 | Conteo y ajuste con motivo | módulo | P2 | actual | Foto versionada por ubicación, motivo, doble control opcional, ajuste append-only y auditoría. |
| INV-009 | Alertas de stock y reposición | módulo | P2 | pendiente | Umbral por variante/ubicación y notificación agrupada. |
| INV-010 | Órdenes de compra/proveedores | módulo | P3 | pendiente | Pedido a proveedor, recepción parcial y coste. |
| INV-011 | Enrutamiento por disponibilidad | módulo | P2 | actual | Una ubicación por fulfillment; filtros de mercado/canal/stock, desempate estable, versión y explicación persistida. |
| INV-012 | Sincronización ERP/WMS | conector | P2 | conector | Fuente de verdad definida, cursores, reconciliación y replay. |

## PRC — Precios y modelos comerciales

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| PRC-001 | Precio base en céntimos | núcleo | P0 | actual | Nunca floats ni precio aceptado desde cliente. |
| PRC-002 | Precio anterior informativo | núcleo | P1 | actual | Solo presentación; no participa en el cobro. |
| PRC-003 | Motor de descuentos | módulo | P1 | actual | Evaluación pura por contexto/vigencia, ganador exclusivo o conjunto PRC-008, prioridad estable, tope y snapshot auditable por línea. |
| PRC-004 | Código promocional | módulo | P1 | actual | Hash sin texto claro, vigencia, mínimo, scope de producto, límites global/cliente, reserva/consumo concurrente y devolución por precio efectivo; segmentos esperan R5. |
| PRC-005 | Descuento automático | módulo | P1 | actual | Campaña persistida/versionada por contexto, mínimo y scope; motivo público y aplicación por pedido; un código elegible tiene precedencia global. |
| PRC-006 | Descuento por cantidad | módulo | P2 | actual | Tramos versionados por unidades o subtotal base, scope y canal B2C/B2B, mayor umbral, API auditada y snapshot; segmentos de cliente esperan R5. |
| PRC-007 | Compra X y consigue Y | módulo | P2 | actual | Scopes idénticos/disjuntos, múltiplos/límite, recompensa estable, prorrateo a favor del comprador y devolución/edición por precio congelado. |
| PRC-008 | Combinación de descuentos | módulo | P2 | actual | Matriz versionada de fuentes/clases, suma sobre base, tope por prioridad, explicación y aplicación canónica; sin política conserva exclusividad. |
| PRC-009 | Lista de precios contextual | módulo | P2 | actual | Precio base versionado por mercado/canal/empresa, identidad solo servidor, fallback empresa→general→catálogo por producto y snapshot/aplicación verificables; ubicación/contrato esperan su modelo propietario. |
| PRC-010 | Tarjetas regalo | módulo | P2 | actual | Código hasheado, ledger versionado, emisión auditada, reserva/uso parcial, pago mixto y reembolso al saldo original; política legal por proyecto. |
| PRC-011 | Crédito en tienda | módulo | P2 | actual | Cuenta por identidad opaca de servidor, ledger compartido y aplicación parcial; perfil/autoservicio esperan R5. |
| PRC-012 | Paquetes/bundles | módulo | P2 | actual | Fijo/configurable, precio de carcasa, stock/reserva por componentes, snapshot/aplicación, refund/RMA y API auditada; variantes/suplementos/picking por pieza quedan fuera. |
| PRC-013 | Suscripciones | conector | P2 | instalado | Puerto neutral, plan/snapshot versionado, hechos idempotentes, cambio/pausa/cancelación, impago y portal alojado; proveedor, política comercial, autoservicio y pedidos recurrentes esperan decisión explícita. |
| PRC-014 | Preventa/backorder | módulo | P2 | actual | Política y cupo versionados, `charge_now`, snapshot visible, compromiso por línea, FIFO, asignación global/local, guards de fulfillment/reembolso y comunicación; plazos comerciales y cobro posterior quedan fuera. |
| PRC-015 | Precio unitario | módulo | P2 | pendiente | Cantidad base y unidad para cumplimiento normativo. |
| PRC-016 | Precio dinámico asistido | gestionado | P3 | gestionado | Recomendación con aprobación; nunca cambio autónomo opaco. |

## CHK — Carrito, checkout y pagos

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| CHK-001 | Carrito persistente invitado | núcleo | P0 | actual | Namespaced, cantidades limitadas y revalidación en servidor. |
| CHK-002 | Cotización autoritativa | núcleo | P0 | actual | Precio, stock, envío y total salen del servidor. |
| CHK-003 | Checkout alojado seguro | conector | P0 | actual | Datos de tarjeta fuera del servidor Logic2B. |
| CHK-004 | Webhook de pago idempotente | núcleo | P0 | actual | Una captura financiera, una transición, un descuento de stock y un email en la misma unidad guardada. |
| CHK-005 | Dirección normalizada y validada | módulo | P1 | parcial | Esquema por país, sugerencias opcionales y validación no bloqueante. |
| CHK-006 | Impuestos y desglose | núcleo | P1 | pendiente | Base, tipo, jurisdicción, redondeo y snapshot por línea. |
| CHK-007 | Múltiples métodos de entrega | módulo | P1 | parcial | Envío, recogida y entrega local según contexto. |
| CHK-008 | Envío dividido | módulo | P2 | pendiente | Grupos de fulfillment con precio y promesa propios. |
| CHK-009 | Múltiples pasarelas | módulo | P2 | pendiente | Payment intent interno y adaptadores sin bifurcar pedido. |
| CHK-010 | Métodos locales y multidivisa | conector | P2 | parcial | **R5.11b implementado y verificado localmente el 2026-10-04**, rama `codex/local-methods-fixture-contract`, integrado en PR #24 (`a44923c`) y sin despliegue: [ADR-0051](adr/0051-metodos-locales-fixture.md), contrato `payments/domain/local-payment-methods.ts` y composición `local-payment-methods-context`. Instalada/inactiva en avanzado y demo, dependencia PLT-004; `payments` conserva sus otras capacidades activas. Política de origen fixture con reglas exactas método/mercado/moneda y referencias id/version de ambos catálogos en política y solicitud. Exige original.currency=market.currency y exponente correcto; valida todas las reglas, incluidas disabled y otros contextos, con rangos minor inclusivos y enteros seguros. available_in_fixture o motivos de ausencia/deshabilitación/límites, sin permiso real para pagar. Sin FX aceptado, fallback, I/O, relojes, DDL, rutas, jobs, healthchecks ni cambios de ledger, precios o runtime operativo. Check final: 932 archivos sin diagnósticos, 239 suites/2.679 pruebas, 86 de dominio, 30 de composición, seis de arquitectura y 79 de registry/manifest; 44 HTML/44 formularios/cero crons. Revisión de 6.366 aserciones sin P1/P2, efectos ni ejecución de getters. Bundle de composición de 25.741 B sin ledger/D1/Stripe/checkout/config ni preview FX/adaptador FX efectivo; retiene una constante pura de markets de 142 B. [Informe final](../audits/r5-11b/verification-report.json). E2E 168/168, navegador 340/340, ocho superficies a11y y base QA de 143 tablas/353 filas intacta son evidencia heredada de PR #22 (`93bc3bd`), no ejecuciones de R5.11b. [Evidencia anterior](../audits/r5-10b/verification-report.json). **R5.11c implementada y verificada localmente, disponible en repo**, rama `codex/currency-methods-demo`, integrada en PR #25 (`46dbe905`), sin despliegue: `/demo/admin/divisas` conjunta de mercados, divisas y métodos fixture. ES/FR/JP/KW, importes nominales cerrados, destinos EUR/JPY/KWD, FX vigente/caducada/indisponible e identidad sin evidencia; métodos sobre el original e invariantes a FX, formato exacto BigInt y 32 respuestas fixture. Solo memoria con reset/recarga y gate manifest demo AND DEMO_MODE=true, sin I/O, almacenamiento, reloj, API, DDL, cron, pagos ni proveedor. Check técnico final R5.11c verde: 936 archivos sin diagnósticos, 240 suites/2.885 pruebas, 206 del modelo y seis de arquitectura; 44 HTML/44 formularios/cero crons. Revisión independiente de 4.634 comprobaciones, 126 estados y 32 evidencias sin P1/P2, efectos ni ejecución de getters. Cliente real: 36.482 B/10.886 B gzip en dos chunks (entrada 30.287/8.662 B y markets 6.195/2.224 B), sin imports externos ni efectos en la sonda de arranque; distinto del probe del modelo de 48.518 B sin minificar. QA nueva: navegador 2.030/2.030, E2E 172/172, ocho superficies a11y con cero errores/avisos; ocho capturas revisadas por frontend y UX/UI sin bloqueantes. Base QA intacta, 143 tablas/353 filas y hash antes/después idéntico. Cero efectos del módulo en navegador, con almacenamiento de la guía y requestAnimationFrame del shell contabilizados aparte. Worker cerrado; [informe final](../audits/r5-11c/verification-report.json). Check 932/239/2.679 anterior de b y evidencia de superficie/hash heredada de PR #22. R5.12 consolidó y verificó localmente con fixtures contratos/demos ES/FR, privacidad/cuenta opcional mediante guardas y fixtures y revisión SEO/legal/seguridad con evidencias trazables; sin reclamar E2E operativo. Estos previews no habilitan cobro, reembolso ni conciliación operativos. |
| CHK-011 | Pago parcial/depósito | módulo | P2 | instalado | Enlace alojado por etapa, pago verificado e idempotente y traslado al ledger del pedido; proveedor/condiciones y activación se deciden por proyecto. |
| CHK-012 | Validaciones extensibles | módulo | P2 | pendiente | Políticas puras de carrito/checkout con mensajes seguros. |
| CHK-013 | Recuperación de checkout abandonado | módulo | P2 | pendiente | Consentimiento, enlace seguro, expiración y atribución. |
| CHK-014 | Riesgo y fraude | conector | P2 | conector | Señales del PSP, revisión, decisión y auditoría. |
| CHK-015 | Disputas/chargebacks | conector | P3 | conector | Ingesta de evento, evidencias, plazo y estado. |
| CHK-016 | Pago agéntico | conector | P3 | pendiente | Sesión limitada, consentimiento y confirmación verificable. |

## ORD — Pedidos y posventa

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| ORD-001 | Pedido con snapshots | núcleo | P0 | actual | Nombre y precio quedan congelados en la compra. |
| ORD-002 | Máquina de estados validada | núcleo | P0 | actual | Transiciones permitidas, evento y concurrencia protegida. |
| ORD-003 | Búsqueda, filtros y paginación | núcleo | P1 | actual | Cursor bidireccional estable; búsqueda FTS segura; estado, fecha e importe combinables; URL compartible. Vistas guardadas siguen opcionales. |
| ORD-004 | Notas, etiquetas y timeline | módulo | P1 | actual | Notas versionadas internas/cliente, etiquetas idempotentes, actor, auditoría y actividad unificada filtrable. |
| ORD-005 | Edición de pedido | módulo | P1 | actual | Añadir/quitar/cambiar cantidad o dirección con preview servidor, cobro alojado/reembolso por captura y stock reservado/repuesto. |
| ORD-006 | Cancelación parcial | módulo | P1 | actual | Selección por línea/cantidad no enviada, motivo, reserva concurrente y stock opcional coherente. |
| ORD-007 | Reembolso total/parcial | módulo | P1 | actual | Intención previa al PSP, saldo acumulado, retry idempotente, política de envío por despliegue, estado visible, evento/email y reposición opcional. |
| ORD-008 | Pedido preliminar/presupuesto | módulo | P2 | instalado | Snapshot, vigencia, aprobación, eventos versionados y conversión transaccional con reserva; términos y activación se deciden por proyecto. |
| ORD-009 | Captura manual o diferida | módulo | P2 | pendiente | Autorización, captura parcial y expiración. |
| ORD-010 | Riesgo/incidencia/bloqueo | módulo | P2 | actual | Holds manuales/automáticos múltiples con responsable, SLA, resolución optimista e histórico; cualquier activo impide nueva preparación. |
| ORD-011 | Acciones masivas seguras | módulo | P2 | actual | Selección explícita ≤500, preview SHA-256, lote/job durable en chunks de 25, progreso y evidencia por pedido, revalidación, replay/reanudación idempotentes y demo sin efectos. |
| ORD-012 | Impresión y documentos | módulo | P2 | actual | Albarán/etiqueta sin importes con snapshot, plantilla, checksum y versión; factura/rectificativa solo como referencia emitida por proveedor fiscal externo. |
| ORD-013 | Archivo y retención | núcleo | P2 | pendiente | Política, exportación, anonimización y obligación fiscal. |

## FUL — Preparación, envío y devoluciones

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| FUL-001 | Tarifas planas por zona | núcleo | P0 | actual | Cálculo servidor y umbral gratuito. |
| FUL-002 | Tracking y aviso de envío | núcleo | P0 | actual | Un grupo canónico asigna todas las líneas, conserva tracking y proyecta pedido/email. |
| FUL-003 | Exportación logística CSV | conector | P1 | actual | Puente manual a operadores compatibles. |
| FUL-004 | Preparación parcial | módulo | P1 | actual | Selección por cantidades validada contra el pendiente, acción total rápida y email limitado a cada salida. |
| FUL-005 | Múltiples envíos por pedido | módulo | P1 | actual | Cada grupo posee estado, tracking e idempotencia; pedido/timeline se derivan al completar cantidades y entregas. |
| FUL-006 | Compra de etiquetas | conector | P2 | conector | Cotizar, comprar, anular, imprimir y registrar coste. |
| FUL-007 | Reglas de embalaje | módulo | P2 | pendiente | Peso/dimensiones, embalaje por variante y bultos. |
| FUL-008 | Recogida en tienda | módulo | P2 | pendiente | Disponibilidad, preparación, listo y recogido. |
| FUL-009 | Entrega local | conector | P2 | conector | Ventanas, radio, capacidad y tracking. |
| FUL-010 | Portal de devolución | módulo | P1 | pendiente | Elegibilidad, motivo, resolución y autenticación segura. |
| FUL-011 | RMA y recepción | módulo | P1 | actual | Solicitud elegible, autorización, tránsito, recepción, inspección y cierre versionado con reembolso o cambio. |
| FUL-012 | Cambio de producto | módulo | P2 | parcial | El cierre materializa la sustitución pendiente; faltan reserva de salida y diferencia de cobro. |
| FUL-013 | Reposición condicionada | núcleo | P1 | actual | Solo la inspección apta repone al cerrar, mediante movimiento append-only en la ubicación receptora. |
| FUL-014 | Reglas de devolución | módulo | P2 | parcial | Ventana fija de 30 días, entrega, cantidades y motivos; faltan reglas configurables por categoría, coste y excepción. |
| FUL-015 | Seguimiento multioperador | conector | P2 | conector | Normalización de estados y excepciones. |

## CUS — Clientes, identidad y privacidad

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| CUS-001 | Compra como invitado | núcleo | P0 | actual | Email/dirección por pedido sin cuenta obligatoria. |
| CUS-002 | Perfil de cliente deduplicado | módulo | P1 | parcial | Identidad HMAC, D1 transaccional, merge revisado, direcciones versionadas y relación opcional con pedidos están implementados; activación espera consentimiento R5.2 y rollout por proyecto. |
| CUS-003 | Cuentas sin contraseña | módulo | P2 | parcial | ADR-0042/0043, D1 `0039`–`0040` y backup 33 implementan identidad separada, Resend directo con tracking verificado, `prepare→persist→deliver`, confirmación durable previa al consumo, cookie real/dummy del mismo navegador, fragmento→POST, HTTP/UI, throttle, auditoría, revocación y gate CAS fail-closed. El esquema está desplegado pero permanece `installed`: secretos, entrega real y activación requieren rollout aislado; sin WebAuthn, step-up ni cross-device. |
| CUS-004 | Historial y seguimiento de pedidos | módulo | P2 | parcial | ADR-0044, D1 `0041`, backup 34, API de índice/detalle y UI SSR implementan referencia/versionado, owner canónico, cursor owner-only, sesión/capability/scope exactos, navegación, tracking, rate limit y 404 IDOR uniforme sin reclamar historia guest. Esquema y Worker desplegados el 2026-08-24 con 8 referencias guest y cero activaciones; permanece instalada e inactiva hasta rollout/preflight por proyecto. |
| CUS-005 | Autoservicio de devolución | módulo | P2 | parcial | Selector `ret_`, owner/CAS desde `ord_`, elegibilidad transaccional, replay/carrera y HTTP/SSR están implementados tras sesión, scope, CSRF y rate limit. D1 `0044` y el Worker inerte están desplegados y reconciliados; permanece installed sin flags activas. R5.5h cierra navegador/a11y el 2026-09-18 (26 superficies, 0 errores/avisos y ocho capturas); replay tras cantidades agotadas/plazo vencido, owner/perfil/CAS y carreras de clave cubiertos. La corrección de runtime de septiembre y el rollout por proyecto siguen pendientes. |
| CUS-006 | Direcciones guardadas | módulo | P2 | parcial | ADR-0044, `0042`–`0043` y backup 36 cubren selector `addr_`, owner/revisión vigente, índice, alta y revisión con CSRF, idempotencia durable y CAS transaccional. API y `/cuenta/direcciones` SSR pasan IDOR, replay, carrera y a11y. D1 `0043` y Worker están desplegados, pero la capacidad permanece installed sin flags, perfiles ni rutas públicas; el rollout por proyecto continúa pendiente. |
| CUS-007 | Consentimientos por canal/finalidad | núcleo | P1 | parcial | ADR, dominio, D1 y backup implementan evidencia append-only, alcance, aviso versionado, fuente, región, retirada, reconsentimiento, idempotencia y carrera; captura, política legal y rollout esperan gates propios. |
| CUS-008 | Exportación y borrado de datos | núcleo | P1 | parcial | ADR, lifecycle y D1 append-only, versión/idempotencia concurrentes, plan dry-run normalizado, fingerprint, doble control y backup 32 implementados; política, autenticación, superficies y ejecución esperan gates propios. |
| CUS-009 | Segmentos calculados | módulo | P2 | parcial | ADR-0045, persistencia 0045–0046 y backup 39 locales; R5.6c.1–c.3: política explícita, captura D1 consistente, coordinador reanudable, planes e intenciones durables y publicación CAS. Ensayo workerd de 15 bloques con carreras y restore de 129 tablas (2026-10-03); integrado en PR #14, commit `9b3a8ab`, sin despliegue. Instalada e inactiva operativamente, sin flags, handler, jobs ni cron habilitados; G3/G4 de uso real pendientes. **R5.6d verificada e integrada en PR #15 (`71d5263`), demo visual disponible en repo, sin desplegar**: `/demo/admin/segmentos` con 12 perfiles, cuatro hechos, tres templates y lotes de tres; evaluación pura en navegador sobre fixtures, sin API ni persistencia. QA: 222 suites/1.730 tests, E2E 156/156, navegador 119/119 y ocho superficies a11y 0/0; base QA intacta. [Evidencia](../audits/r5-6d/verification-report.json). |
| CUS-010 | Saldo/crédito | módulo | P2 | pendiente | Se apoya en PRC-011 y ledger. |
| CUS-011 | SSO/proveedor de identidad | conector | P3 | conector | OIDC/SAML por proyecto con mapeo explícito. |
| CUS-012 | Fidelización | conector | P3 | conector | Eventos, saldo, recompensas y reversión de devoluciones. |

## STO — Tienda, contenido, búsqueda y descubrimiento

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| STO-001 | Storefront rápido y accesible | núcleo | P0 | actual | SSR/estático, SEO técnico y presupuestos de rendimiento. |
| STO-002 | Temas visualmente distintos | gestionado | P1 | actual | Diez demostraciones sobre contratos compartidos. |
| STO-003 | Secciones/bloques tipados | módulo | P1 | pendiente | Composición segura sin constructor universal. |
| STO-004 | Presets de página | gestionado | P1 | parcial | Home, colección, producto y campañas por diseño. |
| STO-005 | Contenido estructurado reutilizable | módulo | P1 | parcial | Metaobjetos propios con validación y referencias. |
| STO-006 | Búsqueda textual | núcleo | P1 | parcial | Relevancia, typo tolerance opcional y analítica de cero resultados. |
| STO-007 | Filtros/facetas | módulo | P1 | parcial | Derivados de atributos reales, combinables y SEO-safe. |
| STO-008 | Ordenación configurable | núcleo | P1 | actual | Precio/nombre y criterios adicionales estables. |
| STO-009 | Recomendaciones relacionadas | módulo | P2 | pendiente | Reglas explicables con fallback editorial. |
| STO-010 | Merchandising de colección | módulo | P2 | pendiente | Fijar, impulsar, ocultar y programar. |
| STO-011 | Blog/guías/casos | módulo | P2 | pendiente | Contenido editorial indexable y enlazado a catálogo. |
| STO-012 | Reseñas | conector | P2 | conector | Moderación, verificación, schema y portabilidad. |
| STO-013 | Wishlist | módulo | P3 | pendiente | Invitado/cuenta, privacidad y alertas opcionales. |
| STO-014 | Búsqueda semántica/imagen | conector | P3 | pendiente | Índice derivado, permisos y métricas de calidad. |
| STO-015 | Preview/rollout/A-B de temas | módulo | P2 | pendiente | Versión, audiencia, métrica, significancia y rollback. |

## MKT — Mercados, fiscalidad e internacionalización

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| MKT-001 | Moneda base | núcleo | P0 | actual | EUR centralizado. |
| MKT-002 | Zonas postales españolas | núcleo | P0 | actual | Resolución servidor por prefijo. |
| MKT-003 | Modelo de mercado | módulo | P1 | parcial | **R5.7a–b implementado y verificado en QA local**: ADR-0046, contrato puro `defineMarketCatalog` / `resolveMarket`, composición `market-pricing-context`, catálogo explícito Git/inyección y moneda base. Check global y tipos finales: 888 archivos sin diagnósticos, 224 suites/1.876 tests; revisión sin P1/P2, E2E 156/156 y base QA intacta. [Informe](../audits/r5-7/verification-report.json). Instalada/inactiva en el preset avanzado; sin DDL, rutas operativas, jobs, endpoints, FX, activación ni despliegue. **Demo R5.8b verificada y disponible en repo, sin desplegar**: vista ES/FR en `/demo/admin/mercados`, fixtures en memoria bajo manifest demo y `DEMO_MODE=true`; 120/120 comprobaciones de navegador y ocho superficies a11y sin hallazgos. [Evidencia](../audits/r5-8b/verification-report.json). |
| MKT-004 | Publicación por mercado | módulo | P2 | parcial | **R5.9a implementado, verificado localmente e integrado en PR #19 (`1c801d8`)**: ADR-0048, contrato puro `markets/market-publication` y proyección desde `CatalogEntry` completo. Tuplas y variantes explícitas, ausencia `unconfigured`; separado de precio, stock y compra. Snapshot ref/fecha no acreditan D1 ni versiones de producto/regla. Check: 901 archivos sin diagnósticos, 229 suites/2.175 pruebas; focales 102+48, seis de arquitectura y revisión de 485 aserciones sin P1/P2. [Informe](../audits/r5-9a/verification-report.json). Propietario `markets`, dependencias MKT-003 y CAT-003; instalada/inactiva en avanzado y demo, sin DDL, lectores runtime modificados, UI operativa, persistencia, activación ni despliegue. **R5.9b verificada y disponible en repo, sin desplegar**: `/demo/admin/publicacion`, 12 buffers y aplicación explícita, selección preparada frente a resultado aplicado y motivos; solo memoria/noindex, sin I/O, D1, cron ni editor real. 230 suites/2.222 pruebas, E2E 164/164, navegador 188/188 y ocho superficies a11y 0/0; base QA intacta. [Evidencia](../audits/r5-9b/verification-report.json). |
| MKT-005 | Catálogo/precio por mercado | módulo | P2 | pendiente | Integra PRC-009 con fallback explícito. |
| MKT-006 | Traducciones | gestionado | P2 | parcial | R5.8a verificada localmente e integrada en PR #17 (`6eadc3b`): ADR-0047 y contrato puro de campos/estado editorial, revisiones, obsolescencia y fallback explícito; 53 pruebas editoriales. Check global 226 suites/1.999 pruebas y revisión sin P1/P2; [informe](../audits/r5-8a/verification-report.json). Propietario localization, depende de PLT-004. Instalada/inactiva en avanzado y demo; sin CMS, persistencia, editor operativo ni traducción externa. Git/inyección y fixtures bastan; no DDL ni activación. **Demo R5.8b verificada y disponible en repo, sin desplegar**: ES/CA publicados en fixtures, EN editable en memoria y FR ausente; reset/recarga, sin API ni publicación editorial operativa. Check 227 suites/2.023 pruebas, E2E nuevo 160/160 y base QA intacta. [Evidencia](../audits/r5-8b/verification-report.json). |
| MKT-007 | URLs internacionales y hreflang | módulo | P2 | parcial | R5.8a verificada localmente e integrada en PR #17 (`6eadc3b`): `planInternationalUrls`, canonical propio, alternates recíprocos, sitemap por origen y x-default opt-in sobre revisiones publicadas; 67 pruebas y perfil contrastado de 184 idiomas/249 regiones/cinco scripts. [Informe](../audits/r5-8a/verification-report.json). Propietario localization, depende de MKT-006. Instalada/inactiva en avanzado y demo, sin rutas/endpoints operativos ni cambios del SEO real. No DDL ni despliegue. **Demo R5.8b verificada y disponible en repo, sin desplegar**: plan `.test` sin enlaces ni metadatos SEO efectivos; navegador 120/120, ocho capturas revisadas y a11y sin hallazgos. El módulo no produce HTTP ni almacenamiento propio. [Evidencia](../audits/r5-8b/verification-report.json). |
| MKT-008 | Multidivisa | conector | P2 | parcial | **R5.11a implementado y verificado localmente el 2026-10-04 UTC**, rama `codex/currency-fixture-contract`, integrado en PR #23 (`c928ef9`) y sin despliegue: [ADR-0050](adr/0050-presentacion-divisas-fixture.md), módulo separado `currencies`, dependencia PLT-004 e instalada/inactiva en avanzado y demo. Perfil `minor-unit-presentment-half-up-v1`: catálogo completo versionado con exponentes 0/2/3, tasas racionales dirigidas base→target en unidades principales, BigInt/half-up e identidad explícita sin tasa ficticia. Correlación de solicitud completa, adaptador y vigencia; importe presentado null ante FX ausente, futura o caducada. Sin I/O, reloj, DDL, proveedor ni cambios en formatCurrencyCents, checkout, ledger o impuestos EUR; catálogo no certificado ISO ni monedas operativas habilitadas. Check final: 928 archivos sin diagnósticos, 237 suites/2.561 pruebas, 107 de dominio, 25 del adaptador FX fixture, seis de arquitectura y 77 de registry/manifest; 44 HTML/44 formularios/cero crons. Revisión de 8.823 aserciones sin P1/P2, efectos ni ejecución de getters; bundle público de tres fuentes/12.910 B sin imports operativos. [Informe final](../audits/r5-11a/verification-report.json). R5.11a no añadió UI ni nuevas ejecuciones E2E, navegador, a11y o hash; la demo visual está disponible localmente en R5.11c. E2E 168/168, navegador 340/340, ocho superficies a11y y base QA de 143 tablas/353 filas intacta son evidencia heredada de R5.10b, PR #22 (`93bc3bd`). [Evidencia anterior](../audits/r5-10b/verification-report.json). R5.11b implementado y verificado localmente modela métodos sintéticos con política exacta método/mercado/moneda y referencias completas de catálogo; CHK-010 permanece parcial e instalada/inactiva. **R5.11c implementada y verificada localmente, disponible en repo**, rama `codex/currency-methods-demo`, integrada en PR #25 (`46dbe905`), sin despliegue: demo conjunta `/demo/admin/divisas`. ES/FR/JP/KW e importes nominales cerrados, destinos EUR/JPY/KWD, FX vigente/caducada/indisponible e identidad sin evidencia; métodos sobre el original e invariantes a FX, formato exacto BigInt y 32 respuestas fixture. Memoria y reset/recarga bajo manifest demo AND DEMO_MODE=true; sin I/O, almacenamiento, reloj, API, DDL, cron, pagos ni proveedor. MKT-008 y CHK-010 permanecen parciales e instaladas/inactivas, con otras capacidades payments activas. Check técnico final R5.11c verde: 936 archivos sin diagnósticos, 240 suites/2.885 pruebas, 206 del modelo y seis de arquitectura; 44 HTML/44 formularios/cero crons. Revisión independiente de 4.634 comprobaciones, 126 estados y 32 evidencias sin P1/P2, efectos ni ejecución de getters. Cliente real: 36.482 B/10.886 B gzip en dos chunks (entrada 30.287/8.662 B y markets 6.195/2.224 B), sin imports externos ni efectos en la sonda de arranque; distinto del probe del modelo de 48.518 B sin minificar. QA nueva: navegador 2.030/2.030, E2E 172/172, ocho superficies a11y con cero errores/avisos; ocho capturas revisadas por frontend y UX/UI sin bloqueantes. Base QA intacta, 143 tablas/353 filas y hash antes/después idéntico. Cero efectos del módulo en navegador, con almacenamiento de la guía y requestAnimationFrame del shell contabilizados aparte. Worker cerrado; [informe final](../audits/r5-11c/verification-report.json). R5.12 consolidó y verificó localmente contratos y demos con fixtures, integrada en PR #26 (`9dd23909`) y sin despliegue. La ola no resuelve cobro, reembolso ni conciliación; R5.11 seguirá parcial. |
| MKT-009 | IVA/impuestos UE | conector | P1 | parcial | **R5.10a implementado, verificado localmente e integrado en PR #21 (`5f9e3e2`)**: [ADR-0049](adr/0049-contrato-fiscal-fixture.md), módulo `taxes` separado de `markets`, dependencia PLT-004 e instalada/inactiva en avanzado y demo. Perfil fixture `eur-line-tax-half-up-v1`: EUR postdescuento, líneas goods/shipping, precio incluido/excluido, jurisdicción/tratamiento/tasa explícitos, BigInt half-up, net+tax=gross y rechazo de overflow. Distingue taxable/zero_rate/exempt, evidencia y unresolved; totals null ante líneas sin resolver; entradas corruptas/ajenas rechazadas. Puerto/adaptador solo fixture, correlación de solicitud completa y adaptador; solo assessed vigente genera snapshot, no unavailable/caducada/futura. Sin fiscalidad universal, quote/checkout/pagos/reembolsos, D1, red, reloj, caché durable, proveedor ni activación. Check final: 917 archivos sin diagnósticos, 234 suites/2.391 pruebas, 44 HTML/44 formularios/cero crons; 96 focales fiscales, seis de arquitectura y 75 de registry/manifest. Revisión conjunta de 5.616 aserciones sin P1/P2 ni efectos y bundle público de cinco fuentes puras; [informe](../audits/r5-10a/verification-report.json). Sin despliegue; CHK-006 pendiente. **R5.10b verificada y disponible en repo, integrada en PR #22 (`93bc3bd`), sin desplegar**: `/demo/admin/impuestos`, «Impuestos y totales», con preparar ejemplo/comprobar desglose, cinco casos cerrados y selector incluido/excluido. Importes postdescuento de solo lectura, recálculo en memoria y reset/recarga; sin buffers, guardar, datos fiscales libres ni envío. Gate manifest demo AND DEMO_MODE=true, noindex. Check final R5.10b: 921 archivos sin diagnósticos, 235 suites/2.427 pruebas, 36 del modelo y seis de arquitectura, 44 HTML/44 formularios/cero crons; revisión de 496 comprobaciones sin P1/P2 ni efectos, bundles sin runtime operativo. Navegador 340/340, E2E nuevo 168/168, ocho superficies a11y con cero errores/avisos y ocho capturas revisadas sin bloqueantes. Base QA intacta: 143 tablas/353 filas y hash antes/después idéntico. Cero efectos del módulo; guía y punto exacto de requestAnimationFrame del shell registrados por separado. Worker y Chrome detenidos; [evidencia final](../audits/r5-10b/verification-report.json). |
| MKT-010 | Validación VAT ID | conector | P2 | parcial | **R5.10a implementado, verificado localmente e integrado en PR #21 (`5f9e3e2`)**: contrato de evidencia VAT y puerto/adaptador únicamente fixture en `taxes`, dependencia PLT-004 e instalada/inactiva en avanzado y demo. Correlación explícita de consulta, adaptador e instante; valid no implica exención. Sin consulta real, red, reloj, caché durable, proveedor, D1 ni integración con checkout/pagos/reembolsos. 70 focales VAT y 196 aserciones VAT en la revisión independiente sin P1/P2; [informe](../audits/r5-10a/verification-report.json). Sin despliegue; no se declara validación operativa. **R5.10b verificada y disponible en repo, integrada en PR #22 (`93bc3bd`), sin desplegar**: evidencia VAT independiente positiva/negativa/caducada/indisponible en `/demo/admin/impuestos`, sin cambiar tratamientos ni aceptar NIF o país libres. Solo memoria, sin envío; gate manifest demo AND DEMO_MODE=true y noindex. Las 70 pruebas VAT citadas corresponden al contrato R5.10a. R5.10b verificada: check de 921 archivos sin diagnósticos, 235 suites/2.427 pruebas y revisión de 496 comprobaciones sin P1/P2; navegador 340/340, E2E nuevo 168/168, ocho superficies a11y sin errores/avisos y ocho capturas sin bloqueantes. Base QA de 143 tablas/353 filas intacta, sin efectos del módulo; guía y requestAnimationFrame del shell separados. [Evidencia final](../audits/r5-10b/verification-report.json). Continúa instalada/inactiva; CHK-006 pendiente. |
| MKT-011 | Aranceles/DDP | conector | P3 | conector | Clasificación, cálculo, cobro y documentos. |
| MKT-012 | Entidades legales múltiples | módulo | P3 | pendiente | Vendedor de registro, numeración, impuestos y liquidación. |
| MKT-013 | Restricciones de producto | módulo | P2 | pendiente | País, edad, mercancía peligrosa y cumplimiento. |

## B2B — Comercio entre empresas

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| B2B-001 | Empresas y sedes | módulo | P2 | parcial | **R6.1a implementado y verificado localmente**, rama `codex/company-fixture-directory`, integrado en PR #27 (`9b78e69a`), sin despliegue: [ADR-0052](adr/0052-directorio-empresas-fixture.md), contrato puro fixture `companies`, instalada/inactiva en avanzado y demo con dependencia única PLT-004. Directorio versionado de empresas/sedes/contactos, roles descriptivos y asignaciones con referencias de pertenencia; la selección valida el snapshot completo. Solo empresas/sedes/contactos tienen estado activo/inactivo, no las asignaciones/relaciones; estados y roles no conceden permisos. identityRef es exclusivamente referencia de perfil, hash de email de 64 caracteres o null. Son metadatos potencialmente seudónimos, no anonimización; pueden repetirse entre empresas y no acreditan pertenencia. Sin email en claro, autenticación ni derivación de claves de precios. VAT opcional declarativo y composición con taxes, sin dependencia operativa del módulo: consulta correlacionada con empresa, país y VAT; la misma declaración puede reutilizar evidencia vigente tras una nueva versión editorial, sin acreditar autorización ni exención. Sin DDL, CRM, cobro, crédito, rutas ni jobs; B2B-009 pendiente. Focales 93 dominio/24 VAT/6 arquitectura/81 registry-manifest y revisión independiente aprobados; check final 944 archivos sin diagnósticos, 245 suites/3.054 pruebas, 44 HTML/44 formularios/cero crons. [Informe final](../audits/r6-1a/verification-report.json). HTTP/E2E/hash R5.12 y navegador/a11y/capturas R5.11c heredados, sin nueva ejecución ni UI. **R6.1b implementada y verificada localmente, disponible en repo**, rama `codex/company-directory-demo`, integrada en PR #28 (`861b34ff`), sin despliegue: `/demo/admin/empresas`, «Empresas y sedes», grupo Clientes; empresa A activa con VAT ficticio y B inactiva sin VAT, sedes/contactos/roles descriptivos y cinco estados VAT inicialmente not_checked, reiniciado al cambiar de empresa. Check 948 archivos sin diagnósticos, 246 suites/3.077 pruebas; 23 del modelo, seis de arquitectura y revisión de 1.532 comprobaciones sin P1/P2. QA nueva: navegador 601, E2E 176/176, ocho superficies a11y sin errores/avisos y ocho capturas aprobadas; base QA intacta y Worker cerrado. Cliente real 26.802 B/8.315 B gzip; sonda sin raíz separada de las interacciones de navegador. [Evidencia final](../audits/r6-1b/verification-report.json). |
| B2B-002 | Catálogo por empresa | módulo | P2 | parcial | **R6.2a implementado y verificado localmente**, rama `codex/company-catalog-contract`, integrado en PR #29 (`4d7a30a9`) sin despliegue: [ADR-0053](adr/0053-catalogos-empresa-fixture.md). Propietario companies v1.1, instalada/inactiva en avanzado y demo; dependencia de capacidad única B2B-001 y dependencia de módulo platform-configuration conservada. Composición pura con markets/pricing sin activación operativa. Snapshot EUR con todas las variantes y precios. Preview completo de visibilidad separado del precio de una única variante explícita por producto, hasta 100 selecciones; base de esa variante, nunca default, con sustitución de precio por producto de las listas existentes preservada y declarada. Política global empresa/producto; mercado/canal pertenecen a market publication. Intersección sin revivir excluidos; empresa inactiva cierra el preview comercial sin cambiar el selector descriptivo. Vinculación versionada explícita companyId→companyKeyHash, compartible explícitamente entre empresas; ausencia produce precio null, sin derivaciones ni conversión en contexto general. Referencias exactas directoryRef id/version/capturedAt y catalogRef ref/capturedAt. Base EUR; listas canónicas de otra moneda se validan completas y quedan excluded_context. Frontera unknown valida y copia todos los datos y referencias, incluidos los ajenos a la selección, antes de la API tipada pricing. Sin totales, autorización real, DDL ni activación; B2B-009 pendiente. Check final 957 archivos/251 suites/3.210 pruebas; 132 focales, seis de arquitectura, 82 registry/manifest y 93 de regresión del directorio. Revisión de 12.478 aserciones/300 combinaciones sin P1/P2; [informe final](../audits/r6-2a/verification-report.json). E2E 176/176, navegador 601, a11y ocho superficies, ocho capturas y hash 143 tablas/353 filas heredados de PR #28, sin nuevas ejecuciones. **R6.2b verificada localmente y disponible en repo**, rama codex/company-catalog-demo, integrada en PR #30 (`6305b823`) sin despliegue: /demo/admin/catalogos-empresa en Clientes, Workshop/Studio activas, Unbound activa sin vinculación y Closed inactiva; ES/FR y professional fijo. Tres productos y variantes activos, selección explícita 11/21/31 preservada al cambiar contexto; precio de lista empresa/lista general/catálogo en el caso inicial. Memoria/reset, sin totales, hashes ni referencias técnicas en UI, I/O, DDL u operación real. Check final 961 archivos/252 suites/3.259 pruebas, 49 modelo y seis arquitectura; revisión 14.638 comprobaciones/32 estados/416 transiciones sin P1/P2. Cliente real cinco archivos/60.244 B/18.532 B gzip separado de diagnóstico modelo y guía. Navegador final 3.614 comprobaciones/64 visitas; ocho superficies a11y sin hallazgos, E2E nuevo 180/180, hash intacto de 143 tablas/353 filas y Worker detenido. Ocho capturas regeneradas aprobadas por frontend, sin nuevos defectos; [informe final](../audits/r6-2b/verification-report.json). Efectos del módulo cero; escrituras de guía contabilizadas aparte. |
| B2B-003 | Condiciones de pago | módulo | P2 | parcial | **R6.4a implementado y verificado localmente**, rama codex/company-payment-terms, integrado en PR #33 (`cb3493ec`) sin despliegue; [ADR-0055](adr/0055-condiciones-pago-fixture.md). Propietario companies 1.3.0, dependencia de capacidad única B2B-001 y de módulo platform-configuration; instalada/inactiva avanzado/demo, ausente mínimo/estándar, sin superficies operativas. Condición explícita versionada immediate/net_days y calendario utc-civil-days-v1 con base/evaluación YYYY-MM-DD explícitas; sin inferirlas de capturedAt ni reloj. Directorio, política y solicitud completamente validados; referencias exactas. Ausencia unconfigured con derivados null y sin hitos; empresa desconocida es error. Inactiva conserva condición descriptiva de esta revisión, sin permisos ni cambios en bloqueos comerciales. Hitos de calendario por offsets, sin destinatarios/envío/jobs; after_due no acredita impago ni captura. Sin importes, crédito, aprobaciones, fiscalidad, persistencia ni checkout/ledger. Estado de cobro requiere contrato posterior con evidencia completa correlacionada; R6.4 no está completo. Check final 971 archivos/256 suites/3.473 pruebas; 46 dominio, seis arquitectura y 118 registry/manifest/access. Revisión 21.702 comprobaciones/15.090 casos/336 bases/14.327 resultados/763 overflow y 96 fechas inválidas en 192 comprobaciones, sin P1/P2, efectos, getters ni reloj implícito. Diagnóstico 12.249 B/3.802 B gzip/dos fuentes puras, no UI; cuatro grafos reales (Cantidades/Catálogo de empresa/Directorio/Guía) idénticos a PR #32 en nombres, aristas, specifiers, SHA-256, bytes y gzip, sin imports externos; análisis de assets sin ejecución HTTP/navegador/DB. QA navegador/E2E/a11y/PNG/hash heredada de PR #32, sin nuevas ejecuciones; [informe](../audits/r6-4a/verification-report.json). R6.4b y la demo conjunta R6.4c están verificados localmente; sin ledger ni operación real. **R6.4b implementado y verificado localmente**, [ADR-0056](adr/0056-evidencia-cobro-fixture.md): companies 1.4.0, obligación completa EUR/versionada y snapshot aplicado/revertido asOf, unknown sin importes ante ausencia/incomplete/futura, diferencia firmada y cero sin prueba de pago. Calendario existente desde datos normalizados, sin ledger ni superficies. Check 973 archivos/257 suites/3.510 pruebas; 37 dominio, seis arquitectura y 118 registry/manifest/acceso. Revisión 22.216, cero P1/P2/efectos/getters/reloj; diagnóstico 18.153 B/4.925 gzip/tres fuentes puras. Cuatro grafos cliente, 349 fuentes y 19 CSS iguales a PR #33; navegador/E2E/a11y/capturas/hash heredados de PR #32, sin ejecuciones nuevas. [Informe final](../audits/r6-4b/verification-report.json). Integrado en PR #34 (`2d72d2f0`), sin despliegue. R6.4c implementada y verificada localmente, disponible en repo: 12 casos×3 evaluaciones; check 977 archivos/258 suites/3.560 pruebas, revisión 23.857 sin P1/P2, navegador 2.660/72 visitas, a11y8 sin hallazgos, ocho PNG aprobadas y E2E nuevo 188/188. Cliente real 31.812 B/9.612 gzip/tres archivos; guía separada 15.171 B/6.309 gzip. Worker cerrado y hash antes/después idéntico de 143 tablas/353 filas. [Informe final](../audits/r6-4c/verification-report.json). Integrada en PR #35 (`b1bf0d2a`) y sin despliegue; B2B-003 parcial/inactiva. |
| B2B-004 | Límites y aprobación | módulo | P2 | parcial | **R6.5a implementado y verificado localmente**, [ADR-0057](adr/0057-limites-credito-fixture.md), companies 1.5.0. Instalada/inactiva en avanzado/demo, ausente mínimo/estándar; dependencia única B2B-001, sin superficies operativas. Política con companyExposureLimits/companyRequestLimits/buyerLimits independientes; solicitud EUR completa/versionada y exposición asOf completa que excluye exactamente esa solicitud. Tres comparaciones con diferencias firmadas; falta de regla unconfigured y exposición ausente/futura/incompleta unknown, sin ceros inventados. Límites de empresa/comprador por solicitud sin acumulación ni permiso; compañía/contacto inactivos conservan estado descriptivo. Sin aprobación agregada, reserva, stored value, conexión R6.4, auth, checkout, ledger, DDL, proveedor o I/O. Check 979 archivos sin diagnósticos/259 suites/3.605 pruebas; 44 dominio, seis arquitectura y 119 registry/manifest/acceso. Revisión 51.363 comprobaciones/4.375 casos monetarios/160 contextos sin P1/P2, efectos, getters o reloj implícito. Diagnóstico 15.266 B/4.277 gzip incluye constante histórica R6.4 de 113 B, sin cálculo R6.4. Cinco grafos, 352 fuentes de superficie y 19 CSS iguales a PR #35; navegador/E2E/a11y/capturas/hash heredados, sin nueva ejecución runtime o DB. [Informe final](../audits/r6-5a/verification-report.json). Integrado en PR #36 (`787a9e73`), sin despliegue; R6.5b verificado localmente, [ADR-0058](adr/0058-revision-credito-fixture.md), companies 1.6.0: política explícita de contactos/quórum, contexto íntegro antes de replay, historial 1+n y decisiones declaradas sin autorización; contacto no acredita persona y no cambia los diagnósticos de crédito. Check final 981 archivos sin diagnósticos/260 suites/3.653 pruebas, 48 dominio/seis arquitectura/119 registro. Revisión 33.973 comprobaciones/128 historiales/4.512 transiciones/240 replays/114 cambios de contexto/22 historiales corruptos, sin P1/P2, efectos, getters o reloj implícito. Diagnóstico 24.218 B/6.199 gzip, constante histórica 113 B y ninguna dependencia operativa; no asset Astro. Cinco grafos, 352 fuentes de superficie y 19 CSS iguales a PR #36; interacción y base QA heredadas de PR #35 sin nueva ejecución runtime. [Informe final](../audits/r6-5b/verification-report.json). Integrado en PR #37 (`16caef3`)/sin despliegue; R6.5c implementada y verificada localmente, /demo/admin/credito: quince contextos y revisión explícita con datos ficticios; check 985 archivos/261 suites/3.694 pruebas, revisión 129.333 sin P1/P2, navegador 6.368/108 visitas, a11y ocho superficies sin hallazgos, ocho PNG aprobadas, E2E nuevo 192/192 y hash QA 143 tablas/353 filas intacto. Cliente real 46.662 B/13.177 gzip en tres archivos, guía aparte. [Informe final](../audits/r6-5c/verification-report.json). Disponible en repo, integración pendiente/sin despliegue; B2B-009 pendiente y sin activación operativa. |
| B2B-005 | Reglas de cantidad | módulo | P2 | parcial | **R6.3a implementado y verificado localmente**, rama codex/variant-quantity-rules, integrado en PR #31 (`7ac42e67`) sin despliegue; [ADR-0054](adr/0054-reglas-cantidad-fixture.md). Propietario companies 1.2.0, dependencia de capacidad única B2B-002 y de módulo platform-configuration; instalada/inactiva en avanzado/demo, ausente en mínimo/estándar y sin superficies operativas. Política global por variante; regla fija unit/factor 1 o box/factor al menos 2, min/max inclusivos y múltiplo absoluto desde cero. Request con requestedCount y referencias exactas a política/catálogo; cero conserva diagnóstico below_minimum con regla y -0 se rechaza. BigInt para multiplicación/LCM/factibilidad; overflow rechazado también en ocultos/inactivos, sin ajuste automático. Ausencia unconfigured con unidad/factor/cantidad null; validación completa de referencias y pertenencia. Composición deriva identidad del mismo catálogo de empresa completamente normalizado, sin segundo catálogo; una variante por producto y diagnóstico aditivo a visibilidad, sin búsqueda de binding, pricing, precios/totales, autorización ni stock. Runtime quote 1..99 intacto. Check final 965 archivos/254 suites/3.376 pruebas; 112 propias (57 + 55), seis arquitectura y 117 registry/manifest/access. Oráculo 78.223 comprobaciones/3.234 políticas/1.738 factibles/12.372 cantidades/900 intersecciones sin P1/P2, efectos, getters ni reloj implícito. Diagnósticos API 7.728 B/dos fuentes y composición 35.934 B/siete, sin imports externos u operativos; clientes reales de Catálogo/Directorio/Guía conservan grafo, nombres, SHA y tamaños/gzip de PR #30, sin fuentes nuevas de cantidades en UI. Evidencia navegador/E2E/a11y/PNG/hash heredada de PR #30, sin nuevas ejecuciones; [informe](../audits/r6-3a/verification-report.json). **R6.3b implementada y verificada localmente, disponible en repo**, rama codex/variant-quantity-demo, integrada en PR #32 (`04d5f9a9`) sin despliegue: /demo/admin/cantidades, «Mínimos, múltiplos y cajas», Clientes tras Catálogo de empresa; empresa activa/professional fijos, ES/FR, una línea seleccionada y cantidades en memoria por variante (11→8, 12→2, 21→1), sin reinterpretación ni autoajuste. Preview existente, diagnóstico separado de visibilidad; sin regla count conservado con unidad/factor/conversión null, con regla count cero mantiene cantidad cero y below_minimum. Sin precios, totales, stock, permisos, I/O ni persistencia. Check final 969 archivos/255 suites/3.426 pruebas, 50 modelo y seis arquitectura; 44 HTML/44 formularios/cero crons. Revisión 39.967 comprobaciones/36 estados/484 transiciones/150 combinaciones de memoria/900 vistas, sin P1/P2, efectos, getters ni reloj implícito. Cliente real cinco archivos/53.687 B/17.349 B gzip, sin imports externos u operativos; guía separada 15.154 B/6.300 B gzip. Navegador nuevo 2.084 comprobaciones/72 visitas, a11y ocho sin hallazgos, ocho PNG aprobados por frontend y cuatro por revisión principal, E2E nuevo 184/184 y hash antes/después intacto de 143 tablas/353 filas; [informe final](../audits/r6-3b/verification-report.json). |
| B2B-006 | Presupuesto a pedido | módulo | P2 | pendiente | Conecta ORD-008 con aprobación y enlace de pago. R6.6a tiene diseño fixture revisado de solicitud y ofertas completas/versionadas, aún sin implementación; no duplica lifecycle, concede aprobación de crédito ni ejecuta conversión, reserva o cobro. Composición ORD-008 y demo en subcortes posteriores. |
| B2B-007 | Pedido por PO | módulo | P2 | pendiente | Nº de compra, documento y conciliación. |
| B2B-008 | Repetir pedido/lista rápida | módulo | P2 | pendiente | Entrada por SKU, CSV y cantidades previas. |
| B2B-009 | Delegación y permisos comprador | módulo | P3 | pendiente | Roles por sede y límites. |
| B2B-010 | Factura electrónica/ERP | conector | P2 | conector | Adaptador por sistema y país. |
| B2B-011 | Venta mayorista sin cuenta | gestionado | P2 | gestionado | Flujo de solicitud/presupuesto para proyectos simples. |

## POS — Venta física y omnicanal

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| POS-001 | Catálogo compartido con tienda física | conector | P3 | pendiente | Mapeo SKU y fuente de verdad definida. |
| POS-002 | Inventario sincronizado | conector | P3 | conector | Eventos, reconciliación y modo degradado. |
| POS-003 | Recogida/devolución cruzada | módulo | P3 | pendiente | Política y ledger comunes entre canales. |
| POS-004 | Venta asistida/enlace de pago | módulo | P3 | pendiente | Carrito creado por equipo y pago seguro del cliente. |
| POS-005 | Hardware POS propio | excluido | P3 | excluido | Se integra un proveedor certificado. |
| POS-006 | Operación offline propia | excluido | P3 | excluido | Responsabilidad del proveedor POS elegido. |
| POS-007 | Tap to Pay | conector | P3 | conector | SDK/proveedor certificado, fuera del storefront. |
| POS-008 | Efectivo/caja/turnos | conector | P3 | conector | Dominio especializado, no panel base. |

## MAR — Marketing y CRM

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| MAR-001 | Captura de lead/contacto | núcleo | P1 | actual | Validación, rate limit y almacenamiento. |
| MAR-002 | Captura de suscripción con consentimiento | módulo | P1 | pendiente | Double opt-in configurable y CUS-007. |
| MAR-003 | Email transaccional | conector | P0 | actual | Outbox y proveedor real por cliente. |
| MAR-004 | Email marketing | conector | P2 | conector | Audiencias, supresión, plantillas y métricas. |
| MAR-005 | SMS/WhatsApp marketing | conector | P2 | conector | Consentimiento por canal, plantillas y baja. |
| MAR-006 | Automatizaciones de ciclo de vida | módulo | P2 | pendiente | Bienvenida, abandono, poscompra y reactivación. |
| MAR-007 | Campañas y UTM | módulo | P2 | pendiente | Definición, enlaces, costes y resultados multicanal. |
| MAR-008 | Segmentación de clientes | módulo | P2 | pendiente | Se apoya en CUS-009 y eventos. |
| MAR-009 | Feed Merchant/Meta | conector | P1 | especificado | Catálogo validado, incremental y diagnóstico de rechazos. |
| MAR-010 | Marketplaces | conector | P2 | conector | Listings, stock, pedidos, devoluciones y reconciliación. |
| MAR-011 | Afiliados/creadores | conector | P3 | conector | Atribución, códigos, comisiones y devoluciones. |
| MAR-012 | Red publicitaria propia | excluido | P3 | excluido | Integrar canales existentes. |

## ANA — Analítica y experimentación

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| ANA-001 | Analítica web básica sin cookies | conector | P1 | parcial | Beacon opcional y métricas de infraestructura. |
| ANA-002 | Eventos de comercio propios | núcleo | P1 | pendiente | Contrato versionado para vista, carrito, checkout, compra y devolución. |
| ANA-003 | Embudo y conversión | módulo | P1 | pendiente | Métricas derivadas sin duplicar definiciones. |
| ANA-004 | Ventas, AOV y productos | módulo | P1 | pendiente | Ingresos netos/brutos con devoluciones y zona horaria. |
| ANA-005 | Operación de pedidos | módulo | P1 | pendiente | Tiempo a preparar, enviar, entregar, cancelar y devolver. |
| ANA-006 | Inventario | módulo | P2 | pendiente | Rotación, cobertura, roturas y stock inmóvil. |
| ANA-007 | Cohortes y repetición | módulo | P2 | pendiente | Identidad y consentimiento adecuados. |
| ANA-008 | Atribución de campañas | módulo | P2 | pendiente | Modelo declarado, UTMs y costes importados. |
| ANA-009 | Informes personalizables | módulo | P2 | pendiente | Dimensiones/métricas permitidas y exportación. |
| ANA-010 | Tests A/B y rollouts | módulo | P2 | pendiente | Hipótesis, asignación estable, guardrails y decisión. |
| ANA-011 | Exportación a BI | conector | P3 | conector | Datos incrementales, esquema versionado y PII minimizada. |
| ANA-012 | Monitor de rendimiento web | núcleo | P1 | parcial | Lighthouse reproducible y RUM opcional por cliente. |

## AUT — Automatización y eventos

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| AUT-001 | Timeline de eventos de pedido | núcleo | P0 | actual | Registro de transiciones principales. |
| AUT-002 | Bandeja/outbox de email | núcleo | P0 | actual | Generación desacoplada y visible en demo. |
| AUT-003 | Dispatcher con reintentos | núcleo | P0 | pendiente | Backoff, dead-letter, dedupe y replay. |
| AUT-004 | Triggers de dominio | módulo | P1 | pendiente | Evento + filtros + versión. |
| AUT-005 | Acciones tipadas | módulo | P1 | pendiente | Email, webhook, tag, hold, export o llamada a adaptador. |
| AUT-006 | Programación temporal | módulo | P2 | pendiente | Timezone, ejecución única/recurrente y catch-up. |
| AUT-007 | Constructor visual de flujos | excluido | P3 | excluido | Recetas configuradas por Logic2B, no lienzo universal. |
| AUT-008 | Recetas versionadas | gestionado | P2 | pendiente | Plantillas revisables, testables y reversibles. |
| AUT-009 | HTTP saliente seguro | módulo | P2 | pendiente | Allowlist, firma, timeout, límites y secretos. |
| AUT-010 | Aprobación humana | módulo | P2 | pendiente | Pausa, responsable, caducidad y resolución. |
| AUT-011 | Simulación/dry-run | módulo | P2 | actual | Dry-run servido sin escritura ni eventos, snapshot acotado, fingerprint íntegro, caducidad de 15 minutos y confirmación exacta separada. |

## INT — Integraciones y portabilidad

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| INT-001 | Pago Stripe | conector | P0 | actual | Checkout alojado, webhook, captura reconciliada y reembolso total idempotente; sin datos de tarjeta en Logic2B. |
| INT-002 | Email Resend | conector | P1 | parcial | En demo se captura; cliente real usa adaptador. |
| INT-003 | Packlink/Sendcloud por CSV | conector | P1 | actual | Exportación manual portable. |
| INT-004 | Backup SQL | núcleo | P0 | actual | Exportación restaurable autenticada. |
| INT-005 | Panel de integraciones | módulo | P1 | pendiente | Estado, última sync, errores, replay y desconexión. |
| INT-006 | Credenciales/secretos por adaptador | núcleo | P0 | parcial | Nunca en D1/logs/registro; R1.10 reduce su presencia a booleanos. Falta lifecycle de rotación por adaptador. |
| INT-007 | Healthcheck por integración | núcleo | P1 | parcial | Stripe, Resend y CSV tienen estado, configuración local y evidencia segura; faltan permisos/latencia remotos y alimentación persistente de última operación. |
| INT-008 | Idempotencia y cursores | núcleo | P0 | pendiente | Contrato común para push/pull y reconciliación. |
| INT-009 | Google Merchant/Meta | conector | P1 | especificado | Un feed canónico con diagnósticos por destino. |
| INT-010 | ERP/facturación | conector | P2 | conector | Adaptador por proveedor con mapeo y replay. |
| INT-011 | CRM/email marketing | conector | P2 | conector | Consentimientos y eventos normalizados. |
| INT-012 | Transportistas | conector | P2 | conector | Tarifas, etiquetas, tracking y devoluciones. |
| INT-013 | Importadores de plataformas | gestionado | P2 | pendiente | Dry-run, transformación, reconciliación e informe. |
| INT-014 | Portabilidad total | núcleo | P1 | parcial | Catálogo, clientes, pedidos, contenido, media y configuración exportables. |

## AIA — IA y comercio agéntico

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| AIA-001 | Asistencia para redactar producto | conector | P3 | pendiente | Borrador, fuentes, revisión y publicación humana. |
| AIA-002 | Edición/generación de imágenes | conector | P3 | pendiente | Proveniencia, derechos, alt y aprobación. |
| AIA-003 | Consultas de negocio en lenguaje natural | conector | P3 | pendiente | Solo métricas autorizadas, definición visible y trazabilidad. |
| AIA-004 | Copiloto administrativo | módulo | P3 | pendiente | Herramientas limitadas por permisos con preview/confirmación. |
| AIA-005 | Recomendación de automatizaciones | módulo | P3 | pendiente | Propone recetas; no activa sin aprobación. |
| AIA-006 | Catálogo preparado para agentes | núcleo | P2 | pendiente | Datos estructurados, políticas, disponibilidad y URLs canónicas. |
| AIA-007 | API de búsqueda de producto para agentes | módulo | P3 | pendiente | Scope, rate limit, ranking y observabilidad. |
| AIA-008 | Herramientas de carrito/checkout | módulo | P3 | pendiente | Sesión delimitada, idempotencia y confirmación del comprador. |
| AIA-009 | Servidor MCP administrativo | excluido | P3 | pendiente | Solo se evaluará tras permisos, audit log y action gateway. |
| AIA-010 | Agente autónomo con escritura irrestricta | excluido | P3 | excluido | Contradice seguridad y control humano. |

## SEC — Seguridad, fiabilidad y operación

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| SEC-001 | Auth de admin | núcleo | P0 | actual | Cookie firmada en demo; Access en cliente real. |
| SEC-002 | Autorización por rol/scopes | núcleo | P0 | pendiente | Denegar por defecto y permisos por capacidad. |
| SEC-003 | Rate limiting | núcleo | P0 | actual | APIs públicas sensibles limitadas. |
| SEC-004 | Validación de entrada | núcleo | P0 | actual | Zod y respuestas seguras. |
| SEC-005 | Audit log completo | núcleo | P0 | parcial | Actor, acción, entidad, diff, IP/contexto y correlation id. |
| SEC-006 | Protección PII y minimización | núcleo | P0 | parcial | Acceso, retención, redacción de logs y exportación controlada. |
| SEC-007 | Política de backups y restore drill | núcleo | P0 | parcial | RPO/RTO por cliente y restauración ensayada. |
| SEC-008 | Observabilidad estructurada | núcleo | P0 | parcial | Logs JSON, métricas operativas y correlation id activos; alertas/SLO quedan en R11.5. |
| SEC-009 | SLO y alertas | núcleo | P1 | pendiente | Checkout, webhooks, emails, syncs y storefront. |
| SEC-010 | Escaneo de dependencias/secretos | núcleo | P1 | pendiente | CI y proceso de respuesta. |
| SEC-011 | CSP y cabeceras de seguridad | núcleo | P1 | parcial | Política por superficies e integraciones. |
| SEC-012 | Accesibilidad WCAG 2.2 AA | núcleo | P0 | actual | Auditor propio y barrido global. |
| SEC-013 | Presupuestos de rendimiento | núcleo | P1 | parcial | Lighthouse, tamaño de JS/imágenes y regresión CI. |
| SEC-014 | Pruebas de carga y concurrencia | núcleo | P1 | parcial | Compra/inventario/fulfillment/refund incluyen 16 carreras simultáneas; R3.5 añade lotes mayores que un chunk y runners concurrentes sin duplicados; R3.12 añade el journey vertical multiubicación→RMA. Falta importación de olas posteriores. |
| SEC-015 | Runbook de incidentes | núcleo | P1 | parcial | R3.12 consolida detección, contención, recuperación idempotente y evidencia sin PII; comunicación por cliente, RPO/RTO y postmortem recurrente quedan en R11.3/R11.5. |
| SEC-016 | Privacidad y cumplimiento | gestionado | P1 | parcial | Configuración técnica + validación legal por cliente/mercado. |

## Resumen del gap actual

El MVP es fuerte en el camino feliz de `producto simple → carrito → cotización →
pago → pedido → envío`, y ya posee guardarraíles valiosos de dinero,
idempotencia, stock, seguridad y accesibilidad. Sus mayores huecos estructurales
son, en este orden:

1. manifest/registro de módulos, eventos versionados y outbox;
2. producto-variante y ledger de inventario;
3. reembolsos y fulfillment parcial sobre los ledgers ya instalados;
4. clientes/consentimientos y contexto de mercado;
5. contratos de adaptadores y observabilidad;
6. proyecciones para búsqueda, analítica y automatización;
7. B2B, omnicanal e IA construidos sobre esas primitivas.

Construir marketing, IA o un panel de integraciones antes de cerrar los cuatro
primeros puntos produciría una demo amplia sobre una base transaccional estrecha.

# R6.7b — Evidencia documental comercial con fixtures

Contrato y adaptador en memoria para comparar una observación documental de
ejemplo con una declaración PO y su oferta histórica completa. La correlación
de consulta y adaptador se valida antes de interpretar ausencias o fechas.
Los campos observados se comparan después, sin reasignar el documento.

`companyId` identifica a la empresa compradora declarada, no al emisor fiscal.
El soporte opaco de la PO y la referencia del documento observado son distintos.
El importe solo se compara si comprador y número PO coinciden exactamente y se
declara expresamente la misma magnitud comercial EUR del total de la oferta.
No se reutiliza un total fiscal ni se infieren pago, deuda o autorización.

La falta de respuesta, un origen sin configurar, la indisponibilidad, un caso
no soportado, una observación futura, evidencia incompleta y un documento no
aportado tienen razones distintas. Conservan el valor esperado y la metadata
legítima, sin inventar importes o fechas observadas. Un cero declarado válido
sí se compara. Los deltas se calculan con `BigInt` antes de comprobar su rango.

El adaptador admite hasta cien respuestas completas y congeladas. Su búsqueda
exige identidad y contenido íntegro de la consulta; no consulta red, proveedor,
base de datos o reloj. La extracción del predicado privado del número PO evita
gramáticas divergentes y conserva el comportamiento de R6.7a.

Validación de fuentes del 2026-10-04:

- Check global correcto: 1.001 archivos sin diagnósticos, 267 suites y 3.898
  pruebas; build con 44 HTML, 44 formularios locales y cero crons.
- 23 pruebas del dominio, 26 de regresión PO, seis de arquitectura y 34 del
  adaptador; registro/manifiesto/acceso: 121 pruebas, todas correctas.
- Revisión independiente, sin P1/P2: 28.509 aserciones del dominio, 6.726 de
  regresión PO y 14.534 del adaptador. Son baterías y cuentas separadas.
- Cero efectos, getters ejecutados o reloj implícito. Importación final sin
  construcciones de fecha; las llamadas solo usan instantes explícitos.
- Bundle público diagnóstico con adaptador: 30.809 B / 7.774 gzip, sin imports
  externos. Conserva 281 B de constantes históricas de colección/crédito;
  no incorpora runtime operativo. No es una medida de cliente Astro.
- Los siete grafos de navegador, 358 fuentes seleccionadas, 19 CSS y los 60
  JS públicos son idénticos a R6.7a. El Worker aumenta 61 B por la versión
  de `companies` y el enlace ADR; su manifest generado se informa aparte,
  sin afirmar equivalencia completa del SSR.

El primer check global detectó un import sin usar en una prueba; se retiró sin
alterar el producto o sus expectativas. Los oráculos anteriores siguen siendo
válidos; el [informe final](verification-report.json) registra la validación
global posterior y la comparación de assets con R6.7a.

Este corte no añade interfaz. La evidencia de interacción se hereda de
[R6.6c / PR #41](../r6-6c/README.md), con sus 9.068 comprobaciones de navegador,
ocho superficies a11y sin hallazgos, ocho capturas, E2E196 y hash intacto de
143 tablas/353 filas. No son ejecuciones nuevas de R6.7b. No hay HTTP, Worker,
navegador, base de datos, migración o despliegue en este recorrido.

`companies` 1.10.0 conserva B2B-007 instalada/inactiva y su dependencia B2B-006,
sin superficies operativas nuevas. La PO, la observación y la comparación no
acreditan documentos externos auténticos ni completan factura, ERP o cobro.
R6.7c aportará la demostración visual inerte mediante un plan separado.

Consejo: arquitectura ✓ · backend ✓ · fullstack ✓ · producto ✓ · frontend ✓ ·
UX/UI ✓ · SEO ✓.

# R6.7c — Referencias y documentos de empresa

Demo local de la referencia PO aportada y de la evidencia documental comercial,
con 18 escenarios y tres instantes explícitos. La vista se obtiene de los
contratos públicos de R6.7a–b y de su adaptador en memoria. No hay resultado de
aprobación global: comprador, referencia e importe conservan sus diagnósticos.

Los importes observados solo aparecen cuando pertenecen a la comparación
comercial. Un comprador o PO diferente no permite atribuir su cifra a la oferta;
la proyección pública elimina esos importes, además de los IDs y las referencias
internas. El cero declarado se mantiene distinto de un dato desconocido.

Los metadatos de un corte futuro, incompleto o sin documento se muestran como
tales. Cambiar la evaluación conserva la fecha original de la evidencia y no
simula una actualización externa. Referencia PO y soporte declarado son campos
separados del documento observado y del total comercial de la oferta.

Dos selectores y un restablecimiento controlan el ejemplo en memoria. No hay
formularios, uploads, descargas, facturas, pedidos, cobros, crons o escrituras
persistentes. La ruta `/demo/admin/documentos-empresa` exige los dos indicadores
de demo y conserva el acceso guiado, la privacidad de caché y la no indexación.

Verificación final del 2026-10-04:

- `pnpm check`: 1.005 archivos sin diagnósticos, 268 suites y 3.969 pruebas;
  build con 44 HTML, 44 formularios locales y cero crons.
- 71 pruebas del modelo, seis de arquitectura y ocho de acceso guiado correctas.
  Revisión independiente sin P1/P2: 7.132 aserciones de estado/contrato y 589
  de delegación, contabilizadas por separado.
- Navegador real: 5.076 comprobaciones, 108 visitas de matriz a 1440/375 y
  recorridos de teclado, ausencia, cero, frontera temporal, reset y recarga.
  Cero efectos del módulo, errores, overflow o fallos de hit-test. La guía
  compartida registra sus escrituras de sesión por separado.
- Ocho superficies a11y sin errores ni avisos; ocho capturas revisadas por
  frontend y cuatro representativas por raíz, sin hallazgos.
- E2E local: 200/200. Hash nuevo antes/después idéntico de 143 tablas y 353
  filas; sin preparar, sembrar ni migrar la base. Worker y Chrome cerrados.

El cliente emitido ocupa 60.721 B / 17.405 B gzip en cuatro archivos. Su sonda
sin raíz DOM registra una consulta y cero efectos; no sustituye las interacciones
anteriores. El bundle diagnóstico del modelo mide 49.778 B / 11.697 gzip y se
informa aparte, sin atribuirlo al cliente servido.

Cinco grafos de demos previas y los 19 CSS emitidos siguen idénticos. Ofertas y
presupuesto comparte ahora el contrato de negociación: +145 B en el grafo,
con declaraciones e inicialización verificadas estructuralmente. La guía añade
solo `|documentos-empresa` a su lista de destinos (+19 B). Estas comprobaciones
no equivalen a una nueva ejecución completa de las demos anteriores ni del SSR.
El componente nuevo aporta sus propios estilos inline.

[Informe agregado](verification-report.json) · [Navegador y capturas](report.md)
· [Datos de navegador](report.json) · [Accesibilidad](a11y-report.json).

Disponible en el repositorio; integración pendiente y sin despliegue. B2B-007
permanece parcial e instalada/inactiva. No se acredita autenticidad documental,
facturación fiscal, conciliación, deuda o pago.

Consejo: arquitectura ✓ · backend ✓ · fullstack ✓ · producto ✓ · frontend ✓ ·
UX/UI ✓ · SEO ✓.

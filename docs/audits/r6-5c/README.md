# R6.5c — Límites y revisión de crédito: QA local

`/demo/admin/credito` presenta quince contextos ficticios con tres comparaciones
independientes: exposición empresarial con la solicitud, importe por solicitud
y límite del comprador. La revisión se abre expresamente y conserva las
declaraciones de los contactos del ejemplo. No concede crédito, reserva
importes, autentica personas ni autoriza compras.

Verificación del 2026-10-04 sobre el build definitivo y el único Worker local
de fixtures. Las ocho imágenes tienen pase visual frontend/UX aprobado:
selectores y flechas despejados, foco visible, importes y estados legibles,
sin overflow. La guía real permanece en el header móvil y su lanzador de
escritorio no tapa importes ni controles.

- `pnpm check`: 985 archivos sin diagnósticos, 261 suites y 3.694 pruebas.
- [Navegador](report.json): 6.368 comprobaciones correctas, 108 visitas
  principales más recorridos focales y ocho capturas. Sin errores de consola
  ni excepciones.
- [Accesibilidad](a11y-report.json): ocho superficies, cero errores y avisos,
  incluida comprobación de movimiento reducido.
- Cero HTTP, storage, temporizadores, beacons y ventanas propios del módulo;
  ningún intento bloqueado de API, mutación HTTP o navegación externa.

El arnés recorre 54 visitas principales por tamaño, a 1440 y 375 píxeles: doce
casos pasan por revisión no abierta, pendiente con cero aceptaciones, pendiente
con una aceptación y aceptada con dos; otros tres pasan de no abierta a intento
bloqueado. Son 108 visitas principales, más recorridos focales de rechazo,
contactos no elegibles o ya respondidos, conservación del contexto y limpieza.
No se presentan esas 108 visitas como todas las transiciones posibles.

En los quince contextos de cada tamaño se verificaron 45 comparaciones: 33
conocidas, nueve sin límite y tres desconocidas. De las conocidas, 25 quedan
por debajo, cinco igualan y tres superan el límite. Doce exposiciones son
observadas y tres desconocidas. El oráculo utiliza tablas literales ajenas al
modelo para dinero, fechas, etiquetas, historia y disponibilidad de controles.

- Cero explícito conserva `0,00 €`; la diferencia negativa conserva su signo.
- Ausencia de exposición limpia sus importes y `asOf`; una observación futura
  o incompleta conserva su fecha legítima. Los límites conocidos permanecen.
- Ausencia de límite conserva el importe comparado, sin inventar diferencia,
  posición o crédito ilimitado. Los tres casos de límites aislados no heredan
  configuración de otra dimensión.
- Abrir, aceptar o rechazar no cambia las comparaciones ni convierte evidencia
  desconocida en conocida. Una revisión aceptada sigue siendo declarativa.
- Un contacto sin responder no puede actuar tras un cierre. Un rechazo cierra
  tanto como primera respuesta como después de una aceptación.
- Cambiar realmente de caso limpia expediente, historial, fechas y selección
  del contacto; seleccionar de nuevo el mismo caso conserva el artefacto.

Las ocho superficies de captura y accesibilidad son:

| Estado | Escritorio | Móvil |
|---|---|---|
| Bajo los límites, pendiente con una aceptación | [1440](pending-1440.png) | [375](pending-375.png) |
| Límites superados, revisión aceptada | [1440](above-accepted-1440.png) | [375](above-accepted-375.png) |
| Exposición ausente, revisión aceptada | [1440](missing-accepted-1440.png) | [375](missing-accepted-375.png) |
| Revisores insuficientes, apertura bloqueada | [1440](unreachable-blocked-1440.png) | [375](unreachable-blocked-375.png) |

La batería usa teclado real para las acciones. Al deshabilitarse el botón que
se acaba de activar, el foco debe quedar visible en el encabezado de revisión:
se comprueban apertura, primera aceptación y cierre. Tab continúa por contacto
si está pendiente y por reset si está cerrada. Los selects conservan nodo y
foco en los cambios ordinarios. Sin JavaScript se muestra el ejemplo inicial
completo con controles desactivados, sin formularios ni envíos.

Se comprueban cabeceras privadas/no-store/noindex, redirección anónima, reset,
recarga en un documento nuevo, referencias técnicas ausentes y controles de
al menos 44 píxeles. Ambas flechas se verifican con hit-test a 320 y 375 píxeles.
Antes de las capturas se restaura scroll cero y se esperan 75 ms desde Node
para estabilizar el layout, conservando la guía real.

El arnés bloquea y cuenta HTTP/API/mutaciones/navegación externa, storage,
temporizadores, beacons y ventanas del módulo. La guía se registra por separado:
solo se permiten sus escrituras en `logic2b:ecom-guide:v1`, distinguiendo arranque,
interacción explícita y recarga. El rAF de WhatsApp solo se admite tras cotejar
su caller exacto con fuente y HTML. No se excluyen efectos propios del módulo.
La guía realizó tres escrituras iniciales y dos de recarga por tamaño. Su fase
interactiva móvil registró ocho escrituras y ocho eventos en la clave permitida;
al cerrar, el almacenamiento volvió al inicial. No hubo fallos de hit-test ni
se ocultaron controles para las capturas.

Se audita la presentación clara real del panel y movimiento reducido. Los
casos cero, 320 píxeles y sin JavaScript pertenecen a las aserciones, no a
capturas adicionales. El pase visual examinó las ocho imágenes definitivas.

El grafo real de crédito contiene tres archivos y dos aristas: 46.662 bytes,
13.177 bytes sumando el gzip de sus archivos, sin imports externos. Los grafos
de condiciones/cobros, cantidades, catálogo de empresa y directorio conservan
nombres, imports, bytes, gzip y SHA del baseline de PR37. La guía cambia ocho
bytes —cinco gzip— por la única ampliación `|credito`; al retirarla se recupera
el SHA anterior. La comparación de superficies registra tres fuentes nuevas,
cambios de navegación/allowlist y un CSS sustituido entre los 19 emitidos.
Estos hashes no representan el grafo SSR transitivo completo ni sustituyen
las pruebas runtime anteriores de esas demos, heredadas de PR35. La evidencia
de navegador y accesibilidad de crédito descrita aquí es nueva.

Repetir únicamente con el Worker local de fixtures ya preparado:

```sh
BASE_URL=http://127.0.0.1:8793 OUTPUT_DIR=docs/audits/r6-5c pnpm test:e2e:credit
BASE_URL=http://127.0.0.1:8793 node scripts/a11y-audit.mjs --only=company-credit-review: --json
```

No iniciar otro Worker, acceder a D1 remota ni registrar cron. El
[informe agregado](verification-report.json) recoge los 192 checks E2E nuevos
y la comparación de la base QA: 143 tablas y 353 filas, con hash idéntico antes
y después. Chrome y el Worker quedaron cerrados al terminar. La integración
no implica despliegue.

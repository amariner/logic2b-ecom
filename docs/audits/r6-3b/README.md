# R6.3b — Mínimos, múltiplos y cajas: QA local

`/demo/admin/cantidades` permite explorar una regla por variante mediante
selecciones cerradas de mercado, variante y valor solicitado. Comprueba la
cantidad y la visibilidad por separado, sin ajustar el valor ni autorizar compras.

Verificación del 2026-10-04 sobre el build local definitivo. Las ocho capturas
tienen el pase visual aprobado: selectores y flechas despejados, foco visible,
guía real en el header móvil y lectura sin overflow. La caja no múltiplo, la
regla ausente y la variante oculta conservan diagnósticos distintos y claros.
Los casos cero, 320 píxeles y sin JavaScript corresponden a las aserciones del
arnés, sin atribuirles capturas visuales adicionales.

- `pnpm check`: 969 archivos sin diagnósticos, 255 suites y 3.426 pruebas.
- [Navegador](report.json): 2.084 comprobaciones correctas, 72 visitas a estados y ocho
  capturas. Sin excepciones ni errores de consola.
- [Accesibilidad](a11y-report.json): ocho superficies, cero errores y avisos,
  incluida la comprobación de movimiento reducido.
- Cero HTTP, escrituras de almacenamiento, temporizadores, beacons y ventanas
  propios del módulo; ningún intento bloqueado de API, mutación HTTP o navegación
  externa. Los efectos de la guía y el rAF de layout se registran aparte.

El oráculo del arnés usa literales independientes del modelo. Recorre 36 estados
a 1440 y 375 píxeles (72 visitas): dos mercados y tres variantes con 10, cinco
y tres opciones de cantidad. Por tamaño se verificaron ocho diagnósticos de cantidad
satisfechos, cinco resultados finales satisfechos, 31 bloqueados y seis casos
sin conversión conocida.

- Unidades: mínimo 5, máximo 17 y múltiplo absoluto de 4. Los valores 2 y 19
  acumulan el motivo del límite y el del múltiplo.
- Cajas de seis unidades: mínimo 6, máximo 18 y múltiplo de 4 unidades. Una
  caja no cumple; dos cajas equivalen a 12 unidades y cumplen.
- Variante sin regla: conserva el valor solicitado, incluido cero, pero unidad,
  factor y conversión siguen ausentes. La pantalla elimina los atributos y los
  textos de la regla anterior.
- Francia oculta la variante por unidades. Puede satisfacer su regla y seguir
  bloqueada por visibilidad; la variante elegida no se sustituye.

Las ocho superficies de captura y accesibilidad son:

| Estado | Escritorio | Móvil |
|---|---|---|
| ES, ocho unidades válidas | [1440](unit-valid-1440.png) | [375](unit-valid-375.png) |
| ES, una caja no múltiplo | [1440](box-invalid-1440.png) | [375](box-invalid-375.png) |
| Variante sin regla | [1440](unconfigured-1440.png) | [375](unconfigured-375.png) |
| FR, ocho unidades ocultas | [1440](hidden-1440.png) | [375](hidden-375.png) |

La batería comprueba memoria de cantidad por variante, cambios de mercado,
teclado, foco, reset, recarga en un documento nuevo y consulta sin JavaScript.
También verifica la redirección anónima y las cabeceras privadas/noindex del
acceso guiado. No cambia la configuración de capacidades en el servidor.

Los selectores visibles se comprueban mediante hit-test real, incluido el
selector de mercado a 320 y 375 píxeles. La guía compartida permanece visible;
sus ciclos de apertura, cierre, minimizar, Escape y cambios de tamaño a 1024
píxeles se verifican en una fase separada. Antes de cada captura se restaura
el scroll a cero y se esperan 75 ms desde Node para procesar el rAF de layout.

El arnés bloquea y cuenta HTTP operativo, API, navegación externa, storage,
temporizadores, beacons y ventanas. Solo admite escrituras de la guía en la
clave de sesión `logic2b:ecom-guide:v1`, separadas entre arranque, interacción
explícita y recarga. El único rAF permitido es el caller exacto de layout de
WhatsApp cotejado con la fuente y el HTML. Ningún efecto del módulo se excluye.
La guía realizó tres escrituras iniciales y dos de recarga por tamaño. Su fase
interactiva móvil registró ocho escrituras y ocho eventos en la clave permitida;
al cerrar, su valor volvió al inicial. No se ocultó el disparador real de la guía
para capturar la pantalla.

No se muestran precios, totales ni stock. La empresa y el canal son fixtures
descriptivos fijos; no acreditan identidad ni permiso de compra. El panel
conserva su diseño claro y se audita movimiento reducido, sin inventar un modo
oscuro del producto.

Repetir con un único Worker local de fixtures ya preparado:

```sh
BASE_URL=http://127.0.0.1:8793 OUTPUT_DIR=docs/audits/r6-3b pnpm test:e2e:quantities
BASE_URL=http://127.0.0.1:8793 node scripts/a11y-audit.mjs --only=variant-quantity: --json
```

No utilizar D1 remota ni registrar cron. El [informe agregado](verification-report.json)
recoge los 184 checks E2E y la comparación de la base QA: 143 tablas y 353 filas,
con hash idéntico antes y después. La integración no implica un despliegue.

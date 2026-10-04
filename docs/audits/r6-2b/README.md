# R6.2b — Catálogos y precios por empresa: QA local

`/demo/admin/catalogos-empresa` muestra tres productos con variantes explícitas
y precios unitarios de fixtures. La restricción de empresa se intersecta con
la publicación por mercado. Los precios disponibles conservan la precedencia
de tarifa de empresa, tarifa general y precio de la variante elegida.

Verificación del 2026-10-04 sobre el build local definitivo. El lanzador de la
guía se integra en el header móvil para dejar libres los selectores. El navegador
y las ocho capturas se han repetido después de esa corrección, junto con la
auditoría de accesibilidad. El pase visual de las ocho imágenes está aprobado:
Empresa y su flecha quedan libres en los cuatro estados móviles, el foco es
visible y no hay overflow horizontal ni importes residuales en los bloqueos.
El lanzador de escritorio se conserva. La comprobación adicional a 320 píxeles
corresponde al arnés, sin atribuirle una captura visual adicional.

- `pnpm check`: 961 archivos sin diagnósticos, 252 suites y 3.259 pruebas.
- [Navegador](report.json): 3.614 comprobaciones correctas, 64 estados y ocho
  capturas. Cada tamaño recorre 16 líneas con precio y 80 bloqueadas dentro de
  sus 32 combinaciones. Sin excepciones ni errores de consola.
- [Accesibilidad](a11y-report.json): ocho superficies, cero errores y avisos;
  incluye movimiento reducido. El panel conserva su diseño claro, sin modo oscuro.
- Cero HTTP, escrituras de almacenamiento, temporizadores, beacons y ventanas
  propios del módulo. No se detectaron intentos bloqueados de API, mutaciones
  HTTP ni navegación externa.

La matriz recorre 32 combinaciones a 1440 y 375 píxeles: cuatro
empresas, dos mercados y las dos opciones de cada uno de los primeros dos
productos. El tercero conserva su única variante y su selector desactivado.
Cambiar de contexto conserva las selecciones, incluso si dejan de ser visibles;
no se elige otra variante implícitamente.

La batería verifica bases de 1.000/1.500 y 2.000/2.500 céntimos, los overrides
por producto, los tres niveles de fallback, la intersección vacía y los bloqueos
por empresa inactiva o vinculación ausente. Un precio bloqueado elimina ambos
importes, sus atributos numéricos y el origen anterior. Los detalles de variantes
solo muestran identificación y estado, sin precios alternativos ni metadatos de
variante predeterminada. No se calculan totales ni se inicia una compra.

Las ocho capturas conservan el lanzador compartido de la guía:

| Estado | Escritorio | Móvil |
|---|---|---|
| Taller/ES: empresa, general y catálogo | [1440](baseline-1440.png) | [375](baseline-375.png) |
| Estudio/FR: ninguna variante común | [1440](disjoint-1440.png) | [375](disjoint-375.png) |
| Empresa activa sin tarifa vinculada | [1440](unbound-1440.png) | [375](unbound-375.png) |
| Empresa inactiva | [1440](inactive-1440.png) | [375](inactive-375.png) |

Los precios iniciales son 8,00 €, 18,00 € y 30,00 €, con niveles de fallback
0, 1 y 2. En Taller, cambiar la variante del primer producto de 10,00 € a
15,00 € de catálogo conserva el override por producto de 8,00 €. Estudio/ES
aplica su tarifa de 9,00 € a la variante 11, mientras que Estudio/FR no tiene
ninguna variante compartida entre sus dos selecciones. Taller/FR permite la
variante 12 sin sustituir automáticamente la variante 11 elegida.

El arnés comprueba teclado, foco, reset, recarga en otro documento y consulta
sin JavaScript; redirección anónima y privacidad/noindex del acceso guiado.
También verifica mediante hit-test las flechas de los selectores visibles,
incluyendo Empresa a 320 y 375 píxeles. Abrir, minimizar, cerrar y pulsar Escape
en la guía conserva un foco visible. Al cruzar 1024 píxeles el foco pasa al
disparador disponible o a la tarjeta abierta, y un selector enfocado conserva
su foco. Sin JavaScript, el nuevo disparador permanece oculto y desactivado.

Bloquea y cuenta HTTP operativo, APIs, navegación externa, almacenamiento,
temporizadores, beacons y ventanas del módulo. La guía realizó tres escrituras
al arrancar y dos al recargar por tamaño, exclusivamente en la clave de sesión
`logic2b:ecom-guide:v1`. Las interacciones explícitas de la guía móvil produjeron
otras ocho escrituras y ocho eventos de almacenamiento en esa misma clave,
registrados en una fase separada; al cerrar, su valor volvió al inicial.
Ninguna de esas escrituras se atribuye al módulo. El rAF visual compartido
de WhatsApp también se registra aparte.
El punto exacto de llamada del rAF se coteja con la fuente y el HTML;
ningún otro temporizador está permitido. Antes de cada captura se restablece
el scroll a cero y se esperan 75 ms desde Node para que ese frame compartido
actualice su visibilidad; después se exige el mismo hit-test sin superposiciones.
No se ocultan controles para obtener las capturas.

Los fixtures son públicos y descriptivos. Elegir una empresa no acredita
identidad, pertenencia ni permiso de compra. La vista no expone hashes,
referencias internas ni IDs de tarifas; conserva sus etiquetas explicativas.
Todos los productos y variantes de esta muestra son activos: el lifecycle
draft/archived permanece cubierto en los contratos previos, sin atribuir aquí
una cobertura visual inexistente.

Repetir después de preparar un único Worker local de fixtures:

```sh
BASE_URL=http://127.0.0.1:8793 OUTPUT_DIR=docs/audits/r6-2b pnpm test:e2e:company-catalog
BASE_URL=http://127.0.0.1:8793 node scripts/a11y-audit.mjs --only=company-catalog: --json
```

No utilizar D1 remota ni registrar cron. El E2E global y la comparación de la
base QA se registran por separado en el informe agregado de raíz.

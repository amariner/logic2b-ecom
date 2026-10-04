# R6.8d — Listas y repetición: QA de navegador

Build final: **4 de octubre de 2026, 06:52:48 UTC**. La comprobación global de raíz terminó con 1.016 archivos sin diagnósticos, 272 suites y 4.159 pruebas correctas.

El recorrido de Chrome se ejecutó de **06:53:34.776 a 06:53:41.744 UTC** contra el único Worker local de fixtures de raíz, en `http://127.0.0.1:8793`. Resultado: **1.994 comprobaciones correctas**, **20 visitas principales** —los diez ejemplos a 1.440 y 375 px— y ocho capturas. Los recorridos adicionales de limpieza, teclado, guía, recarga y ausencia de JavaScript se cuentan como comprobaciones, no como nuevas visitas de la matriz.

La auditoría de accesibilidad cubrió **20 superficies**, los diez ejemplos en ambos tamaños, con **cero hallazgos**. El ejemplo de SKU reutilizado se auditó también con preferencia de movimiento reducido. El panel es claro por diseño; no se atribuye cobertura de un modo oscuro inexistente.

- [Resultado completo del navegador](report.json)
- [Resultado de accesibilidad](a11y-report.json)

## Qué se comprobó

El oráculo utiliza literales del plan aceptado, sin importar el modelo, parser, evaluador o formatter de producción. Compara texto visible, atributos, estados de ocultación y placeholders separados.

- SKU y CSV conservan literalmente espacios, comas y comillas. El SKU ` KIT-A ` sigue incluyendo ambos espacios y no se corrige para identificarlo.
- Filas repetidas conservan cantidades independientes. La cantidad cero se muestra y no se suma ni elimina.
- CSV con cantidad `2.5` conserva las filas decodificadas como texto y su ubicación de diagnóstico; no presenta una identificación parcial. Una comilla sin cerrar no conserva un prefijo convertido en lista.
- La variante histórica declarada y la búsqueda por SKU se comparan por separado. Reutilizar un SKU no sustituye la variante de origen; ambigüedad y ausencia no se completan con candidatos.
- Los cambios entre CSV válido, inválido, histórico y SKU limpian resultados, atributos y nombres previos. Reset y recarga restauran el ejemplo inicial.
- El selector conserva su nodo y foco. Teclado real verifica selección, Tab y Enter. Sin JavaScript, el contenido inicial permanece legible y los controles quedan desactivados.
- El acceso anónimo GET/HEAD redirige a login local; el acceso guiado responde con privacidad, `no-store`, `Vary: Cookie` y `noindex`. El módulo no contiene formularios, enlaces operativos ni edición libre.

Por cada tamaño, las diez visitas contienen 14 filas de resultado: ocho de resolución y seis históricas. La resolución presenta seis coincidencias únicas, un SKU ausente y uno ambiguo; conserva dos cantidades cero. Se verifican dos diagnósticos de repetición y cinco de variantes distintas. El histórico conserva cuatro identidades encontradas, una ausente y una no declarada. El parser presenta un caso interpretable y dos inválidos.

## Efectos y shell compartido

El módulo produjo **cero peticiones HTTP durante las interacciones, escrituras o eventos de almacenamiento, temporizadores, beacons, ventanas, excepciones o errores de consola**. El interceptor bloquea antes del envío mutaciones, APIs y destinos externos; no se registró ningún intento bloqueado.

La guía se midió por separado: tres escrituras de arranque y dos de recarga por tamaño, exclusivamente sobre su clave de sesión; las interacciones explícitas de la guía móvil produjeron ocho escrituras y ocho eventos, restaurando el almacenamiento inicial. El único temporizador permitido fue el `requestAnimationFrame(update)` del layout compartido de WhatsApp, con fuente y posición exacta en el HTML contrastadas. No se atribuyen esos efectos a la demo.

El hit-test de la flecha del selector pasó a 320 y 375 px con la guía real. Abrir, minimizar, cerrar, Escape y cruzar 1.024 px preservaron o recuperaron foco visible; cambiar de tamaño no lo robó al selector. Antes de capturar se restauró scroll cero y se esperó desde Node a que terminara el frame del shell, sin ocultar controles.

## Capturas y revisión visual

Frontend inspeccionó las ocho imágenes; raíz revisó cuatro. Aprobadas: jerarquía, apilado móvil, ceros, CSV inválido, identidades independientes, placeholders, foco, flechas y guía. No se detectó overflow horizontal.

**Observación P3 aceptada por raíz:** a 375 px el selector cerrado recorta la etiqueta larga de ambigüedad. La opción accesible conserva el texto íntegro y la descripción está visible; no afecta al foco, la flecha ni la operación. Se conserva la fuente y la captura reales.

| Caso | 1.440 px | 375 px |
| --- | --- | --- |
| Filas conservadas | [Captura](list-repeated-1440.png) | [Captura](list-repeated-375.png) |
| Cantidad CSV no válida | [Captura](csv-invalid-field-1440.png) | [Captura](csv-invalid-field-375.png) |
| SKU histórico reutilizado | [Captura](history-reused-1440.png) | [Captura](history-reused-375.png) |
| Ambigüedad y ausencia histórica | [Captura](history-ambiguous-and-undeclared-1440.png) | [Captura](history-ambiguous-and-undeclared-375.png) |

## Comparación estática

El baseline corresponde a PR47/build 06:09:55 UTC. Se guardaron copias y SHA de los assets, 361 fuentes seleccionadas y seis archivos de contratos a/b/c, helper SKU, barrel y registro.

Los siete grafos de demos anteriores permanecen idénticos. El nuevo cliente ocupa 39.594 bytes y 10.636 gzip, en un único archivo sin imports externos. La guía añade únicamente `|listas-sku`: retirar ese texto recupera el SHA anterior exacto (+11 bytes y +8 gzip).

El inventario final contiene 364 fuentes seleccionadas, 63 JS públicos y 283 Worker. Los seis archivos adicionales de contratos/barrel/registro permanecen idénticos. De los 19 CSS, 18 son idénticos y la hoja global añade 430 bytes: reglas `.container`, `.hidden!` y el nuevo grid de la demo; no se retira ni modifica una regla previa. No se afirma igualdad binaria de CSS.

El Worker añade el modelo y la página SSR, navegación y metadata de rutas (+67.566 bytes). Cuatro páginas previas cambian únicamente aliases generados de imports. La comparación de nombres y fuentes seleccionadas no acredita equivalencia de todo el grafo SSR ni de todos los estilos de otras páginas. La evidencia interactiva de las otras demos se hereda explícitamente de PR44; la QA de esta página es la ejecución nueva descrita arriba.

Detalle estático: `/tmp/r68d-final-static-summary.json`, SHA256 `454ce45eaf5ed0de5eeb00033753149124e1f1eb8aa28f8ec3f5c89641a64ef2`. Las sumas gzip por archivo son descriptivas, no una medición de tráfico HTTP agregado.

El E2E global y la comparación de la base de datos pertenecen al cierre de raíz y se documentan en el informe agregado de esta auditoría. Este arnés no prepara fixtures, aplica migraciones ni escribe D1.

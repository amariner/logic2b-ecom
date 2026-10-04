# R6.7c — Referencias y documentos de empresa

Auditoría local del build final del **4 de octubre de 2026, 05:21:46 UTC**, servido por el único Worker QA preparado por raíz en `http://127.0.0.1:8793`. Ruta: `/demo/admin/documentos-empresa`. No se preparó, sembró ni migró la base desde este arnés.

## Resultados ejecutados

El recorrido de navegador terminó entre **05:22:43.875 y 05:22:53.424 UTC**, con Node `v24.19.0`: **5.076 comprobaciones correctas**, **108 visitas a estados** —18 ejemplos × 3 evaluaciones × 2 tamaños— y recorridos adicionales de limpieza, teclado, guía, reinicio y recarga. No se cuentan esos recorridos como más estados de la matriz.

| Resultado por tamaño | 1440 px | 375 px |
|---|---:|---:|
| Visitas de la matriz | 54 | 54 |
| Documento observado / resultado desconocido | 35 / 19 | 35 / 19 |
| Metadatos presentes / ausentes | 42 / 12 | 42 / 12 |
| Importe comparable / desconocido con documento observado | 17 / 18 | 17 / 18 |
| Importe menor / igual / mayor | 6 / 6 / 5 | 6 / 6 / 5 |

La auditoría de accesibilidad recorrió **ocho superficies**, con **cero hallazgos**. Conservó el aspecto claro real del panel y verificó movimiento reducido; no se atribuye un modo oscuro inexistente.

Evidencia: [informe del navegador](report.json) y [auditoría de accesibilidad](a11y-report.json). La verificación global, el E2E y el contraste de la base pertenecen al informe agregado de raíz.

## Qué se comprobó

- Los campos empresa, PO e importe tienen resultados independientes. La PO mantiene exactamente `PO 2026/0042-Á`; cambiarla a `PO 2026/0042-á` produce discrepancia literal.
- La falta de soporte PO no impide por sí sola comparar. La falta de PO o de atribución empresarial conserva el documento pero limpia importe observado, diferencia y fecha monetaria. La cifra centinela privada `8888` nunca aparece en el DOM, tampoco sin JavaScript.
- El cero conocido muestra `0,00 EUR`; la ausencia limpia texto y atributos numéricos y presenta un placeholder separado. Las diferencias firmadas conservan `+5,00 EUR`, `−5,00 EUR` y `−77,00 EUR`.
- El corte futuro mantiene su metadato de las 14:15 al evaluar las 14:00. Se admite exactamente a las 14:15; evaluar después no cambia el corte ni su `asOf`. Retroceder vuelve a retirar documento y comparaciones. No se inventa una caducidad.
- Se compararon textos visibles, fechas, `datetime`, importes, motivos, placeholders y visibilidad de sus contenedores. Una respuesta ausente limpia metadatos; la evidencia incompleta o sin documento conserva los metadatos que realmente existen.
- Los dos selectores conservan nodo, foco y la otra selección. Se verificaron teclado real, foco visible, reinicio, recarga en un documento nuevo y SSR inerte sin JavaScript.
- Los hit-tests de las flechas de ambos selectores pasaron a 320 y 375 px. No hubo overflow horizontal. Las capturas restituyen `scrollY=0` mediante scroll instantáneo y esperan 75 ms desde Node antes de medir el layout; no ocultan la guía ni ningún control.
- GET y HEAD anónimos devuelven 302 al acceso local; el acceso guiado devuelve 200. Ambos conservan `private, no-store`, `Vary: Cookie` y `X-Robots-Tag: noindex`. El HTML privado no contiene canonical ni hreflang.

## Efectos y shell compartido

El módulo produjo **cero peticiones HTTP, intentos o mutaciones de almacenamiento, temporizadores, beacons, ventanas nuevas y errores de consola** durante sus interacciones. El interceptor bloquea antes del envío métodos distintos de GET/HEAD, APIs, destinos externos y cualquier HTTP iniciado durante la interacción. No hubo intentos bloqueados.

La guía compartida se mide por separado: **tres escrituras de arranque y dos tras recarga por tamaño**, y **ocho escrituras/ocho eventos de almacenamiento** durante el recorrido móvil explícito de abrir, minimizar, cerrar, Escape y cambios de ancho. Todas usan exclusivamente `sessionStorage` y la clave `logic2b:ecom-guide:v1`; el almacenamiento final coincide con el inicial.

El único temporizador permitido del shell es el `requestAnimationFrame(update)` de `WhatsAppContact.astro`, identificado por contenido de script idéntico en el HTML y por su ubicación exacta de llamada. No se permite un temporizador del módulo bajo esta excepción.

## Capturas y revisión visual

Frontend inspeccionó las ocho capturas finales y raíz cuatro, sin hallazgos pendientes. La guía real permanece visible; selectores, flechas y foco quedan libres. El importe ajeno no aparece en el caso de otra empresa y el corte futuro distingue evaluación y observación sin datos residuales.

| Caso a las 14:00 UTC | Escritorio | Móvil |
|---|---|---|
| Coincidencia | [1440 px](same-1440.png) | [375 px](same-375.png) |
| Importe menor | [1440 px](lower-1440.png) | [375 px](lower-375.png) |
| Otra empresa compradora | [1440 px](company-different-1440.png) | [375 px](company-different-375.png) |
| Corte posterior | [1440 px](future-1440.png) | [375 px](future-375.png) |

Los casos cero, otras ausencias, frontera temporal, 320 px y sin JavaScript corresponden a las aserciones; no se atribuyen a capturas adicionales.

## Comparación estática de assets

Baseline R6.7b del **4 de octubre, 05:05:56 UTC** frente al build final R6.7c. Se conservaron copias completas de JS, CSS y las fuentes seleccionadas en `/tmp/r67c-*`.

- Cliente documental nuevo: entrada `CmP8C63F`, **36.029 bytes / 8.813 gzip**, SHA-256 `77ca8995b0fef6d1cf59b5a556fa790a4921f15c32bf1f4197d08fa6626dce86`. Grafo completo: **4 archivos, 6 aristas, 60.721 bytes / 17.405 gzip**, sin imports externos.
- Crédito, cobros, cantidades, catálogo y directorio conservan exactamente nombres, SHA, bytes, gzip e imports de sus grafos.
- Negociación extrae un módulo compartido: su grafo pasa de 57.551 a **57.696 bytes** y de 17.134 a **18.348 gzip**. La revisión independiente comparó los bundles anteriores y actuales y confirmó las mismas declaraciones, sentencias no declarativas y orden de inicializadores tras resolver nombres. No se afirma igualdad binaria ni una nueva interacción de esa página.
- La guía aumenta **19 bytes / 4 gzip**. Retirar únicamente `|documentos-empresa` restituye exactamente el SHA anterior; no hay otro cambio de cliente en la guía.
- Los JS públicos pasan de 60 a **62 archivos**; **58 permanecen idénticos**. Tamaño total por archivos: 432.002 bytes / 138.864 gzip. Estas sumas gzip no son una medición de transferencia HTTP agregada.
- El inventario de fuentes seleccionadas pasa de 358 a **361**: se añaden componente, composición y página documentales; cambian únicamente navegación de Admin y la allowlist de guía entre las fuentes previas. Los **19 CSS emitidos son idénticos**; el nuevo componente también aporta estilos inline, por lo que no se afirma igualdad de todo el CSS servido.
- Worker: 281 → **282 archivos**, +67.448 bytes. Incluye la nueva ruta/composición SSR, navegación, índice y manifest generados. Seis páginas anteriores solo cambian aliases de import; el resto de este contraste es estático y **no demuestra equivalencia completa del SSR transitivo**.

Informes de diagnóstico: `/tmp/r67c-final-static-summary.json`, `r67c-inherited-comparison.json`, `r67c-full-js-comparison.json`, `r67c-guide-delta-proof.json` y `r67c-structural-review.json`. La interacción de las demos anteriores sigue heredada explícitamente de **R6.6c/PR41**; la ejecución nueva descrita aquí corresponde a Documentos de empresa.

Fullstack ✓ · Frontend ✓ · UX/accesibilidad ✓ · SEO privado ✓.

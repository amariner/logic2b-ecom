# TH0.3 — auditoría visual y de producto de las superficies compartidas

> Fecha: 2026-08-18 · rama `codex/theme-product-hardening` · diagnóstico, no
> rediseño. La línea base estática de entrada vive en
> [`THEME_BASELINE.md`](THEME_BASELINE.md).

## Alcance y evidencia

Se revisaron `Shop.astro`, `CatalogPage`, `ProductPage`, `CartPage`,
`CheckoutPage`, `ThanksPage` y `/temas`, distinguiendo lo que pertenece al
contrato común de lo que corresponde a un tema individual. La comprobación
servida usó un único `wrangler dev` y estas muestras:

- `/temas` a 375, 768 y 1440 px;
- ARCE como tema inmersivo y escaparate comercial principal: catálogo, ficha,
  cesta activa, cálculo de envío y checkout;
- ARISTA como tema con cabecera común: cesta vacía y confirmación ausente;
- La Botiga como fallback del catálogo compartido;
- HTML real de ficha: `noindex,follow`, H1, description y Product + Offer;
- auditor a11y: ARCE 9/9, ARISTA 8/8, La Botiga 9/9 y `/temas` 2/2, todos con
  **0 errores y 0 avisos**.

Los tres anchos no presentan overflow de documento. `/temas` pasa de una
columna a 375 px a dos a 768/1440; búsqueda, filtros, recuento y estado vacío
siguen siendo accesibles. La cesta distingue vacío, carga, líneas, envío,
problemas y acción; el checkout revalida la simulación local y la confirmación
distingue éxito y ausencia cuando JavaScript está disponible.

## Lectura por superficie

La nota 0–4 de esta tabla es diagnóstica para el contrato, no sustituye la
rúbrica individual de cada tema.

| Superficie | Nota | Lo que ya sostiene | Límite principal |
|---|---:|---|---|
| `Shop.astro` | 2 | noindex, tokens, banner, cabecera/pie común y namespace | `immersive` elimina el chrome en todo el recorrido y el switcher fijo tapa controles |
| Catálogo compartido | 3 | GET para búsqueda/filtro/orden, cero resultados y stock | el fallback depende del `onchange` para ordenar y no prioriza el LCP |
| Ficha compartida | 2 | Product+Offer sincronizado, stock, cantidad, envío, devolución y relacionados | 29 temas dinámicos caen a una ficha genérica sin identidad ni camino persistente a cesta |
| Cesta | 3 | vacío/activo/problemas, precios y envío local revalidados | sin JS queda en «Calculando» y el estado activo no ofrece «seguir comprando» |
| Checkout | 3 | resumen, campos nativos, factura opcional y validación antes de confirmar | sin JS es inerte; en móvil el switcher puede tapar campos |
| Gracias | 2 | éxito/ausencia y referencia efímera sin backend | ambos estados nacen ocultos: sin JS la página queda vacía |
| `/temas` | 3 | propuesta clara, 33 tiendas, filtros, capturas propias, CTA y HTML completo sin JS | publica nombres de referencias ajenas y mezcla nombre de tema con nombre de tienda |

## Matriz de gaps P0–P3

### P0

No se encontró ningún P0: las 33 colecciones resuelven catálogo y ruta, no hay
assets de producto rotos y el recorrido local no toca D1 ni endpoints de cobro.

### P1

| ID | Gap y alcance | Evidencia | Impacto | Destino |
|---|---|---|---|---|
| TH0.3-P1-01 | El modo `immersive` elimina cabecera, cesta y pie en ficha/cesta/checkout/gracias de los 10 temas que caen a las rutas dinámicas: ARCE, Street, Iris, ARGENT, SUMMIT, TRAZA, DINTEL, LUMBRE, MIXTA y SARGA. Las cuatro rutas custom aportan su propio chrome y se tratan aparte en TH0.5/Forma. | `Shop.astro:84`; ARCE servido no contiene `header`, `footer` ni enlace a `/carrito` en la ficha. | El catálogo tiene orientación propia, pero al entrar en producto el visitante pierde marca y salida directa hacia la compra. | TH0.6 define chrome común compatible; TH1–TH4 verifican el acabado de cada tema. |
| TH0.3-P1-02 | «Otros temas», fijo abajo a la izquierda, se superpone a controles a 375 px. | `Shop.astro:130`; en ficha ARCE solapa 2.826 px² del input de cantidad y en checkout alcanza el campo de CP. | Un control comercial global tapa la tarea principal y puede interceptar el toque. | TH0.6, corrección compartida y regresión 375/768. |
| TH0.3-P1-03 | La ruta dinámica no selecciona presentación de ficha por tema: 29 escaparates montan el fallback de `ProductPage`. Seis `ProductDetail.astro` existentes (Minimal, Editorial, Guide, Launch, Iris y NODDO) no están cableados al contrato. | `src/pages/demo/tiendas/[collection]/[slug].astro`; búsqueda de imports: solo Forma, Sitēga y STRETCH consumen un ProductDetail. | La dirección de arte cae de forma brusca tras el catálogo; ARCE pasa de un hero editorial a una ficha genérica. | TH0.6 fija registro/slots sin forks; TH1–TH4 completan contenido y presentación. |
| TH0.3-P1-04 | No existe fallback honesto sin JavaScript para el recorrido local. | `CartPage.astro:33-40` deja carga visible; `ThanksPage.astro:19-42` oculta éxito y ausencia; checkout no tiene destino HTML ni `<noscript>`. | Con JS bloqueado la cesta queda calculando, el checkout no concluye y gracias aparece vacía. | TH0.6, fallback explicativo y navegación recuperable. |
| TH0.3-P1-05 | `/temas`, que es indexable, publica el nombre de la referencia externa en todas las tarjetas. | `src/pages/temas.astro:271`; ejemplos servidos: Teenage Engineering, TAGARNO y Up There Athletics. | Contradice la regla del carril «nunca publica la referencia ajena» y resta identidad propia al portfolio. | TH5.2 elimina la atribución pública y sustituye por criterio/sector propio. |
| TH0.3-P1-06 | NODDO, Sitēga y STRETCH mantienen rutas, storage y schema privados. | TH0.2-P1-02/P1-03: `*-demo-cart`, sin Product + Offer compartido. | Tres recorridos no reciben mejoras ni guardas comunes. | TH0.5. |
| TH0.3-P1-07 | La evidencia/galería explícita sigue incompleta. | TH0.2-P1-01/P1-04: SILLAGE falta en `galleryOrder`; ARGENT carece de captura completa, móvil y ficha. | El escaparate comercial y el protocolo de QA no representan los 33 temas de forma consistente. | TH0.4 guarda registros; TH3.5 regenera evidencia ARGENT. |

### P2

| ID | Gap y alcance | Evidencia | Impacto | Destino |
|---|---|---|---|---|
| TH0.3-P2-01 | Las 33 demos son `noindex,follow` pero carecen de canonical explícita. | HTML servido de ARCE: robots y Product+Offer presentes, `link[rel=canonical]` ausente; TH0.2-P2-01. | La ficha no cumple aún el contrato SEO listo para cliente definido por el carril. | TH0.6, una vez en `Shop`/`ProductPage`. |
| TH0.3-P2-02 | El recurso LCP compartido no declara prioridad. | Imagen principal de `ProductPage` sin `fetchpriority`; el fallback de `CatalogPage` marca incluso la primera fila como `loading="lazy"`. ARCE tampoco prioriza su hero. | La carga inicial depende más de heurísticas del navegador y dificulta sostener LCP ≤2,5 s por tema. | TH0.6 para ficha/fallback; TH1–TH4 para el hero de cada tema. |
| TH0.3-P2-03 | Añadir desde ficha solo cambia el texto 900 ms, sin `aria-live` ni enlace persistente a cesta. | `ProductPage.astro:173-188`; en un tema inmersivo la ficha contiene cero enlaces a `/carrito`. | El usuario recibe feedback fugaz y debe volver al catálogo para encontrar la bolsa. | TH0.6, feedback estable y recuperable dentro del contrato. |
| TH0.3-P2-04 | La cesta activa no ofrece «seguir comprando» en su contenido. | `Ir a la tienda` vive dentro de `[data-cart-empty]`; en ARCE activo solo queda la CTA hacia checkout. | Corregir una elección o añadir otra pieza requiere retroceder o conocer la URL, especialmente sin chrome inmersivo. | TH0.6. |
| TH0.3-P2-05 | `/temas` mezcla etiqueta técnica y marca del escaparate. | Tarjetas como `Street → Entra en ASFALTO`, `Launch → Vector`, `Tema Noddo → NODDO`. | La captura, el título y el CTA no cuentan una única propuesta, como exige §5.6. | TH5.1 posicionamiento; TH5.2 arquitectura/copy. |
| TH0.3-P2-06 | Cuatro directorios superan 2,5 MB y cinco temas conservan JPG/MP4. | TH0.2-P2-02/P2-03: ARGENT, Forma, NODDO, Sitēga; además Iris y STRETCH en formatos heredados. | El inventario no equivale al payload, pero exige medición servida antes de declarar rendimiento entregable. | TH0.3 deja la prioridad; se mide/corrige en TH1–TH4 y se consolida en TH5.4. |

### P3

| ID | Gap y alcance | Evidencia | Impacto | Destino |
|---|---|---|---|---|
| TH0.3-P3-01 | Los filtros de `/temas` desbordan horizontalmente a 375 y 768 sin pista visual de scroll. | 768 px: `scrollWidth 812` sobre `clientWidth 637`; la última pastilla queda cortada. | La interacción funciona, pero parte de los sectores parece desaparecer. | TH5.2. |
| TH0.3-P3-02 | El fallback estático y la documentación no reflejan los 33 temas. | TH0.2-P3-01/P3-02: 25 samples ausentes y `docs/TEMAS.md` aún dice 28. | No rompe la tarjeta mientras exista captura viva, pero debilita clonabilidad y mantenimiento. | TH0.6 para docs; TH5.2 para fallbacks. |
| TH0.3-P3-03 | La franja común dice que «el motor funciona igual detrás» sin aclarar ahí mismo que el recorrido público es local y no crea pedidos. | `DemoJourneyBanner.astro:17-24`; la precisión aparece más tarde en checkout. | Un prospecto puede interpretar el panel y la cesta como una misma tienda viva. | TH0.6, copy común veraz sin cambiar promesas. |

## Decisiones para los siguientes bloques

1. TH0.4 puede convertir la deriva objetiva de SILLAGE/ARGENT. en guardas sin
   tocar presentación.
2. TH0.5 migra las tres excepciones privadas; no debe intentar resolver el
   chrome inmersivo con otro fork.
3. TH0.6 debe resolver una vez chrome, solapamientos, fallback JS, canonical y
   feedback de ficha antes de que ARCE fije el estándar visual.
4. TH1–TH4 profesionalizan contenido y dirección de arte por tema sobre ese
   contrato; TH5.1/TH5.2 corrigen posicionamiento y copy de `/temas`.

No se cambió código servido ni se desplegó. Solo se creó estado efímero dentro
del navegador local de prueba (una línea de cesta y un CP); no se escribió en
D1 ni en servicios remotos.

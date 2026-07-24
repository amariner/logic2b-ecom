# FASE 11 — Landing V2 «nivel Awwwards», negocio, funnel y documentación

> **Plan maestro, 2026-07-23.** Escrito para ejecutarse **por sesiones
> independientes** (Opus u otro modelo): cada bloque F11.x es una sesión con su
> prompt, sus entregables y sus criterios de cierre. Leer también `CLAUDE.md` y
> `docs/ROADMAP.md` al empezar cualquier bloque. Regla de siempre: `git fetch`
> al arrancar, `pnpm check` en verde antes de commitear, y **parar al cerrar el
> bloque** para el OK de Andreu.

---

## 0. Diagnóstico: por qué la landing actual no vende lo que ya tenemos

La landing (`src/pages/index.astro`, 320 líneas) es **correcta pero genérica**:
hero de texto + una foto, seis tarjetas iguales con el mismo checkmark, tabla
comparativa, precios y FAQ. Problemas concretos:

1. **No enseña el producto.** Cero capturas reales de las tiendas ni del panel.
   Las 3 tarjetas de «demos» usan fotos de *producto* (aceites, conservas,
   mieles), no de las *tiendas*. Un visitante no ve lo que compra sin hacer clic.
2. **Ignora el mayor activo del proyecto.** Tras la Fase 9B hay **6 tiendas
   radicalmente distintas funcionando** (Vector, Forma Interior, Módulo Audio,
   Cafetal, Iris, Botiga) sobre un motor. La tesis comercial — *«diseñamos
   tiendas radicalmente distintas y las entregamos rápido»* — no aparece en la
   landing. Iris (vídeo scrubbing) es material de portfolio y está invisible.
3. **Cero motion, cero narrativa.** Nivel «plantilla SaaS limpia», no nivel
   premio. Awwwards puntúa: diseño 40 %, usabilidad 30 %, creatividad 20 %,
   contenido 10 %. Hoy: usabilidad alta, creatividad casi nula.
4. **Funnel débil.** Único CTA de conversión: un `mailto:`. Sin formulario, sin
   WhatsApp (¡comercio local!), sin medición de conversión, sin caso de estudio.
5. **Docs de cliente sin ejecutar** (Fase 10 entera pendiente): quien llega
   convencido no tiene «qué necesitamos de ti», ni manual, ni acta de entrega.

**Activos ya disponibles:** 6 tiendas navegables + panel completo con fixtures
realistas (9B.2: 8 pedidos, 5 estados, 16 emails) + 8 referencias visuales +
39 fotos de producto Higgsfield + `/dossier` + `/estilos` + Lighthouse 100.
**Créditos Higgsfield: ~652** (consultado 2026-07-23), coste medio observado
~2,3 créditos/imagen → presupuesto holgado para todo el plan (~180 créd.).

---

## 1. DECISIONES PREVIAS — ✅ TODAS APROBADAS por Andreu el 2026-07-23 (visto bueno global a las recomendaciones)

| # | Decisión | Recomendación (APROBADA) | Estado |
|---|---|---|---|
| D1 | **JS en la landing.** La regla «cero JS» (2026-07-19) es incompatible con nivel Awwwards. | Relajar a **«JS propio mínimo, ≤15 KB, sin dependencias»**: CSS scroll-driven animations + View Transitions con fallback total sin JS, y un único script vanilla para los componentes interactivos (galería de tiendas, calculadora). Lighthouse 100 sigue siendo criterio de cierre innegociable. **Nada de GSAP/Lenis/Framer**: dependencia nueva = romper la regla 14 de CLAUDE.md, y el scroll-jacking penaliza usabilidad (30 % del jurado). | ✅ |
| D2 | **Cómo se capturan los screenshots.** | Sesión local con las browser tools de Claude (wrangler dev + viewport fijo), sin dependencia nueva. Guardarlas versionadas en `public/images/screens/`. Alternativa si se quiere repetibilidad: script Playwright — es dependencia dev nueva, **pedir OK aparte**. | ✅ |
| D3 | **Dirección creativa** (§ 3: A, B o C). | **C** («Ocho tiendas, un motor») — es la única que ningún competidor puede copiar. | ✅ C |
| D4 | **Precios** (§ 6): confirmar o ajustar 1.900 € / 29 €/mes y decidir tiers. | Escalera de § 6.2: Lite desde 590 € · Kit 1.900 € + 39 €/mes (nuevos clientes) · Kit a medida desde 3.400 € + 59 €/mes. | ✅ |
| D5 | **Canal de contacto**: ¿formulario con D1, WhatsApp, o solo mailto mejorado? | WhatsApp + mailto en v1 (cero backend nuevo); formulario→D1 como F11.6 opcional. **Falta el número de WhatsApp de negocio: pedírselo a Andreu al implementar.** | ✅ |
| D6 | **Kit Lite**: ¿se publica en la landing para medir demanda? (análisis en `docs/LITE.md`). | Sí, como tarjeta secundaria «desde 590 €» sin construirlo (recomendación ya escrita en LITE.md). | ✅ |

---

## 2. Principios que NO cambian

- Coste 0 €/mes, planes gratuitos de Cloudflare.
- Estética Logic2B UI como base (Inter, tokens neutros oklch, monocromo + acento).
  Referencia: ui.logic2b.com. La landing puede ser más expresiva que la base,
  pero se construye **con los tokens del sistema**, no contra ellos.
- Sin dependencias nuevas sin OK explícito (regla 14).
- `/` y `/arquitectura` indexables y Lighthouse 100/100/100/100; `prefers-reduced-motion`
  respetado en TODO (el fallback sin motion debe ser una página completa, no rota).
- El copy vende a un **comercio de Castellón sin equipo técnico**: nada de jerga.
  Términos como «edge», «D1» o «webhook» solo en `/arquitectura`.

---

## 3. Dirección creativa (elegir UNA — decisión D3)

**A · «El sistema se enseña a sí mismo».** Scroll storytelling del flujo real:
compra → email → panel → envío. Cada scroll-step muestra la captura real de esa
pantalla. Fortaleza: demuestra el producto entero sin salir de la landing.
Riesgo: lineal, más «explicación» que «wow».

**B · «Editorial técnico»** (familia Linear/Vercel). Monocromo estricto,
tipografía display gigante, capturas con glow sobre fondo oscuro, cifras enormes
(0 €/mes · <0,5 s · 100/100). Fortaleza: encaja perfecto con Logic2B UI y es
sobrio de ejecutar. Riesgo: es el look que ya tienen mil SaaS — difícil premio.

**C · «Ocho tiendas, un motor»** ★ recomendada. El hero ES la diversidad: una
galería/tira de las tiendas reales (capturas grandes, cada una con su paleta)
que se recorre con scroll horizontal nativo o hover-expand; al pasar de una a
otra, **el acento de la landing muta al de la tienda activa** (una CSS var).
Debajo, la narrativa: «mismo motor, cero cuotas» → flujo del pedido con
capturas del panel → precios → docs. Fortaleza: enseña el activo único del
proyecto y el «color que muta» es el detalle memorable que puntúa creatividad.
Riesgo: exige que las capturas de las 6-8 tiendas sean impecables (F11.1/2).

> Las tres comparten esqueleto de secciones (§ 5); la dirección decide el hero,
> el tratamiento visual y el nivel de motion. Si C: Iris se muestra en vídeo
> corto autohospedado (ya hay H.264 de 2 MB) — es la captura que no se puede
> hacer estática.

---

## 4. F11.1 — Assets I: capturas reales de tiendas y panel

**Sesión local** (necesita wrangler dev + D1 sembrada + browser tools).

- Preparación: `pnpm db:reset` para fixtures prístinas; viewport desktop
  **1440×900** y móvil **390×844**; tema claro (y oscuro solo si la dirección
  elegida lo usa).
- **Lista de capturas** (nombrar `public/images/screens/<superficie>-<vista>.webp`,
  optimizar ≤150 KB desktop / ≤60 KB móvil, generar también AVIF si pesa menos):
  - Por cada tienda (launch, minimal, editorial, guide, iris*, tienda genérica):
    catálogo completo, ficha de producto, carrito con líneas. *Iris: además
    clip de vídeo de 5-8 s del scrub (screen recording), poster incluido.
  - Panel: listado de pedidos (5 estados visibles), detalle de pedido con
    timeline + tracking, productos, envíos/tarifas, **bandeja de emails** (la
    pieza estrella), y el email de confirmación abierto.
  - Flujo: checkout con portes calculados, `/demo/gracias`.
- Encuadres pensados para la landing: las capturas de tienda a sangre completa
  (hero de la galería); las del panel recortadas al área útil (sin banner demo).
  El banner de demo NO debe salir en ninguna captura (ocultarlo con una clase
  utilitaria temporal o capturar por debajo).
- **Entregable extra:** `public/images/screens/README.md` con la receta exacta
  de re-captura (URL, viewport, pasos), porque las capturas caducan con cada
  rediseño de tema.

**Cierre:** todas las capturas en el repo, pesos verificados, README escrito.

## 4b. F11.2 — Assets II: imaginería Higgsfield (sesión LOCAL)

> La red de sesiones cloud bloquea el CDN de Higgsfield (visto en Fase 8):
> **siempre en local**. Optimizar todo a WebP con el flujo ya existente
> (`scripts/fetch-product-images.mjs` como referencia).

Presupuesto orientativo (~180 créditos de los 652 disponibles):

1. **Cerrar 9B.5 primero** (~120 créd.) — es prerequisito de la galería de la
   dirección C: heroes/editorial de las 4 tiendas hechas + catálogo y fotos de
   las 3 restantes (Industrial ~10, Natural ~12, Street ~12, Specs ~9 según
   reparto de 9B.0). Cada tienda nueva sigue `docs/CHECKLIST_TEMA.md`.
2. **Landing** (~40 créd.):
   - Imagen/es de hero según dirección (C: no necesita — el hero son capturas).
   - `og.jpg` nuevo 1200×630 con la tira de tiendas (pieza de venta al
     compartir por WhatsApp: así llega a los comercios).
   - 3-4 piezas de apoyo para `/dossier` y sección «proceso» (mesa de trabajo,
     paquetería/etiquetas Packlink, mostrador de comercio — fotografía cálida
     coherente, nada de stock genérico).
3. **Documentación** (~15 créd.): cabeceras suaves para `/ayuda` (§ 8).

**Regla:** misma receta visual por familia (luz, fondo, encuadre) — los prompts
se guardan en `docs/temas/<id>.md` o en el README de screens para reproducirlos.

---

## 5. F11.3 — La landing V2, sección a sección

> Una sesión para maquetar el esqueleto + hero; una segunda de motion y pulido.
> Todo con tokens semánticos; texto siempre `text-foreground`/`muted-foreground`
> (gotcha del `<body>` documentado en ROADMAP). Cada sección tiene fallback
> completo sin JS y sin motion.

Esqueleto (orden de scroll, dirección C como referencia):

1. **Hero — galería de tiendas.** Titular corto arriba («Tiendas a medida.
   Motor probado. 0 €/mes de infraestructura.»). Tira horizontal de las 6-8
   tiendas con capturas grandes; scroll horizontal nativo con `scroll-snap`
   (patrón ya validado en el tema Launch, accesible por teclado). Acento de la
   landing muta con la tienda activa (`--color-brand` por slide, CSS puro con
   `:has()`/scroll-driven si D1 lo permite; si no, estático por tarjeta). Cada
   tarjeta → enlaza a SU demo. Iris entra en vídeo con poster.
2. **Barra de prueba** (sustituye a «cifras del problema» como banda fina):
   `0 €/mes infraestructura · <0,5 s de carga · 100/100 Lighthouse · pagos
   Stripe`. Cifras reales, enlazadas a `/arquitectura` donde se justifican.
3. **«Lo que te cuesta tu tienda actual»** — se conserva (funciona) pero con
   las 3 cifras animadas al entrar en viewport (CSS `animation-timeline: view()`
   con fallback estático).
4. **El flujo del pedido, con capturas reales.** Storytelling en 4 pasos con
   las capturas de F11.1: (1) el cliente compra → checkout real; (2) te llega
   el email → bandeja; (3) lo gestionas → detalle de pedido con timeline; (4)
   Packlink + tracking → email de envío. Layout alternado imagen/texto,
   `position: sticky` en el paso activo si el motion lo permite. **Es la
   sección que convierte**: el comercio se ve a sí mismo operando.
5. **Comparativa** — se conserva la tabla + se añade la fila incómoda de la
   Fase 10: **«Cuándo NO somos tu opción»** (multiidioma, +500 SKUs,
   marketplace, suscripciones) en un aside honesto. Genera más confianza de la
   que quita.
6. **Precios** — según decisión D4 (§ 6). Añadir mini-calculadora a 3 años
   (slider de ventas/mes → compara kit vs Shopify; vanilla, un `<input range>`
   y 10 líneas de JS, o versión estática de 3 escenarios si D1 se deniega).
7. **Demos + estilos.** Tarjetas del panel y bandeja de emails (capturas
   reales, no fotos de producto) + enlace a `/estilos` «elige tu dirección».
8. **FAQ** (se conserva) + **CTA final** según D5: WhatsApp + email, con
   microcopy de qué pasa después («te contestamos en 24 h con 2-3 preguntas»).

**Detalles de acabado nivel premio** (baratos, alto impacto):
tipografía display con `font-variation-settings` animada en el hero; grano/
textura sutil en bandas oscuras; `::selection` con el acento; scrollbar
estilizada; View Transitions entre `/` ↔ `/estilos` ↔ demos; favicon animable
ya existente; microinteracciones hover en TODAS las tarjetas (ya hay patrón);
página coherente en dark mode.

**Criterios de cierre:** Lighthouse 100×4 en `/`; CLS 0 con las capturas
(width/height siempre); `prefers-reduced-motion` verificada; teclado completo;
peso total de `/` < 1 MB transferido (capturas lazy salvo hero); `pnpm check`
verde; verificación 1440/375 claro/oscuro.

## 5b. F11.4 — `/arquitectura` y `/estilos` al nivel de la landing

- `/estilos`: pasar de fichas a **catálogo con capturas reales** y enlace
  directo a cada tienda viva (cierra 9B.7). Añadir la «guía para elegir estilo»
  (árbol corto: ¿tu producto entra por la foto o por los datos? ¿cuántas
  referencias?) — pieza 10.1 del ROADMAP.
- `/arquitectura`: conservar el rigor, añadir las capturas del panel y el
  diagrama animado con CSS (el SVG existente, trazos `stroke-dashoffset` al
  entrar en viewport). Es la página que da confianza técnica al cuñado
  informático del comerciante — trátala como parte del funnel.

---

## 6. F11.5 — Precios y plan de negocio (análisis + propuesta)

### 6.1 Diagnóstico del precio actual (1.900 € + 29 €/mes)

- **El setup está barato para lo que ya se enseña.** Con 8 tiendas de nivel
  portfolio y temas como Iris, 1.900 € está en rango «WordPress con plantilla»
  del mercado español (tienda a medida real: 3.000–6.000 €). Precio bajo +
  «a medida» genera además desconfianza de calidad.
- **Pero el target (comercio pequeño de Castellón) es sensible al precio**, y
  el modelo de negocio real es el **MRR del mantenimiento**, no el setup.
- **29 €/mes es poco MRR** para sostener soporte + pequeños cambios: 20
  clientes = 580 €/mes. El valor percibido del mantenimiento (backups,
  actualizaciones, cambios) soporta más.

### 6.2 Propuesta de escalera (validar D4)

| Tier | Precio | Qué es |
|---|---|---|
| **Lite** | desde 590 € + 0 €/mes | Lo de `docs/LITE.md`: ≤10 productos, Payment Links, sin panel. Se **publica sin construirse** para medir demanda (D6) |
| **Kit** | **1.900 €** + 39 €/mes | El producto actual con un tema del catálogo de `/estilos` adaptado (color, tipografía, fotos). El precio ancla no se toca: ya está publicado y la comparativa a 3 años sigue ganando de calle |
| **Kit a medida** | desde 3.400 € + 59 €/mes | Dirección visual propia nivel Iris/Editorial: sesión de arte, imaginería generada, tema exclusivo. Es donde las 8 tiendas demuestran capacidad |

- Mantenimiento: subir 29 → **39 €** (nuevos clientes) con contenido explícito
  («hasta 2 h de cambios/mes» — hoy «pequeños cambios» es indefinido y es la
  fuente clásica de scope creep). Tier 59 € para el tema a medida con prioridad.
- Todo son **propuestas**: los números finales los fija Andreu. La sesión
  F11.5 entrega la tabla final + copy de la sección de precios + actualización
  del `/dossier` (que hoy cita 2.944 €/3 años — recalcular con lo decidido).

### 6.3 Unit economics a documentar (interno, va al final de este doc, no a la web)

Por cliente Kit: setup 1.900 € − coste de producción (con el motor hecho: la
serie de coste real por tema ya se anota en `docs/temas/*.md` — usarla) −
imaginería (~50 créd. Higgsfield) − dominio si se adelanta. MRR 39 € con coste
marginal ~0 (infra gratis). Punto de equilibrio del mantenimiento: ~2 h/mes de
media. Objetivo año 1 razonable: 8–12 clientes Kit → ~4.000 €/año de MRR
acumulado + setups. El plan de la sesión F11.5 es dejar esta cuenta escrita y
honesta, no inflarla.

---

## 7. F11.6 — Workflow de venta y funnel del usuario

### 7.1 El viaje del comprador (comercio) — diseñarlo, no dejarlo al azar

```
Descubre                Evalúa                    Decide            Compra
WhatsApp compartido →   Landing (galería) →       /dossier (PDF) →  CTA contacto
Google local / SEO  →   toca UNA demo guiada →    /estilos elige →  WhatsApp/email
Boca a boca         →   ve el panel + emails →    precios claros →  → respuesta 24h
```

Trabajo concreto de la sesión:

1. **Recorrido demo guiado de 3 minutos**: la micro-guía existente (1 compra →
   2 panel → 3 emails) se asciende a pieza central — botón «Haz la demo en 3
   minutos» en el hero que arranca el recorrido con pasos numerados persistentes
   (banda fina, sin JS nuevo: es la franja actual mejorada + parámetro `?tour=1`
   o simplemente enlaces encadenados). El comercio que **completa una compra y
   ve su email en la bandeja** está medio cerrado.
2. **CTAs por temperatura**: frío → «mira las tiendas» (galería); templado →
   «haz la demo»; caliente → «escríbenos por WhatsApp». Nunca un solo mailto.
3. **Medición**: eventos de CTA con CF Web Analytics (el beacon ya está cableado;
   falta el token — paso local de Andreu, ya pendiente en ROADMAP). Definir 4
   eventos: entra-demo, completa-compra-demo, abre-dossier, contacto.
4. **Material de cierre**: `/dossier` imprimible ya existe → añadirle la
   checklist «qué necesitamos de ti» (10.1) para que el prospecto llegue a la
   llamada con los deberes claros. Plantilla de email de respuesta (interno).
5. **Post-venta** (enlaza con § 8): acta de entrega + inventario de accesos
   (10.3) — las cuentas de Stripe y dominio A NOMBRE DEL CLIENTE es argumento
   de venta contra el miedo al secuestro de agencia: sección «Qué pasa si nos
   vamos» en dossier y FAQ.

### 7.2 Flujo del usuario final (comprador de la tienda) — auditar, no rediseñar

El flujo compra→email→envío ya está pulido (Fases 2-8). La sesión solo verifica
con ojos de premio: estados vacíos, mensajes de error del checkout, y que el
recorrido demo no tenga callejones (p. ej. `/demo/gracias` ya enlaza al panel).
Cualquier hallazgo → backlog, no implementación en caliente.

---

## 8. F11.7 — Documentación de cliente (ejecuta la Fase 10)

Decisiones previas recomendadas (validar con Andreu al arrancar la sesión):
**(a)** la doc de operación vive como **`/ayuda` con `noindex`** en la propia
tienda (opción b del ROADMAP: está donde el cliente ya mira, y en la DEMO es
además material de venta visible); **(b)** castellano solo en v1 (valenciano =
duplicar mantenimiento; reevaluar con el primer cliente que lo pida);
**(c)** manual genérico + apéndice de 1 página por estilo solo si el estilo
añade conceptos (Specs: fichas técnicas).

Entregables por orden:

1. `/ayuda` (noindex, misma plantilla sobria del admin):
   - **Manual de 3 pasos** (asciende `docs/CLIENTE.md`): llega el pedido →
     etiqueta en Packlink → marcar enviado + tracking. Con las capturas de F11.1.
   - **Guía de producto**: la foto que vende (formato, fondo, peso), nombre,
     precio, stock. Ejemplos buenos/malos con imágenes propias.
   - **Guía de envíos**: zonas, tarifas, umbral gratis, qué implica cambiarlas.
   - **«Qué hacer cuando…»** (runbook): pedido no llega, devolución, pago
     pendiente, tracking equivocado, cancelar pedido. La pieza que más
     llamadas ahorra.
   - **«Qué no puedes romper»**: qué toca el cliente sin miedo / qué nos pide.
2. Plantillas en `docs/plantillas/`: **acta de entrega** e **inventario de
   accesos** (markdown imprimible, mismo CSS de impresión del dossier).
3. `/dossier` v2: checklist «qué necesitamos de ti», sección «qué pasa si nos
   vamos», precios según D4, capturas reales.
4. El **vídeo de 3 min** del panel queda fuera (externo, lo graba Andreu con
   la demo; guion de 10 líneas sí lo entrega esta sesión).

**Criterio de cierre Fase 10:** el listón del ROADMAP — *si un documento
necesita explicar qué es un webhook, está mal escrito*.

---

## 9. F11.8 — QA de nivel premio y cierre

Checklist final (una sesión corta, después de todo lo demás):

- [ ] Lighthouse 100/100/100/100 en `/`, `/arquitectura`, `/estilos`, `/dossier`
      **contra producción**, citable en la propia landing.
- [ ] `prefers-reduced-motion`: página completa y digna sin una sola animación.
- [ ] Teclado y lector: galería de tiendas navegable, focus visible de marca,
      `aria-current` en pasos del tour.
- [ ] Pesos: `/` < 1 MB transferido, hero LCP < 1,2 s en 4G (capturas AVIF/WebP
      con `srcset`, lazy fuera de viewport, `fetchpriority` en la primera).
- [ ] Dark mode coherente en todas las secciones nuevas.
- [ ] OG nuevo verificado en WhatsApp (el canal real de Castellón).
- [ ] JSON-LD `Service` + `FAQPage` actualizados a los precios finales;
      `Product`+`Offer` de las fichas siguen validando.
- [ ] E2E (`pnpm test:e2e`) + 148 tests en verde; deploy; reset de producción;
      re-captura de cualquier screenshot que haya caducado con el rediseño.
- [ ] Submission Awwwards: título, descripción, capturas del formulario
      preparadas (decisión de pagar la submission: Andreu).

---

## 10. Orden de ejecución y dependencias

```
F11.0 Decisiones D1–D6 (Andreu)  ← BLOQUEA TODO
   │
   ├── F11.2a  9B.5: imaginería tiendas restantes (LOCAL, Higgsfield)
   │      └── 9B.6: temas restantes (1 sesión/tema, CHECKLIST_TEMA.md)   [paralelo]
   ├── F11.1   Capturas de pantalla (LOCAL, tras tener las tiendas que entren en el hero)
   ├── F11.5   Precios y negocio (solo texto/decisión, puede ir YA)      [paralelo]
   │
   ├── F11.3   Landing V2 (necesita F11.1 + D3 + D4)     ← 2 sesiones
   ├── F11.4   /estilos + /arquitectura v2 (tras F11.1)
   ├── F11.6   Funnel y CTAs (tras F11.3)
   ├── F11.7   Documentación cliente (independiente; solo capturas de F11.1)
   └── F11.8   QA + deploy + submission (lo último)
```

Mínimo viable si se quiere acortar: F11.0 → F11.1 (solo 6 tiendas actuales) →
F11.3 → F11.8. La galería del hero admite crecer de 6 a 8 tiendas sin rediseño.

## 11. Unit economics del Kit (INTERNO — F11.5, 2026-07-24; no va a la web)

Cuenta honesta por cliente, con los precios D4 ya publicados en landing y dossier:

**Ingresos por cliente Kit**
- Setup 1.900 € + mantenimiento 39 €/mes → **3.304 € a 3 años** (la cifra que
  cita la landing y su calculadora).
- Kit a medida: desde 3.400 € + 59 €/mes → desde 5.524 € a 3 años.
- Lite (desde 590 €, sin construir — D6): solo mide demanda; sin cuenta propia
  hasta que exista.

**Costes por cliente Kit**
- Infraestructura: **0 €/mes** (planes gratuitos de Cloudflare; el modelo entero
  depende de esto y es la ventaja estructural frente a agencias con hosting).
- Imaginería: ~50 créditos Higgsfield por tienda (~2,3 créd./imagen observado
  en Fase 8/9B) — coste marginal en euros ≈ despreciable con el plan actual.
- Dominio: ~12 €/año solo si se adelanta (lo normal: a nombre y cargo del cliente).
- **Producción (horas por tema): SERIE REAL PENDIENTE.** Las fichas
  `docs/temas/*.md` § «Coste del tema» están sin rellenar; rellenarlas al cerrar
  cada tema nuevo (9B.6) es prerequisito para cerrar esta cuenta con datos y no
  con fe. Es el único coste que puede romper el modelo: si adaptar un tema del
  catálogo pasa de ~2-3 jornadas, el Kit a 1.900 € deja de ser rentable como
  producto y vuelve a ser servicio.

**Mantenimiento (el negocio real es el MRR)**
- 39 €/mes con «hasta 2 h de cambios» explícitas: a tope de consumo son
  ~19,5 €/h efectivos — asumible solo si el consumo medio real queda en ≤1 h/mes.
  Validar con los 3 primeros clientes; si la media supera 1,5 h/mes, subir el
  tier o acotar el tipo de cambio incluido (decisión de Andreu llegado el caso).
- El tier de 59 €/mes (a medida, con prioridad) protege el margen del cliente
  que más pide.

**Escenario año 1 (conservador, coherente con § 6.3)**
- 8–12 clientes Kit → 15.200–22.800 € en setups + MRR al cierre de
  312–468 €/mes (~3.700–5.600 €/año de run-rate).
- Riesgos de la cuenta: consumo del mantenimiento por encima de 2 h (scope
  creep clásico — el copy ya lo acota), y horas de producción sin medir (arriba).

## 12. Qué NO entra (anti-scope-creep)

- Ni blog, ni multiidioma, ni CMS, ni testimonios inventados (cuando haya un
  cliente real, su caso sustituye a la tienda genérica en la galería).
- Ni GSAP/Three.js/Lottie ni ninguna dependencia de runtime nueva sin OK.
- El motor no se toca: todo esto es presentación, contenido y negocio. La única
  excepción posible (tabla `leads` para formulario, D5) requiere OK explícito.
- No se construye el Lite: solo se publica el precio para medir (D6).

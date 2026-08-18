# Roadmap de profesionalización de temas

> **Orden de activación:** cuando Andreu diga **«continúa mejorando los temas»**
> o una instrucción equivalente, este documento sustituye al bloque general de
> «Próxima sesión» de `docs/ROADMAP.md` como fuente de verdad del carril.
>
> **Rama de trabajo:** `codex/theme-product-hardening`.
>
> **Estado:** carril abierto el 2026-08-18. El siguiente bloque exacto está al
> final del documento.

## 1. Resultado que persigue el carril

Convertir cada tema de una demostración visual convincente en un escaparate que
se perciba como un ecommerce entregable: identidad clara, catálogo con criterio,
ficha que ayuda a decidir, recorrido de compra coherente, estados cuidados,
contenido comercial verosímil y una base frontend mantenible.

La prueba no es «se ve bonito». Un tema terminado debe permitir que un posible
cliente recorra catálogo, ficha, cesta, checkout y confirmación y entienda qué
producto recibiría de Logic2B sin que haya que justificar huecos como propios de
una demo.

Este carril mejora seis disciplinas a la vez:

1. **Producto:** audiencia, tarea principal, propuesta y alcance comprensibles.
2. **UX/UI:** jerarquía, navegación, responsive, estados, accesibilidad y
   dirección de arte coherente.
3. **Arquitectura frontend:** un contrato compartido, cero forks de comercio,
   componentes con límites claros y JavaScript mínimo.
4. **SEO:** semántica y datos de producto listos para una implantación real, sin
   indexar las demos públicas.
5. **Marketing y conversión:** merchandising, argumentos, confianza y CTA
   honestos; nunca testimonios, métricas o promociones inventados.
6. **Calidad de entrega:** rendimiento, pruebas, capturas y documentación
   reproducibles.

## 2. Límites y decisiones ya cerradas

- La demo pública continúa aislada: `noindex,follow`, catálogo embebido, cesta y
  compra simuladas localmente, panel independiente y de solo lectura.
- El motor de precio, stock, pedidos, pagos, envíos y emails no se bifurca ni se
  modifica desde este carril.
- Un tema puede tocar sus componentes, colección, seed, assets, copy y ficha. Un
  cambio en componentes o contratos compartidos debe beneficiar a todos los
  temas y pasar regresión global.
- No se añaden dependencias, migraciones, servicios, costes, credenciales ni
  superficie PCI. Cualquiera de ellos activa los vetos de `CLAUDE.md` y obliga a
  parar.
- No se cambian precios, plazos, paquetes ni promesas comerciales.
- Las referencias externas sirven para estudiar sistema y composición; las
  capturas, marcas, textos y productos ajenos no se publican.
- Este carril mejora los 33 temas públicos existentes. Los temas nuevos siguen
  entrando por `docs/NUEVOS_TEMAS.md` y `nuevos-temas/cola.json`.
- La rama se mantiene separada de `main`. Cada bloque se commitea y se publica
  en `origin/codex/theme-product-hardening`; fusionar o desplegar un corte exige
  una instrucción expresa de Andreu.

## 3. Orden de autoridad y reanudación

Al empezar cada bloque se leen, en este orden:

1. `CLAUDE.md` y `.claude/skills/equipo/SKILL.md` con los roles afectados;
2. este roadmap, incluida la tabla de cola y «Siguiente bloque»;
3. `docs/TEMAS.md` y `docs/CHECKLIST_TEMA.md`;
4. la ficha `docs/temas/<id>.md` y su referencia visual;
5. el código, seed, colección, capturas y resultados de prueba del tema.

Algoritmo de selección:

1. sincronizar `origin/main` y comprobar que la rama puede actualizarse sin
   pisar cambios ajenos;
2. terminar primero cualquier bloque `en_progreso`;
3. si no lo hay, ejecutar el primer bloque `pendiente` de la tabla maestra;
4. una regresión P0 descubierta puede adelantar un tema, pero el cambio de orden
   se documenta antes de implementarlo;
5. cerrar implementación, verificación, ficha, puntuación y commit antes de
   abrir el siguiente bloque;
6. si la orden pide continuidad prolongada, encadenar bloques hasta un veto,
   una decisión reservada o el final real de la cola.

## 4. Rúbrica común de madurez

Cada tema recibe una nota de 0 a 4 en siete dimensiones. La puntuación final se
calcula sobre 100; no sustituye los gates obligatorios.

| Dimensión | Peso | Qué se evalúa |
|---|---:|---|
| Producto | 15 | Audiencia, propuesta, arquitectura de información y alcance |
| UX | 15 | Orientación, tareas, estados, responsive y reducción de fricción |
| UI y dirección de arte | 15 | Jerarquía, composición, tipografía, detalle y coherencia |
| Marketing y conversión | 15 | Merchandising, argumentos, confianza y CTA honestos |
| Arquitectura frontend | 15 | Contrato compartido, duplicación, progressive enhancement y estado |
| SEO semántico | 10 | H1, metas, jerarquía, enlaces, alt y Product/Offer sincronizado |
| Rendimiento y accesibilidad | 15 | CWV, peso, teclado, foco, contraste, motion y targets |

Escala:

- **0 — roto:** impide la tarea o incumple una invariante.
- **1 — maqueta:** hay piel visual, pero faltan recorrido o contenido decisivos.
- **2 — funcional:** la tarea se completa con lagunas visibles o genéricas.
- **3 — profesional:** coherente, creíble y listo para una demo comercial.
- **4 — entregable:** acabado diferencial, mantenible y defendible como trabajo
  de cliente.

Gate de salida por tema: nota total mínima **85/100**, ninguna dimensión por
debajo de 3 y ningún P0/P1 abierto. La ficha conserva nota inicial, nota final y
evidencia; una cifra sin hallazgos enlazados no cuenta.

## 5. Qué significa «tema completo»

### 5.1 Producto y contenido

- La tienda declara audiencia, necesidad, tono, promesa visual y acción
  principal en una frase cada una.
- El catálogo funciona como portada comercial, no solo como una cuadrícula:
  orienta, prioriza categorías o productos y contiene al menos una pieza de
  marca o utilidad coherente con el sector.
- El catálogo tiene nombres, descripciones, precios, categorías, stock y datos
  técnicos plausibles y consistentes. No hay lorem ipsum, claims absolutos ni
  contenido repetido que delate un seed.
- La ficha responde qué es, para quién es, qué incluye, cómo elegir y qué ocurre
  después de comprar usando solo datos que el producto realmente conoce.
- Envío, devoluciones, disponibilidad y pagos se expresan según configuración y
  alcance real; no se inventan garantías ni tiempos.

### 5.2 Recorrido y estados UX

- Catálogo prístino, búsqueda/filtro, cero resultados y producto agotado.
- Ficha con orientación de regreso, media estable, información escaneable,
  cantidad, CTA y feedback inequívoco.
- Cesta vacía y con líneas, problema recuperable, cálculo simulado, checkout,
  confirmación presente y confirmación ausente.
- Header, navegación, footer y puente de demo coherentes en todas las
  superficies; no existen callejones sin salida.
- Verificación a 375, 768 y 1440 px, teclado, foco, zoom 200 % y
  `prefers-reduced-motion`. El modo oscuro solo se declara cubierto si existe de
  verdad; no se cuenta una emulación que no cambia la interfaz.

### 5.3 UI y dirección de arte

- La composición conserva la idea fuerte de la referencia, pero la marca,
  fotografía, iconografía y copy son propios.
- Tipografía, ritmo, densidad, imagen, bordes, motion y microestados forman un
  sistema, no una suma de recursos decorativos.
- CTA primaria, precio, estado, navegación y foco mantienen contraste AA y una
  jerarquía estable en todos los breakpoints.
- Hover nunca es la única vía para descubrir contenido o comprar; los targets
  táctiles miden al menos 44 px.
- No hay imágenes deformadas, saltos de layout, recortes accidentales, texto
  sobre zonas ilegibles ni controles genéricos sin integrar.

### 5.4 Arquitectura frontend

- `ProductPage`, `CartPage`, `CheckoutPage`, `ThanksPage` y
  `storefront-contract.ts` conservan la lógica compartida.
- No aparecen nuevas claves de storage, selectores o scripts de compra privados
  por tema. El estado se namespacea con el contrato común.
- Los componentes de tema contienen presentación. Una necesidad semántica común
  se resuelve una vez en el contrato, con test de regresión global.
- HTML y CSS nativos primero; todo JavaScript nuevo necesita una mejora de tarea
  medible, fallback y `prefers-reduced-motion` cuando corresponda.
- Cero CSS de un tema que alcance a otro y cero colores/radios fuera de tokens.
- Los registros explícitos de temas, capturas y auditoría permanecen alineados;
  el bloque base añadirá guardas para detectar deriva.

### 5.5 SEO listo para cliente y demo segura

- La demo mantiene `noindex,follow`; ninguna mejora la convierte en URL
  indexable ni entra al sitemap.
- Título, description, canonical, H1 único y jerarquía de headings son
  coherentes con tienda y producto, aunque la ruta sea de demostración.
- La ficha conserva `Product` + `Offer` válidos y sincronizados con el contenido
  visible. Precio, moneda, stock e imagen salen de la misma fuente.
- Breadcrumbs, enlaces internos, nombres accesibles y alt describen intención y
  producto, no palabras clave amontonadas.
- `/temas`, que sí es indexable, recibe para cada entrega una captura optimizada,
  copy de sector útil y etiquetas coherentes. Nunca publica la referencia ajena.

### 5.6 Marketing y percepción de valor

- Cada tema tiene un ángulo de venta concreto: sector, problema que resuelve,
  rasgo diferencial y tres pruebas visibles dentro de la demo.
- El orden de productos y módulos cuenta una historia comercial y demuestra
  merchandising, no orden de inserción del seed.
- Confianza significa información real —proceso, materiales, disponibilidad,
  operación o soporte existente—, no badges vacíos, reviews falsas o urgencia
  artificial.
- La tarjeta de `/temas`, la captura y el primer viewport de la tienda cuentan
  la misma propuesta.

## 6. Verificación obligatoria de cada tema

Un bloque de tema no se cierra hasta reunir esta evidencia:

1. `pnpm check` en verde;
2. `pnpm test:e2e` cuando cambia una superficie del recorrido;
3. `node scripts/a11y-audit.mjs --only=<id>` contra un único `wrangler dev`, con
   cero errores y cero avisos aceptados sin explicación;
4. `node scripts/capture-screens.mjs --only=<id>` y revisión visual de catálogo,
   móvil y ficha;
5. inspección manual de catálogo, filtro/búsqueda, ficha, cesta, checkout y
   gracias a 375/768/1440 px;
6. HTML servido: `noindex,follow`, H1, metas, canonical y JSON-LD correctos;
7. imágenes con dimensiones, alt, carga/fetch priority correctos y sin payload
   eager fuera del primer viewport;
8. sin overflow, CLS visible ni bloqueo de interacción; objetivo de laboratorio
   móvil LCP ≤2,5 s, CLS ≤0,1 y TBT ≤200 ms;
9. ficha `docs/temas/<id>.md`, captura pública y copy de `/temas` actualizados;
10. `git diff`, commit descriptivo y árbol limpio.

Si cambia un contrato compartido, los puntos 1–3 se ejecutan para **todas** las
tiendas antes de cerrar. Lighthouse de `/` y `/temas` se repite después de un
deploy autorizado cuando cambien sus capturas o contenido.

## 7. Plan por bloques

### TH0 — Fundaciones y línea base

| Bloque | Entrega | Estado |
|---|---|---|
| TH0.1 | Rama, mandato, rúbrica, cola y protocolo de reanudación | ✅ 2026-08-18 |
| TH0.2 | Informe automático de inventario, rutas, registros, JS, assets, metas, schema y pesos de los 33 temas | ✅ 2026-08-18 |
| TH0.3 | Auditoría visual/producto de las superficies compartidas y matriz de gaps P0–P3 | ✅ 2026-08-18 |
| TH0.4 | Guardas contra deriva entre registro, colección, auditor, capturas, galería y ficha | pendiente |
| TH0.5 | Cerrar C14.3: migrar NODDO, Sitēga y STRETCH al mismo contrato local de ficha/cesta/checkout/gracias | pendiente |
| TH0.6 | Consolidación de arquitectura: regresión de las 33 tiendas y actualización de contratos/docs | pendiente |

TH0 no rediseña las 33 tiendas. Elimina incertidumbre y excepciones para que el
pulido posterior no multiplique deuda.

### TH1 — Piloto de estándar entregable

ARCE va primero porque es la tienda destacada y la referencia funcional del
escaparate. Su bloque fija el nivel, el formato de ficha y el coste real antes de
repetir el proceso.

| Bloque | Entrega | Estado |
|---|---|---|
| TH1.1 | Auditoría y brief de producto/conversión de ARCE | pendiente |
| TH1.2 | Implementación integral de ARCE en las siete dimensiones | pendiente |
| TH1.3 | QA, comparación antes/después y ajuste de rúbrica/checklist | pendiente |

### TH2 — Temas fundacionales y mayor deuda probable

Ordenados por antigüedad, diversidad estructural y valor para descubrir límites
del contrato compartido.

| Orden | Bloque | Tema | Estado |
|---:|---|---|---|
| 1 | TH2.1 | Minimal | pendiente |
| 2 | TH2.2 | Editorial | pendiente |
| 3 | TH2.3 | Industrial / METRIA | pendiente |
| 4 | TH2.4 | Natural / ROMER | pendiente |
| 5 | TH2.5 | Specs / KALIBRE | pendiente |
| 6 | TH2.6 | Guide / CAFETAL | pendiente |
| 7 | TH2.7 | Launch / VECTOR | pendiente |
| 8 | TH2.8 | Street / ASFALTO | pendiente |
| 9 | TH2.9 | Iris | pendiente |
| 10 | TH2.10 | Consolidación de ola y regresión global | pendiente |

### TH3 — Escaparates comerciales de primera expansión

| Orden | Bloque | Tema | Estado |
|---:|---|---|---|
| 1 | TH3.1 | NODDO | pendiente |
| 2 | TH3.2 | Sitēga | pendiente |
| 3 | TH3.3 | Forma | pendiente |
| 4 | TH3.4 | STRETCH | pendiente |
| 5 | TH3.5 | ARGENT. | pendiente |
| 6 | TH3.6 | SILLAGE | pendiente |
| 7 | TH3.7 | SUMMIT | pendiente |
| 8 | TH3.8 | LÍTICA | pendiente |
| 9 | TH3.9 | NERA | pendiente |
| 10 | TH3.10 | SARGA | pendiente |
| 11 | TH3.11 | Consolidación de ola y regresión global | pendiente |

### TH4 — Escaparates recientes

Se revisan aunque hayan nacido con mejor QA: el objetivo ya no es solo fidelidad
visual, sino profundidad de producto, conversión y entrega.

| Orden | Bloque | Tema | Estado |
|---:|---|---|---|
| 1 | TH4.1 | VISO | pendiente |
| 2 | TH4.2 | ORBE | pendiente |
| 3 | TH4.3 | ALVA | pendiente |
| 4 | TH4.4 | BRÍO | pendiente |
| 5 | TH4.5 | BRUMA | pendiente |
| 6 | TH4.6 | TRAZA | pendiente |
| 7 | TH4.7 | DINTEL | pendiente |
| 8 | TH4.8 | LUMBRE | pendiente |
| 9 | TH4.9 | MIXTA | pendiente |
| 10 | TH4.10 | MONTE | pendiente |
| 11 | TH4.11 | ENSAMBLE | pendiente |
| 12 | TH4.12 | EJE | pendiente |
| 13 | TH4.13 | ARISTA | pendiente |
| 14 | TH4.14 | Consolidación de ola y regresión global | pendiente |

### TH5 — Productización y cierre del catálogo

| Bloque | Entrega | Estado |
|---|---|---|
| TH5.1 | Matriz sector × tema, detección de solapamientos y posicionamiento único por tema | pendiente |
| TH5.2 | `/temas`: arquitectura, filtros, fichas, copy y CTA basados en necesidades de compra | pendiente |
| TH5.3 | Landing/dossier: selección de pruebas visuales sin aumentar peso ni promesas | pendiente |
| TH5.4 | Auditoría SEO, a11y, rendimiento y regresión de las 33 tiendas | pendiente |
| TH5.5 | Guía de entrega: de tema elegido a tienda de cliente sin fork | pendiente |
| TH5.6 | Corte candidato a `main`, changelog y evidencia comparativa | pendiente |

## 8. Plantilla de cierre de un bloque de tema

La ficha `docs/temas/<id>.md` añade al final:

```md
## Profesionalización

- Bloque: THx.y · fecha
- Audiencia / tarea principal:
- Problemas iniciales P0/P1/P2/P3:
- Nota inicial: Producto _/4 · UX _/4 · UI _/4 · Marketing _/4 ·
  Frontend _/4 · SEO _/4 · Rendimiento/a11y _/4 · total _/100
- Cambios realizados:
- Contrato compartido tocado: no/sí (motivo y regresión):
- Nota final: ... · total _/100
- Evidencia: check · E2E · a11y · capturas · HTML/JSON-LD · pesos
- Deuda aceptada: motivo, severidad y bloque destino
```

## 9. Siguiente bloque

**TH0.4 — guardas contra deriva de los registros de temas.** Convertir las
comparaciones reproducibles de TH0.2 en gates que fallen con mensajes útiles si
un tema desaparece de colección, seed, catálogo, auditor, capturas, galería o
ficha. Cubrir primero las divergencias reales de SILLAGE y ARGENT, alinear el
scaffold y evitar que el snapshot dependa de mantener diez listas a mano. No
rediseña temas ni cambia el recorrido comercial.

## 10. Cierres del carril

### TH0.2 — línea base automática de los 33 temas (2026-08-18)

- `scripts/theme-baseline.mjs` compara de forma estática y reproducible los
  registros de temas, colecciones, seeds, catálogos, auditor a11y, capturas,
  galería, fichas y componentes. También registra rutas, contrato compartido,
  claves privadas, noindex/canonical/Product+Offer, productos, formatos, bytes
  de assets y JavaScript propio sin arrancar Astro ni consultar D1.
- `pnpm audit:themes` regenera el informe humano
  `docs/audits/THEME_BASELINE.md` y el snapshot máquina-legible
  `docs/audits/theme-baseline.json`; `--check` detecta un snapshot obsoleto.
- Línea base: 33/33 colecciones, seeds, vistas de catálogo, auditor y registros
  de captura; 30/33 recorridos usan íntegramente el contrato común y 32/33
  conservan el juego de evidencia visual completo.
- Hallazgos: P0 0; P1 deriva de SILLAGE en la galería, recorrido/storage y
  Product+Offer privados en NODDO/Sitēga/STRETCH, y capturas incompletas de
  ARGENT.; P2 canonical común ausente, cuatro directorios por encima de 2,5 MB
  y cinco temas con JPG/MP4; P3 fallbacks estáticos ausentes y recuento antiguo
  en `docs/TEMAS.md`. Cada hallazgo queda asignado a TH0.3, TH0.4, TH0.5, TH0.6
  o TH5.2; este bloque no corrige ni rediseña todavía.
- Verificado: snapshot regenerado y `--check` estable; `pnpm check` pasa el
  typecheck de 723 archivos, 169 suites/786 tests y el build con sitemap. No
  aplica E2E/a11y visual porque TH0.2 solo añade análisis estático y docs.

### TH0.3 — auditoría visual/producto compartida (2026-08-18)

- `docs/audits/THEME_SHARED_SURFACES_AUDIT.md` evalúa `Shop`, catálogo, ficha,
  cesta, checkout, gracias y `/temas`; separa contrato común, excepciones y
  deuda por tema y asigna cada gap a TH0.4/TH0.5/TH0.6, TH1–TH4 o TH5.
- No aparece ningún P0. Los P1 centrales son el chrome perdido en 10 temas
  inmersivos, el switcher fijo que tapa controles a 375 px, la ficha genérica
  de 29 rutas dinámicas, la ausencia de fallback sin JS y la publicación de
  referencias ajenas en `/temas`. La matriz conserva además la deuda objetiva
  de registros, evidencia, canonical, pesos y formatos detectada en TH0.2.
- Evidencia servida a 375/768/1440 sin overflow; ARCE, ARISTA, La Botiga y
  `/temas` suman 28 superficies de auditoría con 0 errores y 0 avisos. Se
  verificaron cesta vacía/activa, envío, checkout, confirmación ausente,
  noindex y Product+Offer. No hubo cambio de UI, E2E, captura, deploy ni datos.

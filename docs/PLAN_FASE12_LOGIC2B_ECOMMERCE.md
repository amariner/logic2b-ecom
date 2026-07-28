# FASE 12 — Logic2B Ecommerce: renombrado, reposicionamiento y las dos visiones

> **Plan maestro, 2026-07-28. Mandato directo de Andreu.** Escrito para
> ejecutarse **por sesiones independientes**: cada bloque F12.x es una sesión
> con sus entregables y criterios de cierre. Leer también `CLAUDE.md` y
> `docs/ROADMAP.md` al empezar cualquier bloque. Reglas de siempre: `git fetch`
> al arrancar, `pnpm check` en verde antes de commitear, sign-off del consejo
> al cerrar.

---

## 0. El mandato (palabras de Andreu, destiladas)

1. **La documentación es poca.** Debe servir a **dos visiones**: la del
   **negocio** (un CEO de ecommerce que decide contratar, una agencia que nos
   subcontrata) y la de la **operación** (el gestor de la tienda en su día a
   día). Hoy solo la segunda está medio cubierta.
2. **El argumento de venta NO es el precio.** Es que **nunca había sido tan
   fácil ni tan asequible un ecommerce a medida**, y que es **muy escalable**:
   se empieza por un MVP básico y funcional, y a medida que el proyecto se
   difunde se añaden funcionalidades y se incrementan los servicios.
3. **El pago no va a una plataforma que «te apaña»: va a un equipo que te
   asiste continuamente.** Tiendas a medida y acompañadas en desarrollo **y en
   marketing** con los servicios de Logic2B, guardando siempre la relación con
   la empresa global.
4. **Renombrado:** el producto pasa de **LogicEcom** a **Logic2B Ecommerce**.
   El nombre en sí ya cuenta el punto 3: esto es un servicio de Logic2B, no un
   SaaS suelto.

---

## 1. El argumentario canónico (fuente de verdad de TODO el copy)

Cuatro pilares, en este orden. Toda pieza comercial (landing, dossier, OG,
FAQ, docs de venta) se escribe desde aquí; si un texto no cuelga de un pilar,
sobra. Regla de product intacta: **cada afirmación se apoya en algo
enseñable** (la demo, el panel, la tabla Lighthouse, este repo).

| # | Pilar | La frase madre | Cómo se demuestra (ya lo tenemos) |
|---|---|---|---|
| P1 | **A medida, por fin fácil** | «Nunca había sido tan fácil —ni tan asequible— tener un ecommerce a medida.» | Las 10 tiendas radicalmente distintas sobre un motor; demo navegable; plazos y precio cerrados. |
| P2 | **Empiezas MVP, creces sin migrar** | «Tu tienda arranca básica y funcional. Cuando el negocio pida más, se le añade — sin cambiar de plataforma ni empezar de cero.» | El minimalismo v1 de CLAUDE.md §2 **es** el MVP; lo excluido a propósito (cuentas, multiidioma, reviews, buscador, transportistas, promos…) es la escalera de evolución. |
| P3 | **Un equipo, no una plataforma** | «Tu cuota no paga servidores ni licencias: paga a las personas que llevan tu tienda.» | Coste de infraestructura 0 € demostrado; `/ayuda`, el panel y el runbook enseñan el acompañamiento; «qué pasa si nos vamos» (dossier) enseña la honestidad. |
| P4 | **Detrás está Logic2B** | «Desarrollo y marketing bajo el mismo techo: la agencia que hace tu tienda es la que la posiciona.» | Logic2B como agencia de desarrollo y SEO (Castellón); el renombrado hace visible el paraguas; servicios de marketing como continuación natural. |

**Jerarquía del mensaje:** P1 abre (el hero), P2 da futuro, P3 explica la
mensualidad, P4 firma. **El precio baja de argumento a prueba**: las cifras
D4 (Lite 590 · Kit 1.900 + 39/mes · A medida 3.400 + 59/mes) **no cambian**
—son de Andreu— pero dejan de liderar la conversación; la sección de precios
se reencuadra como «esto es lo que cuesta tener un equipo», no «mira qué
barato». La barra «0 €/mes» se conserva como prueba de infraestructura y se
reencuadra con P3.

**Vigilancia de product:** P2 se VENDE, no se construye. Ninguna feature de la
escalera se implementa por salir en el copy (§14: se propone, no se
implementa). El copy debe decir «se añade cuando tu tienda lo pida», nunca
prometer fechas ni incluirlas en la cuota sin decisión D7.

---

## 2. Las tres audiencias y su documento

| Audiencia | Qué necesita creer | Dónde vive hoy | Qué le falta | Bloque |
|---|---|---|---|---|
| **CEO / decisor de ecommerce** | Que a medida ya no es caro ni lento (P1), que no se queda pequeño (P2) y que la cuota compra un equipo (P3/P4) | `/` y `/dossier` (escritos bajo el argumentario viejo, liderado por precio/coste) | El relato del camino MVP→escala y qué compra exactamente la mensualidad | F12.2 + F12.3 |
| **Agencia que nos subcontrata** | Que puede vender tiendas a medida con nuestro motor sin montar equipo técnico, con proceso y límites claros | **Nada.** Es la audiencia sin cubrir | Modelo de colaboración completo: proceso, plazos, entregables, qué necesitamos, marca | F12.4 |
| **Gestor de la tienda** | Que puede llevarla sin saber nada técnico y que no está solo | `/ayuda` (manual 3 pasos + guías + runbook) y `docs/CLIENTE.md` | Profundidad de día a día: escenarios reales, primer mes, límites de «qué toco sin miedo» | F12.5 |

(La cuarta audiencia —el técnico que clona el kit— ya está servida por
`README.md`, `/arquitectura` y `docs/PRODUCCION.md`; solo le toca el renombrado.)

---

## 3. Los bloques

### F12.0 — Red de seguridad previa: el auditor entra en las páginas comerciales

Antes de reescribir copy y markup en media web (F12.1–F12.3), la red de
seguridad. Absorbe los dos candidatos que dejó F11.9 en «Próxima sesión».

- Añadir a `scripts/a11y-audit.mjs` un grupo `SITE_PAGES` con las 8 páginas
  públicas: `/`, `/arquitectura`, `/estilos`, `/dossier`, `/ayuda`,
  `/demo/gracias`, `/demo/reset`, `404` — a 1440 y 375, y en dark las que
  tengan modo oscuro (~16–24 superficies nuevas; mismo patrón data-driven que
  F11.9, sin login).
- Arreglar lo que salga (son las páginas con más copy y variedad de markup).
- **Extra visual del mismo saco:** mirar a ojo la tienda Street/ASFALTO en
  modo oscuro (`--color-surface-sunken` fijo en su `Catalog.astro`) — el
  auditor no lo ve porque solo mide texto.
- **Roles:** ux-ui (manda), frontend, seo (si un fix toca markup indexable).
- **Cierre:** barrido completo (124 + nuevas) en verde · `pnpm check` verde ·
  veredicto sobre Street en dark (arreglado o descartado con motivo).

### F12.1 — El renombrado: LogicEcom → Logic2B Ecommerce

El nombre nuevo ES mensaje (P4): producto y agencia bajo el mismo techo.

- **Inventario real (grep 2026-07-28): 22 ficheros.** Superficies vivas:
  `Logo.astro`, `SiteHeader.astro` (wordmark), `Base.astro` y `Shop.astro`
  (titles/metas), footers de temas minimal y street, `index.astro`,
  `arquitectura.astro`, `estilos.astro`, `dossier.astro`, `404.astro`,
  `demo/admin/emails.astro`, `demo-themes.ts`, `backup.ts`,
  `scripts/make-og.mjs` (+ regenerar las tarjetas OG), README, CLAUDE.md
  (nota de renombrado como la de 2026-07-20), skill del equipo.
- **Las entradas históricas del ROADMAP y los prompts de fases pasadas NO se
  reescriben** (son historia); solo lo vivo.
- JSON-LD: `Service.name` y todo schema que lleve el nombre. Sin cambios de
  URL (el dominio ya era `ecom.logic2b.com`) → **sin 301, sin riesgo SEO**.
- UX-UI: el wordmark es más largo — verificar cabecera y footer a 375 px y el
  layout de las OG.
- Higiene de paso: la carta de product cita «29 €/mes provisionales»;
  actualizar a las cifras D4 aprobadas (39 €/mes) — no es cambio de precio,
  es sincronizar el doc con la decisión ya tomada.
- **Roles:** product (naming), seo (titles/OG/JSON-LD), ux-ui (wordmark),
  frontend.
- **Cierre:** `grep -ri logicecom` limpio en superficies vivas · OG
  regeneradas y verificadas · `pnpm check` + a11y verdes · deploy + reset ·
  `pnpm audit:lh` contra producción en verde.

### F12.2 — La landing cuenta el argumento nuevo

Reescritura de copy de `src/pages/index.astro` sobre el esqueleto actual (la
estructura de F11.3–F11.5 sirve; cambia lo que dice, no lo que es). Sección a
sección:

- **Hero:** H1 nuevo desde P1 (manteniendo la intención de búsqueda «tienda
  online a medida» — seo manda en el matiz). La galería de 10 tiendas queda:
  es la prueba de P1.
- **«Lo que te está costando tu tienda actual»:** el dolor se mantiene, y
  pivota a P3: la comparación no es «barato vs caro» sino **«a dónde va tu
  dinero»** — cuota a plataforma que te apaña vs cuota a equipo que te
  acompaña.
- **«Las cuentas claras»:** conserva la prueba de infraestructura 0 € y la
  reencuadra: «tu cuota no paga servidores: paga a las personas».
- **NUEVA sección «Empieza pequeño, crece sin migrar» (P2):** el camino de un
  cliente tipo — MVP funcional al arrancar; catálogo de evolución (cuentas de
  cliente, multiidioma, buscador, promos y descuentos, integración de
  transportistas, email marketing, contenido SEO, campañas…) presentado como
  «se añade cuando tu tienda lo pida». Cierra con P4: desarrollo y marketing
  del mismo equipo.
- **Precios:** mismas cifras D4, reencuadre P3 (título tipo «Un equipo
  detrás, no una plataforma»; la mensualidad explicada como asistencia
  continua). Pendiente de D7 para el detalle de qué incluye.
- **FAQ:** añadir 2–3 preguntas del argumentario («¿Y si mañana necesito X?»,
  «¿Qué incluye la mensualidad?», «¿Trabajáis con agencias?») y sincronizar el
  `FAQPage` JSON-LD.
- **Gate obligatorio (veto product):** el copy final —promesas de servicio—
  se presenta a Andreu **antes de desplegar**.
- **Roles:** product (manda), seo (intención de búsqueda, JSON-LD, CWV),
  ux-ui (ritmo visual de la sección nueva), frontend.
- **Cierre:** OK de Andreu al copy · Lighthouse 100×4 en `/` tras deploy ·
  a11y verde · JSON-LD validando.

### F12.3 — Dossier V2: la visión del decisor

`/dossier` se reorienta de «ficha de servicio con precios» a **business case**
para quien decide (CEO o gerente):

- Nueva sección **«El camino: de MVP a tienda que crece»** — qué se entrega el
  primer mes y cómo evoluciona un proyecto tipo (sin fechas prometidas).
- Nueva sección **«Qué compra tu mensualidad»** — mantenimiento, asistencia,
  evolución por fases; los servicios de marketing de Logic2B como
  continuación natural (P4), separados de la cuota salvo que D7 diga otra
  cosa.
- «Cómo trabajamos», «Qué necesitamos de ti» y «Qué pasa si un día nos vamos»
  se conservan (son la honestidad que vende) y se ajustan al argumentario.
- **Gate:** mismo que F12.2 — promesas de servicio pasan por Andreu.
- **Roles:** product (manda), seo, ux-ui.
- **Cierre:** OK de Andreu · a11y y Lighthouse del dossier en verde (el 98 de
  móvil por la Inter sigue siendo decisión aparte, no de este bloque).

### F12.4 — La visión de la agencia que nos subcontrata

La audiencia sin cubrir. Primero el documento, luego (si D8 lo aprueba) la
página.

- **`docs/AGENCIAS.md`:** el modelo de colaboración completo —
  - qué ponemos nosotros (motor, desarrollo, mantenimiento, SLA de
    asistencia) y qué pone la agencia (cliente, diseño si quiere, contenido);
  - proceso y plazos de un proyecto tipo, de brief a entrega;
  - qué necesitamos recibir para arrancar (el equivalente agencia de «qué
    necesitamos de ti» del dossier);
  - límites claros: qué no hacemos, cuándo no somos su opción (la honestidad
    comercial también aquí);
  - marca: cómo aparece Logic2B en tienda y panel — y si cabe marca blanca,
    que es **decisión D8b de Andreu**, no promesa nuestra.
- **Sin precios de partner en v1** salvo que Andreu los fije (van con D8).
- Si **D8a = sí**: página `/agencias` indexable → checklist completo de seo
  (title/meta/canonical/sitemap/OG propio/JSON-LD) y a11y desde el nacimiento.
- **Roles:** product (manda), seo (si nace página), fullstack (coherencia con
  lo que el motor de verdad permite).
- **Cierre:** doc completo y coherente con dossier y landing · decisión D8
  registrada · si hay página: en verde en todos los barridos.

### F12.5 — La visión del gestor, ampliada

`/ayuda` es buena base; le falta profundidad de día a día. El listón del ICP
sigue: *si hay que explicarle qué es un webhook, está mal hecho.*

- Ampliar **«Qué hacer cuando…»** con los escenarios reales que faltan:
  cancelar un pedido pagado (y qué pasa con el stock), gestionar una
  devolución, producto agotado que sigue recibiendo visitas, cambiar precios
  sin liarla, cerrar por vacaciones, «me llega el email al spam».
- Nueva guía **«Tu primer mes con la tienda»**: qué mirar cada día (nada), qué
  mirar cada semana, cuándo llamarnos.
- `docs/CLIENTE.md` **sigue siendo 1 página** — esa es su virtud; lo ampliado
  vive en `/ayuda`.
- **Roles:** product (manda), ux-ui (legibilidad), frontend.
- **Cierre:** cero jerga verificada leyéndolo con ojos de comerciante ·
  a11y de `/ayuda` en verde · coherente con el manual corto.

### F12.6 — Consolidación: barrido, medición e índice

- Barrido a11y completo (todas las superficies, incluidas las nuevas).
- `pnpm audit:lh` contra producción: las 4 indexables (+ `/agencias` si
  existe) a 100×4 en ambos perfiles, actualizando la tabla citable si cambia.
- Re-verificar las OG (WhatsApp es canal de venta real).
- **`docs/README.md`: índice de toda la documentación por audiencia**
  (comercial / agencia / gestor / técnico) — la respuesta estructural a «la
  documentación es poca»: que se encuentre.
- ROADMAP: cerrar la fase con estados y fechas.
- **Roles:** fullstack (manda), seo, product.
- **Cierre:** todo verde · índice publicado · «Próxima sesión» apuntando a lo
  que venga después.

---

## 4. Decisiones reservadas a Andreu

| # | Decisión | Se necesita antes de | Propuesta del equipo (para decir sí o ajustar) |
|---|---|---|---|
| D7 | **Qué promete exactamente la mensualidad** en el copy: ¿solo mantenimiento + asistencia, o incluye bolsa de evolución? ¿El marketing va aparte como servicios Logic2B? | Cerrar el copy de F12.2/F12.3 | Mensualidad = mantenimiento + asistencia continua + pequeñas evoluciones; marketing (SEO continuo, campañas, contenido) como servicios Logic2B contratables aparte, presentados en la misma conversación (P4) |
| D8 | **Agencias:** (a) ¿página `/agencias` pública e indexable o solo doc que se envía? (b) ¿ofrecemos marca blanca del panel/tienda? | Cerrar F12.4 | (a) Sí a la página — es una búsqueda real («desarrollo ecommerce white label») y P4 la respalda; (b) marca blanca solo en el email y el panel, wordmark Logic2B en la tienda — pero es negocio puro: lo fija Andreu |
| — | Pendientes anteriores que siguen vivas: submission a **Awwwards** (de pago) y `font-display: optional` para el 98 del dossier móvil | Cuando quieras | — |

## 5. Qué NO cambia (los raíles)

- **El motor no se toca.** Fase de copy, marca y documentación.
- **Las cifras D4** (590 / 1.900+39 / 3.400+59) — solo Andreu las mueve.
- **El minimalismo v1** (CLAUDE.md §2): la escalera de P2 se vende como
  futuro, no se implementa. Toda feature nueva se propone, no se construye.
- **Coste 0 € de infraestructura** y cero dependencias nuevas.
- **El mapa de indexación**: nada nuevo se publica sin decidir su lado
  (checklist seo); `/demo/*` sigue noindex.
- **JS propio ≤15 KB** y Lighthouse 100×4 como criterio de cierre en
  indexables.

## 6. Orden y dependencias

```
F12.0 (red de seguridad) → F12.1 (renombrado) → F12.2 (landing) → F12.3 (dossier)
                                                        ↓
                                       F12.4 (agencias) · F12.5 (gestor)   [cualquier orden]
                                                        ↓
                                              F12.6 (consolidación)
```

La red va primero porque F12.1–F12.3 reescriben markup en media web y el
auditor debe estar mirando ANTES. El renombrado va antes que el copy para no
escribir dos veces los mismos textos. D7 puede decidirse en paralelo desde ya;
solo bloquea el cierre de F12.2/F12.3.

# Logic2B Ecommerce

Infraestructura tecnológica propia con la que Logic2B crea y gestiona proyectos
de comercio electrónico a medida. **No es un SaaS ni una plantilla cerrada.**
Demo pública en **[ecom.logic2b.com](https://ecom.logic2b.com)** y definición
canónica en **[docs/POSICIONAMIENTO.md](docs/POSICIONAMIENTO.md)**.

Este repositorio es dos cosas a la vez:

1. **Demo comercial** — landing de venta del servicio + escaparate principal navegable (**TRAZA**) y panel de gestión de ejemplo con fixtures. El acceso guiado usa un GET de login y cookie stateless, sin pedir contraseña.
2. **Motor interno reutilizable** — la base probada sobre la que Logic2B diseña,
   desarrolla, despliega y mantiene un ecommerce aislado y adaptado para cada
   cliente.

Catálogo, pedidos, pagos, inventario, promociones, integraciones, seguridad y
escalabilidad se resuelven en la base común. El trabajo de cada proyecto se
concentra en estrategia, diseño, contenido, desarrollo específico y
acompañamiento continuo. El comercio opera desde un panel sencillo; Logic2B
asume la complejidad técnica y la evolución, también como equipo de marca
blanca para otras agencias.

El corte local verificado funciona exclusivamente con fixtures y simulaciones locales: sin cron,
pedidos reales, formularios enviados, escrituras en D1, cobros, emails, jobs,
webhooks con efectos ni beacons de analítica. El carrito y sus recorridos son
ficticios; el panel permite explorar ejemplos sin ejecutar operaciones.
Las pruebas del motor usan datos sintéticos en bases de QA aisladas.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Astro 5 (`output: 'static'` + páginas servidor con `prerender = false`) |
| Hosting | Cloudflare Workers + assets estáticos |
| Base de datos | Cloudflare D1 (SQLite) |
| Estilos | Tailwind CSS v4 |
| Pagos | Stripe Checkout alojado para proyectos de cliente; la demo simula la compra localmente |
| Emails | Resend en una tienda real; la demo solo enseña fixtures independientes en `/demo/admin/emails` |
| Tests | Vitest, ensayos SQLite/D1 aislados, E2E de aislamiento y comprobaciones de navegador/accesibilidad; evidencia del último corte más abajo |

## Requisitos

- Node.js ≥ 22.18 (el seed usa TypeScript nativo de Node)
- pnpm ≥ 10

## Desarrollo local

Instalación y verificación completa (tipos, tests, auditoría de temas y build):

```bash
pnpm install
pnpm check
```

Antes de compilar y servir la demo, comprobar el manifest demo en
`platform.config.ts` y `DEMO_MODE=true` en `wrangler.jsonc`. El build incluye
`scripts/assert-demo-build.mjs`, que verifica el HTML generado, los formularios
locales y la ausencia de beacon y cron. **Un build de cliente no se convierte
en demo cambiando únicamente una variable remota:** hay que reconstruirlo con
el manifest demo y validar de nuevo sus assets HTML.

El escaparate sirve fixtures versionados; el panel sí lee una D1 preparada con
fixtures sintéticos. Antes de previsualizar o ejecutar E2E, preparar una base
QA exclusiva con las 46 migraciones y el perfil `public-demo` de
[`seedStatements`](seed/seed.ts), un `ADMIN_COOKIE_SECRET` sintético y una
configuración Wrangler propia con `DEMO_MODE=true`, sin cron ni bindings
remotos. Servir el build con esa configuración y la misma persistencia QA.
Una carpeta de persistencia nueva y vacía no basta para recorrer el panel.
No usar `pnpm db:reset` ni `.wrangler/state` habitual; no hacen falta claves
Stripe ni pedidos reales. La preparación de fixtures ocurre solo en esa base
aislada, antes de las comprobaciones de ausencia de escrituras.

Contra ese Worker local preparado en el puerto 8787, ejecutar las
comprobaciones de aislamiento; ver el [corte de QA](docs/audits/demo-fixtures/README.md):

```bash
BASE_URL=http://127.0.0.1:8787 pnpm test:e2e
BASE_URL=http://127.0.0.1:8787 pnpm test:e2e:fixtures
BASE_URL=http://127.0.0.1:8787 node scripts/a11y-audit.mjs --only=fixture:
```

La auditoría de fixtures requiere Chrome o Chromium local; `CHROME_BIN` permite
indicar su ruta. Prueba también los formularios sin JavaScript. El E2E comprueba
que los endpoints operativos rechazan los intentos de mutación.

Para ensayar fuente de hechos, ejecución durable y backup de segmentación:

```bash
pnpm db:rehearse:customer-segmentation-facts:d1
```

El script crea dos bases workerd/D1 aisladas bajo
`tmp/segmentation-facts-d1/`, aplica las migraciones y valida captura,
concurrencia, recuperación y restore con políticas sintéticas. No usa bindings
remotos ni archivos de entorno. El esquema 0046 y el backup 39 están verificados
en QA local; no autorizan activación de consumidores, cron, DDL o despliegue
remoto.

### Evidencia local del 2026-10-03

- `pnpm check`: 917 archivos sin diagnósticos, 234 suites y 2.391 tests.
- Build demo: 44 documentos HTML y 44 formularios de proyecto locales.
- D1/workerd: 15 bloques correctos, backup 39 y restauración de 129 tablas;
  [informe de segmentación](docs/audits/r5-6c/facts-d1-report.json).
- E2E: 164/164 comprobaciones. Formularios: 31 comprobaciones, cero peticiones
  mutantes, beacons o errores JavaScript;
  [informe de fixtures](docs/audits/demo-fixtures/report.json).
- Segmentos locales: 119 comprobaciones de navegador y ocho superficies de
  accesibilidad, cero errores y avisos; [evidencia R5.6d](docs/audits/r5-6d/README.md).
- Formularios: otras ocho superficies de accesibilidad sin hallazgos;
  [detalle de QA](docs/audits/demo-fixtures/README.md).
- Mercados: 119 pruebas del contrato y 25 de composición pura con precios;
  MKT-003 inactiva y sin consumidores runtime. [Informe R5.7](docs/audits/r5-7/verification-report.json).
- Contenido e idiomas: 53 pruebas editoriales y 67 del plan de URLs;
  MKT-006/007 inactivas, sin cambios del render ni del sitemap servido.
  [Informe R5.8a](docs/audits/r5-8a/verification-report.json).
- Mercados e idiomas: edición y publicación simuladas en memoria, 120
  comprobaciones de navegador y ocho superficies a11y sin hallazgos.
  [Evidencia R5.8b](docs/audits/r5-8b/README.md).
- Publicación por mercado y canal: 102 pruebas del contrato, 48 de proyección
  del catálogo completo y revisión independiente de 485 comprobaciones.
  MKT-004 inactiva.
  [Informe R5.9a](docs/audits/r5-9a/verification-report.json).
- Publicación del catálogo: selección por mercado, canal y variante aplicada
  solo en memoria; 47 pruebas del modelo, 188 comprobaciones de navegador y
  ocho superficies a11y sin hallazgos. [Evidencia R5.9b](docs/audits/r5-9b/README.md).
- Cálculo fiscal y evidencia VAT: 96 y 70 pruebas específicas, respectivamente;
  5.616 comprobaciones independientes. Adaptadores solo fixture, capacidades
  MKT-009/010 inactivas y demo visual pendiente de R5.10b.
  [Informe R5.10a](docs/audits/r5-10a/verification-report.json).
- Base QA: 143 tablas y 353 filas, hash antes/después idéntico:
  `9cbfc811cfc4296515a403d395875a43bfa26aff0c9c9b08be0804b15bbf6eca`.

Esta evidencia corresponde a QA local y no acredita que el sitio remoto haya
recibido estos cambios.

### Auditorías y assets generados

Los auditores y generadores de `scripts/` conducen Chrome por CDP o usan los
binarios de imágenes disponibles (`cwebp`, `dwebp`, `sips`). Ejecutar las
auditorías contra el servidor local de QA; revisar las opciones y requisitos
de cada script antes de regenerar assets.

| Comando | Para qué | Cuándo se re-ejecuta |
|---|---|---|
| `pnpm audit:lh` | Lighthouse de las 4 páginas indexables × móvil/escritorio, **mediana de 3 pasadas**. Escribe [`docs/LIGHTHOUSE.md`](docs/LIGHTHOUSE.md) con `--write` | Tras cambios en `/`, `/arquitectura`, `/estilos` o `/dossier`, sobre QA local |
| `node scripts/a11y-audit.mjs` | Comprobaciones de accesibilidad sobre tiendas, panel y páginas comerciales en escritorio/móvil | Tras tocar temas o panel; `--only=fixture:` para las ocho superficies del corte actual |
| `node scripts/capture-screens.mjs` | Capturas de la landing y `/estilos`, en WebP y en los dos anchos (`-560`/`-900`) que la galería sirve por `srcset` | Al añadir o rediseñar una tienda |
| `node scripts/make-og.mjs` | La tarjeta que se ve al compartir el enlace (`public/images/og.jpg`) | Al cambiar marca o posicionamiento — **y subiendo el `?v=N` de `Base.astro`**, o WhatsApp seguirá enseñando la vieja |

Los dos auditores devuelven exit code 1 si algo falla, así que sirven en un
pipeline. `audit:lh` descarta y repite sola las pasadas en las que la red del
que mide se cae (un HTML que tarda 8 s da un 90 que no dice nada de la página);
nunca descarta por nota baja. Los informes HTML quedan en `.lighthouse/`
(ignorado por git).

## Demo y proyectos de cliente

El desarrollo actual se valida en QA local. No incluye despliegues, migraciones
remotas, seeds remotos ni cambios de credenciales. La demo no requiere reset
programado, webhook de Stripe, envío de formularios ni una cola operativa;
el escaparate usa fixtures versionados y una compilación verificada. El panel
consulta una base previamente preparada con fixtures sintéticos. Las pruebas
locales preparan su propia D1 QA; este cierre no modifica la base desplegada.

Un proyecto de cliente tiene despliegue, base, secretos y manifest propios.
La puesta en marcha de pagos, correo, webhooks o jobs se prepara y autoriza
para ese proyecto, con pruebas y acceso independientes. Los scripts históricos
de bootstrap y seed no son el procedimiento de actualización de la demo.

## Estructura

```
shop.config.ts        # TODO lo específico de una tienda: nombre, marca, zonas y tarifas
platform.config.ts    # manifest de capacidades y modo de despliegue
seed/                 # datos sintéticos para QA o preparación de un proyecto aislado
migrations/           # esquema D1
src/lib/              # lógica común (precios, portes, transiciones)
src/pages/            # landing (/), /arquitectura, /demo/* (noindex), /api/*
src/worker.ts         # fetch de Astro; scheduled cerrado en demo
src/collections/      # una tienda del escaparate = colección + tema, sin motor
scripts/*.mjs         # ensayos QA, auditores y generadores de assets
docs/audits/          # evidencia versionada de verificaciones locales
docs/CLIENTE.md       # manual de 1 página para el comercio
docs/POSICIONAMIENTO.md # definición canónica y reglas de lenguaje
docs/CAPACIDADES_CLIENTE.md # qué incluye, qué se activa por proyecto y qué se hace a medida
docs/PRODUCCION.md    # checklist de demo → tienda de cliente real
docs/LIGHTHOUSE.md    # notas de Lighthouse citables (las regenera el script)
docs/CHECKLIST_TEMA.md # receta y gotchas ya pagados de una sesión de tema
docs/ROADMAP.md       # estado del proyecto y decisiones
```

## De demo a tienda real

Checklist técnica en [docs/PRODUCCION.md](docs/PRODUCCION.md). En resumen:
aislar el despliegue, configurar dominio, catálogo, pagos, email, acceso y
operación, y construir o activar lo acordado para ese negocio. La base común
evita repetir infraestructura; no sustituye el análisis, el diseño ni el
desarrollo específico del proyecto.

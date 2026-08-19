# Logic2B Ecommerce

Plantilla de ecommerce ultraligera y de coste operativo ~0 €/mes, pensada para comercios pequeños de 50–100 productos. Demo pública en **[ecom.logic2b.com](https://ecom.logic2b.com)**.

Este repositorio es dos cosas a la vez:

1. **Demo comercial** — landing de venta del servicio + escaparate principal navegable (**ARCE**) y panel de gestión de ejemplo con login y datos simulados.
2. **Plantilla clonable** — para arrancar la tienda de un cliente real: editar `shop.config.ts`, reemplazar el seed, poner claves reales de Stripe y desplegar.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Astro 5 (`output: 'static'` + páginas servidor con `prerender = false`) |
| Hosting | Cloudflare Workers + assets estáticos |
| Base de datos | Cloudflare D1 (SQLite) |
| Estilos | Tailwind CSS v4 |
| Pagos | Stripe Checkout alojado (la tarjeta nunca toca nuestro servidor) |
| Emails | Resend en una tienda real; la demo solo enseña fixtures independientes en `/demo/admin/emails` |
| Tests | Vitest (344: comercio local, variantes, media/atributos tipados, consultas del panel, ledger de inventario real, precios, envío, transiciones, webhook/idempotencia de pago, eventos/outbox/auditoría/observabilidad, integraciones, emails, auth, rate limit, backup, JSON-LD, HTML escaping, CSV y storefront) + E2E de 37 pasos |

## Requisitos

- Node.js ≥ 22.18 (el seed usa TypeScript nativo de Node)
- pnpm ≥ 10

## Desarrollo local

Camino rápido (hace todo lo de abajo y pasa los tests):

```bash
./scripts/bootstrap.sh
```

A mano:

```bash
pnpm install
cp .dev.vars.example .dev.vars   # rellenar con claves TEST de Stripe

pnpm db:reset    # crea la D1 local, aplica migraciones y siembra la demo
pnpm dev         # http://localhost:4321 (bindings D1 via platformProxy)
```

Verificación completa (tipos + tests + build):

```bash
pnpm check
```

E2E de aislamiento de la demo (contra un `pnpm preview` en marcha; 32 comprobaciones: ARCE, simulación local, endpoints de comercio cerrados, auth del panel, fixtures, variantes, CSV/backup y rechazo de mutaciones):

```bash
pnpm test:e2e    # BASE_URL=… para apuntar a otro despliegue con DEMO_MODE
```

El panel de la demo (`/demo/admin`) pide login: contraseña `demo` (se muestra en la propia página de acceso).

### Auditorías y assets generados

Cuatro scripts de `scripts/`, **ninguno con dependencias npm**: conducen el
Chrome del sistema por CDP o llaman a binarios que ya están (`cwebp`, `dwebp`,
`sips`). Todos aceptan `BASE_URL=` para apuntar a otro servidor.

| Comando | Para qué | Cuándo se re-ejecuta |
|---|---|---|
| `pnpm audit:lh` | Lighthouse de las 4 páginas indexables × móvil/escritorio, **mediana de 3 pasadas**. Escribe [`docs/LIGHTHOUSE.md`](docs/LIGHTHOUSE.md) con `--write` | Tras cada deploy que toque `/`, `/arquitectura`, `/estilos` o `/dossier` |
| `node scripts/a11y-audit.mjs` | 14 reglas WCAG 2.2 AA sobre todas las tiendas, el panel y las páginas comerciales en escritorio/móvil, entrando al backoffice con el login real | Tras tocar cualquier tema o el panel; `--only=<id>` para una tienda, `--only=admin` para el backoffice |
| `node scripts/capture-screens.mjs` | Capturas de la landing y `/estilos`, en WebP y en los dos anchos (`-560`/`-900`) que la galería sirve por `srcset` | Al añadir o rediseñar una tienda |
| `node scripts/make-og.mjs` | La tarjeta que se ve al compartir el enlace (`public/images/og.jpg`) | Al cambiar marca o posicionamiento — **y subiendo el `?v=N` de `Base.astro`**, o WhatsApp seguirá enseñando la vieja |

Los dos auditores devuelven exit code 1 si algo falla, así que sirven en un
pipeline. `audit:lh` descarta y repite sola las pasadas en las que la red del
que mide se cae (un HTML que tarda 8 s da un 90 que no dice nada de la página);
nunca descarta por nota baja. Los informes HTML quedan en `.lighthouse/`
(ignorado por git).

### Probar el checkout Stripe end-to-end en una copia real

La demo pública no admite este recorrido: con `DEMO_MODE=true`, quote y checkout
remotos responden `410` y nunca crean pedidos. Para validar el motor de una
tienda real hay que usar una copia con `DEMO_MODE=false`.

1. Claves **test** de Stripe en `.dev.vars` (`STRIPE_SECRET_KEY=sk_test_…`).
2. En otra terminal: `stripe listen --forward-to localhost:4321/api/webhooks/stripe` y copiar el `whsec_…` que imprime a `STRIPE_WEBHOOK_SECRET` en `.dev.vars`.
3. Comprar con la tarjeta de prueba `4242 4242 4242 4242`. El webhook marca el pedido como pagado, descuenta stock y escribe el email de confirmación. Si el manifest activa `INV-004` con `sideEffects` y `jobs`, el alta reserva durante 31 minutos y el cobro consume ese hold; por defecto la capacidad está solo instalada.

### Probar el Worker real (incluido el cron de reset)

```bash
pnpm build
pnpm preview                      # wrangler dev sobre dist/
# el cron: wrangler dev --test-scheduled y luego
curl "http://localhost:8787/__scheduled?cron=0+*/6+*+*+*"
```

## Despliegue (demo en ecom.logic2b.com)

Camino rápido — aprovisiona la D1 remota (fijando su `database_id` en `wrangler.jsonc`), migra, siembra, despliega y pide los secretos:

```bash
./scripts/bootstrap.sh --remote
```

A mano, una sola vez:

```bash
wrangler login

# 1. Crear la D1 remota y pegar el database_id que devuelve en wrangler.jsonc
wrangler d1 create ecom-demo

# 2. Migraciones + seed en remoto
wrangler d1 migrations apply ecom-demo --remote
node seed/generate.ts > /tmp/seed.sql
wrangler d1 execute ecom-demo --remote --file /tmp/seed.sql

# 3. Secretos (claves TEST de Stripe en la demo)
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put ADMIN_COOKIE_SECRET
```

Cada despliegue:

```bash
pnpm deploy      # astro build && wrangler deploy
```

Fotos de producto (una vez, en local — la sesión cloud no puede descargar del CDN de Higgsfield): `pnpm add -D sharp && node scripts/fetch-product-images.mjs && pnpm remove sharp`, después re-sembrar (`pnpm db:reset` en local; en remoto re-ejecutar el seed o esperar al cron de reset).

Después del primer deploy:

1. **Dominio**: en el dashboard de Cloudflare → Workers → `ecom-logic2b` → Settings → Domains & Routes → añadir `ecom.logic2b.com` como custom domain.
2. **Webhook de Stripe**: en el dashboard de Stripe (modo test) crear un endpoint `https://ecom.logic2b.com/api/webhooks/stripe` suscrito a `checkout.session.completed` y `checkout.session.expired`; el signing secret va en `wrangler secret put STRIPE_WEBHOOK_SECRET`.
3. **Cron de reset**: ya queda programado por `triggers.crons` en `wrangler.jsonc` (cada 6 h, handler en `src/worker.ts`). Verificable en el dashboard → Workers → Triggers.

## Estructura

```
shop.config.ts        # TODO lo específico de una tienda: nombre, marca, zonas y tarifas
seed/                 # catálogo demo; reemplazable por cliente
migrations/           # esquema D1
src/lib/              # lógica pura (precios, portes, transiciones) — 100% testeada
src/pages/            # landing (/), /arquitectura, /demo/* (noindex), /api/*
src/worker.ts         # entry point del Worker: fetch de Astro + cron de reset
src/collections/      # una tienda del escaparate = colección + tema, sin motor
scripts/bootstrap.sh  # arranque local y aprovisionamiento Cloudflare (--remote)
scripts/*.mjs         # auditores y generadores de assets (tabla de arriba)
docs/CLIENTE.md       # manual de 1 página para el comercio
docs/CAPACIDADES_CLIENTE.md # qué incluye, qué se activa por proyecto y qué se hace a medida
docs/PRODUCCION.md    # checklist de demo → tienda de cliente real
docs/LIGHTHOUSE.md    # notas de Lighthouse citables (las regenera el script)
docs/CHECKLIST_TEMA.md # receta y gotchas ya pagados de una sesión de tema
docs/ROADMAP.md       # estado del proyecto y decisiones
```

## De demo a tienda real

Checklist completa en [docs/PRODUCCION.md](docs/PRODUCCION.md). En resumen: personalizar `shop.config.ts` + seed, mover la tienda fuera de `/demo/*`, claves live de Stripe, `DEMO_MODE` fuera, quitar el cron de reset, admin tras Cloudflare Access, `RESEND_API_KEY` para los emails y dominio del cliente. Todo es configuración: no queda desarrollo pendiente.

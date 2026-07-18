# De demo a tienda real — checklist

Pasos para convertir esta plantilla en la tienda de un cliente. En orden; todo es configuración, no hay desarrollo pendiente.

## 1. Personalizar la tienda

- [ ] `shop.config.ts`: nombre, razón social, email, divisa, colores de marca, categorías, zonas de envío y tarifas seed.
- [ ] `seed/products.ts`: catálogo real del cliente (el formato es autoexplicativo; precios en céntimos).
- [ ] Imágenes reales de producto en `public/images/products/` (WebP optimizado) y actualizar la ruta de imagen en `seed/seed.ts` (hoy apunta a un SVG placeholder por categoría).
- [ ] Textos legales del footer (aviso legal, privacidad, devoluciones) con los datos del comercio.

## 2. Rutas: la tienda deja de ser "demo"

En la plantilla `/` es la landing comercial de Logic2B y la tienda vive bajo `/demo/*` con `noindex`. Para un cliente:

- [ ] Sustituir `src/pages/index.astro` por la home del comercio y mover `src/pages/demo/{tienda,carrito,checkout,gracias}` a la raíz de `src/pages/` (actualizar los enlaces internos y `src/lib/cart-client.ts` si cambia alguna URL).
- [ ] Quitar el banner de demo y el `noindex` de `src/layouts/Shop.astro`.
- [ ] Actualizar `src/pages/sitemap.xml.ts` y `public/robots.txt` para indexar la tienda; revisar el JSON-LD `Product`/`Offer` con los datos reales.
- [ ] Eliminar `/arquitectura` y las páginas/API de demo que no apliquen (`/demo/reset`, `/api/demo/reset`).

## 3. Modo demo fuera

- [ ] `wrangler.jsonc`: `vars.DEMO_MODE` → `"false"` (bloquea el reset por API y por cron aunque siguieran desplegados).
- [ ] `wrangler.jsonc`: **eliminar el bloque `triggers`** (el cron de reset solo tiene sentido en la demo).

## 4. Stripe en vivo

- [ ] Cuenta Stripe del **cliente** (los cobros van a su banco), activada para pagos en vivo.
- [ ] `wrangler secret put STRIPE_SECRET_KEY` con la clave **live** (`sk_live_…`).
- [ ] Endpoint de webhook en modo live: `https://<dominio>/api/webhooks/stripe`, eventos `checkout.session.completed` y `checkout.session.expired`; su signing secret → `wrangler secret put STRIPE_WEBHOOK_SECRET`.
- [ ] Pedido de prueba real (importe mínimo) + reembolso desde el dashboard de Stripe para validar el ciclo completo.

## 5. Proteger el admin con Cloudflare Access

En la demo el panel es de acceso libre con un aviso. En real:

- [ ] Cloudflare Zero Trust (plan gratuito hasta 50 usuarios) → Access → nueva aplicación self-hosted cubriendo `/demo/admin*` y `/api/admin*` (o las rutas finales si se movieron), con política "solo el email del comercio (+ Logic2B)".
- [ ] Verificar que las rutas admin piden login de Access y que el resto de la web sigue pública.
- [ ] `ADMIN_COOKIE_SECRET` queda reservado (la cookie simple de demo no sustituye a Access).

## 6. Emails reales via Resend

El envío ya está implementado (`src/lib/send-email.ts`): la outbox es la fuente de verdad y, **solo con `DEMO_MODE` off y `RESEND_API_KEY` configurada**, los emails pendientes se entregan por [Resend](https://resend.com) (plan gratuito: 100/día) y quedan marcados `sent = 1`. Se generan tres: confirmación al comprador, aviso interno al comercio (pedido nuevo) y aviso de envío con tracking. Solo hay que configurar:

- [ ] Cuenta en Resend con el **dominio del comercio verificado** (SPF + DKIM que te indica Resend).
- [ ] `shop.config.ts` → `email` con una dirección de ese dominio (es el remitente y quien recibe el aviso interno).
- [ ] `wrangler secret put RESEND_API_KEY`.
- [ ] Comprobar tras el primer pedido real que los emails llegan y que la outbox los marca `sent = 1` (un fallo de Resend los deja pendientes y se reintentan en el siguiente pedido o cambio de estado).

## 7. Dominio y despliegue

- [ ] `astro.config.mjs`: `site` → dominio del cliente. `shop.config.ts`: `baseUrl` ídem.
- [ ] `wrangler.jsonc`: `name` del worker propio del cliente (p. ej. `ecom-<cliente>`) y nueva D1 (`./scripts/bootstrap.sh --remote` hace el aprovisionamiento).
- [ ] Custom domain del cliente en el dashboard de Cloudflare (DNS en Cloudflare, proxied).
- [ ] `pnpm deploy` y smoke test: catálogo, carrito, quote de portes por CP, checkout, webhook, panel.

## 8. Verificación final

- [ ] `pnpm check` en verde (tipos + 32 tests + build).
- [ ] Lighthouse ≥ 95 en las 4 métricas sobre la home y una ficha de producto.
- [ ] Rich Results Test de Google en una ficha (schema `Product` + `Offer` válido).
- [ ] Entregar `docs/CLIENTE.md` al comercio y hacer juntos un pedido de prueba.

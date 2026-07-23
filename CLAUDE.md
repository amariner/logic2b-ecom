# PROMPT MAESTRO — Logic2B Commerce Kit (demo en ecom.logic2b.com)

> Pega este documento completo como primer mensaje en Claude Code, dentro de una carpeta vacía.
> Luego guárdalo como `CLAUDE.md` en la raíz del repo para que persista entre sesiones.

---

## 1. ROL Y CONTEXTO

Eres el desarrollador principal de **Logic2B**, una agencia de desarrollo web y SEO de Castellón (España). Vamos a construir el **Logic2B Commerce Kit**: una plantilla de ecommerce a medida, ultraligera y de coste operativo casi cero, pensada para comercios pequeños de 50–100 productos.

Este repositorio cumple **dos funciones a la vez**:

1. **Escaparate comercial y demo pública** desplegada en `ecom.logic2b.com`. Es la pieza de venta: una landing que explica el servicio y da acceso a demos navegables de todas las pantallas del sistema (tienda, checkout, panel de pedidos, envíos).
2. **Plantilla clonable** lista para arrancar proyectos reales de cliente. Clonar el repo, editar un archivo de configuración, cambiar el seed del catálogo y las claves de Stripe → tienda operativa.

**No es un proyecto de cliente real.** Todo funciona en modo demo: datos sembrados, Stripe en modo test, emails capturados en lugar de enviados, reset periódico. Pero el código debe ser **de producción, no un mockup**: la lógica es real y verificable, solo cambian las credenciales y los datos.

---

## 2. PRINCIPIOS DE DISEÑO DEL SISTEMA

Estos principios mandan sobre cualquier decisión técnica. Si algo entra en conflicto con ellos, páralo y coméntamelo.

- **Coste fijo ~0 €/mes.** Todo debe caber en los planes gratuitos de Cloudflare. Nada de VPS, contenedores, ni servicios con cuota mensual.
- **Minimalismo agresivo.** Sin cuentas de usuario, sin login de comprador, sin wishlist, sin reviews, sin multiidioma en la v1. Guest checkout siempre.
- **La tarjeta nunca toca nuestro servidor.** Stripe Checkout alojado (redirección). Cero superficie PCI.
- **Rendimiento y SEO de serie.** Astro estático/híbrido en el edge. Core Web Vitals perfectos es argumento de venta, no un extra.
- **Envíos simples por defecto.** Tarifa plana / por tramos calculada en servidor. Nada de APIs de transportistas en la v1; el comercio genera etiquetas fuera (Packlink/SendCloud) desde un export CSV.
- **Reutilizable entre clientes.** Todo lo específico de una tienda vive en `shop.config.ts` y en el seed. Nada hardcodeado por el código.

---

## 3. STACK (cerrado, no proponer alternativas sin preguntar)

| Capa | Tecnología |
|---|---|
| Framework | Astro 5 (modo `hybrid`, adaptador `@astrojs/cloudflare`) |
| Hosting | Cloudflare Pages/Workers |
| Base de datos | Cloudflare D1 (SQLite) |
| Imágenes | Cloudflare R2 (en demo: imágenes locales en `/public` para simplificar) |
| Estilos | Tailwind CSS v4 |
| Interactividad | Astro islands + Alpine.js o vanilla TS. **Sin React**, salvo que lo justifiques. |
| Pagos | Stripe Checkout (hosted) + webhook |
| Emails | Resend (en demo: capturados en D1, no enviados) |
| Auth admin | Cloudflare Access en real / cookie firmada simple en demo |
| Lenguaje | TypeScript estricto |
| Tests | Vitest para la lógica de precios/envíos/webhook |

---

## 4. ESTRUCTURA DE RUTAS

**Landing comercial (indexable):**
- `/` — venta del servicio: hero, problema (comisiones y cuotas de Shopify/Woo), stack y coste real, qué incluye, comparativa, acceso a demos, precios (setup + mantenimiento), FAQ, CTA de contacto.
- `/arquitectura` — cómo funciona el sistema: diagrama del flujo, modelo de datos, explicación del webhook y del flujo de envíos. Página técnica que genera confianza.

**Demo tienda (`noindex`):**
- `/demo/tienda` — catálogo con filtros por categoría y orden.
- `/demo/tienda/[slug]` — ficha de producto.
- `/demo/carrito` — carrito (estado en `localStorage`, precios **siempre revalidados en servidor**).
- `/demo/checkout` — recogida de datos de envío + cálculo de portes → redirección a Stripe.
- `/demo/gracias` — confirmación post-pago.

**Demo backoffice (`noindex`):**
- `/demo/admin` — tabla de pedidos: nº, fecha, cliente, total, estado. Filtros por estado.
- `/demo/admin/pedidos/[id]` — detalle: líneas, dirección, botón "Marcar enviado" + campo tracking, timeline de estados.
- `/demo/admin/productos` — CRUD mínimo: nombre, precio, stock, activo.
- `/demo/admin/envios` — tarifas por zona/tramo y botón **"Exportar CSV para Packlink/SendCloud"**.
- `/demo/admin/emails` — **bandeja simulada**: muestra los emails transaccionales que el sistema habría enviado (confirmación de pedido, aviso de envío con tracking). Es una de las mejores piezas de la demo: demuestra el flujo completo sin mandar nada.
- `/demo/reset` — restaura el estado sembrado.

---

## 5. MODELO DE DATOS (D1)

```sql
products      (id, slug UNIQUE, name, description, price_cents, stock,
               image, category, active, created_at)
orders        (id, order_number UNIQUE, email, customer_name, address_json,
               subtotal_cents, shipping_cents, total_cents,
               status,                    -- pending|paid|shipped|delivered|cancelled
               stripe_session_id UNIQUE, stripe_payment_intent,
               tracking_carrier, tracking_number,
               created_at, updated_at)
order_items   (id, order_id FK, product_id, name_snapshot, unit_price_cents, qty)
order_events  (id, order_id FK, from_status, to_status, note, created_at)
shipping_rates(id, zone, label, price_cents, free_over_cents, active)
emails_outbox (id, to_addr, subject, body_html, sent, created_at)  -- bandeja demo
```

Reglas:
- Precios **siempre en céntimos enteros**. Nunca floats.
- `name_snapshot` y `unit_price_cents` congelan el precio en el momento de la compra.
- `stripe_session_id UNIQUE` es la clave de idempotencia del webhook.

---

## 6. API

- `POST /api/cart/quote` → recibe `[{slug, qty}]` + código postal. Devuelve subtotal, portes y total **recalculados en servidor desde D1**. El cliente nunca envía precios.
- `POST /api/checkout/session` → revalida stock y precios, crea la Stripe Checkout Session con `line_items` construidos en servidor, guarda el pedido en `pending`, devuelve la URL de redirección.
- `POST /api/webhooks/stripe` → verifica firma, idempotente, marca `paid`, decrementa stock, escribe en `emails_outbox`.
- `GET/PATCH /api/admin/orders[/:id]` → listado y cambio de estado + tracking. Al pasar a `shipped`, genera el email de aviso.
- `GET /api/admin/orders/export.csv` → columnas compatibles con importación de Packlink PRO / SendCloud.
- `POST /api/demo/reset` → re-seed.

---

## 7. GOTCHAS TÉCNICOS (no los descubras a golpes, ya los sabemos)

1. **Stripe en Workers no puede usar `crypto` de Node.** Usa `stripe.webhooks.constructEventAsync()` (Web Crypto) y `Stripe.createFetchHttpClient()`. Verificar la firma con el método síncrono fallará en el edge.
2. **Bindings de D1 en Astro** se acceden vía `locals.runtime.env.DB`, no por import.
3. **El webhook debe ser idempotente.** Stripe reintenta. Si `stripe_session_id` ya existe como `paid`, responde 200 y no hagas nada más.
4. **Nunca confíes en el precio que llega del cliente.** Todo se recalcula contra D1 antes de crear la sesión.
5. **Decrementa stock en el webhook, no en el checkout.** Un checkout abandonado no debe consumir inventario.
6. **Secretos con `wrangler secret put`**, jamás en el repo. `.dev.vars` en `.gitignore`.

---

## 8. MODO DEMO

Flag `DEMO_MODE=true` en env. Cuando está activo:
- Banner superior fijo: modo demo + tarjeta de prueba `4242 4242 4242 4242` visible y copiable.
- Stripe en claves **test**.
- Emails escritos en `emails_outbox` y visibles en `/demo/admin/emails`, nunca enviados.
- Admin accesible sin credenciales reales (cookie simple), con aviso de que en producción va tras Cloudflare Access.
- Cron Trigger de Cloudflare que ejecuta el reset cada 6 h.
- Todo `/demo/*` con `<meta name="robots" content="noindex,follow">`.

---

## 9. SEO (la landing es una pieza de captación, trátala como tal)

- `/` y `/arquitectura` indexables, con title/meta trabajados, H1 único, `Service` + `FAQPage` en JSON-LD.
- Fichas de producto de la demo con schema `Product` + `Offer` **correcto y validable** — forma parte de lo que vendemos.
- `sitemap.xml`, `robots.txt`, canonical, OG tags.
- Cero JS innecesario en la landing. Objetivo: 100/100/100/100 en Lighthouse.

---

## 10. CATÁLOGO DEMO

Tienda ficticia **"La Botiga del Maestrat"**: productos gourmet locales (aceites, embutidos, mieles, vinos, conservas). ~60 productos en 6 categorías, generados en `seed/products.ts` con precios y stock plausibles. Imágenes: placeholders locales optimizados (WebP), nada de hotlinking.

El seed debe ser trivialmente reemplazable: es el punto de partida para cada cliente nuevo.

---

## 11. CLONABILIDAD

- `shop.config.ts` en la raíz centraliza: nombre, email, divisa, zonas y tarifas de envío, categorías, colores de marca, textos legales.
- `scripts/bootstrap.sh` → crea la D1, aplica migraciones, siembra datos, pide las claves de Stripe.
- `README.md` con el arranque en local y el despliegue.
- `docs/CLIENTE.md`: **manual de 1 página** para el comercio. Tres pasos: (1) llega el email del pedido, (2) exporta/copia la dirección a Packlink e imprime etiqueta, (3) marca "enviado" y pega el tracking. Nada más.

---

## 12. DISEÑO

Estética Logic2B: técnica, limpia, con confianza de agencia — no plantilla genérica. Tipografía de sistema o variable ligera, buen ritmo vertical, dark mode opcional. La demo de tienda debe verse **como una tienda real y bonita**, porque es la prueba de que sabemos hacerlo; la demo de admin debe verse **deliberadamente sobria y funcional**, porque el argumento ahí es "esto se aprende en 5 minutos".

Antes de la Fase 5, propónme 2 direcciones visuales para la landing y espera a que elija.

---

## 13. PLAN DE TRABAJO

Ejecuta **por fases**. Al final de cada una: commit con mensaje descriptivo, resumen breve de lo hecho, y **para y espera mi OK** antes de la siguiente.

- **Fase 0** — Scaffold Astro + adaptador Cloudflare + Tailwind + wrangler + D1 local + `CLAUDE.md` + estructura de carpetas.
- **Fase 1** — Migraciones, `shop.config.ts`, seed del catálogo, tarifas de envío. Tests de la lógica de precios y portes.
- **Fase 2** — Tienda demo: catálogo, ficha, carrito, `/api/cart/quote`.
- **Fase 3** — Checkout Stripe + webhook + `emails_outbox` + página de gracias. Tests del webhook (idempotencia, stock).
- **Fase 4** — Backoffice: pedidos, detalle, estados, tracking, productos, envíos, export CSV, bandeja de emails.
- **Fase 5** — Landing comercial + `/arquitectura` + SEO técnico.
- **Fase 6** — Despliegue en `ecom.logic2b.com`, cron de reset, `README` y `docs/CLIENTE.md`.
- **Fase 7** — `bootstrap.sh` y checklist de "de demo a cliente real" (cambiar claves, quitar `DEMO_MODE`, activar Cloudflare Access, dominio, emails reales).

---

## 14. REGLAS DE TRABAJO

- TypeScript estricto. Sin `any` sin justificar.
- No añadas dependencias sin decírmelo y explicar por qué.
- No inventes features fuera del alcance. Si crees que falta algo, propónlo, no lo implementes.
- Código y commits en inglés; UI, documentación y comentarios de negocio en español.
- Si una decisión tiene impacto en coste, complejidad de mantenimiento o superficie PCI, **para y pregunta**.

---

## 15. EMPIEZA AQUÍ

No escribas código todavía. Primero:

1. Devuélveme el **árbol de archivos completo** que propones para el repo.
2. Lista las **dependencias exactas** con su versión.
3. Señálame las **3 decisiones** que más te preocupan o donde ves ambigüedad.

Cuando dé el OK, arranca la Fase 0.

---

## 16. EL EQUIPO DE ROLES (añadido 2026-07-23)

Este proyecto se trabaja **como un equipo senior de 7 roles a la vez**:
arquitecto de software, fullstack con visión global, backend, product designer,
frontend, UX/UI y SEO. Sus cartas — responsabilidades, checklists y **vetos que
obligan a parar y preguntar** — viven en `.claude/skills/equipo/` (skill
`equipo`, un fichero por rol en `roles/`).

En **toda tarea sustantiva** (código, diseño, contenido, precios, docs):

1. Leer los roles afectados antes de empezar (tabla en el SKILL.md del equipo).
2. Aplicar sus checklists durante el trabajo; un veto activado = parar y
   consultar (refuerza la regla §14, no la sustituye).
3. Cerrar la entrega con el **sign-off del consejo**: una línea por rol
   afectado (✓ / ⚠ con motivo y destino).

Desempate entre roles: principios de §2 > producto vendible > estética.

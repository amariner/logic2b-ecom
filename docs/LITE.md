# Commerce Kit «Lite» — exploración (pendiente de decisión)

> Documento de análisis pedido por el backlog de la Fase 8 («explorar, no implementar
> sin OK»). Nada de esto está construido. Decisión y precios: Andreu.

## Qué sería

Producto de entrada para negocios de **menos de ~10 productos** (artesanos, puestos
de mercado, productores con 3 referencias) a los que el kit completo les sobra:

| | Kit completo | Lite |
|---|---|---|
| Catálogo | D1 + panel CRUD | Ficheros en el repo (`shop.config` o markdown) |
| Carrito | Sí (multi-producto, portes por zona) | **No** — botón «Comprar» por producto |
| Pago | Stripe Checkout + webhook | **Stripe Payment Links** (URL pegada en config) |
| Pedidos | Panel con estados, tracking, CSV | Email de Stripe + su dashboard |
| Stock | Descuento automático | Límite opcional del propio Payment Link |
| Emails | Outbox + Resend con marca propia | Los de Stripe |
| Infraestructura | Workers + D1 + cron | **Solo Pages estático** (ni Worker ni D1) |
| Coste operativo | 0 €/mes | 0 €/mes |

La web sigue siendo a medida (landing + fichas con el mismo diseño y SEO), que es
lo que nos diferencia de un Linktree con fotos.

## Por qué tiene sentido

- **Coste de producción bajísimo**: es un subconjunto del kit actual — el diseño,
  `shop.config`, las fichas con JSON-LD y el SEO ya existen; se quita todo lo
  dinámico. Estimación honesta: 1–2 días por cliente tras la primera plantilla.
- **Escalera de producto**: entrada a ~500–700 € que deja clientes «sembrados»
  para el upgrade al kit completo cuando crezcan (migración natural: mismo repo,
  mismas fichas, se añade D1 + panel).
- Compite contra «no tener web» o un perfil de Instagram, no contra Shopify.

## Contras / riesgos

- **Canibalización**: un cliente de 30 productos podría pedir el Lite «para
  empezar». Mitigación: límite duro comunicado (10 productos, sin carrito).
- Payment Links cobra la comisión estándar de Stripe pero **sin** carrito
  multi-producto: cada venta es de un solo producto (o cantidades del mismo).
  Hay que contarlo sin letra pequeña.
- Mantenimiento: cambios de catálogo = tocar el repo. O se incluye un
  mantenimiento mínimo (¿9 €/mes?) o cada cambio es un ticket.

## Recomendación

Ofrecerlo, pero **no construirlo hasta el primer cliente real** que encaje en el
perfil (evitar producto en estantería). Mientras: añadir una línea en la landing
(«¿Menos de 10 productos? Pregunta por el Kit Lite») para medir demanda con coste
cero. Si en 2–3 meses nadie pregunta, descartar sin haber gastado nada.

## Si se aprueba, alcance v1

1. Rama `lite` de este repo: quitar `/demo/admin`, APIs, D1 y worker; catálogo
   desde `shop.config.ts`; botón por producto con la URL del Payment Link.
2. `docs/CLIENTE-LITE.md`: crear productos y Payment Links en Stripe (5 pasos).
3. Checklist de upgrade Lite → completo en PRODUCCION.md.

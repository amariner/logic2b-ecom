# Tema noddo — ficha de entrega

> NODDO conserva una dirección visual propia sobre el contrato comercial común.
> La compra se simula localmente; el panel ficticio es una muestra independiente.

- **Referencia:** `public/images/referencias/10-noddo.webp`
- **Colección:** `src/collections/noddo.ts` — NODDO, con 12 productos del seed
  compartido de la demo.
- **Imaginería:** 8 renders propios en `public/images/collections/noddo/generated/`
- **Estado:** catálogo y presentación de ficha propios; ficha, carrito,
  checkout y confirmación servidos por las rutas dinámicas compartidas.
- **Persistencia:** `ecom-cart:noddo` en `localStorage`; sin dependencia de D1.
- **Puente:** todas las superficies se montan con `Shop.astro`, muestran
  `DemoJourneyBanner` y enlazan al panel ficticio de solo lectura.

## Coste del tema

- Ficheros propios: `src/components/themes/noddo/`, `src/collections/noddo.ts`
  e imágenes. No conserva directorio de rutas ni fuente de productos paralela.
- Motor compartido: productos, precios, stock, storage, carrito, checkout,
  confirmación, noindex y Product + Offer.

## Verificación (docs/CHECKLIST_TEMA.md)

- ✅ `pnpm check` en verde
- ✅ Catálogo y ficha revisados a 1440px
- ✅ Catálogo, ficha, carrito, checkout y confirmación
- ✅ Franja de demo y acceso al panel ficticio independiente

## Profesionalización

- Bloque: TH0.5 · 2026-08-18
- Problema inicial: rutas, productos, storage y schema privados.
- Cambios: migración al recorrido dinámico común manteniendo catálogo y ficha
  de arte propio; slugs namespaceados y badge conectado al carrito compartido.
- Evidencia: a11y 9/9 sin errores ni avisos; catálogo/ficha revisados en browser;
  capturas desktop, móvil, ficha y tarjetas 560/900 dentro de presupuesto.
- Deuda aceptada: chrome inmersivo y mejoras generales del contrato, TH0.6;
  optimización de assets y pulido individual, TH3.1.

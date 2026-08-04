# Tema noddo — ficha de entrega

> NODDO es una demo visual autónoma. Su catálogo reproduce la referencia y su
> compra se simula localmente; el panel ficticio es una muestra independiente.

- **Referencia:** `public/images/referencias/10-noddo.webp`
- **Colección visual:** `src/collections/noddo.ts` — NODDO
- **Catálogo:** 7 productos estáticos en `src/collections/noddo-products.ts`
- **Imaginería:** 8 renders propios en `public/images/collections/noddo/generated/`
- **Estado:** catálogo, fichas, carrito, checkout y confirmación simulados con
  `localStorage`; sin dependencia de D1.
- **Puente:** todas las rutas se montan con `Shop.astro`, muestran
  `DemoJourneyBanner` y enlazan al panel ficticio de solo lectura.

## Coste del tema (rellenar al cerrar)

- Ficheros propios: `src/components/themes/noddo/`,
  `src/pages/demo/tiendas/noddo/`, `src/collections/noddo*.ts`, imágenes y seed.
- Motor compartido: solo registro del tema y puente común de demo; ninguna
  lógica de precios, pedidos, stock o envíos específica de NODDO.
- Persistencia de la carcasa: `noddo-demo-cart` en `localStorage`.

## Verificación (docs/CHECKLIST_TEMA.md)

- ✅ `pnpm check` en verde
- ✅ Catálogo y ficha revisados a 1440px
- ✅ Catálogo, ficha, carrito, checkout y confirmación
- ✅ Franja de demo y acceso al panel ficticio independiente

# Tema BRUMA — ficha de entrega

- **Cola:** `nuevos-temas/308044ce22d161b3d0caead45300d7f9.jpg`
  (posición 10).
- **Referencia interna:** `public/images/referencias/23-bruma.webp`.
- **Colección:** `src/collections/bruma.ts` — identidad adoptada: **BRUMA**.
- **Catálogo:** 8 productos · slugs `bru-*` · origen, temporada,
  descafeinado y packs.
- **Ruta:** `/demo/tiendas/bruma`.
- **Estado:** listo; ocho assets propios, capturas y QA cerrados.

## Lectura de la referencia

Catálogo de café de lujo silencioso: cabecera mínima en tres columnas,
navegación tipográfica sobredimensionada, dos selectores discretos y rejilla
rígida 4×N sobre blanco. BRUMA conserva jerarquía, proporciones, densidad,
sombra de producto y ritmo vertical, pero sustituye marca, copy y packaging por
un sistema original de bolsas mate y curvas topográficas.

En móvil la cabecera se reduce a wordmark y carrito, el titular conserva su
carácter editorial, los filtros envuelven sin overflow y la rejilla pasa a dos
columnas. La ficha, carrito, checkout y confirmación continúan en el recorrido
local compartido; no se crean pedidos ni se toca la D1 desde el escaparate.

## Imaginería y proveedor efectivo

La primera llamada a `imagegen` integrado falló antes de generar con un error
de red. Se aplicó el fallback Higgsfield ya autorizado para el carril visual.
Los ocho assets se generaron con **Product Photoshoot / GPT Image 2**, uno por
llamada, con inspección entre trabajos. Consumo: **56,36 créditos**; saldo
466,28 → 409,92.

Sistema de prompt común: fotografía de catálogo cuadrada, fondo marfil limpio,
sombra lateral larga, bolsa mate, wordmark BRUMA y topografía original; sin
props, UI, personas, marcas ajenas ni reproducción del packaging de referencia.
Variación específica y resultado:

- `bru-niebla-alta.webp` — musgo + crema;
  `98a0d569-049d-4daf-8a1b-0904174e2059`.
- `bru-loma-clara.webp` — azul mineral + marfil;
  `67658640-b76b-4da2-98e2-ebddd3f11928`.
- `bru-piedra-azul.webp` — marfil + terracota;
  `ca066398-1fbb-4203-aa20-9fcd92723743`.
- `bru-bosque-bajo.webp` — arcilla + marrón;
  `1eaa7cf5-c64c-4c0b-b23f-3d0cfdaa776b`.
- `bru-sol-de-tarde.webp` — ocre + vino;
  `09c9b3f0-d9a7-47c8-b24e-80c08a55e83b`.
- `bru-bruma-fria.webp` — petróleo + azul hielo;
  `91ed3204-a794-4cda-b31f-9d22cb7121f0`.
- `bru-umbral.webp` — carbón + malva;
  `2275205d-1485-44e1-a230-a9e1f8cd85df`.
- `bru-duo-origen.webp` — pareja musgo/azul;
  `11404970-dd15-4deb-94ce-862d65dda5a9`.

Los PNG 2048×2048 se revisaron por silueta, texto, consistencia y marcas, y se
optimizaron a WebP 1600×1600. El proyecto no depende del proveedor en runtime.

## Coste del tema

- **Kit:** colección, seed, `Catalog`, `ProductGrid`, `Filters`, tokens,
  referencia, ficha, ocho assets y cinco capturas finales.
- **Registros previstos:** colección, seed, vista, catálogo comercial,
  auditoría, capturas y rail de portada.
- **¿Hizo falta rozar el motor de comercio?: NO.**
- **Dependencias, migraciones o servicios nuevos en runtime:** NO.
- **Proveedor de imagen:** OpenAI integrado falló por red; fallback Higgsfield
  autorizado, 56,36 créditos.

## Verificación

- ✅ `pnpm check`: 57 suites, 366 tests, tipos y build.
- ✅ Catálogo y ficha revisados a 1440 y 375/390 px, claro, oscuro y
  reduced-motion.
- ✅ Filtros, búsqueda vacía y ocho productos con imágenes válidas.
- ✅ A11y: 0 errores / 0 avisos en 8 superficies.
- ✅ E2E global tras reseed local `0001`–`0011`: todas las comprobaciones de
  aislamiento, admin, backup y pagos en verde.
- ✅ Capturas: catálogo 54 KB, móvil 29 KB, ficha 28 KB y miniaturas 13/35 KB.
- ⬜ Lighthouse y smoke remoto: se ejecutan después del despliegue.

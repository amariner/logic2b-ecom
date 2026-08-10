# Tema SARGA — ficha de entrega

- **Cola:** `nuevos-temas/ac52bc2a112b7cb95286c8707a2cabb8.jpg` (posición 5)
- **Referencia interna:** `public/images/referencias/18-sarga.webp`
- **Colección:** `src/collections/sarga.ts` — identidad adoptada: **SARGA**
- **Catálogo:** 4 productos · slugs `sar-*` · chaquetas, pantalones y chalecos
- **Ruta:** `/demo/tiendas/sarga`
- **Estado:** listo; ocho assets finales únicos y tema incorporado al catálogo

## Lectura de la referencia

Tienda de sastrería femenina contemporánea con una cabecera mínima, campaña
blanca protagonizada por dos modelos en los extremos, producto aislado en una
fila de cuatro y un mosaico editorial de celdas con filetes finos. SARGA
conserva esa composición, la escala contenida y el contraste entre negro y azul
hielo, pero usa marca, copy, catálogo, personas y prendas enteramente propios.

En móvil la cabecera se reduce a menú, wordmark y bolsa; el hero mantiene a las
dos modelos visibles en una relación 16:10; la fila de producto pasa a carrusel
táctil y el mosaico apila la campaña principal antes de las celdas de producto.
Ficha, carrito y checkout siguen usando las implementaciones compartidas.

## Imaginería y proveedor efectivo

La primera llamada a la herramienta `imagegen` integrada de OpenAI/Codex falló
antes de generar ningún archivo con `network error: error sending request`.
El usuario había autorizado expresamente Higgsfield como fallback; por ello los
ocho assets finales se generaron con **Higgsfield Product Photoshoot / GPT Image
2**, en llamadas individuales, con pausa e inspección entre resultados.

Se consumieron **56 créditos Higgsfield** (saldo 1200 → 1144). Cada resultado
se descargó al worktree, se convirtió a WebP y se revisó por encuadre,
anatomía, simetría de prenda, texto, logos y marcas de agua.

- `hero-tailoring.webp` — `hero_banner`, dos modelos ficticias en sastrería
  negra y azul hielo sobre ciclorama blanco, extremos libres y vacío central.
  Resultado `70da7a2b-6600-4ba4-a26d-5763e6b57265`.
- `sar-blazer-negro.webp` — `product_shot`, blazer negro oversized aislado,
  frontal y simétrico. Resultado `07741b46-9f90-4714-962d-6d9bb44d7f9e`.
- `sar-pantalon-palazzo.webp` — `product_shot`, pantalón negro de talle alto y
  doble pinza, aislado. Resultado `120e04cd-fec4-468c-91a9-b658f90a5b88`.
- `sar-blazer-azul.webp` — `product_shot`, blazer largo azul hielo, aislado.
  Resultado `888f8f7a-0534-4e7a-b95f-a0627468ca5d`.
- `sar-chaleco-negro.webp` — `product_shot`, chaleco entallado de cinco
  botones, aislado. Resultado `1d2341b5-ece9-43d8-b150-b203600b7abd`.
- `editorial-chaleco.webp` — `virtual_model_tryout`, modelo ficticia con
  chaleco y pantalón gris, retrato 3:4. Resultado
  `812b38db-d321-4798-8613-e6e8e02abfa3`.
- `editorial-vestido.webp` — `virtual_model_tryout`, vestido halter negro de
  largo completo, estudio gris, 3:4. Resultado
  `f7856833-27a9-48ea-847b-3055d3c2294a`.
- `editorial-sastreria-azul.webp` — `virtual_model_tryout`, blazer azul hielo,
  retrato editorial 3:4. Resultado `a4e7adf7-dca3-44a4-a647-3fdd4682335b`.

La captura de referencia se recortó por regiones antes de enviarla para evitar
que el generador interpretara el navegador o la marca ajena como parte del
asset. Los prompts exigieron siempre personas ficticias, anatomía natural,
fondos limpios, cero logos, cero texto y cero marcas de agua.

## Coste del tema

- **Kit:** colección, seed, `Catalog`, `ProductGrid`, `Filters`, tokens,
  referencia, ficha, ocho assets y capturas finales.
- **Registros previstos:** colección, seed, vista de catálogo, filtro comercial,
  auditoría, capturas y rail de la landing.
- **¿Hizo falta rozar el motor de comercio?: NO.**
- **Dependencias, migraciones o servicios nuevos:** NO.
- **Proveedor de imagen:** OpenAI integrado falló por red; fallback Higgsfield
  autorizado, 56 créditos.

## Verificación

- ☑ `pnpm check`: 364 archivos Astro, 0 diagnósticos; 49 suites y 332 tests;
  build de producción en verde
- ☑ Ocho assets WebP únicos, optimizados e inspeccionados
- ☑ Escritorio 1440 px, móvil 375/390 px y `.dark` forzada sin desbordes ni
  imágenes rotas
- ☑ Filtro de chaquetas (2 productos) y búsqueda vacía comprobados
- ☑ Añadir desde tarjeta escribe `ecom-cart:sarga`, actualiza contador y no
  navega a la ficha
- ☑ Catálogo, ficha, carrito y checkout: **0 errores y 0 avisos** en 9
  superficies a11y, incluida reduced-motion
- ☑ Capturas de catálogo `560/900`, móvil y ficha generadas y optimizadas

# Tema Forma — ficha de entrega

Forma es un escaparate editorial de gafas: retratos, producto y oficio de taller.

- **Referencia:** `public/images/referencias/12-forma.webp`
- **Colección:** `src/collections/forma.ts`
- **Catálogo:** 6 productos canónicos en D1 desde `seed/collections/forma.ts`
- **Imágenes:** renders GPT Image 2 de producto y campaña en `public/images/collections/forma/`
- **Flujo:** ficha → `cart-client` → quote de envío → checkout compartido → pedido → confirmación por sesión
- **Backend:** comparte D1, precios en céntimos, stock, pedidos, emails y panel con el resto de tiendas

Los renders de producto, hero y taller se generaron con Higgsfield/GPT Image 2 y se guardaron en el repositorio para que el tema sea reproducible en local. Los componentes de Forma solo presentan el motor común mediante slots y hooks `data-commerce-*`; no mantienen lógica de compra paralela.

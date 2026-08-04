# Tema Forma — ficha de entrega

Forma es un escaparate editorial de gafas: retratos, producto y oficio de taller.

- **Referencia:** `public/images/referencias/12-forma.webp`
- **Colección:** `src/collections/forma.ts`
- **Catálogo:** 6 productos demo derivados del seed y embebidos en la página
- **Imágenes:** renders GPT Image 2 de producto y campaña en `public/images/collections/forma/`
- **Flujo:** ficha → carrito local → cálculo local de envío → checkout visual → confirmación efímera
- **Backend:** desconectado; no crea pedidos, no descuenta stock y no envía emails

Los renders de producto, hero y taller se generaron con Higgsfield/GPT Image 2 y se guardaron en el repositorio para que el tema sea reproducible en local. Los componentes de Forma componen la simulación local común mediante slots y hooks `data-commerce-*`; no llaman a APIs de comercio.

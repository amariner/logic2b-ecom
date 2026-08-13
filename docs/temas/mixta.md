# Tema MIXTA — ficha de entrega

Decimocuarto tema de la cola visual, cerrado el 2026-08-13. El nombre se adoptó
durante el Goal continuo para expresar una rutina de cuidado combinable; no se
registra como una confirmación explícita de Andreu.

- **Referencia:** `public/images/referencias/27-mixta.webp`, copia optimizada de
  `nuevos-temas/8aee98009d78b485d3312aac82084e3a.jpg`.
- **Colección:** `src/collections/mixta.ts` — rostro y cuerpo.
- **Catálogo:** 6 fórmulas `mix-*`: Polvo Nube, Suero Brote, Crema Vela,
  Bálsamo Calma, Exfoliante Té y Aceite Lento.
- **Imaginería:** 9 assets WebP propios: hero cromado, dos editoriales y seis
  productos aislados.

## Traducción visual

La captura se replica con una cabecera mínima oscura, hero fotográfico a
sangre, ticker lima, manifiesto tipográfico, díptico Cuerpo/Rostro y retícula de
producto de cuatro columnas. En móvil el díptico pasa a una columna y la tienda
a dos, manteniendo las CTA táctiles, el orden del contenido y cero overflow.
El catálogo conserva búsqueda, categorías y ordenación GET; ficha, carrito y
checkout reutilizan el motor compartido sin bifurcar lógica comercial.

## Generación y coste

La primera llamada individual a `imagegen` integrado falló por red antes de
producir un archivo. Se aplicó el fallback Higgsfield Product Photoshoot ya
autorizado en el repositorio: nueve prompts individuales en modo
`product_shot`/`lifestyle_scene`, describiendo fondo marfil, luz editorial,
materiales cosméticos sin texto ni marcas y, para las escenas, encuadre y zona
de uso. Un prompt de rostro fue bloqueado por moderación y se reformuló como
escena segura de una persona adulta; no consumió créditos.

- Saldo: 110,04 → 45,24; coste neto **64,80 créditos**.
- Resultado: 9/9 assets finales inspeccionados, sin texto, logotipos ni marcas
  de agua, optimizados a WebP.
- Dependencias nuevas: ninguna.

## Alcance técnico

- Ficheros propios: colección, seed, tres componentes Astro, nueve imágenes y
  esta ficha.
- Registros compartidos previstos: catálogo de temas, portada, estilos,
  capturas, auditoría a11y y pruebas de catálogo.
- ¿Hizo falta rozar el motor?: **no**. Pricing, envíos, checkout, pedidos, D1 y
  APIs no cambian.

## Verificación

- `pnpm check`: 482 archivos Astro sin diagnósticos, 78 suites/469 tests y
  build en verde.
- E2E global: aislamiento de demos y panel verificado.
- Navegación real a 1440×900 y 375×812: hero, grid, imágenes lazy, carrito,
  búsqueda vacía y ausencia de overflow comprobados.
- Auditoría específica: catálogo, ficha, carrito, checkout, móvil y movimiento
  reducido; **0 errores y 0 avisos en 8 superficies**.
- Capturas: escritorio 148 KB, móvil 45 KB y ficha 20 KB; derivados 900/560 px
  revisados y dentro de presupuesto.
- Despliegue: Worker `6efcec65-de06-4123-b7c2-18a325e348d8`; smoke 200 en
  portada, `/temas`, tienda y hero. Lighthouse remoto (mediana de tres): portada
  99/100/100/100 móvil y 100/100/100/100 escritorio; `/temas` 100/100/100/100
  en ambos perfiles. LCP máximo 1,8 s, CLS 0 y TBT 0 ms.

# Tema SILLAGE — ficha de entrega

- **Cola:** `nuevos-temas/60f2fa24f7e2b276b70ff9be60b1238c.jpg` (posición 2)
- **Referencia interna:** `public/images/referencias/15-sillage.webp`
- **Colección:** `src/collections/sillage.ts` — nombre propuesto: **SILLAGE**
- **Catálogo:** 8 productos · slugs `sil-*` · perfume, aceites y cuidado corporal
- **Ruta:** `/demo/tiendas/sillage`
- **Estado:** listo; catorce assets finales únicos y tema publicado en el rail principal

## Lectura de la referencia

Boutique de perfumería con una densidad muy baja y ritmo editorial. Hero
sensorial en tarjeta redondeada, cuatro novedades sobre gris cálido, producto
destacado a dos columnas, manifiesto centrado, tres familias apiladas y cierre
de showroom. El tema conserva esa secuencia, proporciones y jerarquía sin
reutilizar marca, copy ni assets de la referencia.

## Imaginería prevista

El objetivo sigue siendo 14 WebP originales, generados con la herramienta
integrada y usando recortes de la captura únicamente como referencias de composición:

- `hero-abstract.webp`
- `feature-cedro-solar.webp`
- `showroom.webp`
- `family-perfume.webp`, `family-oils.webp`, `family-body-care.webp`
- ocho imágenes de producto con el nombre de su slug

Están terminados y optimizados los catorce WebP previstos: hero, destacado,
showroom, tres familias y las ocho imágenes de producto. Cada producto usa ya
su asset por slug y las tarjetas de familia consumen sus composiciones propias.

El 2026-08-07 el usuario autorizó expresamente Higgsfield tras dos fallos de red
del generador integrado. Se generaron siete assets con GPT Image 2 y Soul
Location. El siguiente trabajo (`sil-vetiver-11`) fue rechazado por saldo
insuficiente; la cuenta conservaba 6,56 créditos. Por ello el tema no se marcó
como listo hasta producir los siete assets únicos restantes.

Al retomar el trabajo el mismo día, el usuario indicó que los siete assets
restantes debían generarse exclusivamente con la suscripción integrada de
OpenAI, de uno en uno, con pausa entre solicitudes y WebP finales ligeros. El
servicio volvió a estar disponible y completó `sil-vetiver-11`,
`sil-leche-higo`, `sil-balsamo-sal`, el destacado de Cedro Solar y las tres
familias. Cada llamada se guardó, optimizó e inspeccionó antes de enviar la
siguiente; no se usó API con facturación separada ni se volvió a Higgsfield.

## Coste del tema

- Ficheros del kit tocados: colección, seed, componentes, tokens, referencia y ficha.
- Registros compartidos tocados: colección, seed, vista de catálogo y filtro comercial.
- ¿Hizo falta rozar el motor de comercio?: **NO**.
- Dependencias, migraciones o servicios nuevos: **NO**.

## Verificación

- ☑ `pnpm check`: 322 archivos Astro, 296 tests y build en verde
- ☑ Catorce assets WebP generados, optimizados e inspeccionados
- ☑ Ocho productos y tres familias con assets únicos, sin fallbacks temporales
- ☑ 1440 px · 375 px · recorrido completo · 9 superficies a11y sin hallazgos
- ☑ Capturas de QA, incluidas `-560` y `-900`, dentro de objetivo de peso
- ☑ Ficha visible en `/temas`, con enlace a la tienda
- ☑ Entrada en el rail principal y estado `ready`

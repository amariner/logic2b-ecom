# Tema ORBE — ficha de entrega

- **Cola:** `nuevos-temas/c907738a08f280fe8ca611d64646e235.jpg` (posición 7)
- **Referencia interna:** `public/images/referencias/20-orbe.webp`
- **Colección:** `src/collections/orbe.ts` — identidad adoptada: **ORBE**
- **Catálogo:** 6 productos · slugs `orb-*` · sérums, aceites y cuidado diario
- **Ruta:** `/demo/tiendas/orbe`
- **Estado:** listo; nueve assets finales únicos y tema incorporado al catálogo

## Lectura de la referencia

Tienda de skincare de lujo con una barra de servicio mínima, wordmark serif
centrado, hero partido entre producto y piel, franja editorial, cuatro
bestsellers y un manifiesto de marca a dos columnas. ORBE conserva esa
secuencia, el marfil cálido, los filetes finos y la relación entre retrato y
objeto, pero usa identidad, copy, personas, envases y fotografías propios. La
franja de supuestas cabeceras de prensa se traduce a principios de marca para
no inventar avales comerciales.

En móvil la cabecera queda reducida a tienda, marca y cesta; el hero apila
producto y retrato, los principios pasan a tres columnas y el catálogo cae a
dos. Ficha, carrito y checkout siguen usando el contrato comercial compartido:
el tema no duplica estado, cálculo, persistencia ni APIs.

## Imaginería y prompts finales

`imagegen` integrado falló por red antes de producir un archivo. Se activó
Higgsfield Product Photoshoot tras la petición expresa de Andreu. El primer
intento de lote de seis falló dos veces antes de crear trabajos; después, el
backend rechazó `4:5` —aunque la guía local aún lo enumera— y se corrigió a
`3:4`. Las nueve salidas finales se generaron una a una, se inspeccionaron y se
convirtieron a WebP. No entró ninguna imagen con texto, marca, watermark o UI.

- `hero-serum.webp` — botella ámbar con tapón esférico y gran vacío marfil/salvia.
- `editorial-portrait.webp` — retrato de piel oscura con luz de estudio suave.
- `editorial-family.webp` — cuatro siluetas de la familia sobre piedra cálida.
- `orb-renew-serum.webp` — sérum alto con etiqueta de papel marfil.
- `orb-calm-essence.webp` — esencia corta y ancha con tapón esférico.
- `orb-barrier-oil.webp` — aceite compacto con pipeta negra.
- `orb-night-balm.webp` — tarro bajo de bálsamo con tapa plana.
- `orb-eye-concentrate.webp` — vial fino para el contorno de ojos.
- `orb-radiance-treatment.webp` — dosificador opaco con panel verde salvia.

## Coste del tema

- **Higgsfield:** 63,72 créditos del plan (`989,16 → 925,44`) para nueve
  imágenes finales; los fallos previos no produjeron archivos.
- **Kit:** colección, seed, `Catalog`, `ProductGrid`, `Filters`, tokens,
  referencia, ficha, nueve assets y cinco capturas finales.
- **Registros:** colección, seed, catálogo comercial, landing, auditoría y
  motor de capturas.
- **¿Hizo falta rozar el motor de comercio?: NO.**
- **Dependencias, migraciones o servicios nuevos:** NO.

## Verificación

- ☑ Nueve assets WebP únicos, optimizados e inspeccionados
- ☑ Escritorio 1440 px y móvil 390×844 revisados con capturas reales
- ☑ Catálogo, ficha, carrito activo y checkout: 0 errores y 0 avisos en 9
  superficies a11y, incluido movimiento reducido
- ☑ Capturas de catálogo `560/900`, móvil y ficha dentro del objetivo de peso
- ☑ E2E local de aislamiento y panel: 37/37 comprobaciones
- ☑ `pnpm check`: 53 suites, 350 tests, 387 archivos Astro y build en verde

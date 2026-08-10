# Tema NERA — ficha de entrega

- **Cola:** `nuevos-temas/ac52bc2a112b7cb95286c8707a2cabb8.jpg` (posición 5)
- **Referencia interna:** `public/images/referencias/18-nera.webp`
- **Colección:** `src/collections/nera.ts` — identidad adoptada: **NERA**
- **Catálogo:** 8 productos · slugs `ner-*` · sastrería, pantalones, tops y punto
- **Ruta:** `/demo/tiendas/nera`
- **Estado:** listo; once assets finales únicos y tema incorporado al catálogo

## Lectura de la referencia

Tienda de moda femenina minimalista con cabecera fina, wordmark centrado, hero
editorial a sangre, cuatro prendas aisladas sobre blanco y un mosaico alterno de
campaña y producto. NERA conserva esa secuencia, el uso de filetes mínimos, la
tipografía condensada, el ritmo muy compacto y la paleta negro/azul acero, pero
usa identidad, copy, prendas y personas completamente propios.

En móvil la cabecera queda reducida a menú, marca y bolsa; el hero adopta una
proporción vertical, el catálogo cae a dos columnas y el mosaico se apila sin
alterar el orden de lectura. La cabecera inmersiva se limita al catálogo: ficha,
carrito y checkout conservan el chrome compartido y el recorrido demo aislado.

## Imaginería y prompts finales

La primera generación de campaña con `imagegen` integrado falló por red. Según
el fallback ya autorizado en `docs/NUEVOS_TEMAS.md`, los once assets finales se
generaron uno a uno con Higgsfield: Soul 2.0 para las campañas y Product
Photoshoot para cada prenda aislada. Los prompts pidieron estudio marfil,
sastrería precisa, producto sin marca, ausencia de texto añadido y composición
propia; cada resultado se inspeccionó y se convirtió a WebP antes de entrar.

- `hero-campaign.webp` — dos modelos ficticias en negro y azul acero, con vacío
  central para la entrada a colección.
- `editorial-tailoring.webp` — campaña vertical con chaleco gris y pantalón
  negro de caída amplia.
- `editorial-knit.webp` — retrato vertical con jersey gris de cuello vuelto.
- `ner-blazer-negra.webp` — blazer larga negra de hombro relajado.
- `ner-pantalon-palazzo.webp` — pantalón negro de pierna muy ancha.
- `ner-blazer-azul.webp` — blazer azul bruma de línea estructurada.
- `ner-chaleco-estructura.webp` — chaleco negro largo y entallado.
- `ner-vestido-columna.webp` — vestido negro de punto en silueta columna.
- `ner-pantalon-arcilla.webp` — pantalón sastre color arcilla.
- `ner-top-bandeau.webp` — top bandeau negro mínimo.
- `ner-jersey-gris.webp` — jersey gris de punto denso y cuello alto.

## Coste del tema

- **Kit:** colección, seed, `Catalog`, `ProductGrid`, `Filters`, tokens,
  referencia, ficha, once assets y cinco capturas finales.
- **Registros:** colección, seed, catálogo comercial, landing, auditoría y
  motor de capturas.
- **¿Hizo falta rozar el motor de comercio?: NO.**
- **Dependencias, migraciones o servicios nuevos:** NO.

## Verificación

- ☑ Once assets WebP únicos, optimizados e inspeccionados
- ☑ Escritorio 1440 px y móvil 390×844 revisados con capturas reales
- ☑ Catálogo, ficha, carrito activo y checkout: 0 errores y 0 avisos en 9
  superficies a11y, incluido movimiento reducido
- ☑ Capturas de catálogo `560/900`, móvil y ficha dentro del objetivo de peso
- ☑ E2E local de aislamiento y panel: 37/37 comprobaciones
- ☑ `pnpm check`: 53 suites, 350 tests, chequeo Astro y build en verde

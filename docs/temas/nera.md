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

## Profesionalización

- Bloque: TH3.9 (adelantado) · 2026-09-26 (encargo: temas destacados de la home)
- Audiencia / tarea principal: moda de autor y sastrería femenina en series cortas; elegir una prenda y completar el look.
- Problemas iniciales: P1 prendas como «cromos» blancos sobre `#f7f7f5` y tres fotos con viñeteado gris · P1 losa gris en huecos de la rejilla filtrada y «1 piezas» · P1 ficha genérica fuera de marca · P2 textos de ~9 px y objetivos de 32 px · P2 icono «☰» que solo enlazaba al catálogo · P3 `onchange` en línea para ordenar.
- Nota inicial: Producto 3/4 · UX 2/4 · UI 2/4 · Marketing 3/4 · Frontend 2/4 · SEO 3/4 · Rendimiento/a11y 2/4 · total 60/100
- Cambios realizados: `--surface-product` a blanco puro y tres WebP reprocesados (solo tonos > 170 llevados a blanco; prenda intacta) · filetes por tarjeta en vez de fondo de rejilla, plural correcto · ficha propia `ProductDetail.astro` (imágenes apiladas, columna condensada fija, CTA azul acero, «Completa el look») · segunda imagen real al hover solo donde la prenda aparece en campaña (`alternates.ts`) · textos ≥ 0,72 rem y objetivos de 44 px · «Colección» sin icono engañoso · cabecera con sombra y logotipo compactado ligados al scroll (sin cambiar altura: CLS 0) · asentamiento del mosaico · orden con botón «Aplicar» y mejora progresiva.
- Contrato compartido tocado: sí, solo el registro `productPresentations`; ningún cambio en compra.
- Nota final: Producto 3/4 · UX 3/4 · UI 4/4 · Marketing 3/4 · Frontend 4/4 · SEO 3/4 · Rendimiento/a11y 4/4 · total 86/100
- Evidencia: `astro check` sin errores propios · Vitest 1260/1261 (el fallo es `architecture.test.ts` por borradores no versionados de `src/lib/tour`, ajenos) · build · E2E de aislamiento en verde · a11y 0/0 en 8 superficies · capturas regeneradas dentro de presupuesto · `audit:themes` regenerado y estable
- Deuda aceptada: una pasada del auditor dio 2 errores no reproducibles (tres pasadas siguientes a 0); vigilar en TH5.4.

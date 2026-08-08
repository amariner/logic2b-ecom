# Tema LÍTICA — ficha de entrega

- **Cola:** `nuevos-temas/a3978f1d35c67011b1d8877eb75adeaa.jpg` (posición 4)
- **Referencia interna:** `public/images/referencias/17-litica.webp`
- **Colección:** `src/collections/litica.ts` — identidad adoptada: **LÍTICA**
- **Catálogo:** 6 productos · slugs `lit-*` · rostro, cuerpo y objetos
- **Ruta:** `/demo/tiendas/litica`
- **Estado:** listo; diez assets finales únicos y tema incorporado al catálogo

## Lectura de la referencia

Tienda de cosmética natural con fondo marfil, tipografía sans muy ajustada,
retícula modular de filetes finos y una alternancia precisa entre producto
aislado, roca cálida y fotografía corporal monocroma. LÍTICA conserva el hero
partido, las bandas de tres productos precedidas por un titular, el bloque de
categorías apiladas, la sección de principios y el cierre «Sí / No», pero usa
marca, copy, catálogo, envases y fotografías enteramente propios.

En móvil la cabecera se reduce a menú, wordmark y bolsa; el hero apila imagen y
copy; las tarjetas caen a dos columnas y cada bloque editorial conserva su
orden de lectura. La cabecera especial vive solo en el catálogo: ficha, carrito
y checkout recuperan el chrome compartido para que el recorrido completo siga
siendo evidente.

## Imaginería y prompts finales

Los diez assets se generaron con la herramienta `imagegen` integrada de
OpenAI/Codex, en llamadas individuales y sin usar CLI/API con facturación
separada. La captura se usó únicamente como referencia de luz, materialidad y
encuadre; todos los prompts exigieron composición original, envases sin marca,
ausencia de texto legible y cero logotipos o marcas de agua.

- `hero-mineral.webp` — tres tarros ámbar sobre caliza porosa en luz mediterránea
  dura; paisaje amplio para el hero partido.
- `ritual-hands.webp` — manos adultas aplicando bálsamo sobre un antebrazo;
  editorial analógica monocroma, gesto cotidiano y no sexual.
- `gift-kit.webp` — botella, tarro, herramienta de piedra y lino dentro de una
  caja de fibra moldeada sobre roca.
- `ritual-stones.webp` — dos piedras de basalto durante un ritual de antebrazo;
  fotografía documental monocroma.
- `lit-mineral-wash.webp` — botella alta de vidrio ámbar con bomba negra y
  etiqueta marfil en blanco.
- `lit-ferment-serum.webp` — gotero ámbar compacto con una única franja óxido.
- `lit-barrier-cream.webp` — tubo de aluminio cepillado, tapón grafito y pequeño
  cuadrado óxido.
- `lit-night-mask.webp` — tarro bajo de vidrio ámbar con banda de papel y filete
  óxido.
- `lit-body-oil.webp` — botella cilíndrica ámbar de aceite seco, etiqueta baja.
- `lit-limestone-tool.webp` — herramienta facial asimétrica tallada en caliza.

## Coste del tema

- **Kit:** colección, seed, `Catalog`, `ProductGrid`, `Filters`, tokens,
  referencia, ficha y diez assets finales.
- **Registros previstos:** colección, seed, vista de catálogo, filtros del
  catálogo comercial, auditoría, capturas y rail de la landing.
- **¿Hizo falta rozar el motor de comercio?: NO.**
- **Dependencias, migraciones o servicios nuevos:** NO.

## Verificación

- ☑ Build de producción y chequeo Astro en verde (338 archivos, 0 diagnósticos)
- ☑ Diez assets WebP únicos, optimizados e inspeccionados
- ☑ Escritorio 1440 px y móvil 375/390 px sin desbordes ni imágenes rotas
- ☑ Filtro de rostro (4 productos) y búsqueda vacía comprobados
- ☑ Añadir desde tarjeta actualiza el badge; ficha y carrito quedan accesibles
- ☑ Catálogo, ficha, carrito y checkout: 0 errores y 0 avisos en 9 superficies a11y
- ☑ Capturas de catálogo `560/900`, móvil y ficha generadas y optimizadas
- ☑ Verificación completa equivalente a `pnpm check`: 46 suites, 312 tests,
  chequeo Astro y build en verde

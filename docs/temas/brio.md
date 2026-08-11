# Tema BRÍO — ficha de entrega

- **Cola:** `nuevos-temas/247f56bc054cf88fda76024abf2137df.jpg`
  (posición 9).
- **Referencia interna:** `public/images/referencias/22-brio.webp`; se replica
  únicamente la interfaz central y se excluye el fondo promocional exterior.
- **Colección:** `src/collections/brio.ts` — identidad adoptada: **BRÍO**.
- **Catálogo:** 6 productos · slugs `bri-*` · movimiento, descanso y día a día.
- **Ruta:** `/demo/tiendas/brio`.
- **Estado:** listo; ocho assets finales propios y tema incorporado al catálogo.

## Lectura de la referencia

Escaparate DTC de bienestar con una hoja marfil redondeada sobre gris, cabecera
mínima, hero partido entre retrato cercano y envase sobre azulejo, cinta
editorial, manifiesto de gran escala, primera fila de tres productos y retícula
inferior 2×2 con mucho vacío. BRÍO conserva la estructura, densidad y ritmo,
pero sustituye marca, textos, catálogo, persona e imaginería por material propio.

En móvil la cabecera se reduce a Tienda / BRÍO / Bolsa, el hero se apila y la
retícula pasa a dos columnas sin overflow. El ticker se detiene con
`prefers-reduced-motion`. La ficha, el carrito y el checkout siguen usando el
recorrido local compartido; el gestor permanece como fixture independiente.

## Imaginería y proveedor efectivo

La llamada inicial a la herramienta `imagegen` integrada de OpenAI/Codex falló
antes de generar con `network error: error sending request`. Se aplicó el
fallback Higgsfield autorizado para este carril el 2026-08-10. Los ocho assets
se produjeron con **Product Photoshoot / GPT Image 2**, uno por llamada, con
pausa e inspección entre solicitudes. Consumo: **56 créditos**; saldo
660,48 → 604,48.

El sistema de prompts mantuvo marca ficticia, bolsa mate, wordmark redondeado,
formas geométricas y paleta propia; prohibió logos ajenos, UI, marcas de agua,
texto de relleno y anatomía artificial. Los recortes de la referencia se usaron
solo como guía de encuadre:

- `hero-smile.webp` — retrato cuadrado de una mujer ficticia con dos parches
  lima en la sien, luz directa y espacio para copy HTML. Resultado
  `c43acd97-3a07-4480-80a4-c7b18f32683d`.
- `hero-pack.webp` — sobre lima `BRÍO / ESPALDA LIBRE` sobre banco curvo de
  azulejo blanco. Resultado `e154e2f0-0fa4-423a-9bc9-cfa7bf87bbde`.
- `bri-musculo-suelto.webp` — sobre naranja, tres círculos lavanda y escenario
  de azulejo. Resultado `3bec285b-10e5-4f3a-871a-e9c351090071`.
- `bri-pausa-nocturna.webp` — sobre lavanda, luna crema y escenario de
  azulejo. Resultado `003f0036-b4c9-4ab8-8aa9-7d1c56ef29c3`.
- `bri-espalda-libre.webp` — sobre lima pequeño dentro de un nicho profundo de
  azulejo. Resultado `0532f88e-19f3-4586-8978-fd182ea5705b`.
- `bri-nuca-clara.webp` — sobre menta y círculos rosa sobre campo marfil.
  Resultado `15ff407c-1cb3-44b5-9f66-49394cf168d9`.
- `bri-ciclo-calma.webp` — sobre rosa y círculos naranja sobre campo marfil.
  Resultado `094e54ce-6e1e-4e20-9761-4835179d292c`.
- `bri-viaje-ligero.webp` — sobre caléndula y cápsula violeta sobre campo
  marfil. Resultado `89dbd24b-92a1-41c7-87f9-d0344d876eae`.

Todos se guardaron como WebP local de 1600×1600, se inspeccionaron por texto,
geometría, anatomía, marcas y consistencia, y quedaron fuera de cualquier
dependencia del proveedor en runtime.

## Coste del tema

- **Kit:** colección, seed, `Catalog`, `ProductGrid`, `Filters`, tokens,
  referencia, ficha, ocho assets y cinco capturas finales.
- **Registros previstos:** colección, seed, vista de catálogo, filtros
  comerciales, auditoría, capturas y rail de la landing.
- **¿Hizo falta rozar el motor de comercio?: NO.**
- **Dependencias, migraciones o servicios nuevos en runtime:** NO.
- **Proveedor de imagen:** OpenAI integrado falló por red; fallback Higgsfield
  autorizado, 56 créditos.

## Verificación

- ✅ `astro check`: 397 archivos, 0 diagnósticos en la primera pasada.
- ✅ Catálogo y ficha revisados a 1440 px y 375/390 px, en claro y oscuro.
- ✅ Filtro, búsqueda vacía y seis productos con imágenes válidas.
- ✅ Añadir desde tarjeta escribe `ecom-cart:brio`, actualiza el contador y no
  navega a la ficha.
- ✅ Catálogo, ficha, carrito y checkout: **0 errores y 0 avisos** en 8
  superficies a11y, incluida reduced-motion.
- ✅ Capturas finales: catálogo 138 KB, móvil 60 KB, ficha 34 KB y miniaturas
  560/900 dentro de presupuesto.
- ⚠ Lighthouse local de la landing (3 pasadas): 98/100/100/100 móvil y
  99/100/100/100 escritorio. El LCP señalado es el copy general del hero en
  móvil y la captura de ORBE en escritorio, no un asset BRÍO; la corrección
  pertenece al carril de rendimiento de la landing. Sin medida ni despliegue
  remoto en esta sesión.

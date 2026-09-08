# Zancada — importación del tema original de Logic2B

**Fecha:** 2026-09-08. **Estado:** integrado en `main` y publicado en producción.

## Origen y fidelidad

Encargo expreso de Andreu: importar Zancada desde `logic2b-note`, utilizar su
código tal cual y acoplarlo al contrato ecommerce de este repositorio.
Origen: `logic2b-note/src/themes/zancada/Theme.astro`, revisión
`cd6c4cd150178a2ace032ee252b004b512fae723`.

Se conservan la composición, wordmark, isotipo, tipografía de sistema, paleta,
hero dual, vídeos, galería, campaña de montaña, calcetines, equipamiento,
bloque de marca y comunidad. `original.css` conserva literalmente el bloque de
estilos original; `tokens.css` y los **28 recursos** (25 WebP y 3 MP4) son copias
idénticas verificadas por SHA-256. La referencia `33-zancada.webp` procede del
póster aprobado del propio tema, no de la tienda que inspiró su diseño.

Las adaptaciones viven en `commerce.css`, los componentes del kit y los
registros de presentación. Incluyen contraste de texto sobre imágenes/vídeos,
foco, controles táctiles, tamaños de imagen y filas sin desbordamiento.

## Catálogo y recorrido

- 13 artículos originales; 78 referencias demo al materializar las tallas.
- Catálogo en `src/collections/zancada.ts`, consumido por el seed. Un precio
  entero en céntimos por modelo, conservando los importes del original.
- Todas las tarjetas enlazan a su propia ficha: cuatro zapatillas, seis
  calcetines y tres piezas de equipamiento. La XT-Wings mantiene las cuatro
  fotografías y el vídeo 360°; cada otra ficha usa su fotografía específica.
- Filtros GET por categoría, búsqueda combinable, orden y estado vacío.
- Las tallas son referencias explícitas con slug y nombre propios en los
  fixtures; la selección actualiza `data-product-slug`. La bolsa conserva dos
  tallas como líneas distintas mediante el contrato existente. No se modifica
  el sistema de variantes del motor ni se crea almacenamiento privado.
- `ProductPage`, `CartPage`, `CheckoutPage` y `ThanksPage` compartidos;
  almacenamiento `ecom-cart:zancada`, portes de la configuración común y
  confirmación efímera. Todas las rutas conservan `Shop`, aviso demo, Gestor
  tienda, noindex, canonical y Product/Offer en cada ficha.
- Se retira el reclamo de pack 3×42 € porque la compra común no representa ese
  pack. PACE CREW conserva el precio unitario original de 16 €.
- Se retira la cuenta ficticia y se enlaza el Gestor tienda; los textos de
  envío/devolución proceden de `shop.config.ts`. Newsletter, agenda y contenido
  auxiliar continúan siendo demostraciones sin envío de datos.

## Evidencia y comprobaciones

- `pnpm check` correcto: 834 archivos revisados, 205 suites / 1.060 tests,
  integridad de temas y build en verde.
- Auditoría `a11y-audit.mjs --only=zancada`: 0 errores / 0 avisos en 9 superficies de catálogo, ficha,
  cesta, envío y checkout; escritorio, 375 px y movimiento reducido.
- Revisión visual de portada y ficha; menú móvil, filtros de calcetines y
  búsqueda vacía; selección EU 44 → cesta 140 € → CP 12001 → checkout →
  confirmación local a 140 €. Las 13 fichas responden y conservan noindex.
- Capturas reproducibles de catálogo, móvil y ficha, más tarjetas 560/900:
  `public/images/screens/store-zancada-*`. El vídeo comercial se importa de
  `logic2b-note/public/previews/cards/zancada.mp4`; documenta el diseño
  original, con sus rótulos ilustrativos anteriores a la adaptación comercial.
- E2E global correcto en `http://127.0.0.1:8800`, usando una D1 temporal en
  `/tmp/zancada-test-state`, con las migraciones existentes hasta `0044` y el
  seed público. La D1 habitual permanece en `0039`: sus tres fallos de backup
  (`customer_address_access_refs` ausente) son previos y no se altera esa base.

## Publicación

Publicación autorizada expresamente por Andreu el 2026-09-08. Código
`a5e2762`, subido a GitHub en `codex/import-zancada` y `main`; build y
`pnpm deploy` correctos. Worker `ecom-logic2b`, versión
`d435077f-9181-44ad-8397-dfa367b7c59f`, con `DEMO_MODE=true`.

Demo: <https://ecom.logic2b.com/demo/tiendas/zancada>.
Smoke de producción: 18 páginas HTTP 200 (portada, galería, tienda, cesta,
checkout y 13 fichas), noindex en la demo y contrato Product/compra en
las fichas. Los 35 recursos publicados coinciden por SHA-256 con el repositorio.
Portada y recorrido verificados también en navegador: talla EU 44 → cesta →
CP 12001, envío gratis → checkout → confirmación efímera a 140 €.
No se han aplicado migraciones ni
escrito datos en D1. El primer intento se detuvo localmente por falta de
espacio antes de publicar; se retiró el perfil temporal de capturas y el
reintento terminó correctamente.

Lighthouse 12 en producción, mediana de tres pasadas por dispositivo:

| Superficie | Rendimiento | Accesibilidad | Buenas prácticas | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| Portada móvil | 100 | 100 | 100 | 100 | 1,7 s | 0 | 0 ms |
| Portada escritorio | 100 | 100 | 100 | 100 | 0,5 s | 0 | 0 ms |
| Galería móvil | 99 | 100 | 100 | 100 | 2,1 s | 0 | 0 ms |
| Galería escritorio | 100 | 100 | 100 | 100 | 0,6 s | 0 | 0 ms |

Comandos: `node scripts/lighthouse.mjs --only=home` y `--only=estilos`.
El segundo devuelve código 1 porque el objetivo estricto es 100 en todas
las categorías. La diferencia móvil corresponde a LCP (2,1–2,2 s en las
tres pasadas); se registra como mejora pendiente de la galería. No se cita
100 de rendimiento para esa superficie ni se sobrescribe el informe global
`docs/LIGHTHOUSE.md` con una tanda parcial.

## Coste y límites

**Motor modificado: NO.** Solo kit, colección/seed, registros de tema y slots,
CSS limitado a Zancada, capturas, pruebas y documentación. Sin dependencias,
migraciones nuevas, generación de assets ni credenciales nuevas. Despliegue
posterior autorizado, con la sesión de Cloudflare existente.

Se conserva el peso original de las imágenes y los tres vídeos por el encargo
de fidelidad. El auditor de línea base señala el directorio superior a 2,5 MB
y sus MP4; son recursos locales deliberados. Los vídeos usan `preload=none`,
posters, pausa fuera del viewport y respeto de movimiento reducido. El vídeo
de catálogo original se reutiliza sin recodificar. El grabador general local
no terminó su fase de preparación en Chrome; no se altera para este tema. Cualquier optimización futura debe conservar los
originales y medirse por ruta, no por el peso total del directorio.

## Consejo

- Arquitectura ✓: mismo contrato comercial y sin importaciones invertidas.
- Fullstack ✓: talla, carrito, envío y confirmación conectados.
- Backend ✓: seed inmutable; demo aislada, sin escrituras ni proveedores.
- Producto ✓: diseño original conservado y 13 fichas navegables.
- Frontend ✓: Astro y TypeScript, sin dependencias nuevas.
- UX/UI ✓: móvil, teclado, estados y contraste revisados.
- SEO ⚠: noindex/canonical y Product/Offer correctos; rendimiento móvil de
  galería 99, mejora registrada en ROADMAP.

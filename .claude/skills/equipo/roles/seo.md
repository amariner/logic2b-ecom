# SEO

**Misión:** que la landing capte y que la técnica SEO de serie sea un argumento
de venta demostrable («Core Web Vitals perfectos» se enseña, no se promete).

## Responsabilidades en este repo

- **Mapa de indexación estricto:** `/`, `/arquitectura`, `/estilos`, `/dossier`
  indexables con title/meta trabajados, H1 único y canonical. TODO `/demo/*`
  con `noindex,follow`. Nada nuevo se publica sin decidir su lado del mapa.
- **Datos estructurados que VALIDAN:** `Service` + `FAQPage` en la landing;
  `Product` + `Offer` correctos en fichas — forma parte de lo que vendemos.
  Tras tocar precios o FAQ, revalidar el JSON-LD (Rich Results Test): un
  schema desincronizado con el copy es peor que ninguno.
- **CWV como producto:** objetivo 100/100/100/100 en Lighthouse para las
  páginas indexables, citable en la propia landing (re-auditar contra
  producción tras cada deploy que las toque). LCP < 1,2 s, CLS 0.
- **Copy que posiciona sin jerga:** el ICP busca «tienda online para mi
  comercio», «cuánto cuesta una tienda online», «alternativa a Shopify sin
  cuotas» — no «edge computing». Títulos y H2 trabajan esas intenciones;
  `/arquitectura` captura la búsqueda técnica del «cuñado informático».
- **Higiene:** sitemap.xml al día cuando nace una página indexable, OG/Twitter
  por página (el OG se comparte por WhatsApp — es canal de venta real),
  redirecciones sin cadenas, imágenes con alt útil.

## Checklist de revisión

- [ ] ¿Página nueva → decidido index/noindex, canonical, título único, en
      sitemap si indexable?
- [ ] ¿JSON-LD sincronizado con el copy visible (precios, FAQ, productos)?
- [ ] ¿Lighthouse SEO/Perf 100 se mantiene en las indexables afectadas?
- [ ] ¿El cambio de copy conserva la intención de búsqueda del H1/title?
- [ ] ¿OG verificado si la página se va a compartir?

## Vetos (parar y preguntar)

- Meter JS o peso en la landing que comprometa el 100 de Lighthouse.
- Indexar cualquier cosa bajo `/demo/*` o desindexar una página comercial.
- Cambiar URLs indexadas sin plan de redirección 301.

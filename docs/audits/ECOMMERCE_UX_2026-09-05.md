# Revisión comercial y propuesta Inlogem — 5 de septiembre de 2026

Rama: `codex/proposals-inlogem`, actualizada con `git fetch` y `pull --ff-only`.
Encargo de Andreu: acercar la home a Camp, ordenar las páginas y profesionalizar
la propuesta Inlogem, generar los recursos pendientes y revisar los packs.
No se ha desplegado ni se ha publicado la propuesta privada.

## Referencia y criterio de paridad

Referencia inspeccionada en web y navegador: [Logic2B Campings](https://camp.logic2b.com/).
Se reproduce su arquitectura de información y familia visual: cabecera flotante,
jerarquía editorial, lienzo claro, tinta verde, botones redondeados y vistas de
producto. La tienda Inlogem conserva su propia identidad azul y tipografía.

La cobertura de apartados se verifica con esta matriz. No se presenta como un
100 % de igualdad píxel a píxel, funcionalidad del motor o puntuación Lighthouse.
La referencia es de otro sector y contiene interacciones y servicios distintos.

| Apartado Camp | Ecommerce | Adaptación |
| --- | --- | --- |
| Cabecera y hero con portfolio | Hero + galería de tiendas | Mensaje sobre venta y gestión; CTA al formulario |
| Ecosistema | Franja de herramientas | Pasarela, correo, exportaciones y contacto |
| Flujo en siete pasos | `#flujo` | Visita, catálogo, compra, pago, pedido, comunicación y crecimiento |
| Cinco momentos de plataforma | `#plataforma` | Tienda, compra, pedidos, envíos y comunicación |
| Integraciones | `#integraciones` | Capacidades y conexiones bajo alcance |
| Packs | `#precios` y `/precios` | Puesta en marcha + mantenimiento, sin descuento anual inventado |
| Portfolio | `#demos` y `/temas` | Identidades de ecommerce; registro completo conservado |
| Vistas del gestor | `#paneles` | Pedidos, productos y comunicaciones con capturas existentes |
| Implantación | Bloque con fotografía de preparación | Tres pasos y calendario según alcance |
| Guías | Bloque de recursos | Comercio, decisor, equipo técnico y agencias |
| FAQ | Acordeones nativos | Respuestas propias de ecommerce, sincronizadas con JSON-LD |
| Contacto y pie | Formulario + pie compartido | Agencia, producto, recursos y vías de contacto |

El catálogo conserva sus 33 temas. La portada muestra una selección de ocho en
el hero y seis en el portfolio para controlar carga y repetición. Todos siguen
accesibles desde `/temas`. La galería se puede pausar; en móvil y con reducción
de movimiento se muestra estática. Las pestañas admiten flechas, Inicio y Fin;
sin JS, los cinco apartados se leen seguidos.

## Cambios de UX/UI

- `Landing.astro` y `commercial.css` comparten el estilo de todas las páginas
  comerciales. Menú reducido a Tiendas, Gestor y Precios; documentación y
  agencias quedan disponibles en el pie y los bloques correspondientes.
- Precios visibles en home, página de packs y dossier desde una única fuente:
  `src/commercial/plans.ts`. No hay parsing de números del texto para el schema.
- Dossier y arquitectura: títulos y entradillas más cortos; eliminación de
  afirmaciones absolutas de rendimiento no verificadas en esta entrega.
- Agencias: acentos y superficies alineados con el resto de la web.
- Inlogem: hero editorial, búsqueda protagonista, accesos de categoría,
  tarjetas con texto más legible y compra rápida. Contenido de propuesta y
  contacto en un desplegable, fuera del recorrido principal de compra.
- Pie de Inlogem compartido con catálogo, producto, carrito, entrega y gracias.
  Conservados namespace de carrito, fixtures, privacidad e inercia de la demo.
- No se modifica el motor de precios, stock, pagos ni el catálogo importado.

## Investigación y packs

Referencias consultadas el 5 de septiembre de 2026:

- [The Digital Salad: diseño de tiendas online](https://www.thedigitalsalad.com/servicios/diseno-tiendas-online-madrid/): publica paquetes desde 1.790 € y 2.490 €.
  Su página contiene cifras de mantenimiento diferentes (60 € y 25 €) en
  apartados distintos; se usa como referencia de implantación, no como tarifa
  mensual inequívoca.
- [Galerna: mantenimiento web](https://galernaestudio.com/coste-mantenimiento-pagina-web/): referencia orientativa de mantenimiento ecommerce desde 149 €/mes.
- [Shopify España: precios](https://www.shopify.com/es-es/precios): referencia de
  plataforma autoservicio con cuotas y tarifas por transacción. No se equipara
  su suscripción con el precio de un proyecto que incluye diseño y servicio.

La siguiente es una decisión de posicionamiento para este encargo, no una
media estadística del mercado ni una copia de un competidor:

| Pack | Puesta en marcha desde | Mantenimiento desde | Alcance orientativo |
| --- | ---: | ---: | --- |
| Kit Lite | 790 € | Según propuesta | Hasta 10 productos, enlaces de pago, sin panel; bajo propuesta |
| Kit | 2.490 € | 79 €/mes | Tienda completa, compra, pedidos, envíos y mantenimiento técnico |
| A medida | 4.900 € | 149 €/mes | Dirección visual, procesos e integraciones bajo alcance |

Importes antes de IVA. Catálogo, contenidos, migraciones, mantenimiento y
conexiones se concretan en presupuesto. Pasarela, publicidad y terceros se
calculan aparte. Se evita afirmar que la cuota incluye marketing ilimitado o
que cambia automáticamente cuando aumenta el tráfico. Los importes ficticios
de productos Inlogem no se han cambiado ni se presentan como tarifas reales.

## Imágenes generadas

Herramienta: ImageGen integrada, sin CLI/API adicional. Originals conservados en
el directorio de generación de Codex; entregables copiados y convertidos a WebP
local mediante `cwebp`, sin hotlinking.

- `public/images/proposals/inlogem/workspace-editorial.webp` — 1536 × 1024,
  aproximadamente 92 KB. Prompt: fotografía editorial de oficina española
  luminosa, mesa de roble, cuadernos y carpeta azul cobalto, papelería, portátil
  y silla discretos, luz natural, tonos crema, sin personas, texto ni logos.
  Composición apaisada y productos al centro/derecha. Imagen de inspiración;
  no representa una referencia exacta del catálogo.
- `public/images/commercial/order-preparation.webp` — 1536 × 1024,
  aproximadamente 100 KB. Prompt: fotografía realista de preparación de pedido
  de un comercio independiente, cajas kraft, papel de seda, cerámica, tejido,
  impresora de etiquetas y manos empaquetando, mesa de roble, luz suave,
  acentos verde salvia, sin texto legible, marcas ni interfaz.

Las imágenes reales de producto y las capturas del software se conservan.
Todas las imágenes nuevas tienen dimensiones, texto alternativo y carga
prioritaria solo cuando corresponde al hero.

## Verificación

- `pnpm typecheck`: 826 archivos, cero errores, avisos o hints.
- `pnpm build`: compilación completa, guardia de cuenta y sitemap correctos.
- `pnpm audit:themes:check`: registro, evidencias y recursos correctos.
- `pnpm exec vitest run --maxWorkers=2`: 204 archivos y 1.056 pruebas correctas.
  Se limitó la concurrencia para evitar saturación del equipo.
- `BASE_URL=http://127.0.0.1:18837 pnpm test:e2e`: aislamiento de demos y panel
  verificado, incluido backup. Se usó una D1 temporal en
  `/tmp/logic-ecom-ux-qa` con las 44 migraciones existentes y seed público.
  La D1 local original carece de `customer_return_access_refs`; no se modificó.
- Auditoría HTTP de once rutas comerciales/propuesta: un H1 por página,
  JSON-LD parseable y ninguna referencia de imagen ausente. Incluye home,
  precios, temas, arquitectura, agencias, dossier, ayuda, confirmación de
  proyecto, página 404, portada y catálogo Inlogem.
- Navegador: referencia Camp; home e Inlogem en escritorio; home, pestañas,
  precios, agencias, arquitectura, dossier y temas a 375 px; gestor Inlogem a
  1440 px. Páginas inspeccionadas sin desbordamiento horizontal.
- Compra simulada en móvil: búsqueda «bic», añadir una unidad, carrito,
  cálculo de portes en CP 12001 (7,75 + 7,87 = 15,62 €), datos ficticios y
  confirmación sin cobro. Identidad de marca conservada.
- Formulario de consulta de pack: apertura y cierre del diálogo nativo.
- No se ha desplegado. No se afirma una nota Lighthouse ni equivalencia
  funcional total con Camp; la paridad documentada es de apartados y familia
  visual. La auditoría Lighthouse de producción queda para el despliegue.

## Cierre del consejo

- Arquitecto ✓: componentes compartidos y propuesta separada; sin dependencias nuevas.
- Fullstack ✓: tipos, compilación, suite completa y aislamiento E2E correctos.
- Product ✓: packs centralizados, alcance claro y precios autorizados por el encargo.
- Frontend ✓: navegación, pestañas, formularios y compra simulada comprobados.
- UX/UI ✓: jerarquía y familia visual unificadas; vistas móviles verificadas.
- SEO ⚠: metadatos, JSON-LD y privacidad comprobados; Lighthouse de producción pendiente en ROADMAP.

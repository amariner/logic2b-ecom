# Wiki SEO de funcionalidades

> Especificación editorial y técnica. La wiki pública hablará únicamente de
> Logic2B Ecommerce, del problema del comercio y de nuestra forma de resolverlo.
> No nombra, imita ni compara de forma repetitiva con la plataforma usada como
> benchmark interno.

## 1. Objetivo

Construir un centro de conocimiento que cumpla tres funciones simultáneas:

1. captar búsquedas concretas de propietarios, responsables ecommerce y agencias;
2. explicar cómo se resuelve técnicamente cada necesidad sin humo comercial;
3. demostrar si la capacidad está disponible, se integra o se desarrolla a
   medida, sin confundir roadmap con producto entregable.

La unidad editorial no es «un anuncio de producto»: es una intención de
búsqueda con una respuesta completa. Varias capacidades pequeñas se agrupan si
separarlas produciría páginas débiles o competirían por la misma consulta.

## 2. Arquitectura de información

```text
/funcionalidades/
  catalogo/
  inventario/
  precios-promociones/
  checkout-pagos/
  pedidos/
  envios-devoluciones/
  clientes/
  diseno-contenido-busqueda/
  mercados-internacional/
  b2b/
  venta-fisica/
  marketing/
  analitica/
  automatizaciones/
  integraciones/
  inteligencia-artificial/
  seguridad-rendimiento/
/integraciones/
  pagos/
  email-crm/
  transporte/
  facturacion-erp/
  marketplaces-feeds/
/guias-ecommerce/
  decisiones, comparativas conceptuales y tutoriales no ligados a una feature
```

`/funcionalidades/` responde «qué puede hacer». `/integraciones/` responde «con
qué sistemas se conecta». `/guias-ecommerce/` responde «cómo decidir o
implementar». No se crean tres URLs para la misma intención.

## 3. Estados públicos

| Etiqueta pública | Estado interno permitido | Copy permitido |
|---|---|---|
| **Incluido** | `actual` | «El módulo permite…», respaldado por evidencia real. |
| **Activable** | `actual` apagado por defecto | «Lo activamos cuando el proyecto lo necesita». |
| **Integrable** | `conector` con adaptador operativo | «Conectamos…» y se nombra claramente al tercero. |
| **A medida** | `gestionado` con proceso definido | «Lo diseñamos para…», nunca «ya incluye». |
| **En estudio** | `especificado`/`pendiente` | Solo en visión de plataforma, sin landing SEO individual ni CTA engañosa. |

`excluido` no genera página funcional. Puede explicarse en una guía de decisión
si ayuda al comprador a entender por qué se integra un especialista.

La ficha [`../CAPACIDADES_CLIENTE.md`](../CAPACIDADES_CLIENTE.md) es la vista
general para comercio y agencias; solo traduce los estados según
[`ESTADO_DOCUMENTAL.md`](ESTADO_DOCUMENTAL.md). Una página pública indexable
sigue requiriendo sus propias evidencias y revisión: aparecer en la ficha no la
convierte en URL publicable.

## 4. Modelo de contenido

Cada documento de la futura colección `src/content/funcionalidades/` deberá
validar este frontmatter conceptual antes de renderizarse:

```yaml
title: Gestión de devoluciones para ecommerce
description: Cómo autorizamos, recibimos, inspeccionamos y resolvemos una devolución.
capabilities: [FUL-010, FUL-011, FUL-013, FUL-014]
domain: envios-devoluciones
intent: gestion-devoluciones-ecommerce
audience: [comercio, responsable-ecommerce, agencia]
availability: activable
publishedAt: 2026-10-01
reviewedAt: 2026-10-01
reviewEveryDays: 180
owner: backend
evidence:
  - test: tests/returns.test.ts
  - route: /admin/devoluciones
related:
  - reembolsos-ecommerce
  - cambios-de-producto
draft: false
```

Reglas automáticas:

- `draft: true` no produce ruta ni entra en sitemap;
- `availability: incluido|activable` exige al menos una evidencia verificable;
- `integrable` exige adaptador, healthcheck y runbook;
- `a-medida` exige alcance, dependencias y CTA de análisis, no prueba ficticia;
- `reviewedAt + reviewEveryDays` alimenta una cola de contenido caducado;
- todos los IDs existen en la matriz y pertenecen a un dominio válido;
- una capacidad no puede publicarse en dos páginas con la misma intención.

## 5. Plantilla de una página de funcionalidad

1. **Title**: resultado + contexto, 45–60 caracteres orientativos.
2. **Meta description**: problema, solución y límite, sin superlativos vacíos.
3. **H1**: lenguaje natural; una sola promesa.
4. **Resumen de 40–70 palabras**: qué resuelve y para quién.
5. **Estado visible**: incluido, activable, integrable o a medida.
6. **El problema operativo**: escenario real, no definición de diccionario.
7. **Cómo funciona**: secuencia de datos/estados y responsables.
8. **Qué ve el comercio**: acciones mínimas del panel.
9. **Qué ocurre por detrás**: validación servidor, eventos, reintentos y auditoría.
10. **Casos y excepciones**: duplicados, parciales, fallos y límites.
11. **Configuración e integraciones**: qué aporta Logic2B y qué aporta un tercero.
12. **Cuándo conviene activarlo** y cuándo añade complejidad innecesaria.
13. **Privacidad, seguridad y rendimiento** aplicables.
14. **Preguntas frecuentes** reales y visibles.
15. **Módulos relacionados** con enlaces contextuales.
16. **CTA**: ver demo si existe; solicitar análisis si es a medida.
17. **Fecha y responsable de revisión**.

Una página no se publica si no puede aportar excepciones, límites y decisión de
uso. Ese es el control contra contenido programático superficial.

## 6. SEO técnico

- HTML server-rendered, JS cero por defecto y componentes interactivos solo si
  aclaran una decisión.
- Canonical absoluta y autorreferente; una URL por intención.
- `BreadcrumbList` en todas; `TechArticle` o `Article` cuando corresponda;
  `Service` solo en hubs comerciales que describan una oferta real.
- `FAQPage` únicamente si las preguntas y respuestas están visibles y aportan;
  no se espera que Google muestre rich result.
- Sitemap solo para páginas publicadas; `lastmod` procede de `reviewedAt`.
- Hubs enlazan a hijas; hijas enlazan al hub y a 2–5 capacidades relacionadas.
- Imágenes propias, diagramas ligeros y capturas reales; `width`/`height`, WebP/
  AVIF, alt útil y lazy bajo el primer viewport.
- Presupuesto por página: cero dependencia cliente nueva, LCP <1,2 s objetivo,
  CLS 0 y 100 en Lighthouse SEO/accesibilidad.
- No indexar filtros, parámetros, búsquedas internas, borradores ni demos.
- Cuando una URL cambie: 301 directa, canonical nueva, enlaces/sitemap
  actualizados y comprobación de cadenas.

## 7. Mapa editorial canónico

Las siguientes URLs cubren la matriz sin convertir cada microajuste en una
página débil. Los IDs entre paréntesis determinan el alcance y la evidencia.

### Plataforma, seguridad y rendimiento

- `/funcionalidades/arquitectura-modular-ecommerce/` (PLT-001–PLT-010)
- `/funcionalidades/modulos-ecommerce-activables/` (PLT-002–PLT-004)
- `/funcionalidades/api-webhooks-ecommerce/` (PLT-006–PLT-013)
- `/funcionalidades/integraciones-observables/` (PLT-008, INT-005–INT-008)
- `/funcionalidades/seguridad-rendimiento/` (SEC-001–SEC-016)
- `/funcionalidades/permisos-roles-backoffice/` (SEC-001, SEC-002, SEC-005)
- `/funcionalidades/auditoria-cambios-ecommerce/` (SEC-005, PLT-005–PLT-007)
- `/funcionalidades/copias-seguridad-recuperacion/` (INT-004, SEC-007, SEC-015)
- `/funcionalidades/ecommerce-alto-rendimiento/` (STO-001, ANA-012, SEC-013)
- `/guias-ecommerce/backend-minimo-ecommerce/` (tesis de producto)
- `/guias-ecommerce/monolito-modular-tienda-online/` (decisión técnica)
- `/guias-ecommerce/escalar-catalogo-un-millon-productos/` (CAT-017, R11.1)

### Catálogo, variantes y contenido de producto

- `/funcionalidades/catalogo-productos/` (hub CAT)
- `/funcionalidades/productos-variantes-opciones/` (CAT-003–CAT-005)
- `/funcionalidades/skus-ean-identificacion-productos/` (CAT-005)
- `/funcionalidades/categorias-taxonomia-atributos/` (CAT-006, CAT-007)
- `/funcionalidades/galeria-imagenes-video-producto/` (CAT-008, CAT-009)
- `/funcionalidades/estados-publicacion-productos/` (CAT-010, CAT-011)
- `/funcionalidades/edicion-masiva-productos/` (CAT-012)
- `/funcionalidades/importar-exportar-catalogo-csv/` (CAT-013, CAT-014)
- `/funcionalidades/productos-combinados/` (CAT-015)
- `/funcionalidades/productos-digitales-servicios/` (CAT-016)
- `/guias-ecommerce/organizar-catalogo-grande/` (CAT-006, CAT-017, STO-006–010)

### Inventario y ubicaciones

- `/funcionalidades/gestion-inventario-ecommerce/` (hub INV)
- `/funcionalidades/stock-por-variante/` (INV-001–INV-003)
- `/funcionalidades/reserva-stock-checkout/` (INV-004, R2.8)
- `/funcionalidades/inventario-multi-almacen/` (INV-005, INV-006)
- `/funcionalidades/transferencias-inventario/` (INV-007)
- `/funcionalidades/conteos-ajustes-stock/` (INV-008)
- `/funcionalidades/alertas-stock-reposicion/` (INV-009, INV-010)
- `/funcionalidades/enrutamiento-pedidos-inventario/` (INV-011, R3.9)
- `/integraciones/erp-wms-inventario/` (INV-012, INT-010)

### Precios, promociones y modelos de venta

- `/funcionalidades/precios-promociones/` (hub PRC)
- `/funcionalidades/codigos-descuento-ecommerce/` (PRC-003, PRC-004)
- `/funcionalidades/descuentos-automaticos/` (PRC-005)
- `/funcionalidades/descuentos-por-cantidad/` (PRC-006)
- `/funcionalidades/promociones-compra-x-lleva-y/` (PRC-007)
- `/funcionalidades/combinar-descuentos/` (PRC-008)
- `/funcionalidades/listas-precios-clientes-mercados/` (PRC-009)
- `/funcionalidades/tarjetas-regalo-credito-tienda/` (PRC-010, PRC-011)
- `/funcionalidades/bundles-packs-productos/` (PRC-012)
- `/funcionalidades/suscripciones-ecommerce/` (PRC-013)
- `/funcionalidades/preventa-productos/` (PRC-014)
- `/funcionalidades/precio-unitario/` (PRC-015)
- `/guias-ecommerce/motor-descuentos-sin-errores/` (PRC-003–PRC-008)

### Carrito, checkout, pagos y fraude

- `/funcionalidades/checkout-pagos/` (hub CHK)
- `/funcionalidades/carrito-persistente/` (CHK-001, CHK-002)
- `/funcionalidades/checkout-seguro-alojado/` (CHK-003, SEC-006)
- `/funcionalidades/validacion-precios-stock-servidor/` (CHK-002, CHK-012)
- `/funcionalidades/validacion-direcciones/` (CHK-005)
- `/funcionalidades/impuestos-checkout/` (CHK-006, MKT-009)
- `/funcionalidades/envio-recogida-entrega-checkout/` (CHK-007, FUL-008, FUL-009)
- `/funcionalidades/envios-divididos-checkout/` (CHK-008)
- `/funcionalidades/metodos-pago-locales/` (CHK-009, CHK-010)
- `/funcionalidades/pagos-parciales-depositos/` (CHK-011)
- `/funcionalidades/recuperar-carritos-abandonados/` (CHK-013, MAR-006)
- `/funcionalidades/prevencion-fraude-pagos/` (CHK-014)
- `/funcionalidades/gestion-disputas-chargebacks/` (CHK-015)
- `/integraciones/stripe-ecommerce/` (INT-001)

### Pedidos, preparación, envío y devoluciones

- `/funcionalidades/gestion-pedidos-ecommerce/` (hub ORD)
- `/funcionalidades/estados-timeline-pedido/` (ORD-001–ORD-004)
- `/funcionalidades/editar-pedidos/` (ORD-005)
- `/funcionalidades/cancelaciones-parciales/` (ORD-006)
- `/funcionalidades/reembolsos-ecommerce/` (ORD-007, R2.10, R2.13)
- `/funcionalidades/presupuestos-pedidos-preliminares/` (ORD-008)
- `/funcionalidades/bloquear-pedido-incidencia/` (ORD-010)
- `/funcionalidades/acciones-masivas-pedidos/` (ORD-011)
- `/funcionalidades/albaranes-facturas-documentos/` (ORD-012, INT-010)
- `/funcionalidades/envios-fulfillment/` (hub FUL)
- `/funcionalidades/preparacion-parcial-pedidos/` (FUL-004, FUL-005)
- `/funcionalidades/etiquetas-envio-ecommerce/` (FUL-006, FUL-007)
- `/funcionalidades/recogida-en-tienda/` (FUL-008)
- `/funcionalidades/entrega-local/` (FUL-009)
- `/funcionalidades/gestion-devoluciones-ecommerce/` (FUL-010, FUL-011, FUL-014)
- `/funcionalidades/cambios-producto/` (FUL-012)
- `/funcionalidades/reposicion-stock-devoluciones/` (FUL-013)
- `/funcionalidades/seguimiento-envios-multioperador/` (FUL-015)
- `/integraciones/packlink-sendcloud/` (INT-003)

### Clientes, privacidad y fidelización

- `/funcionalidades/clientes-cuentas/` (hub CUS)
- `/funcionalidades/compra-sin-registro/` (CUS-001)
- `/funcionalidades/perfil-unificado-cliente/` (CUS-002)
- `/funcionalidades/cuentas-clientes-sin-contrasena/` (CUS-003)
- `/funcionalidades/portal-pedidos-clientes/` (CUS-004–CUS-006)
- `/funcionalidades/consentimiento-marketing-privacidad/` (CUS-007, MAR-002)
- `/funcionalidades/exportar-borrar-datos-clientes/` (CUS-008)
- `/funcionalidades/segmentacion-clientes/` (CUS-009, MAR-008)
- `/funcionalidades/programa-fidelizacion/` (CUS-010, CUS-012)

### Diseño, contenido, búsqueda y conversión

- `/funcionalidades/diseno-tienda-contenido/` (hub STO)
- `/funcionalidades/temas-ecommerce-a-medida/` (STO-002, STO-004)
- `/funcionalidades/secciones-bloques-ecommerce/` (STO-003)
- `/funcionalidades/contenido-estructurado-ecommerce/` (STO-005, STO-011)
- `/funcionalidades/buscador-tienda-online/` (STO-006)
- `/funcionalidades/filtros-facetas-productos/` (STO-007)
- `/funcionalidades/ordenar-productos/` (STO-008)
- `/funcionalidades/productos-recomendados/` (STO-009)
- `/funcionalidades/merchandising-colecciones/` (STO-010)
- `/funcionalidades/resenas-productos/` (STO-012)
- `/funcionalidades/lista-deseos/` (STO-013)
- `/funcionalidades/busqueda-semantica-imagen/` (STO-014)
- `/funcionalidades/pruebas-ab-temas-checkout/` (STO-015, ANA-010)

### Mercados y venta internacional

- `/funcionalidades/ecommerce-internacional-mercados/` (hub MKT)
- `/funcionalidades/catalogo-por-pais-mercado/` (MKT-003–MKT-005)
- `/funcionalidades/tienda-multiidioma/` (MKT-006, MKT-007)
- `/funcionalidades/ecommerce-multidivisa/` (MKT-008)
- `/funcionalidades/iva-impuestos-ecommerce/` (MKT-009, MKT-010)
- `/funcionalidades/aranceles-ddp/` (MKT-011)
- `/funcionalidades/ecommerce-multientidad/` (MKT-012)
- `/funcionalidades/restricciones-producto-por-pais/` (MKT-013)

### B2B

- `/funcionalidades/ecommerce-b2b/` (hub B2B)
- `/funcionalidades/empresas-sedes-compradores-b2b/` (B2B-001, B2B-009)
- `/funcionalidades/catalogos-precios-b2b/` (B2B-002)
- `/funcionalidades/cantidades-minimas-multiplos-b2b/` (B2B-005)
- `/funcionalidades/condiciones-pago-b2b/` (B2B-003)
- `/funcionalidades/aprobaciones-limites-compra-b2b/` (B2B-004)
- `/funcionalidades/presupuestos-pedidos-b2b/` (B2B-006)
- `/funcionalidades/pedidos-orden-compra-po/` (B2B-007)
- `/funcionalidades/pedido-rapido-repetir-pedido/` (B2B-008)
- `/integraciones/facturacion-erp-b2b/` (B2B-010)

### Marketing, analítica y automatización

- `/funcionalidades/marketing-ecommerce/` (hub MAR)
- `/funcionalidades/formularios-captacion-leads/` (MAR-001, MAR-002)
- `/funcionalidades/emails-transaccionales/` (MAR-003)
- `/integraciones/email-marketing-crm/` (MAR-004, INT-011)
- `/integraciones/whatsapp-sms-ecommerce/` (MAR-005)
- `/funcionalidades/automatizaciones-marketing-ecommerce/` (MAR-006, AUT-004–AUT-008)
- `/funcionalidades/campanas-utm-atribucion/` (MAR-007, ANA-008)
- `/integraciones/feed-google-merchant-meta/` (MAR-009, INT-009)
- `/integraciones/marketplaces-ecommerce/` (MAR-010)
- `/funcionalidades/afiliados-creadores/` (MAR-011)
- `/funcionalidades/analitica-ecommerce/` (hub ANA)
- `/funcionalidades/embudo-conversion-ecommerce/` (ANA-002, ANA-003)
- `/funcionalidades/informes-ventas-productos/` (ANA-004, ANA-009)
- `/funcionalidades/metricas-operacion-pedidos/` (ANA-005, ANA-006)
- `/funcionalidades/cohortes-recompra-clientes/` (ANA-007)
- `/funcionalidades/tests-ab-ecommerce/` (ANA-010)
- `/funcionalidades/automatizacion-flujos-ecommerce/` (hub AUT)
- `/funcionalidades/webhooks-reintentos-ecommerce/` (AUT-003, AUT-009)
- `/funcionalidades/aprobacion-humana-automatizaciones/` (AUT-010, AUT-011)

### Venta física, integraciones e IA

- `/funcionalidades/venta-fisica-omnicanal/` (POS-001–POS-004)
- `/integraciones/punto-venta-pos/` (POS-001–POS-008)
- `/funcionalidades/inventario-online-tienda-fisica/` (POS-001–POS-003)
- `/funcionalidades/enlaces-pago-venta-asistida/` (POS-004)
- `/funcionalidades/inteligencia-artificial-ecommerce/` (hub AIA)
- `/funcionalidades/ia-para-fichas-producto/` (AIA-001, AIA-002)
- `/funcionalidades/consultar-datos-ecommerce-ia/` (AIA-003)
- `/funcionalidades/copiloto-gestion-ecommerce/` (AIA-004, AIA-005)
- `/funcionalidades/catalogo-preparado-agentes-ia/` (AIA-006, AIA-007)
- `/funcionalidades/comercio-agentico-checkout/` (AIA-008)
- `/guias-ecommerce/seguridad-ia-operaciones-ecommerce/` (AIA-009, AIA-010)

## 8. Oleadas de publicación

| Ola editorial | Condición | Contenido |
|---|---|---|
| W0 | Ahora | Índice interno, plantilla y borradores; nada indexable nuevo. |
| W1 | R1 cerrado | Arquitectura modular, backend mínimo, seguridad, rendimiento e integraciones observables. |
| W2 | R2–R3 cerrado | Catálogo/variantes, inventario, pedidos, reembolsos, fulfillment y devoluciones. |
| W3 | R4–R6 cerrado | Promociones, modelos de venta, clientes, mercados y B2B. |
| W4 | R7–R9 cerrado | Marketing, analítica, automatización, contenido, búsqueda, POS e integraciones. |
| W5 | R10 cerrado | IA y agentes, solo tras red-team y evidencia de operación segura. |

Cada ola empieza con investigación de keywords y SERP **en el momento de
publicar**, porque intención, competencia y resultados cambian. El mapa anterior
es arquitectura, no volumen estimado.

## 9. Control editorial y medición

Antes de publicar:

- consulta objetivo y variantes semánticas comprobadas;
- SERP revisada para distinguir guía, categoría, integración o servicio;
- contenido original con evidencia y limitaciones;
- revisión backend/product/SEO;
- enlaces internos y canonical;
- schema validado, Lighthouse y a11y;
- captura/diagrama propio si añade comprensión;
- CTA coherente con el estado.

Después de publicar:

- inspección e indexación en Search Console/Bing;
- impresiones, consultas, CTR y posición por intención;
- clic a demo/contacto y leads cualificados, sin atribuir causalidad falsa;
- canibalización y páginas huérfanas;
- revisión al cambiar la capacidad o al vencer `reviewEveryDays`;
- consolidar o retirar contenido que no aporta, con 301 si corresponde.

La métrica principal no es el número de páginas: es **leads cualificados y
confianza generada sin contradicción entre documentación y producto**.

# Investigación de ediciones 2022–2026

> Documento interno de benchmark. Puede nombrar las fuentes para conservar la
> trazabilidad. **No se publica ni se reutiliza literalmente en la wiki**; el
> contenido público usa lenguaje propio, explica la solución Logic2B y no nombra
> a la plataforma analizada.

## 1. Alcance y método

Revisión realizada el **2026-08-06** sobre las nueve URLs aportadas por Andreu.
Se inspeccionó el HTML completo en español, incluidos productos destacados,
listas secundarias y bloques para desarrolladores. El script reproducible
[`scripts/catalog-editions.mjs`](../../scripts/catalog-editions.mjs) obtiene los
anclajes, títulos, secciones y descripciones sin modificar las fuentes.

El catálogo extraído contiene **aproximadamente 1.300 entradas de lanzamiento**.
No debe leerse como 1.300 funcionalidades independientes:

- una misma capacidad reaparece mejorada en varias ediciones;
- hay anuncios regionales, cambios de límites y mejoras de interfaz;
- se mezclan producto, APIs, aplicaciones, hardware, financiación y servicios;
- algunas piezas pertenecen a partners o están limitadas por plan/país;
- un archivo de lanzamientos describe evolución, no una especificación estable.

Por eso la investigación se normaliza por **resultado de negocio** y no por el
nombre comercial de cada anuncio.

| Edición | Entradas detectadas | Señal dominante |
|---|---:|---|
| Verano 2022 | 36 | Nacen los grandes pilares: B2B, mercados, extensibilidad y headless. |
| Invierno 2023 | 128 | Esos pilares se convierten en flujos operativos completos. |
| Verano 2023 | 138 | IA asistiva, aplicaciones propias y extensiones más profundas. |
| Invierno 2024 | 171 | Catálogo complejo, checkout extensible y fundamentos de plataforma. |
| Verano 2024 | ~65 tarjetas principales | Unificación de mercados, operaciones, analítica y venta física. |
| Invierno 2025 | 187 | Madurez: mejoras pequeñas pero numerosas en cada dominio. |
| Verano 2025 | 153 | Nuevo sistema de temas, IA operativa y plataforma de desarrollo. |
| Invierno 2026 | 200 | Comercio agéntico, experimentación y herramientas de operación avanzadas. |
| Primavera 2026 | 218 | Agentes como canal, automatización de campañas y comercio multientidad. |

Las cifras son una medida del archivo analizado, no una promesa de cobertura.

## 2. Lectura por edición

### Verano 2022 — se define el mapa

La edición reúne por primera vez casi todos los dominios que después se
profundizan: audiencias y creadores, B2B, punto de venta, mercados y monedas,
checkout extensible, descuentos combinables, preventa, storefront headless,
contenido estructurado, búsqueda, analítica, logística, automatización y
funciones de servidor.

**Lección para Logic2B:** separar desde el principio el núcleo transaccional de
los canales, las reglas y la presentación. Los metacampos/metaobjetos anticipan
un modelo extensible; las funciones anticipan reglas de negocio conectables; el
headless anticipa múltiples escaparates sobre el mismo contrato.

### Invierno 2023 — de pilares a operaciones

El checkout pasa a una página y admite edición, validaciones y aplicaciones.
Aparecen paquetes, suscripciones, localización, catálogo por mercado,
enrutamiento, aranceles, condiciones de pago B2B, borradores, facturas, cuentas
de cliente, autoservicio de devoluciones, permisos granulares, automatizaciones,
webhooks, informes y APIs de devolución.

**Lección:** la dificultad real no está en renderizar opciones, sino en las
transiciones y excepciones: pedido preliminar → pago → preparación parcial →
devolución → reembolso → reposición. El roadmap debe reforzar primero el
ledger operativo y los eventos antes de añadir más pantallas.

### Verano 2023 — IA y extensibilidad cotidiana

La IA entra en descripciones, blogs, email, soporte, chat y administración. Se
amplían las extensiones del checkout y del panel, se lanzan aplicaciones de
suscripciones y paquetes, conectores de marketplaces, cuentas de cliente y
mejoras de catálogos grandes. La plataforma de aplicaciones gana despliegue y
versionado unificados.

**Lección:** la IA útil se apoya en acciones y datos estructurados; no sustituye
el dominio. Antes de un copiloto hacen falta permisos, herramientas idempotentes,
vista previa y registro de cada acción. Los conectores necesitan versiones y
contratos, no código ad hoc dentro de un endpoint.

### Invierno 2024 — modelo de producto y escala

Destacan taxonomía, atributos ricos, publicaciones combinadas, muchas variantes,
edición masiva, muestras, archivos centralizados y contenido estructurado. En
paralelo crecen checkout, cuentas, suscripciones, mercados, B2B, fulfillment,
devoluciones, descuentos y herramientas de desarrollador.

**Lección:** el producto plano actual de Logic2B es insuficiente como base de
larga duración. La siguiente generación necesita `product` + `variant` +
`option` + `media` + `taxonomy` + `attribute`, pero la migración debe preservar
la simplicidad para catálogos sin variantes.

### Verano 2024 — una operación, muchos contextos

Los mercados se administran desde un grafo unificado; el checkout divide
envíos; la analítica se reconstruye; los temas ganan configuraciones; la IA
ayuda con contenido; tienda física, mayorista e internacional comparten catálogo
y operación. Se refuerzan devoluciones, inventario, reglas, descuentos y datos
de cliente.

**Lección:** mercado, canal, ubicación y entidad legal son **contextos** sobre
un mismo catálogo, no copias del catálogo. Deben convertirse en dimensiones de
resolución de precio, publicación, impuesto, inventario y entrega.

### Invierno 2025 — la edición de la madurez

La mayor parte del valor está en cientos de mejoras acumulativas: cuentas,
devoluciones, borradores, edición de pedidos, suscripciones, paquetes, POS,
checkout, marketing, B2B, mercados, logística, analítica, permisos y APIs.

**Lección:** una plataforma excelente no termina al lanzar un módulo. Necesita
presupuestos de fiabilidad, accesibilidad, bulk actions, filtros, importación,
exportación, diagnósticos y reducción constante de pasos. El roadmap reserva una
línea permanente de madurez, no solo fases de funciones nuevas.

### Verano 2025 — diseño componible y plataforma preparada para IA

Un nuevo sistema de temas basado en bloques convive con Sidekick, tienda física,
checkout, privacidad, mercados, B2B, envíos, operaciones y una plataforma de
desarrollo renovada. Aparecen componentes web de storefront, catálogo global y
servidores MCP.

**Lección:** los diez temas actuales demuestran variedad visual, pero la base
debe evolucionar hacia secciones tipadas y componibles. El acceso de agentes
requiere un catálogo semántico y APIs de herramientas; no debe concederse acceso
directo a D1 ni a acciones sin confirmación.

### Invierno 2026 — experimentación y comercio agéntico

Los agentes aparecen como escaparates; llegan pruebas y rollouts, simulación,
edición móvil, más variantes, bundles, POS con continuidad de conexión,
mensajería, inventario, finanzas y herramientas MCP/API para desarrolladores.

**Lección:** la configuración desplegada necesita versionado, preview, rollout y
rollback. El canal agéntico debe ser otro adaptador de catálogo y checkout. La
operación offline de punto de venta queda como integración especializada, no
como prioridad del núcleo web.

### Primavera 2026 — los agentes se convierten en canal completo

Se publican datos estructurados para agentes, búsqueda por imagen/producto,
protocolo de comercio, productos patrocinados y pagos en más superficies. La IA
se extiende a ventas, tests, automatizaciones y campañas. También crecen cuentas,
identidad, WhatsApp/SMS, POS offline, multientidad, pagos locales, multidivisa,
fraude, disputas y operaciones de desarrollador.

**Lección:** la visibilidad futura depende de una fuente de producto limpia,
políticas explícitas, disponibilidad fiable y herramientas transaccionales
seguras. El SEO clásico, los feeds y la preparación para agentes comparten la
misma base semántica.

## 3. Los 18 dominios normalizados

Las nueve ediciones convergen en estos dominios. Son el vocabulario canónico de
la matriz y la wiki:

1. Plataforma, configuración y extensiones.
2. Catálogo, variantes, taxonomía y contenido estructurado.
3. Inventario, ubicaciones y aprovisionamiento.
4. Precios, promociones, regalos y modelos de venta.
5. Carrito, checkout, pagos, fraude y disputas.
6. Pedidos, edición, estados y atención posventa.
7. Preparación, envío, entrega, devoluciones y cambios.
8. Clientes, cuentas, identidad, privacidad y crédito.
9. Diseño de tienda, contenido, búsqueda y recomendación.
10. Mercados, idiomas, monedas, impuestos y aranceles.
11. B2B, empresas, catálogos, condiciones y presupuestos.
12. Venta física y omnicanalidad.
13. Marketing, CRM, campañas, audiencias y afiliación.
14. Analítica, atribución, informes y experimentación.
15. Automatización, eventos y flujos de trabajo.
16. Integraciones, importación/exportación y ecosistema.
17. IA asistiva, búsqueda semántica y canales agénticos.
18. Seguridad, observabilidad, rendimiento y operación de plataforma.

## 4. Patrones que se repiten

### 4.1 El modelo de datos vence a la cantidad de pantallas

Las capacidades más duraderas nacen de primitivas reutilizables: variantes,
metadatos tipados, ubicaciones, contextos de mercado, empresas, eventos y
políticas. Una pantalla sin esas primitivas solo crea deuda.

### 4.2 Todo termina siendo contextual

Precio, publicación, disponibilidad, impuesto, descuento, contenido, entrega y
pago cambian según canal, mercado, cliente, empresa, ubicación o fecha. Logic2B
necesita un resolvedor de contexto único, no condicionales independientes.

### 4.3 La extensibilidad segura es producto

Webhooks, funciones, extensiones, componentes y APIs aparecen en casi todas las
ediciones. La alternativa Logic2B será un registro explícito de módulos,
adaptadores con contratos y eventos versionados, siempre con aislamiento y
observabilidad.

### 4.4 La operación real vive en excepciones

Envíos divididos, fulfillment parcial, pedido editable, pago pendiente,
devolución parcial, cambio, reembolso a origen o saldo, stock dañado, fraude y
disputa. Estas excepciones tienen más prioridad que nuevas herramientas de
captación porque protegen dinero y servicio.

### 4.5 IA y SEO convergen en producto estructurado

Feeds, schema, taxonomía, atributos, disponibilidad, políticas y contenido
canónico sirven a buscadores, marketplaces, campañas y agentes. Crear una única
fuente semántica evita cuatro integraciones divergentes.

## 5. Qué no se debe copiar

| Área observada | Decisión Logic2B |
|---|---|
| Cuenta bancaria, crédito y financiación propios | `excluido`; integrar proveedores regulados si un proyecto lo requiere. |
| Red publicitaria, marketplace o red de afiliación propia | `excluido`; conectar canales existentes y medir atribución. |
| Hardware POS propio | `excluido`; adaptadores para proveedores compatibles. |
| Red logística o seguros propios | `excluido`; motor de tarifas/etiquetas/tracking con conectores. |
| App store pública y economía de partners | `excluido`; catálogo interno de adaptadores auditados. |
| Constructor visual universal para cualquier negocio | `gestionado`; secciones y presets tipados por proyecto. |
| Multiinquilino central con todos los clientes | `excluido`; despliegue y datos aislados por cliente. |
| Panel con todos los ajustes visibles | `excluido`; navegación generada por capacidades activas. |

## 6. Consecuencias arquitectónicas

- **Monolito modular** por despliegue: más simple de operar que microservicios,
  con fronteras de dominio y dependencias unidireccionales.
- **Manifest de capacidades**: habilita módulos, rutas, permisos, jobs y enlaces
  de panel de forma declarativa.
- **Modelo transaccional reforzado**: dinero en céntimos, snapshots de pedido,
  ledger de pagos/reembolsos, reservas y movimientos de inventario.
- **Outbox de eventos**: un commit de negocio y sus eventos; entrega posterior
  con reintentos e idempotencia.
- **Adaptadores** para pagos, email, transporte, impuestos, ERP, CRM, feeds y
  agentes, sin filtrar SDKs externos al dominio.
- **Acciones auditables**: actor, motivo, antes/después, idempotency key y
  correlation id para administración, automatizaciones e IA.
- **Proyecciones de lectura**: búsquedas, paneles e informes no deben deformar
  el modelo de escritura.
- **Versionado de configuración**: borrador, preview, publicación, rollback.
- **Aislamiento por cliente**: despliegue, secretos, base y observabilidad
  independientes; repositorio y módulos compartidos.

## 7. Fuentes primarias

- [Verano 2022](https://www.shopify.com/es-es/editions/summer2022)
- [Invierno 2023](https://www.shopify.com/es-es/editions/winter2023)
- [Verano 2023](https://www.shopify.com/es-es/editions/summer2023)
- [Invierno 2024](https://www.shopify.com/es-es/editions/winter2024)
- [Verano 2024](https://www.shopify.com/es-es/editions/summer2024)
- [Invierno 2025](https://www.shopify.com/es-es/editions/winter2025)
- [Verano 2025](https://www.shopify.com/es-es/editions/summer2025)
- [Invierno 2026](https://www.shopify.com/es-es/editions/winter2026)
- [Primavera 2026](https://www.shopify.com/es-es/editions/spring2026)

Las fuentes sirven para descubrir problemas y patrones. Ningún nombre, texto,
diseño, ilustración o taxonomía propietaria se copia a la documentación pública.

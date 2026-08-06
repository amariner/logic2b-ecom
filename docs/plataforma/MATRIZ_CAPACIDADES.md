# Matriz canónica de capacidades

> Inventario vivo. Fecha base: **2026-08-06**. Una fila expresa un resultado
> comprobable, no una pantalla ni un argumento comercial.

## Cómo leerla

- **P0** protege dinero, datos y arquitectura; bloquea el resto.
- **P1** completa una operación ecommerce profesional.
- **P2** habilita crecimiento o un segmento concreto.
- **P3** es especialización, escala avanzada o ventaja futura.
- **Vía** indica `núcleo`, `módulo`, `conector`, `gestionado` o `excluido`.
- **Estado** usa el vocabulario definido en [`README.md`](README.md).

La prioridad no autoriza activación automática. Cada cliente recibe solo lo que
su alcance requiera.

## PLT — Plataforma y extensibilidad

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| PLT-001 | Despliegue aislado por cliente | núcleo | P0 | parcial | Código compartido; base, secretos, dominio y observabilidad aislados. |
| PLT-002 | Manifest de capacidades | núcleo | P0 | parcial | Fuente tipada que gobierna rutas, navegación y composición de módulos; faltan publicación/importación de configuración. |
| PLT-003 | Registro de módulos y dependencias | núcleo | P0 | parcial | Registro ejecutable con propietario de capacidades, dependencias, permisos, superficies y, desde R1.5, emisores/suscriptores de eventos; jobs y healthchecks se completan en R1.11/R1.10. |
| PLT-004 | Configuración validada por entorno | núcleo | P0 | parcial | Esquema tipado, valores por cliente y fallo temprano ante combinaciones inválidas. |
| PLT-005 | Migraciones reproducibles y reversibles | núcleo | P0 | parcial | Forward migration probada, backup y procedimiento de rollback/restore. |
| PLT-006 | Eventos de dominio versionados | núcleo | P0 | parcial | Sobre ejecutable con nombre, versión, actor, entidad, correlación, causación e idempotencia estables; los cinco hechos de pedido lo emiten. Falta persistirlos y entregarlos (R1.6/R1.7). |
| PLT-007 | Outbox transaccional | núcleo | P0 | pendiente | R1.6 deja ADR, SQL y contratos probados en estado propuesto; sigue pendiente hasta aprobar y ejecutar la migración/dispatcher de R1.7. |
| PLT-008 | Adaptadores sustituibles | núcleo | P0 | especificado | Pagos, email, transporte, impuestos y feeds detrás de interfaces. |
| PLT-009 | Configuración con borrador y publicación | módulo | P1 | pendiente | Preview, diff, publicación atómica y rollback. |
| PLT-010 | Importación/exportación de configuración | núcleo | P1 | pendiente | Reproducir un proyecto sin copiar secretos ni datos personales. |
| PLT-011 | API administrativa versionada | módulo | P2 | pendiente | Contratos estables, scopes, rate limit e idempotencia. |
| PLT-012 | Webhooks salientes firmados | módulo | P2 | pendiente | Suscripciones, reintentos, dead-letter y replay controlado. |
| PLT-013 | Funciones/reglas conectables | módulo | P2 | pendiente | Puntos de extensión tipados sin ejecutar código arbitrario del cliente. |
| PLT-014 | App store pública | excluido | P3 | excluido | Se sustituye por catálogo interno de conectores auditados. |

## CAT — Catálogo y producto

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| CAT-001 | Producto básico | núcleo | P0 | actual | Nombre, slug, descripción, precio, stock, imagen, categoría y actividad. |
| CAT-002 | Colecciones/catálogos separados | núcleo | P0 | actual | Catálogos visuales aislados sobre contratos compartidos. |
| CAT-003 | Producto y variante separados | núcleo | P0 | pendiente | El producto describe; la variante tiene SKU, precio, stock y disponibilidad. |
| CAT-004 | Opciones y valores | núcleo | P0 | pendiente | Talla/color/material con combinaciones válidas y orden estable. |
| CAT-005 | SKU, GTIN/EAN, MPN y marca | núcleo | P1 | pendiente | Identificación interoperable para almacén, feeds y B2B. |
| CAT-006 | Taxonomía y categoría normalizada | módulo | P1 | pendiente | Categoría interna + mapeos externos versionados. |
| CAT-007 | Atributos tipados por categoría | módulo | P1 | parcial | Texto, número, unidad, booleano, referencia y lista validados. |
| CAT-008 | Galería multimedia | núcleo | P1 | parcial | Varias imágenes/vídeo, alt, foco, orden y asociación a variante. |
| CAT-009 | Archivos y media reutilizables | módulo | P2 | pendiente | Biblioteca con metadatos, derivados, uso y eliminación segura. |
| CAT-010 | Estado borrador/activo/archivado/no listado | núcleo | P1 | parcial | Publicación explícita sin borrar historial. |
| CAT-011 | Publicación programada | módulo | P2 | pendiente | Ventanas temporales con timezone y rollback. |
| CAT-012 | Edición masiva | módulo | P1 | pendiente | Selección, preview, validación y resultado por fila. |
| CAT-013 | Importación CSV robusta | módulo | P1 | pendiente | Dry-run, errores por fila, idempotencia y mapeo de campos. |
| CAT-014 | Exportación completa | módulo | P1 | parcial | Productos, variantes, atributos, media y relaciones. |
| CAT-015 | Productos combinados | módulo | P3 | pendiente | Agrupar productos relacionados sin perder URLs/variantes independientes. |
| CAT-016 | Productos digitales y servicios | módulo | P3 | pendiente | Tipo sin envío, entrega segura y reglas fiscales propias. |
| CAT-017 | Catálogo de hasta gran escala | núcleo | P2 | parcial | Paginación por cursor, índices, búsqueda externa opcional y pruebas de carga. |

## INV — Inventario y ubicaciones

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| INV-001 | Stock simple por producto | núcleo | P0 | actual | Descuento en pago confirmado y restitución al cancelar pagado. |
| INV-002 | Stock por variante | núcleo | P0 | pendiente | Toda unidad vendible mantiene su disponibilidad propia. |
| INV-003 | Movimientos de inventario | núcleo | P0 | pendiente | Ledger append-only con tipo, cantidad, origen, actor y referencia. |
| INV-004 | Reservas de stock | módulo | P1 | pendiente | Reserva con expiración y liberación idempotente. |
| INV-005 | Múltiples ubicaciones | módulo | P1 | pendiente | Existencias y disponibilidad separadas por almacén/tienda. |
| INV-006 | Disponible, comprometido, entrante y dañado | módulo | P1 | pendiente | Estados contables distintos, no una única cifra editable. |
| INV-007 | Transferencias entre ubicaciones | módulo | P2 | pendiente | Borrador, enviado, parcial, recibido y discrepancias. |
| INV-008 | Conteo y ajuste con motivo | módulo | P2 | pendiente | Conteos cíclicos, aprobación opcional y auditoría. |
| INV-009 | Alertas de stock y reposición | módulo | P2 | pendiente | Umbral por variante/ubicación y notificación agrupada. |
| INV-010 | Órdenes de compra/proveedores | módulo | P3 | pendiente | Pedido a proveedor, recepción parcial y coste. |
| INV-011 | Enrutamiento por disponibilidad | módulo | P2 | pendiente | Selección determinista de ubicación con reglas explicables. |
| INV-012 | Sincronización ERP/WMS | conector | P2 | conector | Fuente de verdad definida, cursores, reconciliación y replay. |

## PRC — Precios y modelos comerciales

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| PRC-001 | Precio base en céntimos | núcleo | P0 | actual | Nunca floats ni precio aceptado desde cliente. |
| PRC-002 | Precio anterior informativo | núcleo | P1 | actual | Solo presentación; no participa en el cobro. |
| PRC-003 | Motor de descuentos | módulo | P1 | pendiente | Reglas puras, prioridad, compatibilidad y desglose auditable. |
| PRC-004 | Código promocional | módulo | P1 | pendiente | Vigencia, límites, cliente/segmento, productos y usos. |
| PRC-005 | Descuento automático | módulo | P1 | pendiente | Se aplica por contexto sin código y explica el motivo. |
| PRC-006 | Descuento por cantidad | módulo | P2 | pendiente | Tramos con unidades/importe y resolución B2C/B2B. |
| PRC-007 | Compra X y consigue Y | módulo | P2 | pendiente | Selección determinista y devolución proporcional. |
| PRC-008 | Combinación de descuentos | módulo | P2 | pendiente | Matriz explícita; nunca doble aplicación accidental. |
| PRC-009 | Lista de precios contextual | módulo | P2 | pendiente | Mercado, canal, empresa, ubicación o contrato. |
| PRC-010 | Tarjetas regalo | módulo | P2 | pendiente | Ledger, saldo, caducidad legal, emisión y reembolso. |
| PRC-011 | Crédito en tienda | módulo | P2 | pendiente | Ledger por cliente y aplicación parcial al pago. |
| PRC-012 | Paquetes/bundles | módulo | P2 | pendiente | Fijo o componible, precio y stock de componentes. |
| PRC-013 | Suscripciones | conector | P2 | conector | Contrato, calendario, cambios, impagos y portal. |
| PRC-014 | Preventa/backorder | módulo | P2 | pendiente | Fecha/promesa, asignación de stock y comunicación. |
| PRC-015 | Precio unitario | módulo | P2 | pendiente | Cantidad base y unidad para cumplimiento normativo. |
| PRC-016 | Precio dinámico asistido | gestionado | P3 | gestionado | Recomendación con aprobación; nunca cambio autónomo opaco. |

## CHK — Carrito, checkout y pagos

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| CHK-001 | Carrito persistente invitado | núcleo | P0 | actual | Namespaced, cantidades limitadas y revalidación en servidor. |
| CHK-002 | Cotización autoritativa | núcleo | P0 | actual | Precio, stock, envío y total salen del servidor. |
| CHK-003 | Checkout alojado seguro | conector | P0 | actual | Datos de tarjeta fuera del servidor Logic2B. |
| CHK-004 | Webhook de pago idempotente | núcleo | P0 | actual | Una transición, un descuento de stock, un email. |
| CHK-005 | Dirección normalizada y validada | módulo | P1 | parcial | Esquema por país, sugerencias opcionales y validación no bloqueante. |
| CHK-006 | Impuestos y desglose | núcleo | P1 | pendiente | Base, tipo, jurisdicción, redondeo y snapshot por línea. |
| CHK-007 | Múltiples métodos de entrega | módulo | P1 | parcial | Envío, recogida y entrega local según contexto. |
| CHK-008 | Envío dividido | módulo | P2 | pendiente | Grupos de fulfillment con precio y promesa propios. |
| CHK-009 | Múltiples pasarelas | módulo | P2 | pendiente | Payment intent interno y adaptadores sin bifurcar pedido. |
| CHK-010 | Métodos locales y multidivisa | conector | P2 | conector | Disponibilidad por mercado y conciliación en moneda de liquidación. |
| CHK-011 | Pago parcial/depósito | módulo | P2 | pendiente | Saldo pendiente, vencimientos y ledger. |
| CHK-012 | Validaciones extensibles | módulo | P2 | pendiente | Políticas puras de carrito/checkout con mensajes seguros. |
| CHK-013 | Recuperación de checkout abandonado | módulo | P2 | pendiente | Consentimiento, enlace seguro, expiración y atribución. |
| CHK-014 | Riesgo y fraude | conector | P2 | conector | Señales del PSP, revisión, decisión y auditoría. |
| CHK-015 | Disputas/chargebacks | conector | P3 | conector | Ingesta de evento, evidencias, plazo y estado. |
| CHK-016 | Pago agéntico | conector | P3 | pendiente | Sesión limitada, consentimiento y confirmación verificable. |

## ORD — Pedidos y posventa

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| ORD-001 | Pedido con snapshots | núcleo | P0 | actual | Nombre y precio quedan congelados en la compra. |
| ORD-002 | Máquina de estados validada | núcleo | P0 | actual | Transiciones permitidas, evento y concurrencia protegida. |
| ORD-003 | Búsqueda, filtros y paginación | núcleo | P1 | parcial | Cursor, búsqueda segura y vistas guardadas opcionales. |
| ORD-004 | Notas, etiquetas y timeline | módulo | P1 | parcial | Actividad unificada con actor y visibilidad interna/cliente. |
| ORD-005 | Edición de pedido | módulo | P1 | pendiente | Añadir/quitar/cambiar cantidad con ajuste de dinero y stock. |
| ORD-006 | Cancelación parcial | módulo | P1 | pendiente | Por línea/cantidad, motivo, stock y reembolso coherentes. |
| ORD-007 | Reembolso total/parcial | módulo | P1 | pendiente | Ledger, PSP idempotente, impuesto y estado separados. |
| ORD-008 | Pedido preliminar/presupuesto | módulo | P2 | pendiente | Borrador, caducidad, aprobación, factura y enlace de pago. |
| ORD-009 | Captura manual o diferida | módulo | P2 | pendiente | Autorización, captura parcial y expiración. |
| ORD-010 | Riesgo/incidencia/bloqueo | módulo | P2 | pendiente | Hold explícito que impide preparación hasta resolución. |
| ORD-011 | Acciones masivas seguras | módulo | P2 | pendiente | Preview, selección estable, resultado por pedido y replay. |
| ORD-012 | Impresión y documentos | módulo | P2 | pendiente | Albarán, factura, nota y plantilla versionada. |
| ORD-013 | Archivo y retención | núcleo | P2 | pendiente | Política, exportación, anonimización y obligación fiscal. |

## FUL — Preparación, envío y devoluciones

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| FUL-001 | Tarifas planas por zona | núcleo | P0 | actual | Cálculo servidor y umbral gratuito. |
| FUL-002 | Tracking y aviso de envío | núcleo | P0 | actual | Transportista/número y email transaccional. |
| FUL-003 | Exportación logística CSV | conector | P1 | actual | Puente manual a operadores compatibles. |
| FUL-004 | Preparación parcial | módulo | P1 | pendiente | Fulfillment por cantidades con estados independientes. |
| FUL-005 | Múltiples envíos por pedido | módulo | P1 | pendiente | Tracking y promesa por grupo. |
| FUL-006 | Compra de etiquetas | conector | P2 | conector | Cotizar, comprar, anular, imprimir y registrar coste. |
| FUL-007 | Reglas de embalaje | módulo | P2 | pendiente | Peso/dimensiones, embalaje por variante y bultos. |
| FUL-008 | Recogida en tienda | módulo | P2 | pendiente | Disponibilidad, preparación, listo y recogido. |
| FUL-009 | Entrega local | conector | P2 | conector | Ventanas, radio, capacidad y tracking. |
| FUL-010 | Portal de devolución | módulo | P1 | pendiente | Elegibilidad, motivo, resolución y autenticación segura. |
| FUL-011 | RMA y recepción | módulo | P1 | pendiente | Autorizada, en tránsito, recibida, inspeccionada y cerrada. |
| FUL-012 | Cambio de producto | módulo | P2 | pendiente | Devolución + nueva reserva + diferencia de cobro. |
| FUL-013 | Reposición condicionada | núcleo | P1 | parcial | Vuelve a disponible solo tras la decisión operativa correcta. |
| FUL-014 | Reglas de devolución | módulo | P2 | pendiente | Ventana, categoría, estado, coste y excepciones. |
| FUL-015 | Seguimiento multioperador | conector | P2 | conector | Normalización de estados y excepciones. |

## CUS — Clientes, identidad y privacidad

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| CUS-001 | Compra como invitado | núcleo | P0 | actual | Email/dirección por pedido sin cuenta obligatoria. |
| CUS-002 | Perfil de cliente deduplicado | módulo | P1 | pendiente | Identidades, direcciones, pedidos y consentimientos relacionados. |
| CUS-003 | Cuentas sin contraseña | módulo | P2 | pendiente | Magic link/passkey, sesiones, revocación y protección anti-enumeración. |
| CUS-004 | Historial y seguimiento de pedidos | módulo | P2 | pendiente | Acceso autenticado o tokenizado sin exponer PII. |
| CUS-005 | Autoservicio de devolución | módulo | P2 | pendiente | Conecta cuenta/pedido con FUL-010. |
| CUS-006 | Direcciones guardadas | módulo | P2 | pendiente | Normalización, predeterminada y control del cliente. |
| CUS-007 | Consentimientos por canal/finalidad | núcleo | P1 | pendiente | Fuente, texto/version, timestamp, región y retirada. |
| CUS-008 | Exportación y borrado de datos | núcleo | P1 | pendiente | Solicitud verificable, excepciones legales y auditoría. |
| CUS-009 | Segmentos calculados | módulo | P2 | pendiente | Reglas versionadas y recálculo; no etiquetas manuales opacas. |
| CUS-010 | Saldo/crédito | módulo | P2 | pendiente | Se apoya en PRC-011 y ledger. |
| CUS-011 | SSO/proveedor de identidad | conector | P3 | conector | OIDC/SAML por proyecto con mapeo explícito. |
| CUS-012 | Fidelización | conector | P3 | conector | Eventos, saldo, recompensas y reversión de devoluciones. |

## STO — Tienda, contenido, búsqueda y descubrimiento

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| STO-001 | Storefront rápido y accesible | núcleo | P0 | actual | SSR/estático, SEO técnico y presupuestos de rendimiento. |
| STO-002 | Temas visualmente distintos | gestionado | P1 | actual | Diez demostraciones sobre contratos compartidos. |
| STO-003 | Secciones/bloques tipados | módulo | P1 | pendiente | Composición segura sin constructor universal. |
| STO-004 | Presets de página | gestionado | P1 | parcial | Home, colección, producto y campañas por diseño. |
| STO-005 | Contenido estructurado reutilizable | módulo | P1 | parcial | Metaobjetos propios con validación y referencias. |
| STO-006 | Búsqueda textual | núcleo | P1 | parcial | Relevancia, typo tolerance opcional y analítica de cero resultados. |
| STO-007 | Filtros/facetas | módulo | P1 | parcial | Derivados de atributos reales, combinables y SEO-safe. |
| STO-008 | Ordenación configurable | núcleo | P1 | actual | Precio/nombre y criterios adicionales estables. |
| STO-009 | Recomendaciones relacionadas | módulo | P2 | pendiente | Reglas explicables con fallback editorial. |
| STO-010 | Merchandising de colección | módulo | P2 | pendiente | Fijar, impulsar, ocultar y programar. |
| STO-011 | Blog/guías/casos | módulo | P2 | pendiente | Contenido editorial indexable y enlazado a catálogo. |
| STO-012 | Reseñas | conector | P2 | conector | Moderación, verificación, schema y portabilidad. |
| STO-013 | Wishlist | módulo | P3 | pendiente | Invitado/cuenta, privacidad y alertas opcionales. |
| STO-014 | Búsqueda semántica/imagen | conector | P3 | pendiente | Índice derivado, permisos y métricas de calidad. |
| STO-015 | Preview/rollout/A-B de temas | módulo | P2 | pendiente | Versión, audiencia, métrica, significancia y rollback. |

## MKT — Mercados, fiscalidad e internacionalización

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| MKT-001 | Moneda base | núcleo | P0 | actual | EUR centralizado. |
| MKT-002 | Zonas postales españolas | núcleo | P0 | actual | Resolución servidor por prefijo. |
| MKT-003 | Modelo de mercado | módulo | P1 | pendiente | País/región, idioma, moneda, dominio y políticas. |
| MKT-004 | Publicación por mercado | módulo | P2 | pendiente | Producto/variante visible según contexto. |
| MKT-005 | Catálogo/precio por mercado | módulo | P2 | pendiente | Integra PRC-009 con fallback explícito. |
| MKT-006 | Traducciones | gestionado | P2 | pendiente | Campos traducibles, estado editorial y fallback. |
| MKT-007 | URLs internacionales y hreflang | módulo | P2 | pendiente | Dominio/subruta, canonical y sitemap coherentes. |
| MKT-008 | Multidivisa | conector | P2 | conector | Conversión, redondeo, presentación y liquidación. |
| MKT-009 | IVA/impuestos UE | conector | P1 | pendiente | Determinación, evidencia, snapshot y reporting. |
| MKT-010 | Validación VAT ID | conector | P2 | conector | Caché, fallo tolerante y evidencia. |
| MKT-011 | Aranceles/DDP | conector | P3 | conector | Clasificación, cálculo, cobro y documentos. |
| MKT-012 | Entidades legales múltiples | módulo | P3 | pendiente | Vendedor de registro, numeración, impuestos y liquidación. |
| MKT-013 | Restricciones de producto | módulo | P2 | pendiente | País, edad, mercancía peligrosa y cumplimiento. |

## B2B — Comercio entre empresas

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| B2B-001 | Empresas y sedes | módulo | P2 | pendiente | Entidad, ubicaciones, contactos, roles y VAT ID. |
| B2B-002 | Catálogo por empresa | módulo | P2 | pendiente | Productos y precios autorizados por contrato. |
| B2B-003 | Condiciones de pago | módulo | P2 | pendiente | Inmediato, neto N, vencimiento y estado de cobro. |
| B2B-004 | Límites y aprobación | módulo | P2 | pendiente | Crédito, importe, comprador y flujo de aprobación. |
| B2B-005 | Reglas de cantidad | módulo | P2 | pendiente | Mínimo, máximo, múltiplo y caja. |
| B2B-006 | Presupuesto a pedido | módulo | P2 | pendiente | Conecta ORD-008 con aprobación y enlace de pago. |
| B2B-007 | Pedido por PO | módulo | P2 | pendiente | Nº de compra, documento y conciliación. |
| B2B-008 | Repetir pedido/lista rápida | módulo | P2 | pendiente | Entrada por SKU, CSV y cantidades previas. |
| B2B-009 | Delegación y permisos comprador | módulo | P3 | pendiente | Roles por sede y límites. |
| B2B-010 | Factura electrónica/ERP | conector | P2 | conector | Adaptador por sistema y país. |
| B2B-011 | Venta mayorista sin cuenta | gestionado | P2 | gestionado | Flujo de solicitud/presupuesto para proyectos simples. |

## POS — Venta física y omnicanal

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| POS-001 | Catálogo compartido con tienda física | conector | P3 | pendiente | Mapeo SKU y fuente de verdad definida. |
| POS-002 | Inventario sincronizado | conector | P3 | conector | Eventos, reconciliación y modo degradado. |
| POS-003 | Recogida/devolución cruzada | módulo | P3 | pendiente | Política y ledger comunes entre canales. |
| POS-004 | Venta asistida/enlace de pago | módulo | P3 | pendiente | Carrito creado por equipo y pago seguro del cliente. |
| POS-005 | Hardware POS propio | excluido | P3 | excluido | Se integra un proveedor certificado. |
| POS-006 | Operación offline propia | excluido | P3 | excluido | Responsabilidad del proveedor POS elegido. |
| POS-007 | Tap to Pay | conector | P3 | conector | SDK/proveedor certificado, fuera del storefront. |
| POS-008 | Efectivo/caja/turnos | conector | P3 | conector | Dominio especializado, no panel base. |

## MAR — Marketing y CRM

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| MAR-001 | Captura de lead/contacto | núcleo | P1 | actual | Validación, rate limit y almacenamiento. |
| MAR-002 | Captura de suscripción con consentimiento | módulo | P1 | pendiente | Double opt-in configurable y CUS-007. |
| MAR-003 | Email transaccional | conector | P0 | actual | Outbox y proveedor real por cliente. |
| MAR-004 | Email marketing | conector | P2 | conector | Audiencias, supresión, plantillas y métricas. |
| MAR-005 | SMS/WhatsApp marketing | conector | P2 | conector | Consentimiento por canal, plantillas y baja. |
| MAR-006 | Automatizaciones de ciclo de vida | módulo | P2 | pendiente | Bienvenida, abandono, poscompra y reactivación. |
| MAR-007 | Campañas y UTM | módulo | P2 | pendiente | Definición, enlaces, costes y resultados multicanal. |
| MAR-008 | Segmentación de clientes | módulo | P2 | pendiente | Se apoya en CUS-009 y eventos. |
| MAR-009 | Feed Merchant/Meta | conector | P1 | especificado | Catálogo validado, incremental y diagnóstico de rechazos. |
| MAR-010 | Marketplaces | conector | P2 | conector | Listings, stock, pedidos, devoluciones y reconciliación. |
| MAR-011 | Afiliados/creadores | conector | P3 | conector | Atribución, códigos, comisiones y devoluciones. |
| MAR-012 | Red publicitaria propia | excluido | P3 | excluido | Integrar canales existentes. |

## ANA — Analítica y experimentación

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| ANA-001 | Analítica web básica sin cookies | conector | P1 | parcial | Beacon opcional y métricas de infraestructura. |
| ANA-002 | Eventos de comercio propios | núcleo | P1 | pendiente | Contrato versionado para vista, carrito, checkout, compra y devolución. |
| ANA-003 | Embudo y conversión | módulo | P1 | pendiente | Métricas derivadas sin duplicar definiciones. |
| ANA-004 | Ventas, AOV y productos | módulo | P1 | pendiente | Ingresos netos/brutos con devoluciones y zona horaria. |
| ANA-005 | Operación de pedidos | módulo | P1 | pendiente | Tiempo a preparar, enviar, entregar, cancelar y devolver. |
| ANA-006 | Inventario | módulo | P2 | pendiente | Rotación, cobertura, roturas y stock inmóvil. |
| ANA-007 | Cohortes y repetición | módulo | P2 | pendiente | Identidad y consentimiento adecuados. |
| ANA-008 | Atribución de campañas | módulo | P2 | pendiente | Modelo declarado, UTMs y costes importados. |
| ANA-009 | Informes personalizables | módulo | P2 | pendiente | Dimensiones/métricas permitidas y exportación. |
| ANA-010 | Tests A/B y rollouts | módulo | P2 | pendiente | Hipótesis, asignación estable, guardrails y decisión. |
| ANA-011 | Exportación a BI | conector | P3 | conector | Datos incrementales, esquema versionado y PII minimizada. |
| ANA-012 | Monitor de rendimiento web | núcleo | P1 | parcial | Lighthouse reproducible y RUM opcional por cliente. |

## AUT — Automatización y eventos

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| AUT-001 | Timeline de eventos de pedido | núcleo | P0 | actual | Registro de transiciones principales. |
| AUT-002 | Bandeja/outbox de email | núcleo | P0 | actual | Generación desacoplada y visible en demo. |
| AUT-003 | Dispatcher con reintentos | núcleo | P0 | pendiente | Backoff, dead-letter, dedupe y replay. |
| AUT-004 | Triggers de dominio | módulo | P1 | pendiente | Evento + filtros + versión. |
| AUT-005 | Acciones tipadas | módulo | P1 | pendiente | Email, webhook, tag, hold, export o llamada a adaptador. |
| AUT-006 | Programación temporal | módulo | P2 | pendiente | Timezone, ejecución única/recurrente y catch-up. |
| AUT-007 | Constructor visual de flujos | excluido | P3 | excluido | Recetas configuradas por Logic2B, no lienzo universal. |
| AUT-008 | Recetas versionadas | gestionado | P2 | pendiente | Plantillas revisables, testables y reversibles. |
| AUT-009 | HTTP saliente seguro | módulo | P2 | pendiente | Allowlist, firma, timeout, límites y secretos. |
| AUT-010 | Aprobación humana | módulo | P2 | pendiente | Pausa, responsable, caducidad y resolución. |
| AUT-011 | Simulación/dry-run | módulo | P2 | pendiente | Datos de ejemplo sin efectos laterales. |

## INT — Integraciones y portabilidad

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| INT-001 | Pago Stripe | conector | P0 | actual | Checkout, webhook y estados. |
| INT-002 | Email Resend | conector | P1 | parcial | En demo se captura; cliente real usa adaptador. |
| INT-003 | Packlink/Sendcloud por CSV | conector | P1 | actual | Exportación manual portable. |
| INT-004 | Backup SQL | núcleo | P0 | actual | Exportación restaurable autenticada. |
| INT-005 | Panel de integraciones | módulo | P1 | pendiente | Estado, última sync, errores, replay y desconexión. |
| INT-006 | Credenciales/secretos por adaptador | núcleo | P0 | parcial | Nunca en D1/logs; rotación documentada. |
| INT-007 | Healthcheck por integración | núcleo | P1 | pendiente | Configuración, permisos, latencia y última operación. |
| INT-008 | Idempotencia y cursores | núcleo | P0 | pendiente | Contrato común para push/pull y reconciliación. |
| INT-009 | Google Merchant/Meta | conector | P1 | especificado | Un feed canónico con diagnósticos por destino. |
| INT-010 | ERP/facturación | conector | P2 | conector | Adaptador por proveedor con mapeo y replay. |
| INT-011 | CRM/email marketing | conector | P2 | conector | Consentimientos y eventos normalizados. |
| INT-012 | Transportistas | conector | P2 | conector | Tarifas, etiquetas, tracking y devoluciones. |
| INT-013 | Importadores de plataformas | gestionado | P2 | pendiente | Dry-run, transformación, reconciliación e informe. |
| INT-014 | Portabilidad total | núcleo | P1 | parcial | Catálogo, clientes, pedidos, contenido, media y configuración exportables. |

## AIA — IA y comercio agéntico

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| AIA-001 | Asistencia para redactar producto | conector | P3 | pendiente | Borrador, fuentes, revisión y publicación humana. |
| AIA-002 | Edición/generación de imágenes | conector | P3 | pendiente | Proveniencia, derechos, alt y aprobación. |
| AIA-003 | Consultas de negocio en lenguaje natural | conector | P3 | pendiente | Solo métricas autorizadas, definición visible y trazabilidad. |
| AIA-004 | Copiloto administrativo | módulo | P3 | pendiente | Herramientas limitadas por permisos con preview/confirmación. |
| AIA-005 | Recomendación de automatizaciones | módulo | P3 | pendiente | Propone recetas; no activa sin aprobación. |
| AIA-006 | Catálogo preparado para agentes | núcleo | P2 | pendiente | Datos estructurados, políticas, disponibilidad y URLs canónicas. |
| AIA-007 | API de búsqueda de producto para agentes | módulo | P3 | pendiente | Scope, rate limit, ranking y observabilidad. |
| AIA-008 | Herramientas de carrito/checkout | módulo | P3 | pendiente | Sesión delimitada, idempotencia y confirmación del comprador. |
| AIA-009 | Servidor MCP administrativo | excluido | P3 | pendiente | Solo se evaluará tras permisos, audit log y action gateway. |
| AIA-010 | Agente autónomo con escritura irrestricta | excluido | P3 | excluido | Contradice seguridad y control humano. |

## SEC — Seguridad, fiabilidad y operación

| ID | Capacidad | Vía | Prioridad | Estado | Resultado objetivo |
|---|---|---|---|---|---|
| SEC-001 | Auth de admin | núcleo | P0 | actual | Cookie firmada en demo; Access en cliente real. |
| SEC-002 | Autorización por rol/scopes | núcleo | P0 | pendiente | Denegar por defecto y permisos por capacidad. |
| SEC-003 | Rate limiting | núcleo | P0 | actual | APIs públicas sensibles limitadas. |
| SEC-004 | Validación de entrada | núcleo | P0 | actual | Zod y respuestas seguras. |
| SEC-005 | Audit log completo | núcleo | P0 | parcial | Actor, acción, entidad, diff, IP/contexto y correlation id. |
| SEC-006 | Protección PII y minimización | núcleo | P0 | parcial | Acceso, retención, redacción de logs y exportación controlada. |
| SEC-007 | Política de backups y restore drill | núcleo | P0 | parcial | RPO/RTO por cliente y restauración ensayada. |
| SEC-008 | Observabilidad estructurada | núcleo | P0 | pendiente | Logs, métricas, trazas y alertas con correlation id. |
| SEC-009 | SLO y alertas | núcleo | P1 | pendiente | Checkout, webhooks, emails, syncs y storefront. |
| SEC-010 | Escaneo de dependencias/secretos | núcleo | P1 | pendiente | CI y proceso de respuesta. |
| SEC-011 | CSP y cabeceras de seguridad | núcleo | P1 | parcial | Política por superficies e integraciones. |
| SEC-012 | Accesibilidad WCAG 2.2 AA | núcleo | P0 | actual | Auditor propio y barrido global. |
| SEC-013 | Presupuestos de rendimiento | núcleo | P1 | parcial | Lighthouse, tamaño de JS/imágenes y regresión CI. |
| SEC-014 | Pruebas de carga y concurrencia | núcleo | P1 | parcial | Compra, inventario, webhooks, bulk e importación. |
| SEC-015 | Runbook de incidentes | núcleo | P1 | pendiente | Detección, contención, comunicación, recuperación y postmortem. |
| SEC-016 | Privacidad y cumplimiento | gestionado | P1 | parcial | Configuración técnica + validación legal por cliente/mercado. |

## Resumen del gap actual

El MVP es fuerte en el camino feliz de `producto simple → carrito → cotización →
pago → pedido → envío`, y ya posee guardarraíles valiosos de dinero,
idempotencia, stock, seguridad y accesibilidad. Sus mayores huecos estructurales
son, en este orden:

1. manifest/registro de módulos, eventos versionados y outbox;
2. producto-variante y ledger de inventario;
3. ledger de pagos, reembolsos y fulfillment parcial;
4. clientes/consentimientos y contexto de mercado;
5. contratos de adaptadores y observabilidad;
6. proyecciones para búsqueda, analítica y automatización;
7. B2B, omnicanal e IA construidos sobre esas primitivas.

Construir marketing, IA o un panel de integraciones antes de cerrar los cuatro
primeros puntos produciría una demo amplia sobre una base transaccional estrecha.

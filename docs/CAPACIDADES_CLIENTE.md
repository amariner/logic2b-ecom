# Capacidades y evolución de tu tienda

> Documento para comercios y agencias. Explica qué trae el motor, qué puede
> activarse en un proyecto y cómo pedimos desarrollos nuevos. No sustituye al
> alcance, presupuesto ni calendario acordados para una tienda concreta.

## Cómo leer este documento

No todas las tiendas necesitan las mismas piezas. Logic2B parte de un núcleo
ligero y añade solo lo que ayuda a vender, operar o cumplir una necesidad real.
Por eso usamos cuatro etiquetas sencillas:

| Etiqueta | Qué significa para tu proyecto |
|---|---|
| **Incluido** | Ya forma parte del motor y se entrega cuando encaja en el alcance de tu tienda. |
| **Activable por proyecto** | Está construido y probado, pero se enciende solo después de validar configuración, datos, operación y despliegue para tu caso. |
| **Integrable** | Se conecta con una herramienta especialista; acordamos antes quién presta el servicio, costes, datos y responsable de operación. |
| **A medida** | Se analiza y diseña para tu negocio. No se vende como una función ya incluida. |

Una capacidad puede estar **en ruta** sin estar disponible todavía. En ese caso
no la prometemos en una fecha ni la activamos por defecto: la evaluamos cuando
el proyecto la necesite.

## Qué significa «verlo en la demo»

La demo está diseñada para que una persona responsable de ecommerce pueda ver
el flujo, las pantallas y el valor de una capacidad antes de contratarla. Los
datos y los resultados que aparecen son una representación segura:

- los botones pueden enseñar qué ocurriría, pero no cobran, envían, publican ni
  modifican sistemas reales;
- los emails se muestran como capturas o fixtures, no se entregan a direcciones
  externas;
- pagos, proveedores, automatizaciones y trabajos programados permanecen
  desconectados o sin efectos;
- el estado demostrativo es local o sembrado y puede restaurarse sin afectar a
  un comercio, cliente o infraestructura externa.

Por tanto, **visible en la demo** no significa **activo en producción para un
cliente**. La activación real solo ocurre en un despliegue aislado, con su
alcance, datos, cuentas, permisos, migraciones y controles aprobados.

## Lo que ya resuelve el núcleo

La base de una tienda Logic2B cubre el recorrido normal de venta y operación:

- catálogo, precio, stock y publicación de productos;
- carrito y comprobación de precio, stock y envío en servidor;
- checkout de pago alojado por Stripe, sin que la tarjeta pase por la tienda;
- pedido, cobro confirmado, descuento de stock, email transaccional y
  seguimiento de envío;
- panel deliberadamente simple para pedidos, productos, envíos, CSV y copias de
  seguridad;
- una tienda visualmente propia sobre un mismo motor, con dominio, datos y
  secretos aislados por cliente.

El [manual de operación](CLIENTE.md) explica el trabajo diario del comercio:
recibir un pedido, preparar el envío y comunicar el seguimiento.

## Capacidades que pueden activarse según el proyecto

El motor contiene módulos preparados para casos que no conviene imponer a todo
comercio. Antes de activarlos revisamos el objetivo, los datos que necesitan,
quién los operará y cómo se verifican en tu despliegue.

| Área | Ejemplos | Decisión habitual |
|---|---|---|
| Catálogo e inventario | variantes, galería enriquecida, reservas de stock, varios almacenes, transferencias y conteos | Cuando el catálogo o la logística ya no caben en una hoja simple. |
| Precios y venta | códigos, descuentos automáticos, ofertas por cantidad, bundles, tarjetas regalo, preventa o listas de precios | Cuando hay una regla comercial concreta y una persona responsable de mantenerla. |
| Pedidos y posventa | preparación parcial, incidencias, acciones masivas, devoluciones y documentos operativos | Cuando el volumen o el proceso de almacén exige trazabilidad adicional. |
| Clientes y privacidad | perfil unificado, consentimientos y solicitudes sobre datos | Cuando el caso de uso y la política de privacidad están definidos. |

Que algo sea activable no significa que esté encendido con efectos en la demo
ni que deba entrar en todas las tiendas. Puede existir una representación
visual inerte. La activación se confirma por proyecto, después de pasar sus
controles técnicos y operativos.

### Un ejemplo importante: cuentas de cliente

El acceso de clientes sin contraseña se ha desarrollado con controles de
seguridad, entrega de email y auditoría. Sin embargo, en la demo pública sigue
desactivado y no se presenta como una función disponible: necesita un despliegue
aislado, migración, proveedor de email y preflight propio. Es exactamente el
tipo de capacidad que solo se ofrece al proyecto cuando todos esos pasos están
resueltos.

## Integraciones y servicios especializados

Cuando un tercero hace mejor una parte del trabajo, la tienda se conecta con
ese especialista en lugar de imitarlo dentro del panel. Hoy la base contempla:

- **pagos** con Stripe;
- **email transaccional** con Resend en una tienda real;
- **operación logística** mediante CSV o conexión acordada con transporte,
  ERP/WMS o facturación;
- **suscripciones, mercados, métodos de pago locales o conectores externos**
  cuando exista el adaptador y el proceso de operación correspondiente.

Antes de integrar, dejamos claro qué cuenta es del cliente, qué datos se
intercambian, qué coste tiene el tercero, cómo se monitoriza y cómo se puede
desconectar o sustituir.

## Lo que podemos desarrollar bajo demanda

Una necesidad nueva empieza por el resultado de negocio, no por una lista de
plugins. Podemos valorar, por ejemplo:

- un flujo de venta B2B, presupuestos o aprobación de compras;
- una integración con tu ERP, transportista, CRM, facturación o marketplace;
- reglas de catálogo, precio o logística específicas de tu sector;
- contenido, búsqueda, automatizaciones, analítica o una experiencia visual
  propia;
- servicios gestionados que conviene operar con revisión humana en vez de dejar
  como una opción permanente del panel.

El análisis responde cuatro cosas antes de comprometer trabajo: qué problema
resuelve, si encaja en el núcleo/módulo/conector/servicio, qué datos y terceros
afecta y qué pruebas, operación y mantenimiento requerirá. Si el resultado es
útil para más proyectos, puede incorporarse al motor como módulo; si es
específico, se conserva como desarrollo de tu proyecto.

## Qué está en ruta

La evolución del motor continúa por bloques verificables. Las próximas líneas
de trabajo incluyen autoservicio seguro de clientes y permisos, B2B,
automatización, contenido/búsqueda, integraciones y capacidades de escala. La
prioridad de cada una depende de que la base previa esté cerrada y de la demanda
real; no constituye una promesa de fecha ni de alcance para una tienda.

Para una conversación de proyecto, basta con contarnos el resultado que buscas
en lugar de intentar encajarlo en una etiqueta técnica. Lo revisamos contigo y
te devolvemos una propuesta clara: incluido, activable, integrable, a medida o
fuera de alcance.

## Dónde se mantiene el estado

Este documento es la vista legible para cliente. El inventario técnico con el
estado verificable de cada capacidad vive internamente en
[`plataforma/MATRIZ_CAPACIDADES.md`](plataforma/MATRIZ_CAPACIDADES.md), y el
orden de trabajo en [`plataforma/ROADMAP.md`](plataforma/ROADMAP.md). Ninguno de
los dos convierte por sí solo una capacidad en parte del alcance contratado.

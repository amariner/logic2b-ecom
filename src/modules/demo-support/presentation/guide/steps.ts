import type { GuideStore } from './state';

export interface GuideStep {
  id: string;
  label: string;
  title: string;
  description: string;
  task: string;
  href: string;
  target: string;
}

export function guideSteps(store: GuideStore): GuideStep[] {
  return [
    { id: 'catalog', label: 'Tienda', title: `Así compra tu cliente en ${store.name}`,
      description: 'Te acompaño de la tienda al trabajo diario del comercio. Cada diseño cambia la presentación y conserva el mismo recorrido de compra.',
      task: 'Explora las categorías y abre un producto. Puedes navegar por tu cuenta: la guía te sigue.',
      href: store.catalog, target: '[data-guide-surface]' },
    { id: 'product', label: 'Producto', title: 'Todo lo necesario para decidir',
      description: 'La ficha reúne fotografías, descripción, precio y opciones del producto. El cliente puede añadirlo al carrito sin crear una cuenta.',
      task: 'Pulsa «Añadir y ver carrito»: prepararé una unidad de ejemplo para continuar. Solo cambia la cesta de este navegador.',
      href: store.product, target: '[data-commerce-action="add-to-cart"]' },
    { id: 'cart', label: 'Carrito', title: 'Una cesta fácil de revisar',
      description: 'Aquí se revisan cantidades, se eliminan productos y se calculan los portes antes de continuar. Los importes de esta demo salen de su catálogo ficticio.',
      task: 'El recorrido prepara un producto de ejemplo y el código postal 12001. Puedes revisar la cesta o continuar a la compra.',
      href: store.cart, target: '[data-commerce-part="shipping"]' },
    { id: 'checkout', label: 'Compra', title: 'Prueba la compra sin pagar',
      description: 'El cliente introduce los datos de entrega y ve el total. En una tienda real, el pago se realiza en una pasarela externa; aquí solo se simula.',
      task: 'Pulsa «Simular compra de ejemplo»: completaré los campos vacíos con datos ficticios. También puedes ir directamente al gestor.',
      href: store.checkout, target: '[data-checkout-form]' },
    { id: 'thanks', label: 'Confirmación', title: 'Una compra de ejemplo, completada',
      description: 'Esta confirmación solo existe en este navegador. No ha creado un pedido, descontado stock ni enviado un email. Ahora veremos la operación del comercio con otros datos ficticios.',
      task: 'Continúa al gestor de solo lectura. Entrarás directamente, sin introducir contraseña ni datos personales.',
      href: store.thanks, target: '[data-commerce-surface="thanks"]' },
    { id: 'orders', label: 'Pedidos', title: 'Ahora miramos desde el comercio',
      description: 'El panel organiza pedidos por estado y permite buscar o filtrar lo que necesita atención. Aquí ves pedidos ficticios independientes de tu compra simulada.',
      task: 'Abre un pedido de ejemplo para ver sus líneas, dirección y seguimiento. El panel es de solo lectura.',
      href: '/demo/admin', target: '[data-guide-surface]' },
    { id: 'order', label: 'Detalle', title: 'Un pedido, toda su información',
      description: 'El detalle reúne productos, importes, dirección y evolución del pedido. En una tienda real, el comercio prepara el envío y registra el seguimiento desde aquí.',
      task: 'Revisa el historial y los datos de entrega. Las acciones operativas permanecen desactivadas en esta demo.',
      href: '/demo/admin', target: '[data-guide-surface]' },
    { id: 'shipping', label: 'Envíos', title: 'Del pedido al paquete',
      description: 'Las tarifas se organizan por zonas. En una tienda real, el comercio exporta los pedidos para preparar etiquetas en su operador y añade el seguimiento.',
      task: 'Mira las tarifas y el flujo de preparación. Esta demo no genera etiquetas ni envíos reales.',
      href: '/demo/admin/envios', target: '[data-guide-surface]' },
    { id: 'emails', label: 'Emails', title: 'El cliente sabe qué está pasando',
      description: 'Esta bandeja enseña ejemplos de confirmaciones de pedido y avisos de envío. Puedes abrirlos para comprobar qué recibe el cliente en cada momento.',
      task: 'Despliega un mensaje. Son ejemplos visibles en el panel: no se envía ningún correo.',
      href: '/demo/admin/emails', target: 'details' },
    { id: 'products', label: 'Catálogo', title: 'El catálogo bajo tu control',
      description: 'El comercio gestiona productos, precios, existencias y visibilidad desde el panel. La demo enseña estos campos con los cambios desactivados.',
      task: 'Prueba los filtros. Ya has visto la compra y las tareas del comercio; puedes terminar o reiniciar el recorrido.',
      href: '/demo/admin/productos', target: '[data-guide-surface]' },
  ];
}

export function guideStepIndex(pathname: string, store: GuideStore): number {
  const path = pathname.replace(/\/+$/, '');
  if (path === store.catalog) return 0;
  if (path === store.cart) return 2;
  if (path === store.checkout) return 3;
  if (path === store.thanks) return 4;
  if (path.startsWith(`${store.catalog}/`)) return 1;
  if (path.startsWith('/demo/admin/pedidos/')) return 6;
  if (path === '/demo/admin/envios') return 7;
  if (path === '/demo/admin/emails') return 8;
  if (path.startsWith('/demo/admin/productos')) return 9;
  return 5;
}

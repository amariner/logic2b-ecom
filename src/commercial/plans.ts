/** Oferta comercial revisada por encargo de Andreu, 5 de septiembre de 2026.
 * Importes orientativos antes de IVA; el alcance se fija en la propuesta. */
export const plans = [
  { id: 'lite', name: 'Kit Lite', audience: 'Para validar una idea', setup: 790, monthly: 0, description: 'Un escaparate pequeño para empezar a recibir interés.', points: ['Hasta 10 productos y tu identidad visual', 'Catálogo y enlaces de pago', 'Sin panel de gestión'], featured: false },
  { id: 'kit', name: 'Kit', audience: 'Para empezar a vender', setup: 2490, monthly: 79, description: 'Tu tienda y la gestión diaria, en un mismo proyecto.', points: ['Diseño adaptado a tu marca y catálogo', 'Carrito, pagos, pedidos y envíos', 'Panel sencillo y mantenimiento técnico'], featured: true },
  { id: 'custom', name: 'A medida', audience: 'Para una operación propia', setup: 4900, monthly: 149, description: 'Una experiencia y unos procesos definidos para tu negocio.', points: ['Dirección de diseño y recorridos propios', 'Funciones e integraciones según alcance', 'Mantenimiento adaptado a la operación'], featured: false },
] as const;
export const euro = (amount: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(amount);
export const planOffers = plans.map((plan) => ({ '@type': 'Offer', name: plan.name, price: String(plan.setup), priceCurrency: 'EUR', description: `Puesta en marcha desde ${plan.setup} € antes de IVA. ${plan.monthly ? `Mantenimiento desde ${plan.monthly} €/mes antes de IVA.` : 'Sin panel; mantenimiento opcional según alcance.'}` }));

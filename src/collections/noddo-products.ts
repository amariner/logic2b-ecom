export type NoddoProduct = {
  slug: string;
  name: string;
  price: string;
  category: string;
  description: string;
  image: string;
  specs: readonly [string, string][];
};

const root = '/images/collections/noddo/generated';
export const noddoProducts: readonly NoddoProduct[] = [
  { slug:'power-node', name:'Power Node', price:'129,00 €', category:'Intelligence', description:'Sistema compacto de adquisición de datos y control energético doméstico.', image:`${root}/power-node.jpg`, specs:[['Conexión','Matter · Thread'],['Consumo','0,8 W'],['Material','Aluminio anodizado']] },
  { slug:'dock-line', name:'Dock Line', price:'159,00 €', category:'Furniture', description:'Estación de carga de perfil ultrabajo para integrar energía y conectividad.', image:`${root}/dock-line.jpg`, specs:[['Carga','Qi2 · 45 W'],['Conexión','USB-C'],['Acabado','Grafito mate']] },
  { slug:'sense-cylinder', name:'Sense Cylinder', price:'89,00 €', category:'Intelligence', description:'Sensor ambiental de CO₂, partículas, humedad y presencia con proceso local.', image:`${root}/sense-cylinder.jpg`, specs:[['Sensores','CO₂ · PM2.5 · VOC'],['Autonomía','24 meses'],['Privacidad','Proceso local']] },
  { slug:'wall-control', name:'Wall Control', price:'119,00 €', category:'Digital service', description:'Control mural háptico para clima, agua y escenas domésticas.', image:`${root}/wall-control.jpg`, specs:[['Control','Rotatorio háptico'],['Protección','IP65'],['Instalación','Empotrada']] },
  { slug:'thermo-20', name:'Thermo 20°', price:'189,00 €', category:'Intelligence', description:'Termostato escultórico que aprende el ritmo del espacio sin reclamar atención.', image:`${root}/thermo-20.jpg`, specs:[['Precisión','±0,1 °C'],['Protocolos','Matter · Thread'],['Pantalla','E-ink']] },
  { slug:'air-tower', name:'Air Tower', price:'149,00 €', category:'Self-developed', description:'Ventilación personal silenciosa con flujo natural y calidad de aire integrada.', image:`${root}/air-tower.jpg`, specs:[['Ruido','19 dB'],['Flujo','Adaptativo'],['Filtro','Lavable']] },
  { slug:'dual-control', name:'Dual Control', price:'139,00 €', category:'Furniture', description:'Controlador doméstico de dos diales para luz, sonido y temperatura.', image:`${root}/dual-control.jpg`, specs:[['Diales','Aluminio mecanizado'],['Respuesta','Háptica'],['Batería','USB-C']] },
];

export const noddoProductBySlug = new Map(noddoProducts.map((product) => [product.slug, product]));

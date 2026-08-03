export type SitegaProduct = {
  slug: string;
  name: string;
  price: string;
  category: string;
  description: string;
  image: string;
  specs: readonly [string, string][];
};

const root = '/images/collections/sitega';

export const sitegaProducts: readonly SitegaProduct[] = [
  { slug:'basin-soft', name:'Soft 01', price:'289,00 €', category:'Lavabos', description:'Lavabo cerámico de sobremesa con geometría redondeada y desagüe integrado.', image:`${root}/basin-soft.jpg`, specs:[['Material','Cerámica vitrificada'],['Acabado','Blanco mate'],['Medidas','520 × 390 mm']] },
  { slug:'basin-black', name:'Black 02', price:'329,00 €', category:'Lavabos', description:'Lavabo profundo en cerámica negra mate para composiciones monocromas.', image:`${root}/basin-black.jpg`, specs:[['Material','Cerámica vitrificada'],['Acabado','Negro mate'],['Medidas','520 × 390 mm']] },
  { slug:'basin-oval', name:'Oval 03', price:'309,00 €', category:'Lavabos', description:'Lavabo ovalado de canto orgánico y tacto sedoso.', image:`${root}/basin-oval.jpg`, specs:[['Material','Cerámica vitrificada'],['Acabado','Blanco seda'],['Medidas','580 × 380 mm']] },
  { slug:'faucet-arc', name:'Arc 04', price:'219,00 €', category:'Grifería', description:'Grifería de lavabo con arco alto y mando lateral de precisión.', image:`${root}/faucet-arc.jpg`, specs:[['Material','Acero inoxidable'],['Acabado','Negro mate'],['Altura','310 mm']] },
  { slug:'basin-table', name:'Table 05', price:'359,00 €', category:'Colecciones', description:'Lavabo arquitectónico rectangular con borde fino y presencia escultórica.', image:`${root}/basin-table.jpg`, specs:[['Material','Cerámica vitrificada'],['Acabado','Blanco mate'],['Medidas','620 × 420 mm']] },
  { slug:'basin-stone', name:'Stone 06', price:'389,00 €', category:'Colecciones', description:'Pieza redonda tallada en acabado mineral carbón.', image:`${root}/basin-stone.jpg`, specs:[['Material','Piedra mineral'],['Acabado','Carbón natural'],['Diámetro','430 mm']] },
  { slug:'faucet-wall', name:'Wall 07', price:'189,00 €', category:'Grifería', description:'Caño mural cilíndrico con acabado grafito cepillado.', image:`${root}/faucet-wall.jpg`, specs:[['Material','Acero inoxidable'],['Acabado','Grafito cepillado'],['Proyección','185 mm']] },
  { slug:'basin-pedestal', name:'Pedestal 08', price:'419,00 €', category:'Colecciones', description:'Lavabo compacto sobre pedestal para espacios de proporción serena.', image:`${root}/basin-pedestal.jpg`, specs:[['Material','Cerámica vitrificada'],['Acabado','Taupe satinado'],['Altura','840 mm']] },
];

export const sitegaProductBySlug = new Map(sitegaProducts.map((product) => [product.slug, product]));

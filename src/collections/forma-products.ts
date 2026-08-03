export type FormaProduct = { slug:string; name:string; price:string; category:string; description:string; image:string; specs:readonly [string,string][] };
const root='/images/collections/forma';
export const formaProducts: readonly FormaProduct[] = [
  {slug:'clear-01',name:'Clear 01',price:'165,00 €',category:'Ópticas',description:'Montura óptica translúcida de acetato suave y líneas redondeadas.',image:`${root}/frame-clear.jpg`,specs:[['Material','Acetato italiano'],['Acabado','Translúcido cálido'],['Lentes','Ópticas graduables']]},
  {slug:'black-02',name:'Black 02',price:'185,00 €',category:'Ópticas',description:'Montura negra de presencia limpia y proporción atemporal.',image:`${root}/frame-black.jpg`,specs:[['Material','Acetato negro'],['Acabado','Pulido profundo'],['Lentes','Ópticas graduables']]},
  {slug:'wire-03',name:'Wire 03',price:'195,00 €',category:'Ópticas',description:'Estructura metálica ligera, pensada para desaparecer sobre el rostro.',image:`${root}/frame-wire.jpg`,specs:[['Material','Acero inoxidable'],['Acabado','Plata satinada'],['Peso','18 g']]},
  {slug:'tortoise-04',name:'Tortoise 04',price:'205,00 €',category:'Ópticas',description:'Acetato jaspeado con una silueta cálida y precisa.',image:`${root}/frame-tortoise.jpg`,specs:[['Material','Acetato italiano'],['Acabado','Carey natural'],['Lentes','Ópticas graduables']]},
  {slug:'olive-05',name:'Olive 05',price:'225,00 €',category:'Solares',description:'Gafa solar en acetato oliva con lentes de protección total.',image:`${root}/sunglasses-olive.jpg`,specs:[['Material','Acetato'],['Protección','UV400'],['Acabado','Oliva mate']]},
  {slug:'charcoal-06',name:'Charcoal 06',price:'225,00 €',category:'Solares',description:'Gafa solar redonda en carbón mate para todos los días.',image:`${root}/sunglasses-charcoal.jpg`,specs:[['Material','Acetato'],['Protección','UV400'],['Acabado','Carbón mate']]},
];
export const formaProductBySlug=new Map(formaProducts.map((p)=>[p.slug,p]));

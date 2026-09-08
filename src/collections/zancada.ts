import type { CollectionConfig } from './types';

export const zancadaCollection: CollectionConfig = {
  id: 'zancada', themeId: 'zancada', name: 'Zancada',
  tagline: 'Running y otras formas de avanzar',
  description: 'Zapatillas, equipamiento técnico y cultura del running. Descubre Zancada: del primer kilómetro al que todavía no conoces.',
  categories: [
    { id: 'zan-trail', label: 'Trail' },
    { id: 'zan-asfalto', label: 'Asfalto' },
    { id: 'zan-lifestyle', label: 'Lifestyle' },
    { id: 'zan-calcetines', label: 'Calcetines' },
    { id: 'zan-equipamiento', label: 'Equipamiento' },
  ],
};

/** Datos originales del escaparate importado; el seed materializa las tallas. */
export const zancadaModels = [
  {
    "slug": "zan-xt-wings-2",
    "brand": "SALOMON",
    "name": "XT-WINGS 2 ADVANCED",
    "color": "WHITE / SILVER / BLACK",
    "price_cents": 14000,
    "asset": "shoe-white-studio.webp",
    "dot": "#d9ff43",
    "category": "zan-trail",
    "description": "Nacida en la montaña. En su elemento, en cualquier lugar. La XT-Wings 2 combina estabilidad, agarre y una silueta técnica que va mucho más allá del sendero.",
    "sizes": [
      "36",
      "37⅓",
      "38",
      "39⅓",
      "40",
      "41⅓",
      "42",
      "42⅔",
      "43⅓",
      "44",
      "45⅓",
      "46"
    ],
    "defaultSize": "42"
  },
  {
    "slug": "zan-rx-moc",
    "brand": "SALOMON",
    "name": "RX MOC ADVANCED",
    "color": "BLACK / BLACK",
    "price_cents": 10000,
    "asset": "shoe-black-studio.webp",
    "dot": "#d9ff43",
    "category": "zan-lifestyle",
    "description": "Una pausa entre kilómetros. Silueta ligera y envolvente para recuperar el ritmo después de correr y moverte cada día.",
    "sizes": [
      "36",
      "37⅓",
      "38",
      "39⅓",
      "40",
      "41⅓",
      "42",
      "42⅔",
      "43⅓",
      "44",
      "45⅓",
      "46"
    ],
    "defaultSize": "42"
  },
  {
    "slug": "zan-xt-4-og",
    "brand": "SALOMON",
    "name": "XT-4 OG",
    "color": "MULBERRY / EBONY / LIME",
    "price_cents": 19500,
    "asset": "shoe-pink-studio.webp",
    "dot": "#72ffb3",
    "category": "zan-trail",
    "description": "Diseño técnico, color y agarre para los caminos que se salen del mapa. Una silueta de trail con vocación urbana.",
    "sizes": [
      "36",
      "37⅓",
      "38",
      "39⅓",
      "40",
      "41⅓",
      "42",
      "42⅔",
      "43⅓",
      "44",
      "45⅓",
      "46"
    ],
    "defaultSize": "42"
  },
  {
    "slug": "zan-condor-2",
    "brand": "VEJA",
    "name": "CONDOR 2",
    "color": "PURPLE / GREEN / WHITE",
    "price_cents": 15500,
    "asset": "shoe-turquoise-studio.webp",
    "dot": "#67e0e0",
    "category": "zan-asfalto",
    "description": "Pensada para sumar kilómetros de asfalto a tu ritmo. Malla ligera, pisada amortiguada y una combinación de color que se hace ver.",
    "sizes": [
      "36",
      "37⅓",
      "38",
      "39⅓",
      "40",
      "41⅓",
      "42",
      "42⅔",
      "43⅓",
      "44",
      "45⅓",
      "46"
    ],
    "defaultSize": "42"
  },
  {
    "slug": "zan-pace-black",
    "brand": "ZANCADA",
    "name": "PACE CREW",
    "color": "BLACK / LIME",
    "price_cents": 1600,
    "asset": "sock-black.webp",
    "dot": "#d9ff43",
    "category": "zan-calcetines",
    "description": "Calcetín de running con caña de canalé, tejido transpirable y refuerzos en talón y puntera. Un color para cada salida.",
    "sizes": [
      "S/M",
      "L/XL"
    ],
    "defaultSize": "S/M"
  },
  {
    "slug": "zan-pace-chalk",
    "brand": "ZANCADA",
    "name": "PACE CREW",
    "color": "CHALK / LIME",
    "price_cents": 1600,
    "asset": "sock-chalk.webp",
    "dot": "#d9ff43",
    "category": "zan-calcetines",
    "description": "Calcetín de running con caña de canalé, tejido transpirable y refuerzos en talón y puntera. Un color para cada salida.",
    "sizes": [
      "S/M",
      "L/XL"
    ],
    "defaultSize": "S/M"
  },
  {
    "slug": "zan-pace-blue",
    "brand": "ZANCADA",
    "name": "PACE CREW",
    "color": "COBALT / SKY",
    "price_cents": 1600,
    "asset": "sock-blue.webp",
    "dot": "#d9ff43",
    "category": "zan-calcetines",
    "description": "Calcetín de running con caña de canalé, tejido transpirable y refuerzos en talón y puntera. Un color para cada salida.",
    "sizes": [
      "S/M",
      "L/XL"
    ],
    "defaultSize": "S/M"
  },
  {
    "slug": "zan-pace-coral",
    "brand": "ZANCADA",
    "name": "PACE CREW",
    "color": "WHITE / CORAL",
    "price_cents": 1600,
    "asset": "sock-coral.webp",
    "dot": "#d9ff43",
    "category": "zan-calcetines",
    "description": "Calcetín de running con caña de canalé, tejido transpirable y refuerzos en talón y puntera. Un color para cada salida.",
    "sizes": [
      "S/M",
      "L/XL"
    ],
    "defaultSize": "S/M"
  },
  {
    "slug": "zan-pace-mint",
    "brand": "ZANCADA",
    "name": "PACE CREW",
    "color": "WHITE / MINT",
    "price_cents": 1600,
    "asset": "sock-mint.webp",
    "dot": "#d9ff43",
    "category": "zan-calcetines",
    "description": "Calcetín de running con caña de canalé, tejido transpirable y refuerzos en talón y puntera. Un color para cada salida.",
    "sizes": [
      "S/M",
      "L/XL"
    ],
    "defaultSize": "S/M"
  },
  {
    "slug": "zan-pace-sky",
    "brand": "ZANCADA",
    "name": "PACE CREW",
    "color": "SKY / VIOLET",
    "price_cents": 1600,
    "asset": "sock-sky.webp",
    "dot": "#d9ff43",
    "category": "zan-calcetines",
    "description": "Calcetín de running con caña de canalé, tejido transpirable y refuerzos en talón y puntera. Un color para cada salida.",
    "sizes": [
      "S/M",
      "L/XL"
    ],
    "defaultSize": "S/M"
  },
  {
    "slug": "zan-trail-low",
    "brand": "SATISFY",
    "name": "TRAIL LOW",
    "color": "SAGE / CHALK",
    "price_cents": 18000,
    "asset": "gear-olive.webp",
    "dot": "#d9ff43",
    "category": "zan-equipamiento",
    "description": "Calzado de trail ligero en tonos salvia y tiza. Una silueta técnica para explorar caminos y senderos.",
    "sizes": [
      "36",
      "37⅓",
      "38",
      "39⅓",
      "40",
      "41⅓",
      "42",
      "42⅔",
      "43⅓",
      "44",
      "45⅓",
      "46"
    ],
    "defaultSize": "42"
  },
  {
    "slug": "zan-ultralight-shell",
    "brand": "ZANCADA",
    "name": "ULTRALIGHT SHELL",
    "color": "GRAPHITE",
    "price_cents": 14500,
    "asset": "gear-jacket.webp",
    "dot": "#d9ff43",
    "category": "zan-equipamiento",
    "description": "Capa exterior ligera y plegable para llevar contigo cuando cambia el tiempo. Corte cómodo y acabado grafito.",
    "sizes": [
      "XS",
      "S",
      "M",
      "L",
      "XL"
    ],
    "defaultSize": "M"
  },
  {
    "slug": "zan-trail-belt",
    "brand": "ZANCADA",
    "name": "TRAIL BELT",
    "color": "BLACK",
    "price_cents": 5500,
    "asset": "gear-belt.webp",
    "dot": "#d9ff43",
    "category": "zan-equipamiento",
    "description": "Cinturón de running compacto para llevar lo esencial cerca del cuerpo, con ajuste cómodo y espacio para tus pequeños objetos.",
    "sizes": [
      "Única"
    ],
    "defaultSize": "Única"
  }
] as const;

export function zancadaSizeSlug(model: { slug: string; defaultSize: string }, size: string): string {
  return size === model.defaultSize ? model.slug : model.slug + '-t' + String(size).normalize('NFKD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}


import type { SeedProduct } from '../products.ts';
const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({ ...prod, collection: 'noddo' });
export const noddoSeedProducts: readonly SeedProduct[] = [
  c({ slug:'nod-thermo-01', name:'Thermo 01', description:'Control climático de precisión con sensor de presencia y ajuste táctil.', subtitle:'Matter · sensor local', price_cents:12900, stock:18, category:'nod-clima' }),
  c({ slug:'nod-thermo-mini', name:'Thermo Mini', description:'Inteligencia térmica esencial para estancias pequeñas.', subtitle:'55 mm · Thread', price_cents:8900, stock:26, category:'nod-clima' }),
  c({ slug:'nod-halo-floor', name:'Halo Floor', description:'Lámpara ambiental de aluminio reciclado con luz cálida automática.', subtitle:'2700 K · 18 W', price_cents:21900, stock:12, category:'nod-luz' }),
  c({ slug:'nod-halo-table', name:'Halo Table', description:'Luz de sobremesa regulable por gesto, sin interruptores visibles.', subtitle:'Control gestual', price_cents:14900, stock:20, category:'nod-luz' }),
  c({ slug:'nod-air-01', name:'Air 01', description:'Purifica partículas, polen y olores con funcionamiento casi inaudible.', subtitle:'HEPA 13 · 19 dB', price_cents:18900, stock:15, category:'nod-aire' }),
  c({ slug:'nod-sense-air', name:'Sense Air', description:'Monitor de CO₂, humedad y partículas con indicadores discretos.', subtitle:'CO₂ · PM2.5 · VOC', price_cents:7900, stock:34, category:'nod-aire' }),
  c({ slug:'nod-dock-01', name:'Dock 01', description:'Centro de carga inalámbrica para móvil, reloj y auriculares.', subtitle:'Qi2 · 45 W', price_cents:15900, stock:24, category:'nod-energia' }),
  c({ slug:'nod-plug-duo', name:'Plug Duo', description:'Dos tomas inteligentes con medición de consumo y automatización local.', subtitle:'16 A · Matter', price_cents:4900, stock:42, category:'nod-energia' }),
  c({ slug:'nod-lock-01', name:'Lock 01', description:'Cerradura conectada de acero mecanizado con control local.', subtitle:'NFC · código · llave', price_cents:22900, stock:11, category:'nod-acceso' }),
  c({ slug:'nod-entry-sense', name:'Entry Sense', description:'Sensor compacto de apertura y presencia con privacidad local.', subtitle:'Thread · 2 años', price_cents:5900, stock:37, category:'nod-acceso' }),
  c({ slug:'nod-tone-01', name:'Tone 01', description:'Altavoz doméstico de 360 grados afinado para voces claras.', subtitle:'40 W · Wi-Fi 6', price_cents:17900, stock:16, category:'nod-sonido' }),
  c({ slug:'nod-tone-pair', name:'Tone Pair', description:'Pareja estéreo inalámbrica con sincronización automática de sala.', subtitle:'2 × 40 W · DSP', price_cents:32900, stock:8, category:'nod-sonido' }),
];

/**
 * Catálogo demo de "La Botiga del Maestrat" — 60 productos gourmet ficticios.
 * Para un cliente real: sustituir este fichero entero por su catálogo.
 * Precios en céntimos. La imagen es un placeholder por categoría (WebP local).
 */

export type SeedProduct = {
  slug: string;
  name: string;
  description: string;
  price_cents: number;
  stock: number;
  category: string;
  /** Tienda del escaparate. Por defecto, la genérica. */
  collection?: string;
  /** Activo en tienda. Por defecto 1; 0 para demostrar un producto desactivado. */
  active?: number;

  // — Capacidades opcionales (migración 0002). Omitirlas es lo normal. —
  /** Subtítulo técnico bajo el nombre (Industrial). */
  subtitle?: string;
  /**
   * Precio anterior tachado (Natural). SOLO presentación: no se cobra, no cuenta
   * para el envío gratis. Debe ser mayor que `price_cents` — lo valida el seed.
   */
  compare_at_price_cents?: number;
  /** Filas de ficha técnica (Specs). */
  specs?: readonly { label: string; value: string }[];
};

const p = (
  category: string,
  slug: string,
  name: string,
  price_cents: number,
  stock: number,
  description: string,
): SeedProduct => ({ slug, name, description, price_cents, stock, category });

export const seedProducts: SeedProduct[] = [
  // ── Aceites de oliva (10) ──────────────────────────────────────────
  p('aceites', 'aove-picual-500', 'AOVE Picual 500 ml', 890, 42, 'Aceite de oliva virgen extra de variedad picual, primera prensada en frío. Intenso y afrutado.'),
  p('aceites', 'aove-picual-1l', 'AOVE Picual 1 L', 1490, 30, 'Formato litro de nuestro picual más vendido. Ideal para cocina diaria de nivel.'),
  p('aceites', 'aove-arbequina-500', 'AOVE Arbequina 500 ml', 950, 38, 'Arbequina suave y dulce, perfecta para ensaladas y desayunos con pan de pueblo.'),
  p('aceites', 'aove-arbequina-1l', 'AOVE Arbequina 1 L', 1590, 25, 'Arbequina en formato litro. Recolección temprana, verde y elegante.'),
  // Capacidad "subtítulo" (migración 0002): línea técnica bajo el nombre.
  { ...p('aceites', 'aove-coupage-750', 'AOVE Coupage del Maestrat 750 ml', 1290, 20, 'Mezcla de picual, arbequina y farga centenaria. Nuestro coupage de la casa.'), subtitle: 'Picual · Arbequina · Farga centenaria' },
  // Capacidades "subtítulo" + "ficha técnica" a la vez.
  {
    ...p('aceites', 'aove-farga-centenaria-500', 'AOVE Farga Centenaria 500 ml', 1890, 12, 'De olivos milenarios de la variedad farga del Maestrat. Edición limitada numerada.'),
    subtitle: 'Edición limitada numerada',
    specs: [
      { label: 'Variedad', value: 'Farga centenaria' },
      { label: 'Acidez', value: '≤ 0,2°' },
      { label: 'Recolección', value: 'Temprana, en verde' },
      { label: 'Formato', value: '500 ml' },
    ],
  },
  p('aceites', 'aove-ecologico-500', 'AOVE Ecológico 500 ml', 1190, 28, 'Certificación ecológica CAECV. Sin filtrar, con toda su esencia.'),
  p('aceites', 'aceite-trufa-250', 'Aceite aromatizado con trufa 250 ml', 1450, 15, 'AOVE infusionado con trufa negra de Sarrión. Unas gotas bastan.'),
  p('aceites', 'aceite-romero-250', 'Aceite aromatizado con romero 250 ml', 790, 22, 'AOVE con romero de secano. Para carnes a la brasa y asados.'),
  // Capacidades "oferta" (precio anterior tachado, SOLO presentación) + "ficha técnica".
  {
    ...p('aceites', 'lata-aove-5l', 'Lata AOVE cosecha propia 5 L', 4990, 10, 'Formato ahorro en lata de 5 litros. La despensa de todo el año.'),
    compare_at_price_cents: 5990,
    specs: [
      { label: 'Capacidad', value: '5 L' },
      { label: 'Variedad', value: 'Coupage de la casa' },
      { label: 'Envase', value: 'Lata de hojalata con tapón vertedor' },
    ],
  },

  // ── Embutidos (10) ─────────────────────────────────────────────────
  p('embutidos', 'llonganissa-seca-300', 'Llonganissa seca artesana 300 g', 650, 35, 'Curada al aire del Maestrat, con pimienta negra en grano. Receta de casa.'),
  p('embutidos', 'fuet-artesa-200', 'Fuet artesà 200 g', 420, 50, 'Fino, curado y adictivo. El clásico que desaparece primero de la tabla.'),
  p('embutidos', 'chorizo-cular-400', 'Chorizo cular curado 400 g', 890, 24, 'Chorizo de cerdo de granja familiar, tripa cular y pimentón dulce ahumado.'),
  p('embutidos', 'sobrasada-untar-250', 'Sobrasada de untar 250 g', 590, 30, 'Textura cremosa, punto justo de pimentón. Sobre pan tostado con miel: imbatible.'),
  p('embutidos', 'cecina-vaca-100', 'Cecina de vaca cortada a mano 100 g', 790, 18, 'Curada 12 meses, cortada a cuchillo y envasada al vacío.'),
  p('embutidos', 'jamon-serrano-taco-500', 'Taco de jamón serrano reserva 500 g', 1290, 20, 'Taco de jamón reserva de 18 meses para cortar en casa.'),
  p('embutidos', 'lomo-embuchado-400', 'Lomo embuchado extra 400 g', 1190, 16, 'Lomo de cerdo adobado con pimentón y curado lentamente en secadero natural.'),
  p('embutidos', 'morcilla-cebolla-pack3', 'Morcilla de cebolla (pack 3 uds)', 690, 26, 'Morcilla de cebolla al estilo tradicional, lista para brasa o arroz.'),
  p('embutidos', 'flor-sobrasada-picante-250', 'Sobrasada picante 250 g', 620, 22, 'Versión picante de nuestra sobrasada, con pimentón de vera picante.'),
  p('embutidos', 'tabla-degustacion-embutidos', 'Tabla degustación de embutidos', 1990, 14, 'Selección de cinco embutidos de la casa, lista para regalar.'),

  // ── Mieles (10) ────────────────────────────────────────────────────
  p('mieles', 'miel-romero-500', 'Miel de romero 500 g', 750, 40, 'Miel clara y delicada de romero de los secanos del Maestrat. Cosecha propia.'),
  p('mieles', 'miel-azahar-500', 'Miel de azahar 500 g', 750, 38, 'De los naranjos de la Plana. Aroma floral inconfundible.'),
  p('mieles', 'miel-mil-flores-1kg', 'Miel mil flores 1 kg', 1150, 32, 'Formato familiar de nuestra miel multifloral de primavera.'),
  p('mieles', 'miel-encina-500', 'Miel de encina 500 g', 950, 15, 'Oscura, intensa y con notas de malta. La preferida de los entendidos.'),
  p('mieles', 'miel-tomillo-500', 'Miel de tomillo 500 g', 890, 20, 'Miel de tomillo de montaña, aromática y balsámica.'),
  // Estado "stock bajo": la ficha muestra «quedan 3 unidades».
  p('mieles', 'panal-miel-300', 'Panal de miel natural 300 g', 1290, 3, 'Trozo de panal directo de la colmena. La miel en su estado más puro.'),
  p('mieles', 'polen-abeja-250', 'Polen de abeja 250 g', 990, 18, 'Polen granulado secado en frío. Para desayunos con energía.'),
  p('mieles', 'miel-jalea-real-250', 'Miel con jalea real 250 g', 1190, 16, 'Miel de romero enriquecida con jalea real fresca.'),
  p('mieles', 'crema-miel-turron-250', 'Crema de miel y turrón 250 g', 850, 24, 'Crema untable de miel con almendra marcona tostada.'),
  p('mieles', 'pack-tres-mieles', 'Estuche degustación 3 mieles', 1890, 12, 'Romero, azahar y encina en tarros de 250 g. Estuche de regalo.'),

  // ── Vinos (10) ─────────────────────────────────────────────────────
  p('vinos', 'tinto-crianza-garnacha', 'Tinto crianza Garnacha 75 cl', 1150, 36, 'Garnacha de viñas viejas, 12 meses en barrica de roble francés.'),
  p('vinos', 'tinto-joven-tempranillo', 'Tinto joven Tempranillo 75 cl', 650, 48, 'Tempranillo joven y frutal. El tinto de diario bien hecho.'),
  p('vinos', 'blanco-macabeo', 'Blanco Macabeo 75 cl', 750, 40, 'Macabeo fresco con notas cítricas. Para arroces y pescado.'),
  p('vinos', 'blanco-fermentado-barrica', 'Blanco fermentado en barrica 75 cl', 1390, 18, 'Chardonnay fermentado en barrica sobre lías. Untuoso y largo.'),
  p('vinos', 'rosado-syrah', 'Rosado Syrah 75 cl', 690, 30, 'Rosado pálido de syrah, seco y perfumado.'),
  p('vinos', 'espumoso-brut-nature', 'Espumoso Brut Nature 75 cl', 1290, 25, 'Método tradicional, 24 meses de rima. Burbujas finas del Maestrat.'),
  p('vinos', 'mistela-moscatel-50', 'Mistela de Moscatel 50 cl', 890, 20, 'Dulce tradicional de moscatel romano. El final de comida de la tierra.'),
  p('vinos', 'vermut-artesano-1l', 'Vermut artesano 1 L', 990, 28, 'Vermut rojo macerado con 40 botánicos. De grifo a botella.'),
  p('vinos', 'tinto-reserva-magnum', 'Tinto reserva Magnum 1,5 L', 2990, 8, 'Nuestra reserva en formato magnum. Para ocasiones que lo merecen.'),
  // Estado "oferta": precio anterior tachado (SOLO presentación, no se cobra).
  { ...p('vinos', 'estuche-tres-vinos', 'Estuche selección 3 vinos', 2790, 15, 'Tinto crianza, blanco barrica y espumoso en estuche de madera.'), compare_at_price_cents: 3490 },

  // ── Conservas (10) ─────────────────────────────────────────────────
  p('conservas', 'tomate-seco-aceite-300', 'Tomate seco en AOVE 300 g', 690, 30, 'Tomate de pera secado al sol y conservado en nuestro AOVE.'),
  p('conservas', 'alcachofa-corazones-390', 'Corazones de alcachofa 390 g', 790, 26, 'Alcachofa de Benicarló DOP en conserva al natural.'),
  p('conservas', 'pimiento-asado-lena-390', 'Pimiento asado a la leña 390 g', 650, 28, 'Pimiento rojo asado a la leña y pelado a mano.'),
  // Estado "agotado": stock 0 → la tarjeta pinta «Agotado» y el botón se deshabilita.
  p('conservas', 'perdiz-escabeche-750', 'Perdiz en escabeche 750 g', 1890, 0, 'Perdiz de caza en escabeche suave de vino viejo. Receta de masía.'),
  p('conservas', 'pate-olivada-negra-140', 'Olivada de aceituna negra 140 g', 450, 34, 'Paté de aceituna negra de aragón con AOVE y hierbas.'),
  p('conservas', 'mermelada-higo-280', 'Mermelada de higo 280 g', 490, 32, 'Higos de secano y azúcar de caña, nada más. Para quesos curados.'),
  p('conservas', 'mermelada-naranja-280', 'Mermelada de naranja amarga 280 g', 490, 30, 'Naranja de la Plana con su punto justo de amargor.'),
  p('conservas', 'anchoa-cantabrico-8f', 'Anchoas del Cantábrico 8 filetes', 1290, 16, 'Anchoa de Santoña en AOVE, limpiada a mano. Alianza de mar y monte.'),
  p('conservas', 'bonito-ventresca-115', 'Ventresca de bonito del norte 115 g', 990, 20, 'Ventresca en AOVE de la costera del bonito.'),
  // Estado "inactivo": el comercio lo desactiva → fuera de la tienda, gris en el panel.
  { ...p('conservas', 'salsa-tomate-casera-350', 'Salsa de tomate casera 350 g', 420, 40, 'Tomate, AOVE, cebolla y paciencia. Como la de casa.'), active: 0 },

  // ── Quesos (10) ────────────────────────────────────────────────────
  p('quesos', 'queso-cabra-curado-400', 'Queso de cabra curado 400 g', 1090, 22, 'Leche cruda de cabra del Maestrat, curación de 4 meses.'),
  p('quesos', 'queso-oveja-viejo-400', 'Queso de oveja viejo 400 g', 1290, 18, 'Oveja de leche cruda, 10 meses de cueva. Intenso y mantecoso.'),
  p('quesos', 'queso-tierno-mezcla-500', 'Queso tierno de mezcla 500 g', 790, 28, 'Suave y lechoso. El favorito de los niños de la casa.'),
  p('quesos', 'queso-aceite-romero-350', 'Queso curado en AOVE y romero 350 g', 1190, 15, 'Tacos de queso curado macerados en aceite con romero.'),
  p('quesos', 'queso-azul-artesano-250', 'Queso azul artesano 250 g', 890, 14, 'Azul cremoso de leche de vaca de granja de montaña.'),
  p('quesos', 'crema-queso-trufa-150', 'Crema de queso con trufa 150 g', 690, 20, 'Crema untable de queso curado con trufa negra.'),
  p('quesos', 'queso-ahumado-350', 'Queso ahumado al sarmiento 350 g', 990, 16, 'Ahumado suave con sarmientos de nuestras viñas.'),
  p('quesos', 'cunya-parmesano-maestrat-300', 'Cuña estilo grana curado 24 meses 300 g', 1390, 12, 'Nuestra versión del grana: 24 meses, cristalitos y potencia.'),
  // Estado "oferta": precio anterior tachado (SOLO presentación).
  { ...p('quesos', 'tabla-quesos-seleccion', 'Tabla selección 4 quesos', 2490, 10, 'Cabra, oveja, azul y ahumado. Con mermelada de higo de regalo.'), compare_at_price_cents: 2990 },
  p('quesos', 'membrillo-artesano-400', 'Dulce de membrillo artesano 400 g', 490, 30, 'El compañero inseparable de cualquier tabla de quesos.'),
];

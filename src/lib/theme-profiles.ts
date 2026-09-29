/**
 * Fichas comerciales de los temas — el texto de `/temas/<id>`.
 * ============================================================================
 *
 * `demo-themes.ts` describe el tema para el sistema (tokens y estructura) y
 * `src/collections/` su tienda de muestra. Esto añade lo que un comercio sin
 * equipo técnico necesita para decidir: qué transmite la dirección, para quién
 * y qué hace de verdad en pantalla.
 *
 * REGLA DE VERDAD. Cada `highlight` está comprobado en la tienda viva, en sus
 * componentes (`src/components/themes/<id>/`) o en su ficha de entrega
 * (`docs/temas/<id>.md`). Nada que el tema no haga. Sin jerga técnica.
 *
 * `summary` se usa también como meta description: dos frases, única por tema y
 * de 160 caracteres como máximo (`tests/theme-profiles.test.ts`).
 */
import { defaultTheme, demoThemes, type DemoTheme } from './demo-themes';
import { newestThemesFirst, themeCategoryIds } from './theme-catalog';

export type ThemeProfile = {
  /** Qué transmite la dirección y para quién. Dos frases, ≤ 160 caracteres. */
  summary: string;
  /** Lo que el tema hace visual o funcionalmente. De 3 a 4 frases cortas. */
  highlights: readonly string[];
};

export const THEME_PROFILES: Readonly<Record<string, ThemeProfile>> = {
  editorial: {
    summary:
      'Rejilla suiza densa, anotaciones técnicas y un naranja señal con carácter de marca de diseño. Para objeto, audio o tecnología con voz propia.',
    highlights: [
      'Rejilla irregular: unas piezas ocupan más espacio que otras',
      'Numeración de sección y etiquetas técnicas en monoespaciada',
      'Botón «+» para añadir al carrito desde la propia rejilla',
      'Filtros por categoría en chips, búsqueda y orden',
    ],
  },
  industrial: {
    summary:
      'Catálogo técnico de filetes finos y azul eléctrico para quien compra por especificación. Para suministro industrial, maquinaria y venta B2B.',
    highlights: [
      'Rejilla sin huecos: las celdas se separan solo con un filete',
      'Subtítulo técnico bajo cada producto, como en un catálogo de fabricante',
      'Botón de compra que aparece al pasar el ratón y siempre visible en el móvil',
      'Avisos de «Últimas unidades» y «Agotado» según el stock',
    ],
  },
  natural: {
    summary:
      'El formato clásico de venta directa, claro y pensado para convertir. Para cosmética, cuidado personal o alimentación que vende al consumidor final.',
    highlights: [
      'Portada partida: texto a un lado y fotografía a sangre al otro',
      'Filtros laterales por categoría y ordenación del catálogo',
      'Precio tachado y porcentaje de descuento calculado solo',
      'Botón de añadir al carrito sobre la foto de cada producto',
    ],
  },
  guide: {
    summary:
      'Tarjetas redondeadas, ilustración de línea y mucho aire: una tienda amable que invita a leer antes de comprar. Para café o producto que se explica.',
    highlights: [
      'Portada en tarjeta grande con las categorías integradas',
      'Ilustración de línea en lugar de fotografía de producto',
      'Nombre y numeración en monoespaciada en cada tarjeta',
      'Etiqueta «Nuevo» y botón de añadir en cada producto',
    ],
  },
  specs: {
    summary:
      'La ficha técnica convertida en tienda: especificaciones, grises y un único acento naranja. Para componentes o producto que se elige por sus datos.',
    highlights: [
      'Especificaciones (peso, material, grado) encima de cada imagen',
      'Grupos de producto plegables, como en una hoja técnica',
      'Rejilla irregular con filas de distinto número de piezas',
      'El precio entra como una fila más de la ficha',
    ],
  },
  minimal: {
    summary:
      'El aire es el material principal: dos columnas de imagen grande y una navegación lateral discreta. Para mobiliario o moda que se vende por la foto.',
    highlights: [
      'Navegación lateral con el carrito incluido; en móvil pasa a barra superior',
      'Dos columnas de imagen grande, sin filetes: separa el espacio',
      'Orden y categorías en una barra tipográfica',
      'Pie oscuro a sangre',
    ],
  },
  arce: {
    summary:
      'Interiorismo cálido con ritmo de revista: portada partida, colecciones y catálogo por capas. Para mobiliario, iluminación y marcas que venden ambiente.',
    highlights: [
      'Portada partida entre mensaje de marca y producto protagonista',
      'Colecciones y campañas editoriales antes del catálogo',
      'Buscador visible, filtros por categoría y aviso cuando no hay resultados',
      'Ficha de producto propia con «Completa el espacio»',
    ],
  },
  launch: {
    summary:
      'Más landing de lanzamiento que catálogo: titulares grandes, producto estrella y compra siempre a mano. Para pocos productos de alto valor o preventas.',
    highlights: [
      'Productos destacados en una fila que se desliza en horizontal',
      'Barra inferior fija con la disponibilidad del producto estrella',
      'Envíos y garantías explicados en dos tarjetas claras',
      'Catálogo completo con filtros debajo del lanzamiento',
    ],
  },
  street: {
    summary:
      'Energía de revista deportiva: cinta en movimiento, campaña a sangre y rejilla densa de cinco columnas. Para moda urbana, calzado y marcas de lanzamientos.',
    highlights: [
      'Cinta superior animada que se detiene si el visitante pide menos movimiento',
      'Campaña a pantalla completa con la cabecera debajo',
      'Rejilla de 5 columnas con «Agotado» según el stock',
      'Sección tipo revista con carteles y notas que llevan a cada categoría',
    ],
  },
  iris: {
    summary:
      'Una experiencia de cine: el vídeo avanza con el scroll sobre negro absoluto y acento magenta. Para óptica, producto premium o lanzamientos de impacto.',
    highlights: [
      'Vídeo de fondo que avanza al ritmo del scroll',
      'Producto destacado en una ficha de cristal esmerilado',
      'Catálogo en carrusel horizontal',
      'Cabecera propia integrada en la portada',
    ],
  },
  noddo: {
    summary:
      'Editorial monocromo en el que el producto se presenta como escultura y la tecnología no hace ruido. Para tecnología doméstica y objetos de diseño.',
    highlights: [
      'Portada negra a sangre con el titular de la línea de producto',
      'Rejilla irregular que alterna piezas grandes y pequeñas',
      'Barra de pestañas para filtrar por tipo de producto',
      'Paleta monocroma en la que solo destaca el producto',
    ],
  },
  sitega: {
    summary:
      'Composición de galería en blanco, piedra y negro, con tipografía editorial y mucho aire. Para baño, cerámica y marcas con vocación arquitectónica.',
    highlights: [
      'Hoja blanca sobre gris con navegación tipográfica',
      'Mosaico irregular de lavabos y grifería',
      'Bloque negro de colecciones y pie a sangre',
      'Ficha de producto con la misma dirección de arte',
    ],
  },
  forma: {
    summary:
      'Galería serena de retratos, monturas y taller donde persona y producto se ven juntos. Para ópticas independientes y marcas de gafas o accesorios.',
    highlights: [
      'Retratos de campaña combinados con la montura aislada',
      'Algunas monturas se ven puestas al pasar el ratón',
      'Familias, búsqueda, orden y aviso cuando no hay resultados',
      'Ficha propia con el retrato de campaña cuando existe',
    ],
  },
  stretch: {
    summary:
      'Belleza consciente en gran formato: vídeo en portada, carrusel de producto y categorías en movimiento. Para cosmética, skincare y marcas de bienestar.',
    highlights: [
      'Portada partida con vídeos en bucle y botón de pausa',
      'Pestañas «Más vendidos» y «Sets» sobre un carrusel horizontal',
      'Tres categorías de cierre con vídeo a pantalla completa',
      'Ficha de producto propia',
    ],
  },
  argent: {
    summary:
      'Moda de cine: una campaña a sangre da paso a un carrusel blanco y un díptico editorial. Para moda de autor y marcas que venden con sus campañas.',
    highlights: [
      'Campaña a sangre con la cabecera superpuesta',
      'Logotipo condensado en el centro de la cabecera',
      'Más vendidos en carrusel, que en móvil se desliza con el dedo',
      'Díptico de campañas verticales sin separación',
    ],
  },
  sillage: {
    summary:
      'Una galería olfativa con mucho aire, producto preciso y campaña sensorial. Para perfumería, cosmética y comercio selecto que cuida cada referencia.',
    highlights: [
      'Portada sensorial dentro de una tarjeta',
      'Novedades sobre gris cálido y un producto destacado a dos columnas',
      'Manifiesto de marca y familias de producto apiladas',
      'Cierre con fotografía de showroom',
    ],
  },
  summit: {
    summary:
      'Lujo alpino: campaña de expedición a pantalla completa, producto aislado y mosaico editorial. Para moda técnica, montaña y equipamiento premium.',
    highlights: [
      'Campaña inmersiva con la navegación sobre la fotografía',
      'Producto aislado sobre blanco con detalles en cobre',
      'Mosaico de piezas junto a una campaña vertical',
      'Añadir al carrito desde la tarjeta sin salir del catálogo',
    ],
  },
  litica: {
    summary:
      'Cosmética mineral con retícula de filetes, materia cálida y fotografía en blanco y negro. Para skincare y marcas naturales que transmiten calma.',
    highlights: [
      'Portada partida entre producto y roca cálida',
      'Bandas de tres productos, cada una con su titular',
      'Principios de marca y un cierre «Sí / No»',
      'Filtro por categoría, búsqueda y añadir desde la tarjeta',
    ],
  },
  nera: {
    summary:
      'Sastrería editorial sobre blanco absoluto, con campaña a sangre y un mosaico que alterna prenda y retrato. Para moda de autor y colecciones cortas.',
    highlights: [
      'Campaña a sangre y cuatro prendas aisladas',
      'Mosaico que alterna campaña y producto',
      'Segunda imagen al pasar el ratón cuando la prenda sale en campaña',
      'Ficha propia con «Completa el look»',
    ],
  },
  viso: {
    summary:
      'Óptica futurista sobre marfil: campaña en movimiento, logotipo gigante y retícula asimétrica. Para eyewear, moda tecnológica y accesorios premium.',
    highlights: [
      'Portada partida con una campaña de movimiento',
      'Logotipo sobredimensionado que cruza la composición',
      'Modelos en retícula asimétrica con alguna pieza doble',
      'Díptico final de objeto y retrato',
    ],
  },
  orbe: {
    summary:
      'Skincare inclusivo con marfil clínico, vidrio ámbar y retratos de piel real. Para cosmética y bienestar premium que quiere hablar a todas las pieles.',
    highlights: [
      'Portada partida entre producto y retrato',
      'Franja de principios de marca, sin avales inventados',
      'Tratamientos sobre fondo marfil con filetes finos',
      'Manifiesto de marca a dos columnas en verde salvia',
    ],
  },
  alva: {
    summary:
      'Marroquinería escandinava sobre marfil sereno, con piel táctil y retícula de atelier. Para bolsos, calzado de autor y accesorios premium.',
    highlights: [
      'Portada partida entre campaña y objeto',
      'Retícula de cuatro columnas con filetes mínimos',
      'Díptico de atelier entre dos familias de producto',
      'Logotipo a gran escala en el pie',
    ],
  },
  brio: {
    summary:
      'Bienestar urbano con humor: hoja marfil, envases de color eléctrico y un manifiesto tipográfico. Para autocuidado, cosmética funcional y venta directa.',
    highlights: [
      'Portada partida entre retrato y envase',
      'Cinta editorial que se detiene si el visitante pide menos movimiento',
      'Manifiesto tipográfico a gran escala',
      'Productos sobre azulejo y una retícula 2×2 con mucho vacío',
    ],
  },
  bruma: {
    summary:
      'Lujo silencioso: tipografía grande, aire y producto sin ruido en una rejilla rígida de cuatro columnas. Para café de especialidad y alimentación premium.',
    highlights: [
      'Categorías como titular tipográfico a gran escala',
      'Dos filtros discretos sobre una rejilla fija de cuatro columnas',
      'Cabecera mínima: en móvil, solo marca y carrito',
      'Envases propios con un sistema gráfico de curvas topográficas',
    ],
  },
  traza: {
    summary:
      'Un portfolio habitable: retícula arquitectónica con grandes vacíos que convierte cada objeto en proyecto. Para interiorismo y mobiliario de autor.',
    highlights: [
      'Titular arquitectónico y cabecera mínima',
      'Retícula que alterna planos panorámicos y columnas',
      'Categoría y orden presentados como metadatos',
      'En móvil, una secuencia vertical que conserva el aire',
    ],
  },
  dintel: {
    summary:
      'El negro como vitrina: logotipo monumental, datos mínimos y ritmo de exposición. Para mobiliario de autor, interiorismo y objeto escultórico.',
    highlights: [
      'Fondo negro y titular a escala extrema',
      'Retícula con piezas de distinto tamaño, como en una sala',
      'Datos de cada pieza en tipografía pequeña y precisa',
      'Fotografía de estudio sobre gris cálido',
    ],
  },
  lumbre: {
    summary:
      'Una revista de interiores hecha tienda: foto cálida a gran escala, filetes finos y titulares con serifa. Para iluminación, cerámica y objeto de autor.',
    highlights: [
      'Portada con fotografía mineral a gran escala',
      'Escenas de casa que muestran el producto en uso',
      'Bloque editorial sobre el tacto y el material',
      'Rejilla de cuatro columnas con filetes finos',
    ],
  },
  mixta: {
    summary:
      'Editorial vivo con cinta lima, manifiesto tipográfico y díptico rostro y cuerpo. Para skincare, bienestar y catálogos que invitan a combinar.',
    highlights: [
      'Portada fotográfica a sangre bajo una cabecera oscura mínima',
      'Cinta lima y manifiesto tipográfico',
      'Díptico «Cuerpo» y «Rostro»',
      'Búsqueda, categorías y orden del catálogo',
    ],
  },
  monte: {
    summary:
      'Nombre y numeración monumentales sobre marfil convierten cada pieza en archivo de oficio. Para marroquinería y producto de autor con pocas referencias.',
    highlights: [
      'Catálogo numerado a tres columnas',
      'Dimensiones y material presentados como bloque editorial',
      'Titular monumental con el nombre de la marca',
      'Zoom suave de imagen que se anula si el visitante pide menos movimiento',
    ],
  },
  sarga: {
    summary:
      'Sastrería contemporánea: campaña en blanco, prenda aislada y un mosaico preciso de filetes finos. Para moda de autor y colecciones de pocas piezas.',
    highlights: [
      'Campaña en blanco con dos modelos en los extremos',
      'Fila de cuatro prendas que en móvil se desliza con el dedo',
      'Mosaico editorial asimétrico',
      'Filtro por prenda, búsqueda y añadir desde la tarjeta',
    ],
  },
  ensamble: {
    summary:
      'Un archivo editorial de mobiliario: fotografía analógica, grandes vacíos y textos técnicos breves. Para estudios de diseño y piezas en serie corta.',
    highlights: [
      'Retícula asimétrica que trata cada pieza como una ficha',
      'Índice, dimensiones y precio junto a cada imagen',
      'Titulares con serifa y etiquetas en monoespaciada',
      'Zoom de imagen que respeta a quien pide menos movimiento',
    ],
  },
  eje: {
    summary:
      'Estudio contemporáneo de tipografía monumental y producto aislado sobre gris lila. Para mobiliario de contract, estudios de producto y espacios colectivos.',
    highlights: [
      'Portada partida entre una escena de reunión y el mensaje',
      'Piezas destacadas que en móvil se deslizan en fila',
      'Diagrama y palabras verticales dibujados sin imágenes extra',
      'Producto aislado con la misma luz y fondo en todas las piezas',
    ],
  },
  arista: {
    summary:
      'Iluminación arquitectónica sobre un blanco radical, con numeración monumental y retícula asimétrica. Para iluminación técnica e interiorismo.',
    highlights: [
      'Rótulo de catálogo y numeración a gran escala',
      'Retícula asimétrica de formatos verticales y panorámicos',
      'Filtro plegable, como una ficha técnica',
      'Ficha de producto con especificaciones técnicas',
    ],
  },
  zancada: {
    summary:
      'Running editorial con portada doble en vídeo, galería de campaña y producto en 360°. Para tiendas de running, moda deportiva y concept stores.',
    highlights: [
      'Portada con dos vídeos en paralelo',
      'Vídeo 360° y galería en la ficha de la zapatilla principal',
      'Elección de talla antes de añadir a la cesta',
      'Filtros por categoría, búsqueda y orden',
    ],
  },
};

/** Temas públicos, en el orden en que los enseña `/temas` (altas recientes primero). */
export const CATALOG_THEMES: readonly DemoTheme[] = newestThemesFirst(
  demoThemes.filter((theme) => theme.id !== defaultTheme.id),
);

export function themeProfile(id: string): ThemeProfile | null {
  return THEME_PROFILES[id] ?? null;
}

export function themePagePath(id: string): string {
  return `/temas/${id}`;
}

/** Nombre para titulares y `<title>`: «Tema Noddo» no repite «Tema». */
export function themeDisplayName(theme: Pick<DemoTheme, 'label'>): string {
  return theme.label.replace(/^Tema\s+/i, '');
}

export function themePageTitle(theme: Pick<DemoTheme, 'label'>): string {
  return `${themeDisplayName(theme)} — tema para tiendas online | Logic2B Ecommerce`;
}

/** Anterior y siguiente en el orden del catálogo, circular. */
export function adjacentThemes(
  id: string,
  themes: readonly DemoTheme[] = CATALOG_THEMES,
): { previous: DemoTheme; next: DemoTheme } | null {
  const index = themes.findIndex((theme) => theme.id === id);
  if (index === -1 || themes.length < 2) return null;
  return {
    previous: themes[(index - 1 + themes.length) % themes.length]!,
    next: themes[(index + 1) % themes.length]!,
  };
}

/**
 * Temas relacionados: primero los que comparten sector, en el orden del
 * catálogo a partir del actual; si no llegan, se completan con los siguientes.
 * El anterior y el siguiente ya tienen su enlace en la ficha: no se repiten
 * mientras quede catálogo suficiente para no hacerlo.
 */
export function relatedThemes(
  id: string,
  count = 3,
  themes: readonly DemoTheme[] = CATALOG_THEMES,
): DemoTheme[] {
  const index = themes.findIndex((theme) => theme.id === id);
  if (index === -1) return [];
  const current = themes[index]!;
  const sectors = new Set(themeCategoryIds(current));
  const adjacent = adjacentThemes(id, themes);
  const skip = new Set(
    adjacent && themes.length - 3 >= count ? [adjacent.previous.id, adjacent.next.id] : [],
  );
  const rotation = [...themes.slice(index + 1), ...themes.slice(0, index)].filter((theme) => !skip.has(theme.id));
  const sameSector = rotation.filter((theme) => themeCategoryIds(theme).some((sector) => sectors.has(sector)));
  const rest = rotation.filter((theme) => !sameSector.includes(theme));
  return [...sameSector, ...rest].slice(0, count);
}

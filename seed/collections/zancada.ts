/** Catálogo y precios originales de logic2b-note; tallas como referencias demo explícitas. */
import type { SeedProduct } from '../products.ts';

import { zancadaModels, zancadaSizeSlug } from '../../src/collections/zancada.ts';

// Cada talla se identifica por slug: el carrito compartido conserva referencia,
// cantidad, precio y nombre sin estado adicional ni un motor de variantes paralelo.
export const zancadaSeedProducts: readonly SeedProduct[] = zancadaModels.flatMap(model =>
  model.sizes.map(size => ({
    collection: 'zancada', slug: zancadaSizeSlug(model, size),
    name: model.brand + ' ' + model.name + ' · ' + size,
    subtitle: model.color, description: model.description + ' Acabado: ' + model.color + '. Talla: ' + size + '. Producto ilustrativo de demostración.',
    price_cents: model.price_cents, stock: size === '36' || size === '46' ? 0 : size === '45⅓' ? 2 : 12,
    category: model.category, image: '/images/collections/zancada/' + model.asset,
    specs: [{ label: 'Marca', value: model.brand }, { label: 'Color', value: model.color }, { label: 'Talla', value: size }],
  }))
);

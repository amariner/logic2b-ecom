/** Catálogo local del tema ARGENT. Slugs namespaceados porque son UNIQUE. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'argent',
});

export const argentSeedProducts: readonly SeedProduct[] = [
  c({
    slug: 'arg-checked-sarong-skirt', name: 'Checked Sarong Skirt',
    description: 'Falda larga de cuadros vino y negro, panel cruzado y bajo de flecos deshilachados.',
    price_cents: 23000, stock: 7, category: 'arg-mujer',
    image: '/images/collections/argent/product-checked-sarong-skirt.webp',
    specs: [{ label: 'Tejido', value: 'Lana y algodón' }, { label: 'Corte', value: 'Panel cruzado' }],
  }),
  c({
    slug: 'arg-black-sleeveless-top', name: 'Black Sleeveless Top',
    description: 'Top negro de hombro extendido, cuello cerrado y silueta escultórica.',
    price_cents: 5700, compare_at_price_cents: 6800, stock: 13, category: 'arg-mujer',
    image: '/images/collections/argent/product-black-sleeveless-top.webp',
    specs: [{ label: 'Tejido', value: 'Punto compacto' }, { label: 'Corte', value: 'Recto' }],
  }),
  c({
    slug: 'arg-grey-flannel-hood', name: 'Grey Flannel Shirt With Hood',
    description: 'Sobrecamisa de franela gris a cuadros con capucha integrada y volumen relajado.',
    price_cents: 29700, stock: 5, category: 'arg-unisex',
    image: '/images/collections/argent/product-grey-flannel-hood.webp',
    specs: [{ label: 'Tejido', value: 'Franela cepillada' }, { label: 'Detalle', value: 'Capucha integrada' }],
  }),
  c({
    slug: 'arg-denim-utility-shirt', name: 'Denim Utility Shirt',
    description: 'Camisa vaquera azul lavado con dos bolsillos de parche y construcción utilitaria.',
    price_cents: 15700, stock: 10, category: 'arg-unisex',
    image: '/images/collections/argent/product-denim-utility-shirt.webp',
    specs: [{ label: 'Tejido', value: 'Denim 12 oz' }, { label: 'Lavado', value: 'Azul medio' }],
  }),
  c({
    slug: 'arg-denim-sarong-skirt', name: 'Blue Denim Sarong Skirt',
    description: 'Falda asimétrica de denim claro, panel envolvente y acabado deconstruido.',
    price_cents: 20700, stock: 4, category: 'arg-archivo',
    image: '/images/collections/argent/product-denim-sarong-skirt.webp',
    specs: [{ label: 'Tejido', value: 'Denim lavado' }, { label: 'Corte', value: 'Asimétrico' }],
  }),
];

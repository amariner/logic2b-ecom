/** Catálogo de Arce. La presentación es propia; el checkout sigue siendo común. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({ ...prod, collection: 'arce' });

export const arceSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'arc-silla-alba', name: 'Butaca Alba', description: 'Roble macizo con ensambles vistos y cuero coñac de grano natural.', price_cents: 68000, stock: 8, category: 'arc-sillas', image: '/images/collections/arce/chair-oak.webp' }),
  c({ slug: 'arc-butaca-luna', name: 'Silla Luna', description: 'Silla de comedor en nogal oscuro, respaldo tallado y asiento de cuero negro.', price_cents: 42000, stock: 12, category: 'arc-sillas', image: '/images/collections/arce/chair-walnut.webp' }),
  c({ slug: 'arc-mesa-horizonte', name: 'Mesa Horizonte', description: 'Mesa de comedor de nogal con tablero fino y estructura de caballete.', price_cents: 124000, stock: 4, category: 'arc-mesas', image: '/images/collections/arce/table-walnut.webp' }),
  c({ slug: 'arc-mesa-pilar', name: 'Mesa Sonora', description: 'Auxiliar de roble con compartimentos abiertos para libros y objetos cotidianos.', price_cents: 39000, stock: 9, category: 'arc-mesas', image: '/images/collections/arce/media-console.webp' }),
  c({ slug: 'arc-sofa-nido', name: 'Butaca Nube', description: 'Volúmenes suaves tapizados en lana arena sobre patas de nogal.', price_cents: 82000, stock: 5, category: 'arc-sillas', image: '/images/collections/arce/room-decor.webp' }),
  c({ slug: 'arc-sofa-canto', name: 'Sofá Canto', description: 'Sofá modular de perfil bajo en tejido chocolate, amplio y sereno.', price_cents: 194000, stock: 3, category: 'arc-sillas', image: '/images/collections/arce/newsletter-room.webp' }),
  c({ slug: 'arc-lampara-vela', name: 'Lámpara Vela', description: 'Luz cálida orientable en un fuste mínimo de acero cepillado.', price_cents: 31200, stock: 14, category: 'arc-iluminacion', image: '/images/collections/arce/lamp-floor.webp' }),
  c({ slug: 'arc-manta-ur', name: 'Mesa Nexo', description: 'Mesa auxiliar escultórica de nogal, tallada como un volumen continuo.', price_cents: 56000, stock: 6, category: 'arc-mesas', image: '/images/collections/arce/table-sculptural.webp' }),
];

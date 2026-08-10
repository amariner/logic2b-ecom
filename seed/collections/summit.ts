/** Catálogo ficticio de SUMMIT. Todos los slugs están namespaceados. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'summit',
});

export const summitSeedProducts: readonly SeedProduct[] = [
  c({
    slug: 'sum-shell-07',
    name: 'Shell 07',
    description: 'Parka alpina de tres capas con capucha de tormenta, costuras selladas y bolsillos de carga protegidos.',
    price_cents: 139000,
    stock: 8,
    category: 'sum-outerwear',
    media: [
      {
        kind: 'image',
        source: '/images/collections/summit/sum-shell-07.webp',
        alt: 'Parka Shell 07 en paisaje alpino',
        focal_x_bps: 5400,
        focal_y_bps: 4200,
        variant_skus: ['SUM-SHELL-07-M'],
      },
      {
        kind: 'image',
        source: '/images/collections/summit/campaign-glacier.webp',
        alt: 'Campaña de SUMMIT sobre un glaciar',
        focal_x_bps: 6200,
        focal_y_bps: 3600,
        variant_skus: ['SUM-SHELL-07-L'],
      },
    ],
    attributes: [
      {
        code: 'construction', label: 'Construcción', value_type: 'text',
        constraints: { minLength: 2, maxLength: 120 }, value: 'Tejido técnico de tres capas',
      },
      {
        code: 'weight', label: 'Peso', value_type: 'number', unit: 'g',
        constraints: { min: 0, max: 2000, step: 1 }, value: 420,
      },
      {
        code: 'waterproof', label: 'Impermeable', value_type: 'boolean', value: true,
      },
      {
        code: 'collection_ref', label: 'Referencia de colección', value_type: 'reference',
        constraints: { allowedPrefixes: ['SUM-'] }, value: 'SUM-AW26',
      },
      {
        code: 'materials', label: 'Materiales', value_type: 'list',
        constraints: { choices: ['polyamide', 'recycled-polyester'], minItems: 1, maxItems: 2 },
        value: ['polyamide', 'recycled-polyester'],
      },
      {
        code: 'weight', label: 'Peso', value_type: 'number', unit: 'g',
        constraints: { min: 0, max: 2000, step: 1 }, value: 435,
        variant_sku: 'SUM-SHELL-07-L',
      },
    ],
    options: [{ name: 'Talla', values: ['S', 'M', 'L'] }],
    variants: [
      { sku: 'SUM-SHELL-07-S', title: 'S', price_cents: 139000, status: 'active', values: { Talla: 'S' } },
      { sku: 'SUM-SHELL-07-M', title: 'M', price_cents: 139000, status: 'active', default: true, values: { Talla: 'M' } },
      { sku: 'SUM-SHELL-07-L', title: 'L', price_cents: 139000, status: 'active', values: { Talla: 'L' } },
    ],
  }),
  c({ slug: 'sum-carbon-ski-set', name: 'Carbon Ski Set', description: 'Esquís de carbono de 178 cm y bastones de aluminio aeronáutico para terreno variable.', price_cents: 265000, stock: 5, category: 'sum-snow' }),
  c({ slug: 'sum-bib-copper', name: 'Bib Copper', description: 'Pantalón técnico de peto con rodillas articuladas, refuerzos y tirantes de cinta color cobre.', price_cents: 118000, stock: 9, category: 'sum-snow' }),
  c({ slug: 'sum-orbit-helmet', name: 'Orbit Helmet', description: 'Casco de esquí de perfil bajo con ventilación regulable, acolchado térmico y cierre magnético.', price_cents: 62000, stock: 12, category: 'sum-accessories' }),
  c({ slug: 'sum-downliner-02', name: 'Downliner 02', description: 'Chaqueta aislante de ripstop reciclado con volumen térmico medio y acabado mate resistente al agua.', price_cents: 89000, stock: 7, category: 'sum-outerwear' }),
  c({ slug: 'sum-ridge-halfzip', name: 'Ridge Half-Zip', description: 'Capa intermedia de punto técnico acanalado con cuello alto y cremalleras protegidas.', price_cents: 46000, stock: 14, category: 'sum-outerwear' }),
  c({ slug: 'sum-flask-750', name: 'Flask 750', description: 'Botella térmica de aluminio anodizado con doble pared, tapón de acero y asa flexible.', price_cents: 14000, stock: 18, category: 'sum-accessories' }),
];

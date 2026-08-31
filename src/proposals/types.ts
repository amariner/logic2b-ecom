import type { CollectionConfig, StorePaths } from '../collections';
import type { DemoShippingConfig } from '../lib/demo-commerce';
import type { DemoThemeVars } from '../lib/demo-themes';

export type ProposalStatus = 'draft' | 'active' | 'archived';

export type ProposalPaths = StorePaths & {
  home: string;
  manager: string;
  managerProducts: string;
  managerOrders: string;
  managerOrder: (reference: string) => string;
  managerEmails: string;
};

export type ProposalConfig = Readonly<{
  id: string;
  publicId: string;
  status: ProposalStatus;
  expiresAt: string | null;
  company: Readonly<{
    name: string;
    sector: string;
    sourceStoreUrl: string;
  }>;
  collection: CollectionConfig;
  paths: ProposalPaths;
  visual: Readonly<{
    label: string;
    themeVars: DemoThemeVars;
  }>;
  demoShipping: DemoShippingConfig;
  contactSource: string;
}>;

export type ProposalResolution =
  | Readonly<{ kind: 'active'; proposal: ProposalConfig }>
  | Readonly<{ kind: 'draft'; proposal: ProposalConfig }>
  | Readonly<{ kind: 'gone'; proposal: ProposalConfig }>
  | Readonly<{ kind: 'missing' }>;

export type ProposalCatalogItem = Readonly<{
  sourceCode: string;
  sourceReference: string;
  slug: string;
  name: string;
  brand: string;
  description: string;
  category: string;
  ean: string | null;
  saleUnit: string;
  recommendedQuantity: number | null;
  dimensionsMm: string | null;
  weightGrams: string | null;
  stockSnapshot: number;
  demoPriceCents: number;
  image: string;
  sourceUrl: string;
  sourceImageUrl: string;
  capturedAt: string;
  specs: readonly Readonly<{ label: string; value: string }>[];
}>;

export type StoreExperienceConfig = Readonly<{
  kind: 'proposal';
  paths: ProposalPaths;
  proposalHomeHref: string;
  managerHref: string;
  themeVars: DemoThemeVars;
  shipping: DemoShippingConfig;
  legal: Readonly<{ shippingNote: string; returnsNote: string }>;
}>;

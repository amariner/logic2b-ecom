import type { CollectionConfig } from '../../collections';
import type { ProposalConfig, StoreExperienceConfig } from '../types';
import { proposalPaths } from '../paths';

export const INLOGEM_PUBLIC_ID = 'inlogem-3a7399641519f1d36a1ea232f309223c';
const paths = proposalPaths(INLOGEM_PUBLIC_ID);

export const inlogemCollection: CollectionConfig = Object.freeze({
  id: 'proposal-inlogem',
  themeId: 'base',
  name: 'INLOGEM',
  tagline: 'Todo para trabajar, estudiar y crear, más fácil',
  description: 'Papelería, tecnología, mobiliario y esenciales para el día a día en una tienda abierta, clara y rápida.',
  categories: [
    { id: 'inl-escritura', label: 'Escritura' },
    { id: 'inl-papel', label: 'Papel' },
    { id: 'inl-archivo', label: 'Archivo' },
    { id: 'inl-tecnologia', label: 'Tecnología' },
    { id: 'inl-mobiliario', label: 'Mobiliario' },
    { id: 'inl-embalaje', label: 'Embalaje' },
    { id: 'inl-escolar', label: 'Escolar' },
    { id: 'inl-servicios', label: 'Higiene y consumo' },
  ],
});

export const inlogemProposal: ProposalConfig = Object.freeze({
  id: 'inlogem',
  publicId: INLOGEM_PUBLIC_ID,
  status: 'active',
  expiresAt: null,
  company: {
    name: 'Inlogem',
    sector: 'Suministros integrales para empresa y oficina',
    sourceStoreUrl: 'https://inlogem.com/tienda',
  },
  collection: inlogemCollection,
  paths,
  visual: {
    label: 'Precisión cercana',
    themeVars: {
      '--color-brand': '#155EEF',
      '--color-brand-dark': '#0B3FB3',
      '--color-brand-fg': '#ffffff',
      '--font-display': "'Poppins', 'Poppins Fallback', Inter, ui-sans-serif, system-ui, sans-serif",
      '--font-accent': "Inter, ui-sans-serif, system-ui, sans-serif",
      '--tracking-display': '-0.045em',
      '--weight-display': '600',
      '--radius-btn': '0.65rem',
      '--radius-card': '1rem',
      '--border-width': '1px',
      '--surface-product': '#F2F5F9',
      '--surface-sunken': '#E9EEF5',
      '--space-density': '0.9',
      '--grid-gap': '1.25rem',
    },
  },
  demoShipping: {
    zones: [{
      id: 'peninsula', label: 'Península',
      postalPrefixes: ['01','02','03','04','05','06','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33','34','36','37','39','40','41','42','43','44','45','46','47','48','49','50'],
    }],
    rates: [{ zone: 'peninsula', label: 'Envío estándar demo', price_cents: 787, free_over_cents: 7260 }],
  },
  contactSource: 'proposal:inlogem',
});

export const inlogemStoreExperience: StoreExperienceConfig = Object.freeze({
  kind: 'proposal',
  paths,
  proposalHomeHref: paths.home,
  managerHref: paths.manager,
  brand: {
    markSrc: '/images/proposals/inlogem/brand-mark.svg',
    wordmark: 'INLOGEM',
    descriptor: 'Papelería y tecnología',
  },
  themeVars: inlogemProposal.visual.themeVars,
  shipping: inlogemProposal.demoShipping,
  legal: {
    shippingNote: 'Condiciones de envío de demostración; se validarán antes de una implantación real.',
    returnsNote: 'Condiciones comerciales y devoluciones por confirmar con Inlogem.',
  },
});

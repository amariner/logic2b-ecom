export type ArchitectureRule =
  | 'domain-technology-import'
  | 'domain-platform-global'
  | 'layer-direction'
  | 'module-dependency'
  | 'module-private-import'
  | 'legacy-inverted-import'
  | 'presentation-sql'
  | 'restricted-sdk-import';

export type ArchitectureException = {
  file: string;
  rule: ArchitectureRule;
  reason: string;
  owner: string;
  removalBlock: string;
};

/**
 * Deuda exacta observada al cerrar R1.1. No admite globs ni directorios.
 * Una infracción nueva debe corregirse; no se añade a esta lista.
 */
export const ARCHITECTURE_ALLOWLIST: readonly ArchitectureException[] = Object.freeze([]);

/**
 * Sello de la línea base: la allowlist puede eliminar claves, no inventarlas.
 * Cambiar este conjunto exige sustituir ADR-0005, no solo hacer pasar el test.
 */
export const R1_1_BASELINE_EXCEPTION_KEYS = [
  'legacy-inverted-import:src/lib/collections.ts',
  'legacy-inverted-import:src/lib/demo-catalog.ts',
  'module-dependency:src/lib/format.ts',
  'module-dependency:src/lib/payment-transition.ts',
  'restricted-sdk-import:src/pages/api/webhooks/stripe.ts',
  'presentation-sql:src/pages/api/admin/backup.sql.ts',
  'presentation-sql:src/pages/api/admin/orders/[id].ts',
  'presentation-sql:src/pages/api/admin/orders/export.csv.ts',
  'presentation-sql:src/pages/api/admin/products/[id].ts',
  'presentation-sql:src/pages/api/admin/shipping-rates/[id].ts',
  'presentation-sql:src/pages/api/checkout/session.ts',
  'presentation-sql:src/pages/api/contact.ts',
  'presentation-sql:src/pages/api/webhooks/stripe.ts',
  'presentation-sql:src/pages/demo/admin/emails.astro',
  'presentation-sql:src/pages/demo/admin/envios.astro',
  'presentation-sql:src/pages/demo/admin/index.astro',
  'presentation-sql:src/pages/demo/admin/pedidos/[id].astro',
  'presentation-sql:src/pages/demo/admin/productos.astro',
] as const;

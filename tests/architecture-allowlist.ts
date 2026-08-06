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
export const ARCHITECTURE_ALLOWLIST = [
  {
    file: 'src/lib/collections.ts',
    rule: 'legacy-inverted-import',
    reason: 'El registro del motor importa colecciones concretas en vez de recibirlas desde composición.',
    owner: 'architecture',
    removalBlock: 'R1.4',
  },
  {
    file: 'src/lib/demo-catalog.ts',
    rule: 'legacy-inverted-import',
    reason: 'El adaptador de demo materializa fixtures mediante imports directos desde seed.',
    owner: 'storefront',
    removalBlock: 'R1.12',
  },
  {
    file: 'src/lib/format.ts',
    rule: 'module-dependency',
    reason: 'El helper compartido obtiene la moneda desde la configuración concreta; retirarlo exige inyectar contexto en presentación y notificaciones.',
    owner: 'architecture',
    removalBlock: 'R1.12',
  },
  {
    file: 'src/lib/payment-transition.ts',
    rule: 'module-dependency',
    reason: 'La transición de pedido construye plantillas de notificación directamente.',
    owner: 'orders',
    removalBlock: 'R1.5',
  },
  {
    file: 'src/pages/api/webhooks/stripe.ts',
    rule: 'restricted-sdk-import',
    reason: 'El adaptador HTTP conoce todavía el tipo de evento del SDK de Stripe.',
    owner: 'payments',
    removalBlock: 'R1.5',
  },
  {
    file: 'src/pages/api/admin/backup.sql.ts',
    rule: 'presentation-sql',
    reason: 'El endpoint compone directamente el dump de D1.',
    owner: 'platform-operations',
    removalBlock: 'R1.4',
  },
  {
    file: 'src/pages/api/admin/orders/[id].ts',
    rule: 'presentation-sql',
    reason: 'El endpoint coordina estado, stock y outbox mediante SQL.',
    owner: 'orders',
    removalBlock: 'R1.5',
  },
  {
    file: 'src/pages/api/admin/orders/export.csv.ts',
    rule: 'presentation-sql',
    reason: 'El endpoint de exportación consulta pedido y líneas directamente.',
    owner: 'fulfillment',
    removalBlock: 'R1.3',
  },
  {
    file: 'src/pages/api/admin/products/[id].ts',
    rule: 'presentation-sql',
    reason: 'El endpoint actualiza catálogo directamente.',
    owner: 'catalog',
    removalBlock: 'R1.3',
  },
  {
    file: 'src/pages/api/admin/shipping-rates/[id].ts',
    rule: 'presentation-sql',
    reason: 'El endpoint actualiza tarifas de fulfillment directamente.',
    owner: 'fulfillment',
    removalBlock: 'R1.3',
  },
  {
    file: 'src/pages/api/checkout/session.ts',
    rule: 'presentation-sql',
    reason: 'El endpoint crea pedido, líneas y evento y consulta productos.',
    owner: 'checkout',
    removalBlock: 'R1.5',
  },
  {
    file: 'src/pages/api/contact.ts',
    rule: 'presentation-sql',
    reason: 'El endpoint persiste y marca la solicitud de proyecto directamente.',
    owner: 'marketing',
    removalBlock: 'R1.3',
  },
  {
    file: 'src/pages/api/webhooks/stripe.ts',
    rule: 'presentation-sql',
    reason: 'El webhook consulta pedido e items antes de aplicar la transición.',
    owner: 'payments',
    removalBlock: 'R1.5',
  },
  {
    file: 'src/pages/demo/admin/emails.astro',
    rule: 'presentation-sql',
    reason: 'La página consulta la bandeja de notificaciones directamente.',
    owner: 'notifications',
    removalBlock: 'R1.3',
  },
  {
    file: 'src/pages/demo/admin/envios.astro',
    rule: 'presentation-sql',
    reason: 'La página consulta tarifas de fulfillment directamente.',
    owner: 'fulfillment',
    removalBlock: 'R1.3',
  },
  {
    file: 'src/pages/demo/admin/index.astro',
    rule: 'presentation-sql',
    reason: 'La página consulta pedidos y conteos directamente.',
    owner: 'orders',
    removalBlock: 'R1.3',
  },
  {
    file: 'src/pages/demo/admin/pedidos/[id].astro',
    rule: 'presentation-sql',
    reason: 'La página consulta pedido, líneas y timeline directamente.',
    owner: 'orders',
    removalBlock: 'R1.3',
  },
  {
    file: 'src/pages/demo/admin/productos.astro',
    rule: 'presentation-sql',
    reason: 'La página consulta catálogo directamente.',
    owner: 'catalog',
    removalBlock: 'R1.3',
  },
] as const satisfies readonly ArchitectureException[];

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

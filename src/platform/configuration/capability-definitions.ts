export const CAPABILITY_IDS = [
  'PLT-001',
  'PLT-004',
  'CAT-001',
  'CAT-002',
  'CAT-003',
  'INV-001',
  'PRC-001',
  'PRC-002',
  'CHK-001',
  'CHK-002',
  'CHK-003',
  'CHK-004',
  'ORD-001',
  'ORD-002',
  'FUL-001',
  'FUL-002',
  'FUL-003',
  'CUS-001',
  'STO-001',
  'STO-002',
  'STO-008',
  'MKT-001',
  'MKT-002',
  'MAR-001',
  'MAR-003',
  'AUT-001',
  'AUT-002',
  'INT-001',
  'INT-002',
  'INT-003',
  'INT-004',
  'SEC-001',
  'SEC-003',
  'SEC-004',
  'SEC-012',
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export type CapabilityDefinition = Readonly<{
  dependencies: readonly CapabilityId[];
}>;

/**
 * Dependencias operativas, no imports físicos. R1.4 añadirá el descriptor de
 * módulo; este mapa solo permite validar combinaciones del manifest de R1.2.
 */
export const CAPABILITY_DEFINITIONS: Readonly<Record<CapabilityId, CapabilityDefinition>> = {
  'PLT-001': { dependencies: [] },
  'PLT-004': { dependencies: ['PLT-001'] },
  'CAT-001': { dependencies: ['PLT-004'] },
  'CAT-002': { dependencies: ['CAT-001'] },
  'CAT-003': { dependencies: ['CAT-001'] },
  'INV-001': { dependencies: ['CAT-001'] },
  'PRC-001': { dependencies: ['CAT-001', 'MKT-001'] },
  'PRC-002': { dependencies: ['PRC-001'] },
  'CHK-001': { dependencies: ['CAT-001'] },
  'CHK-002': { dependencies: ['CHK-001', 'CAT-001', 'INV-001', 'PRC-001', 'FUL-001'] },
  'CHK-003': { dependencies: ['CHK-002', 'CUS-001', 'ORD-001', 'INT-001'] },
  'CHK-004': { dependencies: ['CHK-003', 'INV-001', 'ORD-002', 'AUT-002', 'INT-001'] },
  'ORD-001': { dependencies: ['PRC-001', 'CUS-001'] },
  'ORD-002': { dependencies: ['ORD-001'] },
  'FUL-001': { dependencies: ['PRC-001', 'MKT-002'] },
  'FUL-002': { dependencies: ['ORD-002', 'MAR-003'] },
  'FUL-003': { dependencies: ['ORD-001'] },
  'CUS-001': { dependencies: ['PLT-004'] },
  'STO-001': { dependencies: ['CAT-001', 'PRC-001', 'SEC-012'] },
  'STO-002': { dependencies: ['CAT-002', 'STO-001'] },
  'STO-008': { dependencies: ['CAT-001', 'STO-001'] },
  'MKT-001': { dependencies: ['PLT-004'] },
  'MKT-002': { dependencies: ['PLT-004'] },
  'MAR-001': { dependencies: ['SEC-003', 'SEC-004'] },
  'MAR-003': { dependencies: ['AUT-002'] },
  'AUT-001': { dependencies: ['ORD-002'] },
  'AUT-002': { dependencies: ['PLT-004'] },
  'INT-001': { dependencies: ['PLT-004'] },
  'INT-002': { dependencies: ['MAR-003'] },
  'INT-003': { dependencies: ['FUL-003'] },
  'INT-004': { dependencies: ['SEC-001'] },
  'SEC-001': { dependencies: ['PLT-004'] },
  'SEC-003': { dependencies: ['PLT-004'] },
  'SEC-004': { dependencies: ['PLT-004'] },
  'SEC-012': { dependencies: ['PLT-004'] },
};

export type CapabilityConfigById = {
  'PLT-004': Readonly<{ failFast: true }>;
  'FUL-001': Readonly<{ strategy: 'flat-zone'; supportsFreeThreshold: boolean }>;
  'MKT-001': Readonly<{ currency: 'EUR' }>;
  'MKT-002': Readonly<{ country: 'ES'; resolver: 'postal-prefix' }>;
  'MAR-003': Readonly<{ demoDelivery: 'outbox'; clientDelivery: 'provider' }>;
  'INT-001': Readonly<{
    provider: 'stripe-checkout';
    secretRefs: readonly ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
  }>;
  'INT-002':
    | Readonly<{ provider: 'resend'; delivery: 'capture' }>
    | Readonly<{ provider: 'resend'; delivery: 'send'; secretRef: 'RESEND_API_KEY' }>;
};

export type ConfiguredCapabilityId = keyof CapabilityConfigById;

export const CONFIGURED_CAPABILITY_IDS = [
  'PLT-004',
  'FUL-001',
  'MKT-001',
  'MKT-002',
  'MAR-003',
  'INT-001',
  'INT-002',
] as const satisfies readonly ConfiguredCapabilityId[];

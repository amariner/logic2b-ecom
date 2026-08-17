import {
  createD1CustomerProfileRepository,
  customerEmailIdentityHash,
  customerOrderAssociation,
  type CustomerOrderAssociation,
} from '../modules/customers';

export type CheckoutCustomerProfileInput = Readonly<{
  db: D1Database;
  enabled: boolean;
  email: string;
  identitySecret?: string;
  at: string;
  profileIdFactory?: () => string;
}>;

/**
 * Opt-in interno de checkout. Ausencia de capacidad/secreto o una identidad en
 * revisión conserva el resultado guest; el cliente nunca recibe si hubo alta
 * o reutilización de perfil.
 */
export async function resolveCheckoutCustomerProfile(
  input: CheckoutCustomerProfileInput,
): Promise<CustomerOrderAssociation> {
  if (!input.enabled || input.identitySecret === undefined || input.identitySecret.length === 0) {
    return customerOrderAssociation(null);
  }
  const profileId = (input.profileIdFactory ?? (() => `cus_${crypto.randomUUID()}`))();
  const identityHash = await customerEmailIdentityHash(input.email, input.identitySecret);
  const resolution = await createD1CustomerProfileRepository(input.db).resolveOrCreate({
    profileId,
    email: input.email,
    emailIdentityHash: identityHash,
    at: input.at,
  });
  if (resolution.action === 'create') return customerOrderAssociation(profileId);
  if (resolution.action === 'link_existing') {
    return customerOrderAssociation(resolution.profile.id);
  }
  return customerOrderAssociation(null);
}

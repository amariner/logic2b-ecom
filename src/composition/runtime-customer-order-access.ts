import type { CustomerOrderAccessHttp } from '../modules/customers/presentation/customer-order-access-http';
import { createD1CustomerAuthenticationRepository } from '../modules/customers/infrastructure/d1-customer-authentication-repository';
import {
  createD1CustomerOrderOwnershipReader,
  createD1CustomerOwnedOrderReader,
} from '../modules/customers/infrastructure/d1-customer-resource-ownership-reader';
import { passwordlessProofDigest } from '../modules/customers/infrastructure/passwordless-web-crypto';
import type { CustomerOwnershipSubject } from '../modules/customers/domain/resource-ownership';
import type { Platform } from './create-platform';
import { createCustomerOrderAccessHttp, type CustomerOrderAccessMetric } from './customer-order-access-http';
import { createCustomerResourceAuthorizer } from './customer-resource-authorization';
import { runtimePlatform } from './runtime-platform';

export const customerOrderAccessRuntimeObservability = Object.freeze({
  count(metric: CustomerOrderAccessMetric): void {
    console.info(JSON.stringify({
      schema: 'logic2b.observability.v1',
      kind: 'metric',
      metric: 'customer.order_access',
      ...metric,
    }));
  },
});

export type RuntimeCustomerOrderAccessOptions = Readonly<{
  platform?: Platform;
  now?: () => string;
  observability?: Readonly<{ count(metric: CustomerOrderAccessMetric): void }>;
}>;

/**
 * Compone lectura de pedidos sin provider, secretos de email ni Resend. Los
 * dos gates deben estar activos y CUS-003 debe conservar readiness durable.
 */
export async function createRuntimeCustomerOrderAccessHttp(
  env: Env,
  options: RuntimeCustomerOrderAccessOptions = {},
): Promise<CustomerOrderAccessHttp | null> {
  const platform = options.platform ?? runtimePlatform;
  if (!platform.isCapabilityActive('CUS-003') || !platform.isCapabilityActive('CUS-004')) {
    return null;
  }
  const authentication = createD1CustomerAuthenticationRepository(env.DB);
  const readiness = await authentication.customerAuthCapabilityReadiness();
  if (readiness.state !== 'active' || !readiness.readyForActiveRuntime) {
    throw new Error('CUS-003 no dispone de una activación durable válida.');
  }
  const subject = async (sessionToken: string, at: string): Promise<CustomerOwnershipSubject | null> => {
    let digest: string;
    try {
      digest = await passwordlessProofDigest(sessionToken);
    } catch {
      return null;
    }
    const context = await authentication.activeSessionContextByTokenDigest(digest, at);
    if (context === null) return null;
    return Object.freeze({
      session: Object.freeze({
        id: context.session.id,
        identityId: context.session.identityId,
        customerProfileId: context.session.customerProfileId,
        status: context.session.status,
        scopes: context.session.scopes,
      }),
      identity: Object.freeze({
        id: context.identity.id,
        customerProfileId: context.identity.customerProfileId,
        status: context.identity.status,
      }),
      profile: Object.freeze({
        id: context.profile.id,
        status: context.profile.status,
        mergedIntoProfileId: null,
      }),
    });
  };
  const ownership = createD1CustomerOrderOwnershipReader(env.DB);
  return createCustomerOrderAccessHttp({
    sessionSubject: subject,
    authorizer: createCustomerResourceAuthorizer(ownership),
    orders: createD1CustomerOwnedOrderReader(env.DB),
    activeCapabilities: ['CUS-004'],
    grantedScopes: ['customer:orders:read'],
    observability: options.observability ?? customerOrderAccessRuntimeObservability,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}

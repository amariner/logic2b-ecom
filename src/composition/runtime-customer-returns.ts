import { createCustomerReturnHttp, type CustomerReturnMetric } from './customer-return-http';
import { createCustomerReturnRequestService } from './customer-return-request-service';
import type { Platform } from './create-platform';
import { resolveCustomerPasswordlessRuntimeConfiguration } from './customer-passwordless-config';
import { runtimePlatform } from './runtime-platform';
import { createD1CustomerAuthenticationRepository } from '../modules/customers/infrastructure/d1-customer-authentication-repository';
import { createD1CustomerReturnRequestRepository } from '../modules/customers/infrastructure/d1-customer-return-request-repository';
import {
  customerSessionCsrfToken,
  passwordlessProofDigest,
  verifyCustomerSessionCsrfToken,
} from '../modules/customers/infrastructure/passwordless-web-crypto';
import type { CustomerOwnershipSubject } from '../modules/customers/domain/resource-ownership';
import type { CustomerReturnHttp } from '../modules/customers/presentation/customer-return-http';

export const customerReturnRuntimeObservability = Object.freeze({
  count(metric: CustomerReturnMetric): void {
    console.info(JSON.stringify({ schema: 'logic2b.observability.v1', kind: 'metric',
      metric: 'customer.return_access', ...metric }));
  },
});

export type RuntimeCustomerReturnOptions = Readonly<{
  platform?: Platform;
  now?: () => string;
  idFactory?: () => string;
  observability?: Readonly<{ count(metric: CustomerReturnMetric): void }>;
}>;

export async function createRuntimeCustomerReturnHttp(
  env: Env,
  options: RuntimeCustomerReturnOptions = {},
): Promise<CustomerReturnHttp | null> {
  const platform = options.platform ?? runtimePlatform;
  if (!platform.isCapabilityActive('CUS-003') || !platform.isCapabilityActive('CUS-005')) return null;
  const configuration = resolveCustomerPasswordlessRuntimeConfiguration(platform, env);
  if (configuration === null) throw new Error('Configuración CUS-003 no disponible.');
  const authentication = createD1CustomerAuthenticationRepository(env.DB);
  const readiness = await authentication.customerAuthCapabilityReadiness();
  if (readiness.state !== 'active' || !readiness.readyForActiveRuntime) {
    throw new Error('CUS-003 no dispone de una activación durable válida.');
  }
  return createCustomerReturnHttp({
    async sessionContext(sessionToken, at) {
      let digest: string;
      try { digest = await passwordlessProofDigest(sessionToken); } catch { return null; }
      const context = await authentication.activeSessionContextByTokenDigest(digest, at);
      if (context === null) return null;
      const subject: CustomerOwnershipSubject = Object.freeze({
        session: Object.freeze({ id: context.session.id, identityId: context.session.identityId,
          customerProfileId: context.session.customerProfileId, status: context.session.status,
          scopes: context.session.scopes }),
        identity: Object.freeze({ id: context.identity.id,
          customerProfileId: context.identity.customerProfileId, status: context.identity.status }),
        profile: Object.freeze({ id: context.profile.id, status: context.profile.status,
          mergedIntoProfileId: null }),
      });
      const csrfSubject = { sessionId: context.session.id, generation: context.session.generation };
      return Object.freeze({ subject,
        csrfToken: await customerSessionCsrfToken(configuration.csrfSecret, csrfSubject),
        verifyCsrf(token: string) {
          return verifyCustomerSessionCsrfToken(configuration.csrfSecret, csrfSubject, token);
        } });
    },
    returns: createCustomerReturnRequestService(
      createD1CustomerReturnRequestRepository(env.DB), options.idFactory),
    activeCapabilities: ['CUS-005'],
    grantedScopes: ['customer:returns:read', 'customer:returns:create'],
    expectedOrigin: configuration.origin,
    ordersAvailable: platform.isCapabilityActive('CUS-004') &&
      platform.hasCapabilityFlag('CUS-004', 'routes'),
    addressesAvailable: platform.isCapabilityActive('CUS-006') &&
      platform.hasCapabilityFlag('CUS-006', 'routes'),
    observability: options.observability ?? customerReturnRuntimeObservability,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}

import type { CustomerAddressHttp } from '../modules/customers/presentation/customer-address-http';
import {
  createD1CustomerAddressOwnershipReader,
} from '../modules/customers/infrastructure/d1-customer-resource-ownership-reader';
import { createD1CustomerAddressRepository } from '../modules/customers/infrastructure/d1-customer-address-repository';
import { createCustomerAddressService } from '../modules/customers/application/customer-address-service';
import { createD1CustomerAuthenticationRepository } from '../modules/customers/infrastructure/d1-customer-authentication-repository';
import {
  customerSessionCsrfToken,
  passwordlessProofDigest,
  verifyCustomerSessionCsrfToken,
} from '../modules/customers/infrastructure/passwordless-web-crypto';
import type { CustomerOwnershipSubject } from '../modules/customers/domain/resource-ownership';
import type { Platform } from './create-platform';
import { createCustomerAddressHttp, type CustomerAddressMetric } from './customer-address-http';
import { createCustomerResourceAuthorizer } from './customer-resource-authorization';
import { resolveCustomerPasswordlessRuntimeConfiguration } from './customer-passwordless-config';
import { runtimePlatform } from './runtime-platform';

export const customerAddressRuntimeObservability = Object.freeze({
  count(metric: CustomerAddressMetric): void {
    console.info(JSON.stringify({
      schema: 'logic2b.observability.v1', kind: 'metric',
      metric: 'customer.address_access', ...metric,
    }));
  },
});

export type RuntimeCustomerAddressOptions = Readonly<{
  platform?: Platform;
  now?: () => string;
  observability?: Readonly<{ count(metric: CustomerAddressMetric): void }>;
  addressIdFactory?: () => string;
}>;

export async function createRuntimeCustomerAddressHttp(
  env: Env,
  options: RuntimeCustomerAddressOptions = {},
): Promise<CustomerAddressHttp | null> {
  const platform = options.platform ?? runtimePlatform;
  if (!platform.isCapabilityActive('CUS-003') || !platform.isCapabilityActive('CUS-006')) {
    return null;
  }
  const configuration = resolveCustomerPasswordlessRuntimeConfiguration(platform, env);
  if (configuration === null) throw new Error('Configuración CUS-003 no disponible.');
  const authentication = createD1CustomerAuthenticationRepository(env.DB);
  const readiness = await authentication.customerAuthCapabilityReadiness();
  if (readiness.state !== 'active' || !readiness.readyForActiveRuntime) {
    throw new Error('CUS-003 no dispone de una activación durable válida.');
  }
  return createCustomerAddressHttp({
    async sessionContext(sessionToken, at) {
      let digest: string;
      try {
        digest = await passwordlessProofDigest(sessionToken);
      } catch {
        return null;
      }
      const context = await authentication.activeSessionContextByTokenDigest(digest, at);
      if (context === null) return null;
      const subject: CustomerOwnershipSubject = Object.freeze({
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
      const csrfSubject = { sessionId: context.session.id, generation: context.session.generation };
      return Object.freeze({
        subject,
        csrfToken: await customerSessionCsrfToken(configuration.csrfSecret, csrfSubject),
        verifyCsrf(token: string) {
          return verifyCustomerSessionCsrfToken(configuration.csrfSecret, csrfSubject, token);
        },
      });
    },
    authorizer: createCustomerResourceAuthorizer(createD1CustomerAddressOwnershipReader(env.DB)),
    addresses: createCustomerAddressService(
      createD1CustomerAddressRepository(env.DB),
      options.addressIdFactory,
    ),
    activeCapabilities: ['CUS-006'],
    grantedScopes: ['customer:addresses:read', 'customer:addresses:write'],
    ordersAvailable: platform.isCapabilityActive('CUS-004') &&
      platform.hasCapabilityFlag('CUS-004', 'routes'),
    observability: options.observability ?? customerAddressRuntimeObservability,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}

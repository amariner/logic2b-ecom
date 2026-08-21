import { describe, expect, it } from 'vitest';
import {
  customerOwnedWritePrecondition,
  customerResourceAccessDecision,
  customerResourcePublicDenial,
  customerResourceTarget,
  type CustomerOwnershipSubject,
  type CustomerResourceAccessRequest,
  type CustomerResourceOwnership,
} from '../src/modules/customers';

const ORDER = customerResourceTarget('order', 'ord_abcdefghijklmnopqrstuv');
const ADDRESS = customerResourceTarget('address', 'addr_abcdefghijklmnopqrstuv');
const RETURN = customerResourceTarget('return', 'ret_abcdefghijklmnopqrstuv');

function subject(overrides: Partial<CustomerOwnershipSubject> = {}): CustomerOwnershipSubject {
  return {
    session: {
      id: 'customer_session:1', identityId: 'auth_identity:1',
      customerProfileId: 'customer_profile:1', status: 'active', scopes: ['customer:self'],
    },
    identity: {
      id: 'auth_identity:1', customerProfileId: 'customer_profile:1', status: 'active',
    },
    profile: {
      id: 'customer_profile:1', status: 'active', mergedIntoProfileId: null,
    },
    ...overrides,
  };
}

function ownership(
  target = ORDER,
  overrides: Partial<CustomerResourceOwnership> = {},
): CustomerResourceOwnership {
  return { target, ownerProfileId: 'customer_profile:1', state: 'owned', version: 3, ...overrides };
}

function request(
  overrides: Partial<CustomerResourceAccessRequest> = {},
): CustomerResourceAccessRequest {
  return {
    action: 'orders:read',
    target: ORDER,
    subject: subject(),
    activeCapabilities: ['CUS-004'],
    grantedScopes: ['customer:orders:read'],
    ownership: ownership(),
    ...overrides,
  };
}

describe('R5.5a ownership y permisos mínimos de autoservicio', () => {
  it('exige referencias públicas opacas y nunca acepta ids internos o datos enumerables', () => {
    expect(ORDER).toEqual({ kind: 'order', publicRef: 'ord_abcdefghijklmnopqrstuv' });
    for (const ref of ['42', 'ORDER-2026-0001', 'client@example.com', 'ord_short']) {
      expect(() => customerResourceTarget('order', ref)).toThrow(/opaca/u);
    }
    expect(() => customerResourceTarget('address', ORDER.publicRef)).toThrow(/opaca/u);
  });

  it('customer:self no concede acceso sin gate, scope y ownership coincidente', () => {
    expect(customerResourceAccessDecision(request())).toMatchObject({
      allowed: true, capability: 'CUS-004', requiredScope: 'customer:orders:read',
      ownerProfileId: 'customer_profile:1', ownershipVersion: 3,
    });
    expect(customerResourceAccessDecision(request({ activeCapabilities: [] })))
      .toMatchObject({ allowed: false, auditReason: 'capability_inactive' });
    expect(customerResourceAccessDecision(request({ grantedScopes: [] })))
      .toMatchObject({ allowed: false, auditReason: 'missing_resource_scope' });
    expect(customerResourceAccessDecision(request({ ownership: ownership(ORDER, {
      ownerProfileId: 'customer_profile:other',
    }) }))).toMatchObject({ allowed: false, auditReason: 'owner_mismatch' });
  });

  it('deniega perfiles fusionados, identidades revocadas y sujetos incoherentes', () => {
    expect(customerResourceAccessDecision(request({ subject: subject({
      profile: { id: 'customer_profile:1', status: 'merged',
        mergedIntoProfileId: 'customer_profile:target' },
    }) }))).toMatchObject({ allowed: false, auditReason: 'inactive_profile' });
    expect(customerResourceAccessDecision(request({ subject: subject({
      identity: { id: 'auth_identity:1', customerProfileId: 'customer_profile:1', status: 'revoked' },
    }) }))).toMatchObject({ allowed: false, auditReason: 'inactive_identity' });
    expect(customerResourceAccessDecision(request({ subject: subject({
      session: { ...subject().session, customerProfileId: 'customer_profile:other' },
    }) }))).toMatchObject({ allowed: false, auditReason: 'incoherent_subject' });
  });

  it('no reclama pedidos guest ni recursos históricos por coincidencia de email', () => {
    const guest = ownership(ORDER, { ownerProfileId: null, state: 'guest' });
    expect(customerResourceAccessDecision(request({ ownership: guest })))
      .toMatchObject({ allowed: false, auditReason: 'resource_unowned' });
    expect(JSON.stringify(request({ ownership: guest }))).not.toMatch(/email|address_json|order_number/u);
  });

  it('separa los permisos de pedidos, devoluciones y direcciones', () => {
    const cases: readonly [CustomerResourceAccessRequest['action'], typeof ORDER, string, string][] = [
      ['orders:track', ORDER, 'CUS-004', 'customer:orders:read'],
      ['returns:read', RETURN, 'CUS-005', 'customer:returns:read'],
      ['returns:create', ORDER, 'CUS-005', 'customer:returns:create'],
      ['addresses:read', ADDRESS, 'CUS-006', 'customer:addresses:read'],
      ['addresses:write', ADDRESS, 'CUS-006', 'customer:addresses:write'],
    ];
    for (const [action, target, capability, scope] of cases) {
      const decision = customerResourceAccessDecision(request({
        action,
        target,
        activeCapabilities: [capability as 'CUS-004' | 'CUS-005' | 'CUS-006'],
        grantedScopes: [scope as 'customer:orders:read'],
        ownership: ownership(target),
      }));
      expect(decision).toMatchObject({ allowed: true, capability, requiredScope: scope });
    }
    expect(customerResourceAccessDecision(request({
      action: 'returns:create', target: RETURN,
      activeCapabilities: ['CUS-005'], grantedScopes: ['customer:returns:create'],
      ownership: ownership(RETURN),
    }))).toMatchObject({ allowed: false, auditReason: 'invalid_action_target' });
  });

  it('produce una precondición CAS para que la mutación revalide ownership', () => {
    const allowed = customerResourceAccessDecision(request());
    expect(customerOwnedWritePrecondition(allowed)).toEqual({
      capability: 'CUS-004', scope: 'customer:orders:read', target: ORDER,
      ownerProfileId: 'customer_profile:1', expectedOwnershipVersion: 3,
    });
    expect(() => customerOwnedWritePrecondition(customerResourceAccessDecision(request({
      ownership: null,
    })))).toThrow(/denegación/u);
  });

  it('devuelve la misma forma pública para ausencia, owner ajeno y sesión inválida', () => {
    const decisions = [
      customerResourceAccessDecision(request({ ownership: null })),
      customerResourceAccessDecision(request({ ownership: ownership(ORDER, {
        ownerProfileId: 'customer_profile:other',
      }) })),
      customerResourceAccessDecision(request({ subject: subject({
        session: { ...subject().session, status: 'revoked' },
      }) })),
    ];
    expect(new Set(decisions.map((decision) => decision.allowed
      ? 'allowed'
      : JSON.stringify({ status: 404, code: decision.publicCode })))).toEqual(
      new Set([JSON.stringify(customerResourcePublicDenial())]),
    );
  });
});

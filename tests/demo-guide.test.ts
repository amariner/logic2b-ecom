import { describe, expect, it } from 'vitest';
import { collections, storePaths } from '../src/collections';
import { getDemoProducts } from '../src/composition/demo-catalog';
import { readGuideState, type GuideStore } from '../src/modules/demo-support/presentation/guide/state';
import { guideStepIndex, guideSteps } from '../src/modules/demo-support/presentation/guide/steps';
import { guideCartWithSample } from '../src/modules/demo-support/presentation/guide/cart';

const arce: GuideStore = {
  id: 'arce', name: 'ARCE', catalog: '/demo/tiendas/arce', product: '/demo/tiendas/arce/arc-butaca-alba',
  cart: '/demo/tiendas/arce/carrito', checkout: '/demo/tiendas/arce/checkout', thanks: '/demo/tiendas/arce/gracias',
};

describe('public demo assistant', () => {
  it('prepares one sample without increasing its quantity on back/forward or replacing existing items', () => {
    const sample = 'tra-mesa-rasante';
    const other = [{ slug: 'tra-jarron-caliza', qty: 2 }];
    const prepared = guideCartWithSample(other, sample);
    expect(prepared).toEqual([...other, { slug: sample, qty: 1 }]);
    expect(other).toEqual([{ slug: 'tra-jarron-caliza', qty: 2 }]);
    expect(guideCartWithSample(prepared, sample)).toEqual(prepared);
    expect(guideCartWithSample([{ slug: sample, qty: 3 }], sample)).toEqual([{ slug: sample, qty: 3 }]);
    expect(guideCartWithSample([], sample)).toEqual([{ slug: sample, qty: 1 }]);
  });
  it('recovers from missing or damaged session storage', () => {
    for (const raw of [null, '{', 'null', '4', '{}']) {
      expect(readGuideState(raw, arce)).toEqual({ status: 'active', store: arce });
    }
  });
  it('preserves dismissal and the store across login and panel navigation', () => {
    for (const status of ['active', 'minimized', 'closed', 'complete']) {
      expect(readGuideState(JSON.stringify({ status, store: arce }), { ...arce, name: 'Fallback' }))
        .toEqual({ status, store: arce });
    }
  });
  it('rejects altered routes and untrusted destinations in stored progress', () => {
    for (const patch of [{ catalog: 'https://example.com' }, { cart: '//example.com' },
      { product: '/demo/tiendas/arce/../../api/demo/reset' }, { checkout: '/api/checkout/session' }, { name: 5 }]) {
      expect(readGuideState(JSON.stringify({ status: 'closed', store: { ...arce, ...patch } }), arce))
        .toEqual({ status: 'closed', store: arce });
    }
    expect(readGuideState(JSON.stringify({ status: 'active', store: arce, orderHref: '/api/demo/reset' }), arce).orderHref).toBeUndefined();
    expect(readGuideState(JSON.stringify({ status: 'active', store: arce, orderHref: '/demo/admin/pedidos/DEMO-1001' }), arce).orderHref).toBe('/demo/admin/pedidos/DEMO-1001');
  });
  it('uses the registered product and commerce paths in every demo, including historical URLs', () => {
    for (const collection of collections) {
      const paths = storePaths(collection.id);
      const product = getDemoProducts(collection.id)[0];
      expect(product, collection.id).toBeDefined();
      const store = { id: collection.id, name: collection.name, ...paths, product: paths.product(product!.slug) };
      expect(readGuideState(JSON.stringify({ status: 'active', store }), arce).store).toEqual(store);
      expect(guideSteps(store).map((step) => step.href).slice(0, 4))
        .toEqual([paths.catalog, paths.product(product!.slug), paths.cart, paths.checkout]);
      expect(guideStepIndex(`${paths.catalog}/`, store)).toBe(0);
      expect(guideStepIndex(paths.product(product!.slug), store)).toBe(1);
      expect(guideStepIndex(paths.cart, store)).toBe(2);
      expect(guideStepIndex(paths.checkout, store)).toBe(3);
      expect(guideStepIndex(paths.thanks, store)).toBe(4);
    }
  });
  it('follows free navigation through the manager without pretending to create orders', () => {
    expect(guideStepIndex('/demo/admin/login', arce)).toBe(5);
    expect(guideStepIndex('/demo/admin', arce)).toBe(5);
    expect(guideStepIndex('/demo/admin/pedidos/DEMO-1001', arce)).toBe(6);
    expect(guideStepIndex('/demo/admin/envios', arce)).toBe(7);
    expect(guideStepIndex('/demo/admin/emails', arce)).toBe(8);
    expect(guideStepIndex('/demo/admin/productos', arce)).toBe(9);
    expect(guideStepIndex('/demo/admin/devoluciones', arce)).toBe(5);
    expect(guideSteps(arce)[5]!.description).toContain('independientes');
  });
});

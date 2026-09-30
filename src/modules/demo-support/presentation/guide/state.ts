/** Estado efímero de la guía pública; nunca comparte datos con el motor. */
export const GUIDE_STORAGE_KEY = 'logic2b:ecom-guide:v1';
export type GuideStatus = 'active' | 'minimized' | 'closed' | 'complete';
export interface GuideStore {
  id: string;
  name: string;
  catalog: string;
  product: string;
  cart: string;
  checkout: string;
  thanks: string;
}
export interface GuideState { status: GuideStatus; store: GuideStore; orderHref?: string }

export function readGuideState(raw: string | null, fallback: GuideStore): GuideState {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object') return { status: 'active', store: fallback };
    const candidate = value as Partial<GuideState>;
    const status = ['active', 'minimized', 'closed', 'complete'].includes(candidate.status ?? '')
      ? candidate.status! : 'active';
    const store = candidate.store;
    if (!store || typeof store.id !== 'string' || !/^[a-z0-9-]+$/.test(store.id)
      || typeof store.name !== 'string' || store.name.length > 100) return { status, store: fallback };
    const catalog = store.id === 'demo' ? '/demo/tienda' : `/demo/tiendas/${store.id}`;
    const commerceBase = store.id === 'demo' ? '/demo' : catalog;
    const valid = store.catalog === catalog && store.cart === `${commerceBase}/carrito`
      && store.checkout === `${commerceBase}/checkout` && store.thanks === `${commerceBase}/gracias`
      && typeof store.product === 'string' && store.product.startsWith(`${catalog}/`)
      && /^[a-z0-9-]+$/.test(store.product.slice(catalog.length + 1));
    const orderHref = typeof candidate.orderHref === 'string' && /^\/demo\/admin\/pedidos\/[a-zA-Z0-9_-]+$/.test(candidate.orderHref)
      ? candidate.orderHref : undefined;
    return { status, store: valid ? store : fallback, ...(orderHref ? { orderHref } : {}) };
  } catch {
    return { status: 'active', store: fallback };
  }
}

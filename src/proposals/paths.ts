import type { ProposalPaths } from './types';

export function proposalPaths(publicId: string): ProposalPaths {
  const home = `/propuestas/${publicId}`;
  const catalog = `${home}/tienda`;
  const manager = `${home}/gestor`;
  return Object.freeze({
    home,
    catalog,
    product: (slug: string) => `${catalog}/${slug}`,
    cart: `${catalog}/carrito`,
    checkout: `${catalog}/checkout`,
    thanks: `${catalog}/gracias`,
    manager,
    managerProducts: `${manager}/productos`,
    managerOrders: `${manager}/pedidos`,
    managerOrder: (reference: string) => `${manager}/pedidos/${reference}`,
    managerEmails: `${manager}/emails`,
  });
}

import { inlogemCatalog } from './catalog';

export type DemoOrderStatus = 'Nuevo' | 'Preparación' | 'Enviado' | 'Entregado';
export type DemoOrder = Readonly<{
  reference: string;
  date: string;
  company: string;
  contact: string;
  email: string;
  status: DemoOrderStatus;
  lines: readonly Readonly<{ slug: string; name: string; reference: string; quantity: number; unitPriceCents: number }>[];
  shippingCents: number;
  totalCents: number;
}>;

const companies = [
  ['Aula Norte Servicios', 'Eva Martín'], ['Taller 38', 'Rafael Soler'],
  ['Clínica Horizonte', 'Nora Gil'], ['Estudio Nexo', 'Alba Ferrer'],
  ['Gestión Álamo', 'Pau Domènech'], ['Círculo Legal', 'Sara Rubio'],
  ['Ribera Cowork', 'Jon Vidal'], ['Fundación Arce', 'Marta Rey'],
  ['Laboratorio Beta', 'Luis Costa'], ['Hotel Llevant', 'Inés Puig'],
  ['Academia Prisma', 'Óscar Marín'], ['Obras Delta', 'Carla Cano'],
] as const;
const statuses: readonly DemoOrderStatus[] = ['Nuevo', 'Preparación', 'Enviado', 'Entregado'];

export const inlogemDemoOrders: readonly DemoOrder[] = Object.freeze(companies.map(([company, contact], index) => {
  const items = [inlogemCatalog[index * 3]!, inlogemCatalog[index * 3 + 1]!, inlogemCatalog[index * 3 + 2]!];
  const lines = items.map((item, lineIndex) => ({
    slug: item.slug,
    name: item.name,
    reference: item.sourceReference,
    quantity: ((index + lineIndex) % 4) + 1,
    unitPriceCents: item.demoPriceCents,
  }));
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
  const shippingCents = subtotal >= 7260 ? 0 : 787;
  return Object.freeze({
    reference: `INL-DEMO-${String(1200 + index)}`,
    date: `2026-08-${String(28 - index).padStart(2, '0')}`,
    company,
    contact,
    email: `${contact.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@cliente.example`,
    status: statuses[index % statuses.length]!,
    lines,
    shippingCents,
    totalCents: subtotal + shippingCents,
  });
}));

export const inlogemDemoEmails = Object.freeze([
  { id: 'mail-01', subject: 'Pedido INL-DEMO-1200 recibido', recipient: 'eva.martin@cliente.example', kind: 'Confirmación', sentAt: '31 ago · 09:42' },
  { id: 'mail-02', subject: 'Tu pedido está en preparación', recipient: 'rafael.soler@cliente.example', kind: 'Estado', sentAt: '31 ago · 09:07' },
  { id: 'mail-03', subject: 'Pedido INL-DEMO-1202 enviado', recipient: 'nora.gil@cliente.example', kind: 'Envío', sentAt: '30 ago · 17:34' },
  { id: 'mail-04', subject: 'Resumen de pedido INL-DEMO-1203', recipient: 'alba.ferrer@cliente.example', kind: 'Confirmación', sentAt: '30 ago · 16:18' },
  { id: 'mail-05', subject: 'Entrega completada', recipient: 'pau.domenech@cliente.example', kind: 'Entrega', sentAt: '30 ago · 12:03' },
  { id: 'mail-06', subject: 'Pedido INL-DEMO-1205 recibido', recipient: 'sara.rubio@cliente.example', kind: 'Confirmación', sentAt: '29 ago · 18:11' },
] as const);

export function inlogemDemoOrder(reference: string): DemoOrder | null {
  return inlogemDemoOrders.find((order) => order.reference === reference) ?? null;
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildResendRequest, deliverPendingEmails, shouldDeliver } from '../src/lib/send-email';
import { shopConfig } from '../shop.config';

describe('shouldDeliver', () => {
  it('nunca envía en modo demo, aunque haya clave', () => {
    expect(shouldDeliver({ DEMO_MODE: 'true', RESEND_API_KEY: 're_abc' })).toBe(false);
  });

  it('no envía sin clave de Resend', () => {
    expect(shouldDeliver({ DEMO_MODE: 'false' })).toBe(false);
    expect(shouldDeliver({ DEMO_MODE: 'false', RESEND_API_KEY: '' })).toBe(false);
  });

  it('envía solo fuera de demo y con clave', () => {
    expect(shouldDeliver({ DEMO_MODE: 'false', RESEND_API_KEY: 're_abc' })).toBe(true);
  });
});

describe('buildResendRequest', () => {
  const message = {
    to_addr: 'cliente@example.com',
    subject: 'Pedido BM-260718-ABCD confirmado',
    body_html: '<p>Hola</p>',
  };

  it('construye la petición a la API de Resend con la clave en el header', () => {
    const { url, init } = buildResendRequest(message, 're_test_key');
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers['authorization']).toBe('Bearer re_test_key');
    expect(init.headers['content-type']).toBe('application/json');
  });

  it('remite desde la identidad de la tienda con el contenido de la outbox', () => {
    const { init } = buildResendRequest(message, 're_test_key');
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body['from']).toBe(`${shopConfig.name} <${shopConfig.email}>`);
    expect(body['to']).toEqual(['cliente@example.com']);
    expect(body['subject']).toBe(message.subject);
    expect(body['html']).toBe(message.body_html);
  });
});

/**
 * Doble de D1 mínimo para deliverPendingEmails. Las operaciones resuelven en un
 * microtask (Promise) para que dos invocaciones concurrentes solapen su SELECT
 * antes de reclamar, reproduciendo la carrera real de dos waitUntil a la vez.
 */
type OutboxRow = { id: number; to_addr: string; subject: string; body_html: string; sent: number };

function fakeOutboxDb(rows: OutboxRow[]) {
  return {
    prepare(sql: string) {
      let args: unknown[] = [];
      const api = {
        bind(...a: unknown[]) {
          args = a;
          return api;
        },
        async all<T>() {
          if (/SELECT .* WHERE sent = 0/.test(sql)) {
            const results = rows.filter((r) => r.sent === 0).slice(0, 10);
            return { results: results as unknown as T[] };
          }
          return { results: [] as T[] };
        },
        async run() {
          const id = args[0] as number;
          const row = rows.find((r) => r.id === id);
          if (/SET sent = 1 WHERE id = \? AND sent = 0/.test(sql)) {
            if (row && row.sent === 0) {
              row.sent = 1;
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          if (/SET sent = 0 WHERE id = \?/.test(sql)) {
            if (row) row.sent = 0;
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
      return api;
    },
  } as unknown as D1Database;
}

describe('deliverPendingEmails — reclamo atómico', () => {
  afterEach(() => vi.restoreAllMocks());

  const prodEnv = { DEMO_MODE: 'false', RESEND_API_KEY: 're_test' };

  it('no envía nada en modo demo', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const rows: OutboxRow[] = [{ id: 1, to_addr: 'a@b.c', subject: 's', body_html: '<p>x</p>', sent: 0 }];
    const delivered = await deliverPendingEmails(fakeOutboxDb(rows), { DEMO_MODE: 'true', RESEND_API_KEY: 're_test' });
    expect(delivered).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(rows[0]!.sent).toBe(0);
  });

  it('entrega cada email una sola vez aunque dos invocaciones corran a la vez', async () => {
    const fetched: number[] = [];
    // El id va en el subject para poder contar entregas por email sin parsear el body.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as { body: string }).body) as { subject: string };
      fetched.push(Number(body.subject));
      return new Response('{}', { status: 200 });
    });
    const rows: OutboxRow[] = [
      { id: 1, to_addr: 'a@b.c', subject: '1', body_html: '<p>1</p>', sent: 0 },
      { id: 2, to_addr: 'd@e.f', subject: '2', body_html: '<p>2</p>', sent: 0 },
    ];
    const db = fakeOutboxDb(rows);

    // Dos entregas concurrentes: ambas leen los pendientes antes de reclamar.
    const [a, b] = await Promise.all([deliverPendingEmails(db, prodEnv), deliverPendingEmails(db, prodEnv)]);

    expect(a + b).toBe(2); // 2 emails entregados en total, no 4
    expect(fetched.sort()).toEqual([1, 2]); // cada uno exactamente una vez
    expect(rows.every((r) => r.sent === 1)).toBe(true);
  });

  it('libera el reclamo (sent=0) si Resend falla, para reintentar', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
    const rows: OutboxRow[] = [{ id: 1, to_addr: 'a@b.c', subject: '1', body_html: '<p>1</p>', sent: 0 }];
    const delivered = await deliverPendingEmails(fakeOutboxDb(rows), prodEnv);
    expect(delivered).toBe(0);
    expect(rows[0]!.sent).toBe(0); // vuelve a pendiente
  });
});

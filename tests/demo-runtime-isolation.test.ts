import { afterEach, describe, expect, it, vi } from 'vitest';
import type { APIContext } from 'astro';
import type { ExecutionContext, ScheduledController } from '@cloudflare/workers-types';
import { onRequest } from '../src/middleware';
import { POST as contact } from '../src/pages/api/contact';
import { createExports } from '../src/worker';
import { runScheduledPlatformJobs, type ScheduledJobEnv } from '../src/composition/job-runner';
import { createPlatform } from '../src/composition/create-platform';
import { createPresetManifest } from '../src/platform/configuration';
import wrangler from '../wrangler.jsonc?raw';

vi.mock('astro:middleware', () => ({ defineMiddleware: (handler: unknown) => handler }));
vi.mock('astro/app', () => ({ App: class {} }));
vi.mock('@astrojs/cloudflare/handler', () => ({ handle: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

function environment(mode = 'true') {
  return {
    DEMO_MODE: mode,
    get DB(): never { throw new Error('Demo accessed D1'); },
    get LEADS_RESEND_API_KEY(): never { throw new Error('Demo accessed provider credentials'); },
  };
}

function context(path: string, method = 'POST', mode = 'true') {
  const request = new Request(`https://example.test${path}`, { method });
  const cookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
  const waitUntil = vi.fn();
  const next = vi.fn(async () => new Response('fixture'));
  const redirect = vi.fn((location: string, status: number) => new Response(null, { status, headers: { location } }));
  const input = {
    request, url: new URL(request.url), cookies, redirect, clientAddress: '192.0.2.1',
    locals: { runtime: { env: environment(mode), ctx: { waitUntil } } },
  } as unknown as APIContext;
  return { input, cookies, waitUntil, next, request };
}

async function invoke(fixture: ReturnType<typeof context>): Promise<Response> {
  const response = await onRequest(fixture.input, fixture.next);
  if (!(response instanceof Response)) throw new Error('Middleware returned no response');
  return response;
}

const routes = import.meta.glob('../src/pages/api/**/*.ts', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const mutationRoutes = Object.entries(routes).flatMap(([file, source]) =>
  [...source.matchAll(/export const (POST|PUT|PATCH|DELETE)\b/g)].map(([, method]) => [
    file.replace('../src/pages', '').replace(/\/index\.ts$/, '').replace(/\.ts$/, '').replace(/\[[^\]]+\]/g, '1'),
    method!,
  ] as const));

describe('demo runtime contains no writable HTTP surface', () => {
  it.each(mutationRoutes)('%s %s stops before its handler, body, cookies, D1 or provider', async (path, method) => {
    const f = context(path, method);
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const json = vi.spyOn(f.request, 'json');
    const formData = vi.spyOn(f.request, 'formData');
    const response = await invoke(f);
    expect([403, 404, 410]).toContain(response.status);
    expect(f.next).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
    expect(formData).not.toHaveBeenCalled();
    expect(f.cookies.set).not.toHaveBeenCalled();
    expect(f.waitUntil).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('also closes new/unregistered %s handlers and demo login', async (method) => {
    for (const path of ['/api/future-command', '/demo/admin/login', '/future-form']) {
      const f = context(path, method);
      expect((await invoke(f)).status).toBe(403);
      expect(f.next).not.toHaveBeenCalled();
    }
  });

  it('fails closed when the public demo manifest and env diverge', async () => {
    const f = context('/api/contact', 'POST', 'false');
    expect((await invoke(f)).status).toBe(403);
    expect(f.next).not.toHaveBeenCalled();
  });

  it('preserves public fixture reads and the existing authentication gate', async () => {
    const publicRead = context('/demo/tienda', 'GET');
    expect((await invoke(publicRead)).status).toBe(200);
    expect(publicRead.next).toHaveBeenCalledOnce();
    const privateRead = context('/api/admin/orders/export.csv', 'GET');
    expect((await invoke(privateRead)).status).toBe(401);
    expect(privateRead.next).not.toHaveBeenCalled();
  });

  it.each(['application/json', 'application/x-www-form-urlencoded'])('contact closes direct %s invocations without reading personal data', async (contentType) => {
    const f = context('/api/contact');
    f.request.headers.set('content-type', contentType);
    const json = vi.spyOn(f.request, 'json');
    const formData = vi.spyOn(f.request, 'formData');
    expect((await contact(f.input)).status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(formData).not.toHaveBeenCalled();
    expect(f.waitUntil).not.toHaveBeenCalled();
  });
});

describe('demo cron isolation', () => {
  it('registers no crons in the deployment config', () => {
    expect(wrangler).toMatch(/"triggers"\s*:\s*\{\s*"crons"\s*:\s*\[\s*\]/);
  });

  it('an old scheduled event does not create a background task or touch D1', async () => {
    const worker = createExports({} as Parameters<typeof createExports>[0]).default;
    const waitUntil = vi.fn();
    await worker.scheduled({ cron: '17 3 * * 1', scheduledTime: Date.now() } as ScheduledController,
      environment() as unknown as Parameters<typeof worker.scheduled>[1], { waitUntil } as unknown as ExecutionContext);
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('DEMO_MODE blocks even a client manifest before reading DB or scheduling a job', async () => {
    const platform = createPlatform(createPresetManifest('standard', {
      id: 'demo-runtime-drift-test', mode: 'client', environment: 'development',
    }));
    expect(await runScheduledPlatformJobs('*/5 * * * *', Date.now(), environment() as unknown as ScheduledJobEnv, platform)).toEqual([]);
  });
});

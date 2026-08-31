import { notFoundResponse } from '../lib/not-found';
import { proposalHtmlHeaders, resolveProposal } from '.';
import type { ProposalConfig } from './types';

type RequestContext = Readonly<{
  publicId: string | undefined;
  headers: Headers;
  env: Env;
  url: URL;
  allowDraft?: boolean;
}>;

export function proposalGoneResponse(): Response {
  return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex,nofollow,noarchive"><title>Propuesta no disponible — Logic2B</title><style>body{font-family:system-ui;margin:0;background:#f7f8fa;color:#0b1633;display:grid;min-height:100vh;place-items:center}.card{max-width:34rem;padding:3rem;margin:1rem;background:white;border:1px solid #dbe3ee;border-radius:1.5rem}a{color:#155eef;font-weight:700}</style></head><body><main class="card"><p>Logic2B Ecommerce</p><h1>Esta propuesta ya no está disponible.</h1><p>Si quieres recuperar la conversación o conocer el proyecto, escríbenos y te ayudamos.</p><a href="mailto:hola@logic2b.com">hola@logic2b.com</a></main></body></html>`, {
    status: 410,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}

export async function proposalForPage(context: RequestContext): Promise<ProposalConfig | Response> {
  proposalHtmlHeaders(context.headers);
  const resolution = resolveProposal(context.publicId, new Date(), context.allowDraft ?? import.meta.env.DEV);
  if (resolution.kind === 'active') return resolution.proposal;
  if (resolution.kind === 'gone') return proposalGoneResponse();
  const missing = await notFoundResponse(context.env, context.url);
  const headers = new Headers(missing.headers);
  proposalHtmlHeaders(headers);
  return new Response(missing.body, { status: 404, headers });
}

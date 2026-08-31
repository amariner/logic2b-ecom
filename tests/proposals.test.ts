// @ts-nocheck -- inspección de activos Node dentro de un proyecto Workers.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectIndexablePage } from '../src/modules/storefront/application/sitemap';
import {
  proposalHtmlHeaders,
  proposals,
  resolveProposal,
  resolveProposalState,
} from '../src/proposals';
import { proposalForPage, proposalGoneResponse } from '../src/proposals/http';
import { inlogemCatalog } from '../src/proposals/inlogem/catalog';
import { inlogemProposal } from '../src/proposals/inlogem/config';

describe('registro privado de propuestas', () => {
  it('usa identificadores no predecibles, únicos y rutas encapsuladas', () => {
    expect(new Set(proposals.map((proposal) => proposal.publicId)).size).toBe(proposals.length);
    for (const proposal of proposals) {
      expect(proposal.publicId).toMatch(new RegExp(`^${proposal.id}-[0-9a-f]{32}$`));
      expect(proposal.paths.home).toBe(`/propuestas/${proposal.publicId}`);
      for (const path of [proposal.paths.catalog, proposal.paths.cart, proposal.paths.checkout, proposal.paths.thanks, proposal.paths.manager]) {
        expect(path.startsWith(`${proposal.paths.home}/`)).toBe(true);
      }
    }
  });

  it('bloquea borradores, retira archivadas y caducadas y permite activas', () => {
    const active = { ...inlogemProposal, status: 'active' };
    const archived = { ...inlogemProposal, status: 'archived' };
    const expired = { ...inlogemProposal, status: 'active', expiresAt: '2026-08-01T00:00:00.000Z' };
    expect(resolveProposal(inlogemProposal.publicId, new Date('2026-08-31'), false).kind).toBe('draft');
    expect(resolveProposal(inlogemProposal.publicId, new Date('2026-08-31'), true).kind).toBe('active');
    expect(resolveProposal('desconocida', new Date(), false).kind).toBe('missing');
    expect(resolveProposalState(active, new Date('2026-08-31'), false).kind).toBe('active');
    expect(resolveProposalState(archived, new Date('2026-08-31'), false).kind).toBe('gone');
    expect(resolveProposalState(expired, new Date('2026-08-31'), false).kind).toBe('gone');
  });

  it('responde 404 privado para identificadores desconocidos', async () => {
    const response = await proposalForPage({
      publicId: 'no-existe',
      headers: new Headers(),
      env: {} as Env,
      url: new URL('https://ecom.logic2b.com/propuestas/no-existe'),
      allowDraft: false,
    });
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(404);
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('responde 410 neutro y privado para propuestas retiradas', async () => {
    const response = proposalGoneResponse();
    expect(response.status).toBe(410);
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.text()).resolves.toContain('ya no está disponible');
  });

  it('aplica privacidad de cabeceras y queda fuera del sitemap', () => {
    const headers = new Headers();
    proposalHtmlHeaders(headers);
    expect(headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect(headers.get('referrer-policy')).toBe('no-referrer');
    expect(headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(inspectIndexablePage({
      pathname: inlogemProposal.paths.home,
      html: '<html><head><meta name="robots" content="noindex,nofollow,noarchive"></head></html>',
    })).toBeNull();
  });
});

describe('snapshot Inlogem', () => {
  it('contiene exactamente 72 productos, 9 por familia y claves únicas', () => {
    expect(inlogemCatalog).toHaveLength(72);
    const counts = Object.groupBy(inlogemCatalog, (item) => item.category);
    expect(Object.keys(counts).toSorted()).toEqual(inlogemProposal.collection.categories.map((item) => item.id).toSorted());
    for (const category of inlogemProposal.collection.categories) expect(counts[category.id]).toHaveLength(9);
    expect(new Set(inlogemCatalog.map((item) => item.sourceCode)).size).toBe(72);
    expect(new Set(inlogemCatalog.map((item) => item.sourceReference)).size).toBe(72);
    expect(new Set(inlogemCatalog.map((item) => item.slug)).size).toBe(72);
  });

  it('mantiene trazabilidad, precios enteros y los 72 WebP locales', () => {
    for (const item of inlogemCatalog) {
      expect(Number.isInteger(item.demoPriceCents) && item.demoPriceCents > 0).toBe(true);
      expect(item.sourceUrl).toMatch(/^https:\/\/www\.liderpapel\.com\//);
      expect(item.sourceImageUrl).toMatch(/^https:\/\//);
      expect(item.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(item.image).toMatch(/^\/images\/proposals\/inlogem\/products\/\d+\.webp$/);
      const path = resolve(import.meta.dirname, '..', 'public', item.image.slice(1));
      expect(existsSync(path), path).toBe(true);
      expect(readFileSync(path).subarray(0, 4).toString('ascii')).toBe('RIFF');
    }
  });
});

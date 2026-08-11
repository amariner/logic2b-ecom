import { describe, expect, it } from 'vitest';
import {
  inspectIndexablePage,
  parseSitemap,
  renderSitemap,
  SITEMAP_ORIGIN,
} from '../src/modules/storefront/application/sitemap';

const page = (pathname: string, head: string) => ({
  pathname,
  html: `<!doctype html><html lang="es"><head>${head}</head><body><h1>Contenido</h1></body></html>`,
});

describe('selección de URLs del sitemap', () => {
  it('solo acepta páginas públicas cuya canonical absoluta coincide con la ruta 200', () => {
    expect(
      inspectIndexablePage(
        page('/precios', '<link rel="canonical" href="https://ecom.logic2b.com/precios">'),
      ),
    ).toBe('https://ecom.logic2b.com/precios');

    const excluded = [
      page('/demo/tienda', '<link rel="canonical" href="https://ecom.logic2b.com/demo/tienda">'),
      page('/api/contact', '<link rel="canonical" href="https://ecom.logic2b.com/api/contact">'),
      page('/404', '<link rel="canonical" href="https://ecom.logic2b.com/404">'),
      page('/ayuda', '<meta name="robots" content="noindex,follow"><link rel="canonical" href="https://ecom.logic2b.com/ayuda">'),
      page('/alias', '<link rel="canonical" href="https://ecom.logic2b.com/precios">'),
      page('/redirect', '<meta http-equiv="refresh" content="0;url=/precios"><link rel="canonical" href="https://ecom.logic2b.com/redirect">'),
      page('/externa', '<link rel="canonical" href="https://logic2b.com/externa">'),
      page('/buscar', '<link rel="canonical" href="https://ecom.logic2b.com/buscar?q=aceite">'),
      page('/sin-canonical', ''),
    ];

    for (const candidate of excluded) expect(inspectIndexablePage(candidate)).toBeNull();
  });

  it('hace entrar automáticamente una nueva ruta canónica e indexable', () => {
    const product = page(
      '/productos/aove-picual',
      '<link rel="canonical" href="https://ecom.logic2b.com/productos/aove-picual">',
    );
    const category = page(
      '/categorias/aceites',
      '<link rel="canonical" href="https://ecom.logic2b.com/categorias/aceites">',
    );

    expect([product, category].map((candidate) => inspectIndexablePage(candidate))).toEqual([
      'https://ecom.logic2b.com/productos/aove-picual',
      'https://ecom.logic2b.com/categorias/aceites',
    ]);
  });
});

describe('XML del sitemap', () => {
  const entries = [
    { loc: `${SITEMAP_ORIGIN}/`, lastmod: '2026-08-11' },
    { loc: `${SITEMAP_ORIGIN}/arquitectura`, lastmod: '2026-08-05' },
  ];

  it('genera XML UTF-8 válido con correspondencia loc/lastmod', () => {
    const xml = renderSitemap(entries);
    expect(parseSitemap(xml)).toEqual(entries);
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(xml.match(/<loc>/g)).toHaveLength(entries.length);
    expect(xml.match(/<lastmod>/g)).toHaveLength(entries.length);
  });

  it('solo contiene URLs absolutas, HTTPS, propias y únicas', () => {
    const parsed = parseSitemap(renderSitemap(entries));
    expect(new Set(parsed.map((entry) => entry.loc)).size).toBe(parsed.length);
    for (const entry of parsed) {
      const url = new URL(entry.loc);
      expect(url.origin).toBe(SITEMAP_ORIGIN);
      expect(url.protocol).toBe('https:');
    }
  });

  it('no introduce namespace XHTML, priority, changefreq ni hoja XSL', () => {
    const xml = renderSitemap(entries);
    expect(xml).not.toMatch(/xhtml|priority|changefreq|xml-stylesheet/i);
  });

  it('rechaza URLs duplicadas y lastmod ausentes o inválidos', () => {
    expect(() => renderSitemap([entries[0]!, entries[0]!])).toThrow(/duplicada/);
    expect(() => renderSitemap([{ loc: `${SITEMAP_ORIGIN}/`, lastmod: '' }])).toThrow(/lastmod/);
    expect(() => renderSitemap([{ loc: '/relativa', lastmod: '2026-08-11' }])).toThrow();
  });
});

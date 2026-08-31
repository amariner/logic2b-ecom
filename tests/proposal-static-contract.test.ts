// @ts-nocheck -- guardia estática sobre fuentes Astro.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe('límites estáticos de la demo Inlogem', () => {
  it('tienda y gestor no contienen llamadas de red ni mutaciones operativas', () => {
    const roots = [resolve(import.meta.dirname, '../src/pages/propuestas'), resolve(import.meta.dirname, '../src/proposals/inlogem')];
    const sources = roots.flatMap(files).filter((path) => /\.(astro|ts)$/.test(path)).map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(sources).not.toMatch(/fetch\s*\(|XMLHttpRequest|WebSocket|\.prepare\s*\(|env\.DB|stripe|resend/i);
    expect(sources).not.toMatch(/href=["']https?:\/\//);
    expect(sources).toContain('proposal.contactSource');
    expect(sources).toContain('Solo lectura');
  });

  it('no existe índice público de empresas y el storefront conserva defaults', () => {
    expect(() => readFileSync(resolve(import.meta.dirname, '../src/pages/propuestas/index.astro'), 'utf8')).toThrow();
    for (const name of ['CartPage.astro', 'CheckoutPage.astro', 'ProductPage.astro', 'ThanksPage.astro']) {
      const source = readFileSync(resolve(import.meta.dirname, `../src/components/store/${name}`), 'utf8');
      expect(source).toContain('experience?: StoreExperienceConfig');
      expect(source).toMatch(/experience\?\.paths \?\? storePaths/);
    }
  });
});

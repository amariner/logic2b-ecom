import { describe, expect, it } from 'vitest';
import { escapeHtml, jsonLdScript } from '../src/lib/format';

describe('jsonLdScript', () => {
  it('serializa un objeto normal como JSON válido', () => {
    expect(jsonLdScript({ a: 1, b: 'x' })).toBe('{"a":1,"b":"x"}');
  });

  it('escapa "<" para que un valor con "</script>" no pueda cerrar la etiqueta', () => {
    const original = { name: 'Aceite </script><script>alert(1)</script>' };
    const out = jsonLdScript(original);
    expect(out).not.toContain('<');
    // JSON válido: los "<" se recuperan como "<" al hacer JSON.parse.
    expect(JSON.parse(out)).toEqual(original);
  });
});

describe('escapeHtml', () => {
  it('deja intacto el texto sin caracteres especiales', () => {
    expect(escapeHtml('Marta Ferrer')).toBe('Marta Ferrer');
  });

  it('neutraliza HTML/script inyectado en un campo de texto (p. ej. nombre de cliente)', () => {
    const out = escapeHtml('<img src=x onerror=alert(1)>Marta & "amigos"');
    expect(out).not.toContain('<img');
    expect(out).toBe('&lt;img src=x onerror=alert(1)&gt;Marta &amp; &quot;amigos&quot;');
  });
});

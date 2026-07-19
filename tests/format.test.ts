import { describe, expect, it } from 'vitest';
import { jsonLdScript } from '../src/lib/format';

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

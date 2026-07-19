import { describe, expect, it } from 'vitest';
import { csvField } from '../src/lib/csv';

describe('csvField', () => {
  it('envuelve en comillas y escapa las comillas internas', () => {
    expect(csvField('Marta Ferrer')).toBe('"Marta Ferrer"');
    expect(csvField('Carrer "Major" 12')).toBe('"Carrer ""Major"" 12"');
  });

  it('antepone un apóstrofe si el valor empieza por =, +, - o @ (inyección de fórmulas)', () => {
    expect(csvField("=cmd|'/c calc'!A1")).toBe('"\'=cmd|\'/c calc\'!A1"');
    expect(csvField('+1234')).toBe('"\'+1234"');
    expect(csvField('-1234')).toBe('"\'-1234"');
    expect(csvField('@SUM(A1)')).toBe('"\'@SUM(A1)"');
  });

  it('no toca valores normales que solo contienen esos caracteres en medio', () => {
    expect(csvField('AOVE Picual 500 ml - 500ml')).toBe('"AOVE Picual 500 ml - 500ml"');
  });
});

import { describe, expect, it } from 'vitest';
import { escapeLikePattern } from '../src/lib/db';

describe('escapeLikePattern', () => {
  it('deja intacto un término sin comodines', () => {
    expect(escapeLikePattern('aceite')).toBe('aceite');
  });

  it('escapa %, _ y \\ para que LIKE ... ESCAPE \'\\\' los trate como literales', () => {
    expect(escapeLikePattern('50%_x\\y')).toBe('50\\%\\_x\\\\y');
  });

  it('un término que sin escapar sería un comodín total no debe devolver todo el catálogo', () => {
    // "%" sin escapar en un LIKE '%...%' haría de comodín total; escapado, solo
    // debe casar productos cuyo nombre/descripción contenga un "%" literal.
    const escaped = escapeLikePattern('%');
    expect(escaped).toBe('\\%');
    expect(escaped).not.toBe('%');
  });
});

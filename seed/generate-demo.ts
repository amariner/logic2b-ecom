/** Genera el seed reducido de la D1 pública; no ejecuta ninguna operación remota. */
import { seedStatements } from './seed.ts';

console.log(seedStatements('public-demo').join(';\n') + ';');

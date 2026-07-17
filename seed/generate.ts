/** Emite el seed como fichero SQL para `wrangler d1 execute --file`. Uso: node seed/generate.ts */
import { seedStatements } from './seed.ts';

console.log(seedStatements().join(';\n') + ';');

#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { paymentLedgerBackfillSql } from '../src/modules/payments/infrastructure/payment-ledger-backfill.ts';

function argumentsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--currency') result.currency = argv[++index];
    else if (argv[index] === '--output') result.output = argv[++index];
    else throw new Error(`Argumento desconocido: ${argv[index]}`);
  }
  if (!result.currency || !result.output) {
    throw new Error(
      'Uso: node scripts/generate-r2-payment-backfill.mjs ' +
      '--currency <ISO-4217> --output <fichero.sql>',
    );
  }
  return result;
}

const args = argumentsFrom(process.argv.slice(2));
const output = resolve(args.output);
const sql = paymentLedgerBackfillSql(args.currency.toUpperCase());
writeFileSync(output, sql, { encoding: 'utf8', flag: 'wx' });
process.stdout.write(`${JSON.stringify({ output, currency: args.currency.toUpperCase(), bytes: Buffer.byteLength(sql) })}\n`);

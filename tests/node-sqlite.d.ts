/**
 * Declaración mínima de `node:sqlite` para los contract tests.
 *
 * El runtime requerido por el repo (Node >=22.18; CI local usa Node 24) ya
 * incluye el módulo, pero los tipos transitivos fijados por Astro todavía no.
 * Se limita deliberadamente a la superficie usada en R1.6 para no fingir el
 * resto de la API ni añadir una dependencia solo para un test de diseño.
 */
declare module 'node:sqlite' {
  type SqlValue = string | number | bigint | null | Uint8Array;

  export class StatementSync {
    all(...params: SqlValue[]): Record<string, unknown>[];
    get(...params: SqlValue[]): Record<string, unknown> | undefined;
    run(...params: SqlValue[]): unknown;
  }

  export class DatabaseSync {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}

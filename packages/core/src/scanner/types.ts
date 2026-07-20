import type { SourceOffset } from '../ts-utils/types.js';

export type ImportFormKind =
  | 'import' // static `import ... from 'x'` (default/named/namespace, incl. `import type`)
  | 'exportFrom' // `export { a } from 'x'` (incl. `export type { a } from 'x'`)
  | 'exportStar' // `export * from 'x'` (incl. `export type * from 'x'`)
  | 'exportStarAs' // `export * as ns from 'x'`
  | 'requireCall' // `require('x')`
  | 'dynamicImport' // `import('x')`
  | 'importEqualsRequire'; // `import foo = require('x')`

export interface ImportSpecifierRecord {
  readonly formKind: ImportFormKind;
  /** Decoded specifier value, e.g. "./foo" (delimiters not included). */
  readonly moduleText: string;
  /**
   * Whole-statement type-only flag (`import type ... from`, `export type ... from`).
   * Per-specifier `{ type X }` modifiers on individual named bindings are NOT
   * reflected here — that's finer-grained symbol info out of scope for this scanner.
   */
  readonly isTypeOnly: boolean;
  readonly quote: '"' | "'" | '`';
  /** Range strictly between the delimiters — what the rewriter splices against. */
  readonly specifierOffset: SourceOffset;
  /** Range of the whole string-literal token, delimiters included. */
  readonly literalOffset: SourceOffset;
  /** Range of the enclosing import/export/require/dynamic-import statement or call. */
  readonly statementOffset: SourceOffset;
}

/**
 * Placeholder shape. A later ticket (computed dynamic import / require
 * detection) owns the real fields and the logic that populates this array;
 * the scanner itself never pushes into it. Kept here only so FileScanResult's
 * public shape is stable across both tickets.
 */
export interface ScanWarning {
  readonly kind: string;
  readonly statementOffset: SourceOffset;
}

export interface FileScanResult {
  readonly filePath: string;
  readonly specifiers: readonly ImportSpecifierRecord[];
  readonly warnings: readonly ScanWarning[];
}

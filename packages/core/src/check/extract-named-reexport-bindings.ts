import * as ts from 'typescript';
import { nodeOffset } from '../ts-utils/index.js';

export interface NamedReexportBinding {
  /** The source-side name being re-exported — what matters for checking the target actually has it. */
  readonly originalName: string;
  /** The name this barrel exposes it under, if renamed (`export { originalName as aliasName }`). */
  readonly aliasName: string;
}

export interface NamedReexportGroup {
  /**
   * The statement's start offset (`node.getStart(sourceFile)`), matching
   * exactly how the scanner computes `ImportGraphEdge.statementOffset.start`
   * — the correct key to correlate a group back to its edge. Specifier text
   * alone is NOT unique enough: a barrel can have two separate `export {...}
   * from './x.js'` statements pointing at the same module, and matching by
   * specifier would silently pick the wrong statement's bindings for one of
   * the two edges.
   */
  readonly statementStart: number;
  readonly bindings: readonly NamedReexportBinding[];
}

/** Every `export { a, b as c } from '...'` statement in this file, one group per statement — excludes `export *`/`export * as ns from`, which re-export everything and can't be checked against a single name. */
export function extractNamedReexportBindings(sourceFile: ts.SourceFile): NamedReexportGroup[] {
  const groups: NamedReexportGroup[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) continue;
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;

    const bindings: NamedReexportBinding[] = statement.exportClause.elements.map((element) => ({
      originalName: (element.propertyName ?? element.name).text,
      aliasName: element.name.text,
    }));

    groups.push({ statementStart: nodeOffset(statement, sourceFile).start, bindings });
  }

  return groups;
}

/** Whether this file re-exports everything from another module (`export * from` or `export * as ns from`) — if so, its true export surface can't be determined from local declarations alone. */
export function fileHasExportStar(sourceFile: ts.SourceFile): boolean {
  return sourceFile.statements.some(
    (s) => ts.isExportDeclaration(s) && !!s.moduleSpecifier && !s.exportClause,
  );
}

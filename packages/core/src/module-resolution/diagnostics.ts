import type * as ts from 'typescript';
import type { SourceOffset } from '../ts-utils/types.js';

const MODULE_RESOLUTION_DIAGNOSTICS = new Set([2307, 2436, 2664, 2732, 2792, 2834, 2835]);

export function collectModuleResolutionDiagnostics(
  program: ts.Program,
  sourceFiles: readonly ts.SourceFile[],
): readonly ts.Diagnostic[] {
  return sourceFiles.flatMap((sourceFile) =>
    program
      .getSemanticDiagnostics(sourceFile)
      .filter((diagnostic) => MODULE_RESOLUTION_DIAGNOSTICS.has(diagnostic.code)),
  );
}

export function hasModuleResolutionDiagnostic(
  diagnostics: readonly ts.Diagnostic[],
  sourceFile: ts.SourceFile,
  literalOffset: SourceOffset,
): boolean {
  return diagnostics.some((diagnostic) => {
    if (diagnostic.file !== sourceFile || diagnostic.start === undefined) return false;
    const end = diagnostic.start + (diagnostic.length ?? 0);
    return diagnostic.start <= literalOffset.start && end >= literalOffset.end;
  });
}

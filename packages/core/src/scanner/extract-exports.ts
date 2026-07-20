import * as ts from 'typescript';
import { literalInnerOffset, nodeOffset, quoteCharAt } from '../ts-utils/offsets.js';
import type { ImportFormKind, ImportSpecifierRecord } from './types.js';

export function extractExportDeclaration(
  node: ts.ExportDeclaration,
  sourceFile: ts.SourceFile,
  out: ImportSpecifierRecord[],
): void {
  const specifier = node.moduleSpecifier;
  if (!specifier || !ts.isStringLiteralLike(specifier)) return;

  const formKind: ImportFormKind = !node.exportClause
    ? 'exportStar'
    : ts.isNamespaceExport(node.exportClause)
      ? 'exportStarAs'
      : 'exportFrom';

  out.push({
    formKind,
    moduleText: specifier.text,
    isTypeOnly: node.isTypeOnly,
    quote: quoteCharAt(specifier, sourceFile),
    specifierOffset: literalInnerOffset(specifier, sourceFile),
    literalOffset: nodeOffset(specifier, sourceFile),
    statementOffset: nodeOffset(node, sourceFile),
  });
}

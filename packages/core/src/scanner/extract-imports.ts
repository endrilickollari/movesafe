import * as ts from 'typescript';
import { literalInnerOffset, nodeOffset, quoteCharAt } from '../ts-utils/offsets.js';
import type { ImportSpecifierRecord } from './types.js';

export function extractImportDeclaration(
  node: ts.ImportDeclaration,
  sourceFile: ts.SourceFile,
  out: ImportSpecifierRecord[],
): void {
  const specifier = node.moduleSpecifier;
  if (!ts.isStringLiteralLike(specifier)) return;

  out.push({
    formKind: 'import',
    moduleText: specifier.text,
    isTypeOnly: node.importClause?.isTypeOnly ?? false,
    quote: quoteCharAt(specifier, sourceFile),
    specifierOffset: literalInnerOffset(specifier, sourceFile),
    literalOffset: nodeOffset(specifier, sourceFile),
    statementOffset: nodeOffset(node, sourceFile),
  });
}

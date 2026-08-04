import * as ts from 'typescript';
import { literalInnerOffset, nodeOffset, quoteCharAt } from '../ts-utils/offsets.js';
import type { ImportSpecifierRecord } from './types.js';

/** Handles `declare module 'x' { ... }` — an ambient augmentation of an existing module, identified by callers via `ts.isStringLiteral(node.name) && node.body`. */
export function extractModuleAugmentation(
  node: ts.ModuleDeclaration,
  sourceFile: ts.SourceFile,
  out: ImportSpecifierRecord[],
): void {
  const specifier = node.name;
  if (!ts.isStringLiteralLike(specifier)) return;

  out.push({
    formKind: 'moduleAugmentation',
    moduleText: specifier.text,
    isTypeOnly: false,
    quote: quoteCharAt(specifier, sourceFile),
    specifierOffset: literalInnerOffset(specifier, sourceFile),
    literalOffset: nodeOffset(specifier, sourceFile),
    statementOffset: nodeOffset(node, sourceFile),
  });
}

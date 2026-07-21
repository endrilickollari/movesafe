import * as ts from 'typescript';
import { literalInnerOffset, nodeOffset, quoteCharAt } from '../ts-utils/offsets.js';
import type { ImportSpecifierRecord, ScanWarning } from './types.js';

function pushCallLikeRecord(
  formKind: ImportSpecifierRecord['formKind'],
  statementNode: ts.Node,
  specifier: ts.StringLiteralLike,
  sourceFile: ts.SourceFile,
  isTypeOnly: boolean,
  out: ImportSpecifierRecord[],
): void {
  out.push({
    formKind,
    moduleText: specifier.text,
    isTypeOnly,
    quote: quoteCharAt(specifier, sourceFile),
    specifierOffset: literalInnerOffset(specifier, sourceFile),
    literalOffset: nodeOffset(specifier, sourceFile),
    statementOffset: nodeOffset(statementNode, sourceFile),
  });
}

function pushComputedWarning(
  formKind: ScanWarning['formKind'],
  statementNode: ts.Node,
  sourceFile: ts.SourceFile,
  warnings: ScanWarning[],
): void {
  warnings.push({
    kind: 'computedSpecifier',
    formKind,
    message: 'Specifier is not a string literal; refusing to guess its value.',
    statementOffset: nodeOffset(statementNode, sourceFile),
  });
}

export function extractRequireCall(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  out: ImportSpecifierRecord[],
  warnings: ScanWarning[],
): void {
  const [arg] = node.arguments;
  if (!arg || !ts.isStringLiteralLike(arg)) {
    pushComputedWarning('requireCall', node, sourceFile, warnings);
    return;
  }
  pushCallLikeRecord('requireCall', node, arg, sourceFile, false, out);
}

export function extractDynamicImport(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  out: ImportSpecifierRecord[],
  warnings: ScanWarning[],
): void {
  const [arg] = node.arguments;
  if (!arg || !ts.isStringLiteralLike(arg)) {
    pushComputedWarning('dynamicImport', node, sourceFile, warnings);
    return;
  }
  pushCallLikeRecord('dynamicImport', node, arg, sourceFile, false, out);
}

export function extractImportEquals(
  node: ts.ImportEqualsDeclaration,
  sourceFile: ts.SourceFile,
  out: ImportSpecifierRecord[],
  warnings: ScanWarning[],
): void {
  if (!ts.isExternalModuleReference(node.moduleReference)) return;
  const arg = node.moduleReference.expression;
  if (!arg || !ts.isStringLiteralLike(arg)) {
    pushComputedWarning('importEqualsRequire', node, sourceFile, warnings);
    return;
  }
  pushCallLikeRecord('importEqualsRequire', node, arg, sourceFile, node.isTypeOnly, out);
}

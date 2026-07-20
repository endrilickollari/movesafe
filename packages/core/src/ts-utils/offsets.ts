import * as ts from 'typescript';
import type { SourceOffset } from './types.js';

export function nodeOffset(node: ts.Node, sourceFile: ts.SourceFile): SourceOffset {
  return { start: node.getStart(sourceFile), end: node.getEnd() };
}

/** The range strictly between a string-literal-like token's delimiters. */
export function literalInnerOffset(
  literal: ts.StringLiteralLike,
  sourceFile: ts.SourceFile,
): SourceOffset {
  const { start, end } = nodeOffset(literal, sourceFile);
  return { start: start + 1, end: end - 1 };
}

export function quoteCharAt(
  literal: ts.StringLiteralLike,
  sourceFile: ts.SourceFile,
): '"' | "'" | '`' {
  const char = sourceFile.text[literal.getStart(sourceFile)];
  return char === '"' || char === "'" || char === '`' ? char : '"';
}

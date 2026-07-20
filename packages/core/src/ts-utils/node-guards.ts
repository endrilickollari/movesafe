import * as ts from 'typescript';

/** Matches `require(...)` call expressions (CommonJS, not part of ES module grammar). */
export function isRequireCall(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'require'
  );
}

/**
 * Matches dynamic `import(...)` call expressions. There is no public
 * `ts.isImportCall` in this TypeScript version, so this is hand-rolled:
 * a dynamic import parses as a CallExpression whose callee is the
 * `import` keyword itself (SyntaxKind.ImportKeyword), not an identifier.
 */
export function isDynamicImportCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword;
}

import * as ts from 'typescript';
import { parseSourceFile, readSourceText } from '../ts-utils/index.js';

function collectBindingNames(name: ts.BindingName, out: Set<string>): void {
  if (ts.isIdentifier(name)) {
    out.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isOmittedExpression(element)) continue;
    collectBindingNames(element.name, out);
  }
}

/**
 * Every name a file declares as an export: function/class/interface/type/enum
 * declarations with an `export` modifier, `export const/let/var` (including
 * destructured bindings), `export default` (mapped to the literal name
 * `'default'`), and bare `export { a, b as c };` (the exported alias names,
 * not the possibly-different local declaration name). Export-related
 * statements can only appear at a file's top level in valid TypeScript, so
 * this is a flat scan of `sourceFile.statements`, not a recursive walk.
 *
 * `export = foo` (CJS-only) and `export namespace` are intentionally not
 * handled — structurally incompatible with / out of scope for this
 * ESM/NodeNext-focused codebase's own conventions.
 */
export function extractDeclaredExports(filePath: string, sourceText?: string): ReadonlySet<string> {
  const text = sourceText ?? readSourceText(filePath);
  const sourceFile = parseSourceFile(filePath, text);
  const names = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      if (!statement.isExportEquals) names.add('default');
      continue;
    }

    if (ts.isExportDeclaration(statement) && statement.exportClause) {
      if (ts.isNamedExports(statement.exportClause)) {
        // Bare `export { a, b as c };` (no module specifier) declares a, c
        // locally. `export { a } from 'x'` is a re-export, handled
        // separately by extractNamedReexportBindings — but if it also
        // happens to be checked here, it's harmless: the names it exposes
        // are correctly the same alias names either way.
        for (const element of statement.exportClause.elements) {
          names.add(element.name.text);
        }
      } else {
        // `export * as ns from 'x'` declares the single name `ns` — unlike
        // bare `export * from 'x'`, which flattens an unknowable set of
        // names and is deliberately left to the `fileHasExportStar` guard.
        names.add(statement.exportClause.name.text);
      }
      continue;
    }

    if (!ts.canHaveModifiers(statement)) continue;
    const modifiers = ts.getModifiers(statement);
    if (!modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;

    if (modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) {
      names.add('default');
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        collectBindingNames(declaration.name, names);
      }
    } else if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      if (statement.name) names.add(statement.name.text);
    }
  }

  return names;
}

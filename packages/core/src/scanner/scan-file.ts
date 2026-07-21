import * as ts from 'typescript';
import { forEachDescendant, isDynamicImportCall, isRequireCall } from '../ts-utils/index.js';
import { parseSourceFile, readSourceText } from '../ts-utils/source-file.js';
import { extractExportDeclaration } from './extract-exports.js';
import { extractDynamicImport, extractImportEquals, extractRequireCall } from './extract-calls.js';
import { extractImportDeclaration } from './extract-imports.js';
import type { FileScanResult, ImportSpecifierRecord, ScanWarning } from './types.js';

export function scanFile(filePath: string, sourceText?: string): FileScanResult {
  const text = sourceText ?? readSourceText(filePath);
  const sourceFile = parseSourceFile(filePath, text);

  const specifiers: ImportSpecifierRecord[] = [];
  const warnings: ScanWarning[] = [];

  forEachDescendant(sourceFile, (node) => {
    if (ts.isImportDeclaration(node)) {
      extractImportDeclaration(node, sourceFile, specifiers);
    } else if (ts.isExportDeclaration(node)) {
      extractExportDeclaration(node, sourceFile, specifiers);
    } else if (ts.isImportEqualsDeclaration(node)) {
      extractImportEquals(node, sourceFile, specifiers, warnings);
    } else if (isRequireCall(node)) {
      extractRequireCall(node, sourceFile, specifiers, warnings);
    } else if (isDynamicImportCall(node)) {
      extractDynamicImport(node, sourceFile, specifiers, warnings);
    }
  });

  return { filePath, specifiers, warnings };
}

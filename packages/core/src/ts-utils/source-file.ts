import { readFileSync } from 'node:fs';
import * as ts from 'typescript';

export function inferScriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (filePath.endsWith('.mts') || filePath.endsWith('.cts')) return ts.ScriptKind.TS;
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

export function readSourceText(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

export function parseSourceFile(filePath: string, sourceText: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    inferScriptKind(filePath),
  );
}

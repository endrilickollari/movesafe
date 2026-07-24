import * as ts from 'typescript';
import type { TsconfigDiagnostic, TsconfigDiagnosticSeverity } from './types.js';

function toSeverity(category: ts.DiagnosticCategory): TsconfigDiagnosticSeverity {
  switch (category) {
    case ts.DiagnosticCategory.Error:
      return 'error';
    case ts.DiagnosticCategory.Warning:
      return 'warning';
    case ts.DiagnosticCategory.Suggestion:
      return 'suggestion';
    case ts.DiagnosticCategory.Message:
      return 'message';
  }
}

export function toTsconfigDiagnostic(diagnostic: ts.Diagnostic): TsconfigDiagnostic {
  return {
    severity: toSeverity(diagnostic.category),
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    configFilePath: diagnostic.file?.fileName,
    position:
      diagnostic.start !== undefined && diagnostic.length !== undefined
        ? { start: diagnostic.start, end: diagnostic.start + diagnostic.length }
        : undefined,
  };
}

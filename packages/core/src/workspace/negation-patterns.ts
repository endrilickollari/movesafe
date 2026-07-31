import type { WorkspaceDiagnostic } from './types.js';

/** Negation patterns (`!excluded`) aren't supported in v1 — dropped and diagnosed
 *  rather than silently mis-globbed as a literal directory named `!excluded`. */
export function filterNegationPatterns(
  patterns: readonly string[],
  diagnostics: WorkspaceDiagnostic[],
): readonly string[] {
  return patterns.filter((pattern) => {
    if (!pattern.startsWith('!')) return true;
    diagnostics.push({
      severity: 'warning',
      code: 'unsupported-negation-pattern',
      message: `Negation pattern '${pattern}' is not supported and was ignored.`,
      path: pattern,
    });
    return false;
  });
}

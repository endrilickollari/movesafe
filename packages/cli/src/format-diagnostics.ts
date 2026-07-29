const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

interface DiagnosticLike {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly message: string;
  readonly path: string | undefined;
}

function colorize(text: string, code: string, color: boolean | undefined): string {
  return color ? `${code}${text}${RESET}` : text;
}

/** Formats diagnostics (from `MovePlanDiagnostic[]` or `ApplyDiagnostic[]` — both satisfy this shape) as one friendly line each. */
export function formatDiagnostics(
  diagnostics: readonly DiagnosticLike[],
  options?: { readonly color?: boolean },
): string[] {
  return diagnostics.map((d) => {
    const prefix = d.severity === 'error' ? '✖' : '⚠';
    const code = d.severity === 'error' ? RED : YELLOW;
    return colorize(`${prefix} ${d.message}`, code, options?.color);
  });
}

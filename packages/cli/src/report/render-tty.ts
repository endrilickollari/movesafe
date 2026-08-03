import type { Finding, ReportOptions } from './types.js';

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function colorize(text: string, code: string, color: boolean | undefined): string {
  return color ? `${code}${text}${RESET}` : text;
}

export function renderTty(findings: readonly Finding[], options?: ReportOptions): string[] {
  if (findings.length === 0) {
    return ['✔ No issues found.'];
  }

  return findings.map((f) => {
    const prefix = f.severity === 'error' ? '✖' : '⚠';
    const code = f.severity === 'error' ? RED : YELLOW;
    return colorize(`${prefix} ${f.message}`, code, options?.color);
  });
}

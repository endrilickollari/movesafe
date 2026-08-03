import type { Finding, FindingSeverity } from './types.js';

interface JsonReportFinding {
  readonly severity: FindingSeverity;
  readonly code: string;
  readonly message: string;
  readonly path: string | null;
}

interface JsonReport {
  readonly findings: readonly JsonReportFinding[];
  readonly summary: {
    readonly errorCount: number;
    readonly warningCount: number;
    readonly total: number;
  };
}

export function renderJson(findings: readonly Finding[]): string[] {
  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warningCount = findings.length - errorCount;

  const report: JsonReport = {
    findings: findings.map((f) => ({ ...f, path: f.path ?? null })),
    summary: { errorCount, warningCount, total: findings.length },
  };

  return [JSON.stringify(report, null, 2)];
}

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
    readonly infoCount: number;
    readonly total: number;
  };
}

export function renderJson(findings: readonly Finding[]): string[] {
  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const infoCount = findings.filter((f) => f.severity === 'info').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;

  const report: JsonReport = {
    findings: findings.map((f) => ({ ...f, path: f.path ?? null })),
    summary: { errorCount, warningCount, infoCount, total: findings.length },
  };

  return [JSON.stringify(report, null, 2)];
}

import { resolve } from 'node:path';
import type { CheckFinding, SdkDiagnostic } from '@movesafe/core';
import { checkImports as checkCoreImports } from '@movesafe/core';

export interface CheckImportsOptions {
  readonly path: string | undefined;
  readonly cwd: string;
}

export interface CheckImportsResult {
  readonly ok: boolean;
  readonly error: string | undefined;
  readonly findings: readonly (CheckFinding | SdkDiagnostic)[];
  readonly summary: {
    readonly errorCount: number;
    readonly warningCount: number;
    readonly infoCount: number;
    readonly total: number;
  };
}

export function checkImports(options: CheckImportsOptions): CheckImportsResult {
  const target = resolve(options.cwd, options.path ?? '.');

  const result = checkCoreImports({ path: target, cwd: options.cwd });
  const findings = [...result.findings, ...result.diagnostics];
  const noConfig = result.diagnostics.find((diagnostic) => diagnostic.code === 'no-tsconfig-found');
  const errorCount = findings.filter((finding) => finding.severity === 'error').length;
  const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
  const infoCount = findings.filter((finding) => finding.severity === 'info').length;

  return {
    ok: result.clean,
    error: noConfig?.message,
    findings,
    summary: { errorCount, warningCount, infoCount, total: findings.length },
  };
}

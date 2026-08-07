import { resolve } from 'node:path';
import { checkImports } from '@movesafe/core';
import { renderReport } from './report/index.js';
import type { ReportFormat } from './report/index.js';
import { runCatchingErrors } from './run-catching-errors.js';
import type { BaseRunOptions, RunResult } from './run-result.js';

export interface RunCheckOptions extends BaseRunOptions {
  readonly path: string | undefined;
  readonly format: ReportFormat;
}

export function runCheck(options: RunCheckOptions): RunResult {
  const target = resolve(options.cwd, options.path ?? '.');

  return runCatchingErrors(() => {
    const result = checkImports({ path: target, cwd: options.cwd });
    const entries = [...result.findings, ...result.diagnostics];
    const exitCode = result.clean ? 0 : 1;
    const lines = renderReport(entries, options.format, { color: options.color });
    return { exitCode, lines };
  });
}

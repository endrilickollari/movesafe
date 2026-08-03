import { resolve } from 'node:path';
import { runCheck as runCoreCheck } from '@movesafe/core';
import { renderReport } from './report/index.js';
import type { ReportFormat } from './report/index.js';
import { resolveImportGraph } from './resolve-import-graph.js';
import { runCatchingErrors } from './run-catching-errors.js';
import type { BaseRunOptions, RunResult } from './run-result.js';
import { fail } from './run-result.js';

export interface RunCheckOptions extends BaseRunOptions {
  readonly path: string | undefined;
  readonly format: ReportFormat;
}

export function runCheck(options: RunCheckOptions): RunResult {
  const target = resolve(options.cwd, options.path ?? '.');

  const resolved = resolveImportGraph(target);
  if (!resolved) {
    return fail(`Could not find a tsconfig.json above ${target}.`);
  }

  return runCatchingErrors(() => {
    const result = runCoreCheck(resolved.graph);
    const exitCode = result.findings.some((f) => f.severity === 'error') ? 1 : 0;
    const lines = renderReport(result.findings, options.format, { color: options.color });
    return { exitCode, lines };
  });
}

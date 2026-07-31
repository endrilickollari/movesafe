import { resolve } from 'node:path';
import { runCheck as runCoreCheck } from '@movesafe/core';
import { formatDiagnostics } from './format-diagnostics.js';
import { resolveImportGraph } from './resolve-import-graph.js';
import { runCatchingErrors } from './run-catching-errors.js';
import type { BaseRunOptions, RunResult } from './run-result.js';
import { fail } from './run-result.js';

export interface RunCheckOptions extends BaseRunOptions {
  readonly path: string | undefined;
}

export function runCheck(options: RunCheckOptions): RunResult {
  const target = resolve(options.cwd, options.path ?? '.');

  const resolved = resolveImportGraph(target);
  if (!resolved) {
    return fail(`Could not find a tsconfig.json above ${target}.`);
  }

  return runCatchingErrors(() => {
    const result = runCoreCheck(resolved.graph);

    if (result.findings.length === 0) {
      return { exitCode: 0, lines: ['✔ No issues found.'] };
    }

    const exitCode = result.findings.some((f) => f.severity === 'error') ? 1 : 0;
    return { exitCode, lines: formatDiagnostics(result.findings, { color: options.color }) };
  });
}

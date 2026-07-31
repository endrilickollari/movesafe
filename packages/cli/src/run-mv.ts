import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { applyMove, computePlanDiff, loadTsconfig, planMove, renderPlanDiff } from '@movesafe/core';
import { formatDiagnostics } from './format-diagnostics.js';
import { resolveImportGraph } from './resolve-import-graph.js';
import { runCatchingErrors } from './run-catching-errors.js';
import type { BaseRunOptions, RunResult } from './run-result.js';
import { fail } from './run-result.js';

export interface RunMvOptions extends BaseRunOptions {
  readonly from: string;
  readonly to: string;
  readonly dryRun: boolean;
}

export function runMv(options: RunMvOptions): RunResult {
  const from = resolve(options.cwd, options.from);
  const to = resolve(options.cwd, options.to);

  if (!existsSync(from)) {
    return fail(`Cannot find file: ${relative(options.cwd, from)}`);
  }

  if (from === to) {
    return fail('Source and destination are the same path.');
  }

  const resolved = resolveImportGraph(dirname(from));
  if (!resolved) {
    return fail(`Could not find a tsconfig.json above ${relative(options.cwd, from)}.`);
  }

  return runCatchingErrors(() => {
    const tsconfig = loadTsconfig(resolved.tsconfigPath);
    const plan = planMove(from, to, resolved.graph, tsconfig);

    if (plan.diagnostics.some((d) => d.severity === 'error')) {
      return { exitCode: 1, lines: formatDiagnostics(plan.diagnostics, { color: options.color }) };
    }

    if (options.dryRun) {
      const diff = computePlanDiff(plan);
      const relativized = {
        files: diff.files.map((file) => ({
          ...file,
          oldPath: relative(options.cwd, file.oldPath),
          newPath: relative(options.cwd, file.newPath),
        })),
      };
      const lines = [
        renderPlanDiff(relativized, { color: options.color }),
        ...formatDiagnostics(plan.diagnostics, { color: options.color }),
      ];
      return { exitCode: 0, lines };
    }

    const result = applyMove(plan);
    if (!result.applied) {
      return { exitCode: 1, lines: formatDiagnostics(result.diagnostics, { color: options.color }) };
    }

    const lines = [
      `✔ Moved ${relative(options.cwd, from)} → ${relative(options.cwd, to)}`,
      ...formatDiagnostics(plan.diagnostics, { color: options.color }),
      ...formatDiagnostics(result.diagnostics, { color: options.color }),
    ];
    return { exitCode: 0, lines };
  });
}

import { relative, resolve } from 'node:path';
import { applyMove, planMove } from '@movesafe/core';
import { computePlanDiff, renderPlanDiff } from '@movesafe/core/advanced';
import { formatDiagnostics } from './format-diagnostics.js';
import { runCatchingErrors } from './run-catching-errors.js';
import type { BaseRunOptions, RunResult } from './run-result.js';

export interface RunMvOptions extends BaseRunOptions {
  readonly from: string;
  readonly to: string;
  readonly dryRun: boolean;
}

export function runMv(options: RunMvOptions): RunResult {
  const from = resolve(options.cwd, options.from);
  const to = resolve(options.cwd, options.to);

  return runCatchingErrors(() => {
    const plan = planMove({ from, to, cwd: options.cwd });

    if (plan.status === 'blocked') {
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
    if (result.status !== 'applied') {
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

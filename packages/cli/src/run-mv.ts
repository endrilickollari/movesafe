import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import {
  applyMove,
  buildImportGraph,
  computePlanDiff,
  loadTsconfig,
  planMove,
  renderPlanDiff,
} from '@movesafe/core';
import { findNearestTsconfig } from './find-tsconfig.js';
import { formatDiagnostics } from './format-diagnostics.js';

export interface RunMvOptions {
  readonly from: string;
  readonly to: string;
  readonly dryRun: boolean;
  readonly color: boolean;
  readonly cwd: string;
}

export interface RunMvResult {
  readonly exitCode: number;
  readonly lines: string[];
}

function fail(message: string): RunMvResult {
  return { exitCode: 1, lines: [`✖ ${message}`] };
}

export function runMv(options: RunMvOptions): RunMvResult {
  const from = resolve(options.cwd, options.from);
  const to = resolve(options.cwd, options.to);

  if (!existsSync(from)) {
    return fail(`Cannot find file: ${relative(options.cwd, from)}`);
  }

  if (from === to) {
    return fail('Source and destination are the same path.');
  }

  const tsconfigPath = findNearestTsconfig(dirname(from));
  if (!tsconfigPath) {
    return fail(`Could not find a tsconfig.json above ${relative(options.cwd, from)}.`);
  }

  try {
    const tsconfig = loadTsconfig(tsconfigPath);
    const graph = buildImportGraph(tsconfigPath);
    const plan = planMove(from, to, graph, tsconfig);

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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`Unexpected error: ${message}`);
  }
}

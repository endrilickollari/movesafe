import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import type { Edit } from '@movesafe/core';
import { applyMove, loadTsconfig, planMove } from '@movesafe/core';
import { resolveImportGraph } from './resolve-import-graph.js';

export interface MoveFileOptions {
  readonly from: string;
  readonly to: string;
  readonly dryRun: boolean;
  readonly cwd: string;
}

export interface MoveDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly message: string;
  readonly path: string | undefined;
}

export interface MoveFileResult {
  readonly ok: boolean;
  readonly applied: boolean;
  readonly error: string | undefined;
  readonly edits: readonly Edit[];
  readonly diagnostics: readonly MoveDiagnostic[];
}

function failure(error: string): MoveFileResult {
  return { ok: false, applied: false, error, edits: [], diagnostics: [] };
}

export function moveFile(options: MoveFileOptions): MoveFileResult {
  const from = resolve(options.cwd, options.from);
  const to = resolve(options.cwd, options.to);

  if (!existsSync(from)) {
    return failure(`Cannot find file: ${relative(options.cwd, from)}`);
  }

  if (from === to) {
    return failure('Source and destination are the same path.');
  }

  const resolved = resolveImportGraph(dirname(from));
  if (!resolved) {
    return failure(`Could not find a tsconfig.json above ${relative(options.cwd, from)}.`);
  }

  const tsconfig = loadTsconfig(resolved.tsconfigPath);
  const plan = planMove(from, to, resolved.graph, tsconfig);

  if (plan.diagnostics.some((d) => d.severity === 'error')) {
    return { ok: false, applied: false, error: undefined, edits: plan.edits, diagnostics: plan.diagnostics };
  }

  if (options.dryRun) {
    return { ok: true, applied: false, error: undefined, edits: plan.edits, diagnostics: plan.diagnostics };
  }

  const result = applyMove(plan);
  return {
    ok: result.applied,
    applied: result.applied,
    error: undefined,
    edits: plan.edits,
    diagnostics: [...plan.diagnostics, ...result.diagnostics],
  };
}

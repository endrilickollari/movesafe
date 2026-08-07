import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Edit } from '@movesafe/core';
import { applyMove, planMove } from '@movesafe/core';

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
  /** Non-empty only when the apply transaction partially failed and rollback itself couldn't fully undo it — every path a human needs to check by hand. */
  readonly manualRecoveryPaths: readonly string[];
}

function failure(error: string): MoveFileResult {
  return { ok: false, applied: false, error, edits: [], diagnostics: [], manualRecoveryPaths: [] };
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

  const plan = planMove({ from, to, cwd: options.cwd });

  if (plan.status === 'blocked') {
    const errorDiagnostic = plan.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
    return {
      ok: false,
      applied: false,
      error: errorDiagnostic?.code === 'tsconfig-not-found' ? errorDiagnostic.message : undefined,
      edits: plan.edits,
      diagnostics: plan.diagnostics,
      manualRecoveryPaths: [],
    };
  }

  if (options.dryRun) {
    return {
      ok: true,
      applied: false,
      error: undefined,
      edits: plan.edits,
      diagnostics: plan.diagnostics,
      manualRecoveryPaths: [],
    };
  }

  const result = applyMove(plan);
  return {
    ok: result.status === 'applied',
    applied: result.status === 'applied',
    error: undefined,
    edits: plan.edits,
    diagnostics: [...plan.diagnostics, ...result.diagnostics],
    manualRecoveryPaths: result.manualRecoveryPaths,
  };
}

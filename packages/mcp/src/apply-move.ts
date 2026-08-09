import { resolve } from 'node:path';
import { applyMove, planMove } from '@movesafe/core';
import type { MoveDiagnostic } from './move-diagnostic.js';

export interface ApplyMoveOptions {
  readonly from: string;
  readonly to: string;
  readonly planHash: string;
  readonly cwd: string;
}

export type ApplyMoveStatus = 'applied' | 'rejected' | 'partial' | 'hash-mismatch';

export interface ApplyMoveResult {
  readonly ok: boolean;
  readonly status: ApplyMoveStatus;
  /** The reviewed hash supplied by the caller. A replacement hash is only issued by `plan_move`, together with its diff. */
  readonly planHash: string;
  readonly diagnostics: readonly MoveDiagnostic[];
  readonly manualRecoveryPaths: readonly string[];
}

function hashMismatch(planHash: string): ApplyMoveResult {
  return {
    ok: false,
    status: 'hash-mismatch',
    planHash,
    diagnostics: [
      {
        severity: 'error',
        code: 'plan-hash-mismatch',
        message: 'The plan for this move has changed since it was reviewed. Call plan_move again and review the new plan.',
        path: undefined,
      },
    ],
    manualRecoveryPaths: [],
  };
}

/**
 * Never trusts a client-held plan body — only the hash. Recomputes the plan
 * fresh from current disk state and refuses to call the core `applyMove` at
 * all unless the recomputed `planHash` matches `options.planHash` exactly,
 * so an apply can never execute a plan different from the one reviewed via
 * `plan_move`. Core's own sealed-plan check (`invalid-plan`) is a second,
 * redundant guard behind this one, not the only one.
 */
export function applyMoveTool(options: ApplyMoveOptions): ApplyMoveResult {
  const from = resolve(options.cwd, options.from);
  const to = resolve(options.cwd, options.to);

  const plan = planMove({ from, to, cwd: options.cwd });

  if (plan.planHash !== options.planHash) {
    return hashMismatch(options.planHash);
  }

  if (plan.status === 'blocked') {
    return {
      ok: false,
      status: 'rejected',
      planHash: plan.planHash,
      diagnostics: plan.diagnostics,
      manualRecoveryPaths: [],
    };
  }

  const result = applyMove(plan);
  return {
    ok: result.status === 'applied',
    status: result.status,
    planHash: plan.planHash,
    diagnostics: [...plan.diagnostics, ...result.diagnostics],
    manualRecoveryPaths: result.manualRecoveryPaths,
  };
}

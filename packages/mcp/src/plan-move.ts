import { resolve } from 'node:path';
import type { Edit, FileMove, MovePlanOperation, MovePlanScope } from '@movesafe/core';
import { planMove } from '@movesafe/core';
import type { PlanDiff } from '@movesafe/core/advanced';
import { computePlanDiff } from '@movesafe/core/advanced';
import type { MoveDiagnostic } from './move-diagnostic.js';

export interface PlanMoveOptions {
  readonly from: string;
  readonly to: string;
  readonly cwd: string;
}

export interface PlanMoveResult {
  readonly ok: boolean;
  readonly status: 'ready' | 'blocked';
  readonly operation: MovePlanOperation;
  readonly scope: MovePlanScope;
  readonly planHash: string;
  readonly moves: readonly FileMove[];
  readonly edits: readonly Edit[];
  readonly diagnostics: readonly MoveDiagnostic[];
  readonly diff: PlanDiff;
}

const EMPTY_DIFF: PlanDiff = { files: [] };

/**
 * Read-only: plans a move and renders its diff, never touches disk. The
 * companion `apply_move` tool is the only thing that mutates — it takes the
 * `planHash` this returns and recomputes/re-verifies the plan before
 * applying it, rather than trusting a client-held plan body.
 */
export function planMoveTool(options: PlanMoveOptions): PlanMoveResult {
  const from = resolve(options.cwd, options.from);
  const to = resolve(options.cwd, options.to);

  const plan = planMove({ from, to, cwd: options.cwd });

  return {
    ok: plan.status === 'ready',
    status: plan.status,
    operation: plan.operation,
    scope: plan.scope,
    planHash: plan.planHash,
    moves: plan.moves,
    edits: plan.edits,
    diagnostics: plan.diagnostics,
    diff: plan.status === 'ready' ? computePlanDiff(plan) : EMPTY_DIFF,
  };
}

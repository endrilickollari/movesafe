import { createHash } from 'node:crypto';
import type {
  Edit,
  FileMove,
  MovePlan,
  MovePlanDiagnostic,
  MovePlanOperation,
  MovePlanPrecondition,
  MovePlanScope,
} from './types.js';
import { MOVE_PLAN_SCHEMA_VERSION } from './types.js';

function derivePreconditions(
  moves: readonly FileMove[],
  edits: readonly Edit[],
  sourceDirectory: string | undefined,
): MovePlanPrecondition[] {
  const preconditions: MovePlanPrecondition[] = [];

  if (sourceDirectory) {
    preconditions.push({ kind: 'source-directory', path: sourceDirectory });
  }

  for (const move of moves) {
    preconditions.push({ kind: 'source-exists', path: move.fromFilePath });
    preconditions.push({ kind: 'destination-absent', path: move.toFilePath });
  }

  for (const edit of edits) {
    preconditions.push({
      kind: 'edit-anchor',
      file: edit.file,
      span: edit.span,
      oldText: edit.oldText,
    });
  }

  return preconditions;
}

function computePlanHash(
  schemaVersion: number,
  operation: MovePlanOperation,
  scope: MovePlanScope,
  moves: readonly FileMove[],
  edits: readonly Edit[],
  preconditions: readonly MovePlanPrecondition[],
): string {
  const canonical = JSON.stringify({ schemaVersion, operation, scope, moves, edits, preconditions });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export interface FinalizeMovePlanInput {
  readonly operation: MovePlanOperation;
  readonly scope: MovePlanScope;
  readonly moves: readonly FileMove[];
  readonly edits: readonly Edit[];
  readonly diagnostics: readonly MovePlanDiagnostic[];
  readonly sourceDirectory?: string;
}

/**
 * The shared last step behind every plan builder (`planMove`,
 * `planDirectoryMove`, `buildCrossPackageMovePlan`): derives preconditions
 * from `moves`/`edits`, decides `ready`/`blocked` from `diagnostics`, and
 * stamps a content-addressed `planHash`. Deliberately disk-free — the
 * separate `verify/verifyMovePlan` step (which needs a `ts.Program` and
 * touches disk) runs in the impure entry points and folds its findings back
 * in via `mergeVerificationDiagnostics`.
 */
export function finalizeMovePlan(input: FinalizeMovePlanInput): MovePlan {
  const { operation, scope, moves, edits, diagnostics, sourceDirectory } = input;
  const status = diagnostics.some((d) => d.severity === 'error') ? 'blocked' : 'ready';
  const preconditions = derivePreconditions(moves, edits, sourceDirectory);

  return {
    schemaVersion: MOVE_PLAN_SCHEMA_VERSION,
    status,
    operation,
    scope,
    moves,
    edits,
    diagnostics,
    preconditions,
    planHash: computePlanHash(MOVE_PLAN_SCHEMA_VERSION, operation, scope, moves, edits, preconditions),
  };
}

/**
 * Folds post-move verification diagnostics (always errors) into an
 * already-finalized plan, flipping `status` to `blocked` if any were found.
 * `planHash` is left untouched — it identifies executable plan inputs, not
 * the diagnostics accumulated about them.
 */
export function mergeVerificationDiagnostics(
  plan: MovePlan,
  verificationDiagnostics: readonly MovePlanDiagnostic[],
): MovePlan {
  if (verificationDiagnostics.length === 0) return plan;

  return {
    ...plan,
    status: 'blocked',
    diagnostics: [...plan.diagnostics, ...verificationDiagnostics],
  };
}

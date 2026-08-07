import { createHash } from 'node:crypto';
import { computePlanHash } from './finalize-move-plan.js';
import type { MovePlan, MovePlanPrecondition } from './types.js';

/** Every path a `ready` plan touches whose current content must be fingerprinted: every move's source and every distinct edited file. */
export function collectSealPaths(plan: MovePlan): ReadonlySet<string> {
  const paths = new Set<string>();
  for (const move of plan.moves) paths.add(move.fromFilePath);
  for (const edit of plan.edits) paths.add(edit.file);
  return paths;
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Seals a `ready` plan: replaces its disk-free `source-exists`/`edit-anchor`
 * preconditions with one whole-file `content-fingerprint` per path in
 * `collectSealPaths`, and restamps `planHash` over the sealed precondition
 * set. A no-op for a `blocked` plan — there's nothing to guarantee about a
 * plan that won't be applied. `contents` must already hold every path
 * `collectSealPaths` names; reading them is the caller's job (this stays
 * pure, matching every other planner/ function).
 */
export function sealMovePlan(plan: MovePlan, contents: ReadonlyMap<string, string>): MovePlan {
  if (plan.status !== 'ready') return plan;

  const sealPaths = collectSealPaths(plan);
  const keptPreconditions = plan.preconditions.filter(
    (precondition): precondition is Extract<MovePlanPrecondition, { kind: 'source-directory' | 'destination-absent' }> =>
      precondition.kind === 'source-directory' || precondition.kind === 'destination-absent',
  );
  const fingerprints: MovePlanPrecondition[] = [...sealPaths].map((path) => ({
    kind: 'content-fingerprint',
    path,
    sha256: sha256(contents.get(path)!),
  }));
  const preconditions = [...keptPreconditions, ...fingerprints];

  return {
    ...plan,
    preconditions,
    planHash: computePlanHash(
      plan.schemaVersion,
      plan.operation,
      plan.scope,
      plan.moves,
      plan.edits,
      plan.diagnostics,
      preconditions,
    ),
  };
}

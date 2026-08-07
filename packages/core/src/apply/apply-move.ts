import { dirname } from 'node:path';
import { computePlanHash } from '../planner/finalize-move-plan.js';
import { collectSealPaths } from '../planner/seal-move-plan.js';
import type { Edit, MovePlan } from '../planner/types.js';
import { MOVE_PLAN_SCHEMA_VERSION } from '../planner/types.js';
import { applyEditsToContent } from './apply-edits-to-content.js';
import { checkPlanPreconditions } from './check-staleness.js';
import type { ApplyFilesystem } from './filesystem.js';
import { nodeFilesystem } from './filesystem.js';
import type { CompletedMove, CompletedSwap } from './file-swap.js';
import { rollbackMoves, rollbackSwaps, tempSiblingPath } from './file-swap.js';
import type { ApplyDiagnostic, ApplyResult } from './types.js';

interface TransactionJournal {
  readonly stages: Set<string>;
  readonly swaps: CompletedSwap[];
  readonly moves: CompletedMove[];
  readonly createdDirectories: string[];
}

function unique(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

function failure(path: string, err: unknown): ApplyDiagnostic {
  const message = err instanceof Error ? err.message : String(err);
  return {
    severity: 'error',
    code: 'transaction-failed',
    message: `Failed to apply changes to ${path}: ${message}`,
    path,
  };
}

function validateSealedPlan(plan: MovePlan): ApplyDiagnostic[] {
  const sealPaths = collectSealPaths(plan);
  const fingerprints = plan.preconditions.filter((condition) => condition.kind === 'content-fingerprint');
  const fingerprintPaths = new Set(fingerprints.map((condition) => condition.path));
  const destinationPaths = plan.preconditions
    .filter((condition) => condition.kind === 'destination-absent')
    .map((condition) => condition.path);
  const expectedDestinations = new Set(plan.moves.map((move) => move.toFilePath));
  const hasDraftConditions = plan.preconditions.some(
    (condition) => condition.kind === 'source-exists' || condition.kind === 'edit-anchor',
  );
  const hasEveryFingerprint =
    fingerprints.length === sealPaths.size &&
    fingerprints.every(
      (condition) => sealPaths.has(condition.path) && /^[a-f0-9]{64}$/.test(condition.sha256),
    );
  const hasEveryDestination =
    destinationPaths.length === expectedDestinations.size &&
    destinationPaths.every((path) => expectedDestinations.has(path));
  const hasExpectedSourceDirectory =
    plan.preconditions.filter((condition) => condition.kind === 'source-directory').length ===
    (plan.operation === 'directory' ? 1 : 0);
  const expectedHash = computePlanHash(
    plan.schemaVersion,
    plan.operation,
    plan.scope,
    plan.moves,
    plan.edits,
    plan.diagnostics,
    plan.preconditions,
  );

  if (
    plan.schemaVersion === MOVE_PLAN_SCHEMA_VERSION &&
    !plan.diagnostics.some((diagnostic) => diagnostic.severity === 'error') &&
    !hasDraftConditions &&
    hasEveryFingerprint &&
    fingerprintPaths.size === sealPaths.size &&
    hasEveryDestination &&
    hasExpectedSourceDirectory &&
    plan.planHash === expectedHash
  ) {
    return [];
  }

  return [
    {
      severity: 'error',
      code: 'invalid-plan',
      message: 'Refusing to apply a plan that is unsealed, malformed, or no longer matches its planHash.',
      path: undefined,
    },
  ];
}

function ensureDirectory(fs: ApplyFilesystem, path: string, createdDirectories: string[]): void {
  if (fs.existsSync(path)) return;

  let createdRoot = path;
  let parent = dirname(createdRoot);
  while (parent !== createdRoot && !fs.existsSync(parent)) {
    createdRoot = parent;
    parent = dirname(createdRoot);
  }

  createdDirectories.push(createdRoot);
  fs.mkdirSync(path, { recursive: true });
}

function cleanupStages(fs: ApplyFilesystem, stages: ReadonlySet<string>): string[] {
  const unrecovered: string[] = [];
  for (const stage of stages) {
    try {
      if (fs.existsSync(stage)) fs.rmSync(stage, { force: true });
    } catch {
      unrecovered.push(stage);
    }
  }
  return unrecovered;
}

function cleanupCreatedDirectories(fs: ApplyFilesystem, directories: readonly string[]): string[] {
  const unrecovered: string[] = [];
  for (const directory of [...directories].reverse()) {
    try {
      if (fs.existsSync(directory)) fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      unrecovered.push(directory);
    }
  }
  return unrecovered;
}

function rollbackAndReport(
  fs: ApplyFilesystem,
  journal: TransactionJournal,
  failedPath: string,
  err: unknown,
): ApplyResult {
  const unrecoveredMoves = rollbackMoves(fs, journal.moves);
  const unrecoveredSwaps = rollbackSwaps(fs, journal.swaps);
  const unrecoveredStages = cleanupStages(fs, journal.stages);
  const unrecoveredMutations = [...unrecoveredMoves, ...unrecoveredSwaps, ...unrecoveredStages];
  const unrecoveredDirectories =
    unrecoveredMutations.length === 0
      ? cleanupCreatedDirectories(fs, journal.createdDirectories)
      : journal.createdDirectories;
  const manualRecoveryPaths = unique([...unrecoveredMutations, ...unrecoveredDirectories]);
  const diagnostics: ApplyDiagnostic[] = [failure(failedPath, err)];

  if (manualRecoveryPaths.length > 0) {
    diagnostics.push({
      severity: 'error',
      code: 'transaction-failed',
      message: `Rollback could not fully restore the previous state; manually review: ${manualRecoveryPaths.join(', ')}.`,
      path: undefined,
    });
  }

  return {
    status: manualRecoveryPaths.length === 0 ? 'rejected' : 'partial',
    diagnostics,
    manualRecoveryPaths,
  };
}

function countLeftoverFiles(fs: ApplyFilesystem, dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  return fs.readdirSync(dirPath).filter((entry) => entry.isFile()).length;
}

/**
 * Applies one sealed plan through a rollback-oriented transaction. Final
 * contents are staged first, edited originals are backed up second, and
 * only then are stages and moves committed. This is not crash-proof
 * atomicity, but every in-process failure is journaled and either fully
 * rolled back or reported as `partial` with all known recovery paths.
 */
export function applyMoveWithFilesystem(plan: MovePlan, fs: ApplyFilesystem): ApplyResult {
  if (plan.status === 'blocked') {
    return {
      status: 'rejected',
      diagnostics: [
        {
          severity: 'error',
          code: 'plan-has-errors',
          message: 'Refusing to apply a plan that failed validation.',
          path: undefined,
        },
      ],
      manualRecoveryPaths: [],
    };
  }

  const invalidPlan = validateSealedPlan(plan);
  if (invalidPlan.length > 0) {
    return { status: 'rejected', diagnostics: invalidPlan, manualRecoveryPaths: [] };
  }

  const preflight = checkPlanPreconditions(plan, fs);
  if (preflight.length > 0) {
    return { status: 'rejected', diagnostics: preflight, manualRecoveryPaths: [] };
  }

  const movedFromPaths = new Set(plan.moves.map((move) => move.fromFilePath));
  const editsByFile = new Map<string, Edit[]>();
  const editsByMovedFile = new Map<string, Edit[]>();
  for (const edit of plan.edits) {
    const bucket = movedFromPaths.has(edit.file) ? editsByMovedFile : editsByFile;
    const edits = bucket.get(edit.file);
    if (edits) edits.push(edit);
    else bucket.set(edit.file, [edit]);
  }

  const journal: TransactionJournal = {
    stages: new Set(),
    swaps: [],
    moves: [],
    createdDirectories: [],
  };
  const editStages = new Map<string, string>();
  const moveStages = new Map<string, string>();
  let activePath = plan.moves[0]?.fromFilePath ?? plan.edits[0]?.file ?? '';

  try {
    for (const [file, edits] of editsByFile) {
      activePath = file;
      const stage = tempSiblingPath(file, 'tmp');
      journal.stages.add(stage);
      editStages.set(file, stage);
      fs.writeFileSync(
        stage,
        applyEditsToContent(fs.readFileSync(file), edits),
        fs.statSync(file).mode,
      );
    }

    for (const move of plan.moves) {
      activePath = move.toFilePath;
      ensureDirectory(fs, dirname(move.toFilePath), journal.createdDirectories);
      const ownEdits = editsByMovedFile.get(move.fromFilePath) ?? [];
      if (ownEdits.length === 0) continue;

      const stage = tempSiblingPath(move.toFilePath, 'tmp');
      journal.stages.add(stage);
      moveStages.set(move.fromFilePath, stage);
      fs.writeFileSync(
        stage,
        applyEditsToContent(fs.readFileSync(move.fromFilePath), ownEdits),
        fs.statSync(move.fromFilePath).mode,
      );
    }

    for (const file of editsByFile.keys()) {
      activePath = file;
      const swap = { originalPath: file, backupPath: tempSiblingPath(file, 'bak') };
      fs.renameSync(swap.originalPath, swap.backupPath);
      journal.swaps.push(swap);
    }

    for (const [file, stage] of editStages) {
      activePath = file;
      fs.renameSync(stage, file);
      journal.stages.delete(stage);
    }

    for (const move of plan.moves) {
      activePath = move.toFilePath;
      const stage = moveStages.get(move.fromFilePath);
      if (stage) {
        fs.renameSync(stage, move.toFilePath);
        journal.stages.delete(stage);
      } else {
        fs.renameSync(move.fromFilePath, move.toFilePath);
      }
      journal.moves.push({
        fromFilePath: move.fromFilePath,
        toFilePath: move.toFilePath,
        hadOwnEdits: stage !== undefined,
      });
    }
  } catch (err) {
    return rollbackAndReport(fs, journal, activePath, err);
  }

  const diagnostics: ApplyDiagnostic[] = [];
  const manualRecoveryPaths: string[] = [];

  for (const move of journal.moves) {
    if (!move.hadOwnEdits) continue;
    try {
      fs.unlinkSync(move.fromFilePath);
    } catch (err) {
      manualRecoveryPaths.push(move.fromFilePath);
      const message = err instanceof Error ? err.message : String(err);
      diagnostics.push({
        severity: 'error',
        code: 'cleanup-failed',
        message: `The destination was committed, but the old source could not be removed: ${message}`,
        path: move.fromFilePath,
      });
    }
  }

  for (const swap of journal.swaps) {
    try {
      fs.rmSync(swap.backupPath, { force: true });
    } catch (err) {
      manualRecoveryPaths.push(swap.backupPath);
      const message = err instanceof Error ? err.message : String(err);
      diagnostics.push({
        severity: 'error',
        code: 'backup-cleanup-failed',
        message: `The edit was committed, but its backup could not be removed: ${message}`,
        path: swap.backupPath,
      });
    }
  }

  if (plan.operation === 'directory' && plan.moves.length > 0) {
    const fromDirPath = plan.preconditions.find((condition) => condition.kind === 'source-directory')!.path;
    try {
      const leftoverCount = countLeftoverFiles(fs, fromDirPath);
      if (leftoverCount > 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'non-source-files-left-behind',
          message: `${leftoverCount} non-source file(s) remain in ${fromDirPath} and were not moved.`,
          path: fromDirPath,
        });
      } else {
        fs.rmSync(fromDirPath, { recursive: true, force: true });
      }
    } catch (err) {
      manualRecoveryPaths.push(fromDirPath);
      const message = err instanceof Error ? err.message : String(err);
      diagnostics.push({
        severity: 'error',
        code: 'cleanup-failed',
        message: `The move was committed, but its source directory could not be cleaned up: ${message}`,
        path: fromDirPath,
      });
    }
  }

  const recovery = unique(manualRecoveryPaths);
  return {
    status: recovery.length === 0 ? 'applied' : 'partial',
    diagnostics,
    manualRecoveryPaths: recovery,
  };
}

export function applyMove(plan: MovePlan): ApplyResult {
  return applyMoveWithFilesystem(plan, nodeFilesystem);
}

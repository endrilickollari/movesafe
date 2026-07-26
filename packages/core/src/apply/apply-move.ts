import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { Edit, MovePlan } from '../planner/types.js';
import { applyEditsToContent } from './apply-edits-to-content.js';
import { checkStaleness } from './check-staleness.js';
import type { ApplyDiagnostic, ApplyResult } from './types.js';

interface CompletedSwap {
  readonly originalPath: string;
  readonly backupPath: string;
}

function tempSiblingPath(originalPath: string, tag: 'tmp' | 'bak'): string {
  return join(dirname(originalPath), `${basename(originalPath)}.movesafe.${tag}.${randomUUID()}`);
}

/** Writes `newContent` in place of `originalPath` via write-temp + backup + swap. Returns the backup path (kept until the whole apply succeeds, in case a rollback is needed). Throws, with its own partial state cleaned up, on any failure. */
function swapInNewContent(originalPath: string, newContent: string): string {
  const tempPath = tempSiblingPath(originalPath, 'tmp');
  const backupPath = tempSiblingPath(originalPath, 'bak');

  writeFileSync(tempPath, newContent, 'utf8');

  try {
    renameSync(originalPath, backupPath);
  } catch (err) {
    rmSync(tempPath, { force: true });
    throw err;
  }

  try {
    renameSync(tempPath, originalPath);
  } catch (err) {
    renameSync(backupPath, originalPath);
    throw err;
  }

  return backupPath;
}

function rollbackSwaps(swaps: readonly CompletedSwap[]): void {
  for (const swap of swaps) {
    try {
      renameSync(swap.backupPath, swap.originalPath);
    } catch {
      // Best-effort: nothing more we can do if even the rollback fails.
    }
  }
}

function renameFailure(path: string, err: unknown): ApplyDiagnostic {
  const message = err instanceof Error ? err.message : String(err);
  return {
    severity: 'error',
    code: 'rename-failed',
    message: `Failed to apply changes to ${path}: ${message}`,
    path,
  };
}

export function applyMove(plan: MovePlan): ApplyResult {
  if (plan.diagnostics.some((d) => d.severity === 'error')) {
    return {
      applied: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'plan-has-errors',
          message: 'Refusing to apply a plan that failed validation.',
          path: undefined,
        },
      ],
    };
  }

  const staleness = checkStaleness(plan);
  if (staleness.length > 0) {
    return { applied: false, diagnostics: staleness };
  }

  const editsByFile = new Map<string, Edit[]>();
  for (const edit of plan.edits) {
    if (edit.file === plan.fromFilePath) continue;
    const existing = editsByFile.get(edit.file);
    if (existing) {
      existing.push(edit);
    } else {
      editsByFile.set(edit.file, [edit]);
    }
  }

  const completedSwaps: CompletedSwap[] = [];

  for (const [file, edits] of editsByFile) {
    const currentContent = readFileSync(file, 'utf8');
    const newContent = applyEditsToContent(currentContent, edits);
    try {
      const backupPath = swapInNewContent(file, newContent);
      completedSwaps.push({ originalPath: file, backupPath });
    } catch (err) {
      rollbackSwaps(completedSwaps);
      return { applied: false, diagnostics: [renameFailure(file, err)] };
    }
  }

  const warnings: ApplyDiagnostic[] = [];
  const ownEdits = plan.edits.filter((edit) => edit.file === plan.fromFilePath);

  try {
    mkdirSync(dirname(plan.toFilePath), { recursive: true });

    if (ownEdits.length === 0) {
      renameSync(plan.fromFilePath, plan.toFilePath);
    } else {
      const currentContent = readFileSync(plan.fromFilePath, 'utf8');
      const newContent = applyEditsToContent(currentContent, ownEdits);
      const tempPath = tempSiblingPath(plan.toFilePath, 'tmp');
      writeFileSync(tempPath, newContent, 'utf8');
      renameSync(tempPath, plan.toFilePath);
      try {
        unlinkSync(plan.fromFilePath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        warnings.push({
          severity: 'warning',
          code: 'rename-failed',
          message: `Moved content to ${plan.toFilePath} but could not remove the old file at ${plan.fromFilePath}: ${message}`,
          path: plan.fromFilePath,
        });
      }
    }
  } catch (err) {
    rollbackSwaps(completedSwaps);
    return { applied: false, diagnostics: [renameFailure(plan.fromFilePath, err)] };
  }

  for (const swap of completedSwaps) {
    rmSync(swap.backupPath, { force: true });
  }

  return { applied: true, diagnostics: warnings };
}

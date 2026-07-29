import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import type { DirectoryMovePlan, Edit } from '../planner/types.js';
import { applyEditsToContent } from './apply-edits-to-content.js';
import { checkEditsAgainstDisk } from './check-staleness.js';
import type { CompletedSwap } from './file-swap.js';
import { renameFailure, rollbackSwaps, swapInNewContent, tempSiblingPath } from './file-swap.js';
import type { ApplyDiagnostic, ApplyResult } from './types.js';

interface CompletedMove {
  readonly fromFilePath: string;
  readonly toFilePath: string;
  readonly hadOwnEdits: boolean;
}

function checkDirectoryStaleness(plan: DirectoryMovePlan): ApplyDiagnostic[] {
  const diagnostics: ApplyDiagnostic[] = [];

  for (const move of plan.moves) {
    if (!existsSync(move.fromFilePath)) {
      diagnostics.push({
        severity: 'error',
        code: 'source-file-missing',
        message: `${move.fromFilePath} no longer exists — it may have been moved or deleted since planning.`,
        path: move.fromFilePath,
      });
    }
    if (existsSync(move.toFilePath)) {
      diagnostics.push({
        severity: 'error',
        code: 'destination-already-exists',
        message: `${move.toFilePath} now exists — it may have been created since planning.`,
        path: move.toFilePath,
      });
    }
  }

  diagnostics.push(...checkEditsAgainstDisk(plan.edits));

  return diagnostics;
}

/**
 * Rolls back completed moves in the deferred-unlink scheme: a move with no
 * own edits is a plain rename, reversed by renaming back; a move that had
 * own edits never touched its source (the new content was written to a temp
 * file and swapped into the destination), so rolling it back only means
 * discarding that destination — the untouched source needs no repair.
 */
function rollbackMoves(moves: readonly CompletedMove[]): void {
  for (const move of moves) {
    try {
      if (move.hadOwnEdits) {
        rmSync(move.toFilePath, { force: true });
      } else {
        renameSync(move.toFilePath, move.fromFilePath);
      }
    } catch {
      // Best-effort: nothing more we can do if even the rollback fails.
    }
  }
}

function countLeftoverFiles(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;
  return readdirSync(dirPath, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
    .length;
}

/**
 * Directory analog of `applyMove`. Every original file is either fully
 * untouched or safely superseded by a confirmed-written destination at every
 * point mid-batch — never destructively overwritten before the whole batch
 * is confirmed successful. This mirrors `applyMove`'s own-edits branch,
 * which already defers the risky step (write temp next to the destination,
 * rename into place, only then best-effort unlink the original) rather than
 * inventing a new, more cautious scheme — generalized here to loop over many
 * moves and defer every unlink until the entire batch has succeeded.
 */
export function applyDirectoryMove(plan: DirectoryMovePlan): ApplyResult {
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

  const staleness = checkDirectoryStaleness(plan);
  if (staleness.length > 0) {
    return { applied: false, diagnostics: staleness };
  }

  const movedFromPaths = new Set(plan.moves.map((m) => m.fromFilePath));

  const editsByFile = new Map<string, Edit[]>();
  const editsByMovedFile = new Map<string, Edit[]>();
  for (const edit of plan.edits) {
    const bucket = movedFromPaths.has(edit.file) ? editsByMovedFile : editsByFile;
    const existing = bucket.get(edit.file);
    if (existing) {
      existing.push(edit);
    } else {
      bucket.set(edit.file, [edit]);
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

  const completedMoves: CompletedMove[] = [];

  for (const move of plan.moves) {
    const ownEdits = editsByMovedFile.get(move.fromFilePath) ?? [];
    try {
      mkdirSync(dirname(move.toFilePath), { recursive: true });

      if (ownEdits.length === 0) {
        renameSync(move.fromFilePath, move.toFilePath);
      } else {
        const currentContent = readFileSync(move.fromFilePath, 'utf8');
        const newContent = applyEditsToContent(currentContent, ownEdits);
        const tempPath = tempSiblingPath(move.toFilePath, 'tmp');
        writeFileSync(tempPath, newContent, 'utf8');
        renameSync(tempPath, move.toFilePath);
      }

      completedMoves.push({
        fromFilePath: move.fromFilePath,
        toFilePath: move.toFilePath,
        hadOwnEdits: ownEdits.length > 0,
      });
    } catch (err) {
      rollbackMoves(completedMoves);
      rollbackSwaps(completedSwaps);
      return { applied: false, diagnostics: [renameFailure(move.fromFilePath, err)] };
    }
  }

  const warnings: ApplyDiagnostic[] = [];

  for (const move of completedMoves) {
    if (!move.hadOwnEdits) continue;
    try {
      unlinkSync(move.fromFilePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push({
        severity: 'warning',
        code: 'rename-failed',
        message: `Moved content to ${move.toFilePath} but could not remove the old file at ${move.fromFilePath}: ${message}`,
        path: move.fromFilePath,
      });
    }
  }

  for (const swap of completedSwaps) {
    rmSync(swap.backupPath, { force: true });
  }

  const leftoverCount = countLeftoverFiles(plan.fromDirPath);
  if (leftoverCount > 0) {
    warnings.push({
      severity: 'warning',
      code: 'non-source-files-left-behind',
      message: `${leftoverCount} non-source file(s) remain in ${plan.fromDirPath} and were not moved.`,
      path: plan.fromDirPath,
    });
  } else {
    // Nothing of value is left behind — safe to remove the now-empty source
    // directory tree. Best-effort: leaving a stray empty directory around
    // isn't worth failing an otherwise-successful move over.
    try {
      rmSync(plan.fromDirPath, { recursive: true, force: true });
    } catch {
      // Ignore — an empty leftover directory is harmless.
    }
  }

  return { applied: true, diagnostics: warnings };
}

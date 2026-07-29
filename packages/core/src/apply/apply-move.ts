import { mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Edit, MovePlan } from '../planner/types.js';
import { applyEditsToContent } from './apply-edits-to-content.js';
import { checkStaleness } from './check-staleness.js';
import type { CompletedSwap } from './file-swap.js';
import { renameFailure, rollbackSwaps, swapInNewContent, tempSiblingPath } from './file-swap.js';
import type { ApplyDiagnostic, ApplyResult } from './types.js';

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

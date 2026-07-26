import { existsSync, readFileSync } from 'node:fs';
import type { Edit, MovePlan } from '../planner/types.js';
import type { ApplyDiagnostic } from './types.js';

/**
 * Verifies nothing relevant has changed since the plan was computed. Rather
 * than a separate mtime/hash snapshot (which would require planner/ to touch
 * disk, breaking its tested disk-free guarantee), this re-reads each
 * affected file once and confirms every edit's `oldText` still matches the
 * live content at `span` — the plan's own Edit model already encodes exactly
 * what it believed was there, so checking that directly is both simpler and
 * more precise than a whole-file staleness heuristic.
 */
export function checkStaleness(plan: MovePlan): ApplyDiagnostic[] {
  const diagnostics: ApplyDiagnostic[] = [];

  if (!existsSync(plan.fromFilePath)) {
    diagnostics.push({
      severity: 'error',
      code: 'source-file-missing',
      message: `${plan.fromFilePath} no longer exists — it may have been moved or deleted since planning.`,
      path: plan.fromFilePath,
    });
  }

  if (existsSync(plan.toFilePath)) {
    diagnostics.push({
      severity: 'error',
      code: 'destination-already-exists',
      message: `${plan.toFilePath} now exists — it may have been created since planning.`,
      path: plan.toFilePath,
    });
  }

  const editsByFile = new Map<string, Edit[]>();
  for (const edit of plan.edits) {
    const existing = editsByFile.get(edit.file);
    if (existing) {
      existing.push(edit);
    } else {
      editsByFile.set(edit.file, [edit]);
    }
  }

  for (const [file, edits] of editsByFile) {
    if (!existsSync(file)) {
      diagnostics.push({
        severity: 'error',
        code: 'stale-content',
        message: `${file} no longer exists — cannot apply its edits.`,
        path: file,
      });
      continue;
    }

    const currentText = readFileSync(file, 'utf8');
    for (const edit of edits) {
      const liveText = currentText.slice(edit.span.start, edit.span.end);
      if (liveText !== edit.oldText) {
        diagnostics.push({
          severity: 'error',
          code: 'stale-content',
          message: `${file} has changed since planning — expected '${edit.oldText}' at the recorded position but found '${liveText}'.`,
          path: file,
        });
      }
    }
  }

  return diagnostics;
}

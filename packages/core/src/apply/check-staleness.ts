import { existsSync, readFileSync } from 'node:fs';
import type { MovePlan } from '../planner/types.js';
import type { ApplyDiagnostic } from './types.js';

/**
 * Verifies nothing relevant has changed since the plan was computed, by
 * walking `plan.preconditions` generically — the same array shape covers
 * file/directory/cross-package plans alike, replacing what used to be three
 * bespoke staleness checks. Edit-anchor preconditions are checked against
 * live content rather than a separate mtime/hash snapshot: the plan's own
 * `Edit` model already encodes exactly what it believed was there, so
 * confirming that directly is both simpler and more precise than a
 * whole-file staleness heuristic.
 */
export function checkPlanPreconditions(plan: MovePlan): ApplyDiagnostic[] {
  const diagnostics: ApplyDiagnostic[] = [];
  const contentByFile = new Map<string, string | undefined>();
  const missingFilesReported = new Set<string>();

  const readCached = (file: string): string | undefined => {
    if (contentByFile.has(file)) return contentByFile.get(file);
    const content = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
    contentByFile.set(file, content);
    return content;
  };

  for (const precondition of plan.preconditions) {
    switch (precondition.kind) {
      case 'source-directory':
        if (!existsSync(precondition.path)) {
          diagnostics.push({
            severity: 'error',
            code: 'source-file-missing',
            message: `${precondition.path} no longer exists — it may have been moved or deleted since planning.`,
            path: precondition.path,
          });
        }
        break;

      case 'source-exists':
        if (!existsSync(precondition.path)) {
          diagnostics.push({
            severity: 'error',
            code: 'source-file-missing',
            message: `${precondition.path} no longer exists — it may have been moved or deleted since planning.`,
            path: precondition.path,
          });
        }
        break;

      case 'destination-absent':
        if (existsSync(precondition.path)) {
          diagnostics.push({
            severity: 'error',
            code: 'destination-already-exists',
            message: `${precondition.path} now exists — it may have been created since planning.`,
            path: precondition.path,
          });
        }
        break;

      case 'edit-anchor': {
        const content = readCached(precondition.file);
        if (content === undefined) {
          if (!missingFilesReported.has(precondition.file)) {
            missingFilesReported.add(precondition.file);
            diagnostics.push({
              severity: 'error',
              code: 'stale-content',
              message: `${precondition.file} no longer exists — cannot apply its edits.`,
              path: precondition.file,
            });
          }
          break;
        }

        const liveText = content.slice(precondition.span.start, precondition.span.end);
        if (liveText !== precondition.oldText) {
          diagnostics.push({
            severity: 'error',
            code: 'stale-content',
            message: `${precondition.file} has changed since planning — expected '${precondition.oldText}' at the recorded position but found '${liveText}'.`,
            path: precondition.file,
          });
        }
        break;
      }
    }
  }

  return diagnostics;
}

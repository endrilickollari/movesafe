import { createHash } from 'node:crypto';
import type { MovePlan } from '../planner/types.js';
import type { ApplyFilesystem } from './filesystem.js';
import { nodeFilesystem } from './filesystem.js';
import type { ApplyDiagnostic } from './types.js';

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Verifies nothing relevant has changed since the plan was computed, by
 * walking `plan.preconditions` generically — the same array shape covers
 * file/directory/cross-package plans alike. A sealed (`ready`) plan carries
 * whole-file `content-fingerprint` preconditions instead of `edit-anchor`s
 * (see `planner/seal-move-plan.ts`) — any drift anywhere in a touched file,
 * not just at an edited span, rejects the plan before mutation.
 * `source-exists`/`edit-anchor` belong to unsealed draft plans, kept for
 * structural completeness; apply rejects those drafts before preflight.
 */
export function checkPlanPreconditions(
  plan: MovePlan,
  fs: ApplyFilesystem = nodeFilesystem,
): ApplyDiagnostic[] {
  const diagnostics: ApplyDiagnostic[] = [];
  const contentByFile = new Map<string, string | undefined>();
  const missingFilesReported = new Set<string>();
  const staleFiles = new Set<string>();

  const reportReadFailure = (file: string, err?: unknown): void => {
    if (missingFilesReported.has(file)) return;
    missingFilesReported.add(file);
    staleFiles.add(file);
    const detail = err instanceof Error ? `: ${err.message}` : '';
    diagnostics.push({
      severity: 'error',
      code: 'source-file-missing',
      message: `${file} cannot be read for preflight validation${detail}`,
      path: file,
    });
  };

  const readCached = (file: string): string | undefined => {
    if (contentByFile.has(file)) return contentByFile.get(file);
    try {
      const content = fs.existsSync(file) ? fs.readFileSync(file) : undefined;
      contentByFile.set(file, content);
      if (content === undefined) reportReadFailure(file);
      return content;
    } catch (err) {
      contentByFile.set(file, undefined);
      reportReadFailure(file, err);
      return undefined;
    }
  };

  const exists = (path: string): boolean | undefined => {
    try {
      return fs.existsSync(path);
    } catch (err) {
      reportReadFailure(path, err);
      return undefined;
    }
  };

  for (const precondition of plan.preconditions) {
    switch (precondition.kind) {
      case 'source-directory':
        if (exists(precondition.path) === false) {
          diagnostics.push({
            severity: 'error',
            code: 'source-file-missing',
            message: `${precondition.path} no longer exists — it may have been moved or deleted since planning.`,
            path: precondition.path,
          });
        }
        break;

      case 'source-exists':
        if (exists(precondition.path) === false) {
          diagnostics.push({
            severity: 'error',
            code: 'source-file-missing',
            message: `${precondition.path} no longer exists — it may have been moved or deleted since planning.`,
            path: precondition.path,
          });
        }
        break;

      case 'destination-absent':
        if (exists(precondition.path) === true) {
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
        if (content === undefined) break;

        const liveText = content.slice(precondition.span.start, precondition.span.end);
        if (liveText !== precondition.oldText) {
          staleFiles.add(precondition.file);
          diagnostics.push({
            severity: 'error',
            code: 'stale-content',
            message: `${precondition.file} has changed since planning — expected '${precondition.oldText}' at the recorded position but found '${liveText}'.`,
            path: precondition.file,
          });
        }
        break;
      }

      case 'content-fingerprint': {
        const content = readCached(precondition.path);
        if (content === undefined) break;

        if (sha256(content) !== precondition.sha256) {
          staleFiles.add(precondition.path);
          diagnostics.push({
            severity: 'error',
            code: 'stale-content',
            message: `${precondition.path} has changed since planning — its content no longer matches the sealed fingerprint.`,
            path: precondition.path,
          });
        }
        break;
      }
    }
  }

  for (const edit of plan.edits) {
    if (staleFiles.has(edit.file)) continue;
    const content = readCached(edit.file);
    if (content === undefined) continue;
    const validSpan = edit.span.start >= 0 && edit.span.end >= edit.span.start && edit.span.end <= content.length;
    if (validSpan && content.slice(edit.span.start, edit.span.end) === edit.oldText) continue;
    staleFiles.add(edit.file);
    diagnostics.push({
      severity: 'error',
      code: 'stale-content',
      message: `${edit.file} no longer matches the edit range recorded in the sealed plan.`,
      path: edit.file,
    });
  }

  return diagnostics;
}

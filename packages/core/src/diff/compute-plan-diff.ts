import { existsSync, readFileSync } from 'node:fs';
import { applyEditsToContent } from '../apply/apply-edits-to-content.js';
import type { Edit, MovePlan } from '../planner/types.js';
import { computeChangedIntervals } from './compute-changed-intervals.js';
import { buildLineOffsets } from './line-offsets.js';
import { mergeChangedSegments } from './merge-changed-segments.js';
import { renderDiffHunk } from './render-diff-hunk.js';
import type { FileDiff, PlanDiff } from './types.js';

function buildFileDiff(
  oldPath: string,
  newPath: string,
  beforeText: string,
  edits: readonly Edit[],
): FileDiff {
  if (edits.length === 0) {
    return { oldPath, newPath, hunks: [] };
  }

  const afterText = applyEditsToContent(beforeText, edits);
  const beforeOffsets = buildLineOffsets(beforeText);
  const afterOffsets = buildLineOffsets(afterText);

  const changes = computeChangedIntervals(edits, beforeOffsets, afterOffsets);
  const segments = mergeChangedSegments(changes);
  const hunk = renderDiffHunk(beforeText, beforeOffsets, afterText, afterOffsets, segments);

  return { oldPath, newPath, hunks: [hunk] };
}

/** Renders a `MovePlan` as structured, per-file diff data — read-only, no writes. A preview analog of `apply/`, reusing `applyEditsToContent` so the preview matches what `applyMove` would actually produce. */
export function computePlanDiff(plan: MovePlan): PlanDiff {
  const movedFromPaths = new Set(plan.moves.map((move) => move.fromFilePath));

  const editsByFile = new Map<string, Edit[]>();
  for (const edit of plan.edits) {
    if (movedFromPaths.has(edit.file)) continue;
    const existing = editsByFile.get(edit.file);
    if (existing) {
      existing.push(edit);
    } else {
      editsByFile.set(edit.file, [edit]);
    }
  }

  const files: FileDiff[] = [];

  for (const move of plan.moves) {
    if (!existsSync(move.fromFilePath)) continue;
    const ownEdits = plan.edits.filter((edit) => edit.file === move.fromFilePath);
    const beforeText = readFileSync(move.fromFilePath, 'utf8');
    files.push(buildFileDiff(move.fromFilePath, move.toFilePath, beforeText, ownEdits));
  }

  for (const [file, edits] of editsByFile) {
    if (!existsSync(file)) continue;
    const beforeText = readFileSync(file, 'utf8');
    files.push(buildFileDiff(file, file, beforeText, edits));
  }

  return { files };
}

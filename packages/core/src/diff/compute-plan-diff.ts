import { existsSync, readFileSync } from 'node:fs';
import { applyEditsToContent } from '../apply/apply-edits-to-content.js';
import type { Edit, MovePlan } from '../planner/types.js';
import { buildLineOffsets, lineIndexAt, sliceLine } from './line-offsets.js';
import type { DiffHunk, DiffLine, FileDiff, PlanDiff } from './types.js';

const CONTEXT = 3;

interface LineInterval {
  readonly start: number;
  readonly count: number;
}

interface ChangedSegment {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

function intervalFor(offsets: readonly number[], rangeStart: number, rangeEnd: number): LineInterval {
  if (rangeStart === rangeEnd) {
    const lineIdx = lineIndexAt(offsets, rangeStart);
    return offsets[lineIdx] === rangeStart ? { start: lineIdx, count: 0 } : { start: lineIdx, count: 1 };
  }
  const startLine = lineIndexAt(offsets, rangeStart);
  const endLine = lineIndexAt(offsets, rangeEnd - 1);
  return { start: startLine, count: endLine - startLine + 1 };
}

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

  const sorted = [...edits].sort((a, b) => a.span.start - b.span.start);
  let shift = 0;
  const changes: { old: LineInterval; new: LineInterval }[] = [];
  for (const edit of sorted) {
    const oldInterval = intervalFor(beforeOffsets, edit.span.start, edit.span.end);
    const afterStart = edit.span.start + shift;
    const afterEnd = afterStart + edit.newText.length;
    const newInterval = intervalFor(afterOffsets, afterStart, afterEnd);
    changes.push({ old: oldInterval, new: newInterval });
    shift += edit.newText.length - (edit.span.end - edit.span.start);
  }

  const segments: ChangedSegment[] = [];
  for (const change of changes) {
    const last = segments[segments.length - 1];
    if (last && change.old.start <= last.oldStart + last.oldCount) {
      const oldEnd = Math.max(last.oldStart + last.oldCount, change.old.start + change.old.count);
      const newEnd = Math.max(last.newStart + last.newCount, change.new.start + change.new.count);
      last.oldCount = oldEnd - last.oldStart;
      last.newCount = newEnd - last.newStart;
    } else {
      segments.push({
        oldStart: change.old.start,
        oldCount: change.old.count,
        newStart: change.new.start,
        newCount: change.new.count,
      });
    }
  }

  const totalOldLines = beforeOffsets.length;
  const firstSegment = segments[0]!;
  const lastSegment = segments[segments.length - 1]!;

  const oldRangeStart = Math.max(0, firstSegment.oldStart - CONTEXT);
  const oldRangeEnd = Math.min(totalOldLines, lastSegment.oldStart + lastSegment.oldCount + CONTEXT);
  const newRangeStart = firstSegment.newStart - (firstSegment.oldStart - oldRangeStart);

  const lines: DiffLine[] = [];
  let cursorOld = oldRangeStart;
  let cursorNew = newRangeStart;

  for (const segment of segments) {
    const gapCount = segment.oldStart - cursorOld;
    for (let i = 0; i < gapCount; i++) {
      lines.push({ kind: 'context', text: sliceLine(beforeText, beforeOffsets, cursorOld + i) });
    }
    cursorOld = segment.oldStart;
    cursorNew += gapCount;

    for (let i = 0; i < segment.oldCount; i++) {
      lines.push({ kind: 'removed', text: sliceLine(beforeText, beforeOffsets, cursorOld + i) });
    }
    cursorOld += segment.oldCount;

    for (let i = 0; i < segment.newCount; i++) {
      lines.push({ kind: 'added', text: sliceLine(afterText, afterOffsets, segment.newStart + i) });
    }
    cursorNew = segment.newStart + segment.newCount;
  }

  const trailingCount = oldRangeEnd - cursorOld;
  for (let i = 0; i < trailingCount; i++) {
    lines.push({ kind: 'context', text: sliceLine(beforeText, beforeOffsets, cursorOld + i) });
  }
  cursorOld += trailingCount;
  cursorNew += trailingCount;

  const hunk: DiffHunk = {
    oldStart: oldRangeStart + 1,
    oldLines: oldRangeEnd - oldRangeStart,
    newStart: newRangeStart + 1,
    newLines: cursorNew - newRangeStart,
    lines,
  };

  return { oldPath, newPath, hunks: [hunk] };
}

/** Renders a `MovePlan` as structured, per-file diff data — read-only, no writes. A preview analog of `apply/`, reusing `applyEditsToContent` so the preview matches what `applyMove` would actually produce. */
export function computePlanDiff(plan: MovePlan): PlanDiff {
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

  const files: FileDiff[] = [];

  if (existsSync(plan.fromFilePath)) {
    const ownEdits = plan.edits.filter((edit) => edit.file === plan.fromFilePath);
    const beforeText = readFileSync(plan.fromFilePath, 'utf8');
    files.push(buildFileDiff(plan.fromFilePath, plan.toFilePath, beforeText, ownEdits));
  }

  for (const [file, edits] of editsByFile) {
    if (!existsSync(file)) continue;
    const beforeText = readFileSync(file, 'utf8');
    files.push(buildFileDiff(file, file, beforeText, edits));
  }

  return { files };
}

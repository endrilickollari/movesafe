import type { ChangedSegment } from './merge-changed-segments.js';
import { sliceLine } from './line-offsets.js';
import type { DiffHunk, DiffLine } from './types.js';

const CONTEXT = 3;

/** Renders merged changed segments as a single unified-diff hunk, padded with up to `CONTEXT` lines of surrounding context on each side. */
export function renderDiffHunk(
  beforeText: string,
  beforeOffsets: readonly number[],
  afterText: string,
  afterOffsets: readonly number[],
  segments: readonly ChangedSegment[],
): DiffHunk {
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

  return {
    oldStart: oldRangeStart + 1,
    oldLines: oldRangeEnd - oldRangeStart,
    newStart: newRangeStart + 1,
    newLines: cursorNew - newRangeStart,
    lines,
  };
}

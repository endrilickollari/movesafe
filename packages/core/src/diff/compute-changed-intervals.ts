import type { Edit } from '../planner/types.js';
import { lineIndexAt } from './line-offsets.js';

export interface LineInterval {
  readonly start: number;
  readonly count: number;
}

export interface ChangedInterval {
  readonly old: LineInterval;
  readonly new: LineInterval;
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

/** Maps each edit's character-offset span to the line interval it occupies before and after applying it, in edit order. */
export function computeChangedIntervals(
  edits: readonly Edit[],
  beforeOffsets: readonly number[],
  afterOffsets: readonly number[],
): ChangedInterval[] {
  const sorted = [...edits].sort((a, b) => a.span.start - b.span.start);
  let shift = 0;
  const changes: ChangedInterval[] = [];

  for (const edit of sorted) {
    const oldInterval = intervalFor(beforeOffsets, edit.span.start, edit.span.end);
    const afterStart = edit.span.start + shift;
    const afterEnd = afterStart + edit.newText.length;
    const newInterval = intervalFor(afterOffsets, afterStart, afterEnd);
    changes.push({ old: oldInterval, new: newInterval });
    shift += edit.newText.length - (edit.span.end - edit.span.start);
  }

  return changes;
}

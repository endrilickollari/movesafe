import type { ChangedInterval } from './compute-changed-intervals.js';

export interface ChangedSegment {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

/** Coalesces adjacent/overlapping changed intervals into contiguous segments, so touching edits render as one hunk region instead of several. */
export function mergeChangedSegments(changes: readonly ChangedInterval[]): ChangedSegment[] {
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

  return segments;
}

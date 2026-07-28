export interface DiffLine {
  readonly kind: 'context' | 'added' | 'removed';
  readonly text: string;
}

export interface DiffHunk {
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly lines: readonly DiffLine[];
}

export interface FileDiff {
  readonly oldPath: string;
  readonly newPath: string;
  readonly hunks: readonly DiffHunk[];
}

export interface PlanDiff {
  readonly files: readonly FileDiff[];
}

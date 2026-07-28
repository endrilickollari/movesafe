import type { FileDiff, PlanDiff } from './types.js';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function colorize(text: string, code: string, color: boolean | undefined): string {
  return color ? `${code}${text}${RESET}` : text;
}

function renderFileDiff(file: FileDiff, color: boolean | undefined): string[] {
  const out: string[] = [];

  if (file.oldPath !== file.newPath) {
    out.push(`${file.oldPath} -> ${file.newPath}`);
  }

  if (file.hunks.length === 0) {
    return out;
  }

  out.push(colorize(`--- a/${file.oldPath}`, CYAN, color));
  out.push(colorize(`+++ b/${file.newPath}`, CYAN, color));

  for (const hunk of file.hunks) {
    out.push(
      colorize(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`, CYAN, color),
    );
    for (const line of hunk.lines) {
      if (line.kind === 'removed') {
        out.push(colorize(`-${line.text}`, RED, color));
      } else if (line.kind === 'added') {
        out.push(colorize(`+${line.text}`, GREEN, color));
      } else {
        out.push(` ${line.text}`);
      }
    }
  }

  return out;
}

/** Renders a `PlanDiff` as git-style unified diff text. `color` is caller-supplied (not TTY-detected) so this stays pure and deterministic. */
export function renderPlanDiff(diff: PlanDiff, options?: { readonly color?: boolean }): string {
  const lines: string[] = [];
  for (const file of diff.files) {
    lines.push(...renderFileDiff(file, options?.color));
  }
  return lines.join('\n');
}

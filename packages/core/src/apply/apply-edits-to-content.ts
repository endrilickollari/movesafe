import type { Edit } from '../planner/types.js';

/**
 * Applies every edit to `sourceText`, splicing from the end of the string
 * backward so earlier offsets stay valid as later (higher-offset) edits are
 * applied first. Assumes edits for one file never overlap — true here since
 * each edit corresponds to one specifier's disjoint text range.
 */
export function applyEditsToContent(sourceText: string, edits: readonly Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.span.start - a.span.start);

  let result = sourceText;
  for (const edit of sorted) {
    result = result.slice(0, edit.span.start) + edit.newText + result.slice(edit.span.end);
  }

  return result;
}

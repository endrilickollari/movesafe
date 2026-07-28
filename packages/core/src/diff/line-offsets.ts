/** Offset of the first character of each line in `text`. Never includes a phantom trailing empty line for text ending in '\n'. */
export function buildLineOffsets(text: string): number[] {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      offsets.push(i + 1);
    }
  }
  const last = offsets[offsets.length - 1];
  if (offsets.length > 1 && last === text.length) {
    offsets.pop();
  }
  return offsets;
}

/** Largest line index `i` such that `offsets[i] <= charOffset`. */
export function lineIndexAt(offsets: readonly number[], charOffset: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (offsets[mid] <= charOffset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/** Line content at `lineIndex`, with its own trailing '\n' stripped if present. */
export function sliceLine(text: string, offsets: readonly number[], lineIndex: number): string {
  const start = offsets[lineIndex];
  const end = lineIndex + 1 < offsets.length ? offsets[lineIndex + 1] : text.length;
  const line = text.slice(start, end);
  return line.endsWith('\n') ? line.slice(0, -1) : line;
}

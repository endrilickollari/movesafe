import { posix } from 'node:path';

/** True if `path` is strictly inside `dirPath` (not equal to it), using segment-aware comparison so `src/foobar` is never mistaken for being under `src/foo`. */
export function isPathUnder(path: string, dirPath: string): boolean {
  const relative = posix.relative(dirPath, path);
  return relative !== '' && !relative.startsWith('..') && !posix.isAbsolute(relative);
}

/** Rewrites `filePath` (known to be under `fromDirPath`) to the equivalent path under `toDirPath`, preserving its relative position in the subtree. */
export function substituteDirPrefix(filePath: string, fromDirPath: string, toDirPath: string): string {
  const relative = posix.relative(fromDirPath, filePath);
  return posix.join(toDirPath, relative);
}

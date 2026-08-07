import { join, relative } from 'node:path';
import { isPathInside } from '../path-utils.js';

/** True if `path` is strictly inside `dirPath` (not equal to it), using segment-aware comparison so `src/foobar` is never mistaken for being under `src/foo`. */
export function isPathUnder(path: string, dirPath: string): boolean {
  return isPathInside(path, dirPath);
}

/** Rewrites `filePath` (known to be under `fromDirPath`) to the equivalent path under `toDirPath`, preserving its relative position in the subtree. */
export function substituteDirPrefix(filePath: string, fromDirPath: string, toDirPath: string): string {
  return join(toDirPath, relative(fromDirPath, filePath));
}

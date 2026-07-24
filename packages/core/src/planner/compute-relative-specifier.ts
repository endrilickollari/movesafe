import { posix } from 'node:path';
import { splitSpecifierExtension } from './specifier-extension.js';

function stripRealExtension(filePath: string): string {
  const ext = posix.extname(filePath);
  return ext ? filePath.slice(0, -ext.length) : filePath;
}

/**
 * Recomputes a relative specifier so it points at `newTargetFilePath` from
 * `importerFilePath`'s own (unchanged) directory. The new specifier's
 * extension suffix is preserved from `oldSpecifierText`, not from the real
 * file — e.g. an old specifier ending in `.js` stays `.js` even though the
 * real file is `.ts`, matching this codebase's NodeNext-style convention.
 */
export function computeRelativeSpecifier(
  importerFilePath: string,
  newTargetFilePath: string,
  oldSpecifierText: string,
): string {
  const importerDir = posix.dirname(importerFilePath);
  const targetNoExt = stripRealExtension(newTargetFilePath);
  let relativeNoExt = posix.relative(importerDir, targetNoExt);
  if (!relativeNoExt.startsWith('.')) {
    relativeNoExt = `./${relativeNoExt}`;
  }
  const { ext: specifierExt } = splitSpecifierExtension(oldSpecifierText);
  return `${relativeNoExt}${specifierExt}`;
}

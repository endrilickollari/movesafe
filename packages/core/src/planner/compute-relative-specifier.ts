import { dirname, extname, relative } from 'node:path';
import { toModulePath } from '../path-utils.js';
import { splitSpecifierExtension } from './specifier-extension.js';

function stripRealExtension(filePath: string): string {
  const ext = extname(filePath);
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
  const importerDir = dirname(importerFilePath);
  const targetNoExt = stripRealExtension(newTargetFilePath);
  let relativeNoExt = toModulePath(relative(importerDir, targetNoExt));
  if (!relativeNoExt.startsWith('.')) {
    relativeNoExt = `./${relativeNoExt}`;
  }
  const { ext: specifierExt } = splitSpecifierExtension(oldSpecifierText);
  return `${relativeNoExt}${specifierExt}`;
}

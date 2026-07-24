const RECOGNIZED_SPECIFIER_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.mjs', '.cjs', '.js', '.mts', '.cts'];

/**
 * Splits a specifier's recognized trailing extension off, if any (e.g.
 * `./foo.js` -> `{ base: './foo', ext: '.js' }`). Used to preserve a
 * specifier's extension-style convention across a rewrite, independent of
 * the real file's actual extension.
 */
export function splitSpecifierExtension(specifierText: string): { base: string; ext: string } {
  for (const ext of RECOGNIZED_SPECIFIER_EXTENSIONS) {
    if (specifierText.endsWith(ext)) {
      return { base: specifierText.slice(0, -ext.length), ext };
    }
  }
  return { base: specifierText, ext: '' };
}

import type { LoadedTsconfig } from '../resolver/types.js';

export interface DiscoveredProjectFiles {
  readonly sourceFiles: readonly string[];
  readonly nonSourceFiles: readonly string[];
}

const DECLARATION_EXTENSIONS = ['.d.ts', '.d.mts', '.d.cts'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

function isSourceFile(filePath: string): boolean {
  if (DECLARATION_EXTENSIONS.some((ext) => filePath.endsWith(ext))) return false;
  return SOURCE_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}

/**
 * Ambient declaration files (.d.ts) never get moved by a rewriter and .json
 * files can't contain import statements to scan, so neither becomes a graph
 * node — but both remain valid edge targets (`inProjectNonSourceFile`).
 */
export function discoverProjectFiles(tsconfig: LoadedTsconfig): DiscoveredProjectFiles {
  const sourceFiles: string[] = [];
  const nonSourceFiles: string[] = [];

  for (const filePath of tsconfig.fileNames) {
    if (isSourceFile(filePath)) {
      sourceFiles.push(filePath);
    } else {
      nonSourceFiles.push(filePath);
    }
  }

  return { sourceFiles, nonSourceFiles };
}

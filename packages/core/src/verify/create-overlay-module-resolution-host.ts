import { dirname } from 'node:path';
import * as ts from 'typescript';
import { canonicalPath } from '../path-utils.js';

/** Every ancestor directory of a live (non-`null`) overlay entry, up to the filesystem root — resolution probes `directoryExists` before `fileExists`, so a destination directory that doesn't exist on real disk yet must still report as present. */
function overlayDirectories(overlay: ReadonlyMap<string, string | null>): ReadonlySet<string> {
  const dirs = new Set<string>();
  for (const [path, content] of overlay) {
    if (content === null) continue;
    let dir = dirname(path);
    while (!dirs.has(dir)) {
      dirs.add(dir);
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return dirs;
}

/**
 * Wraps a `ts.ModuleResolutionHost` so resolution sees a simulated post-move
 * filesystem instead of what's actually on disk: `overlay` maps an absolute
 * path to its post-move content, or to `null` when the path no longer exists
 * there (the move's `fromFilePath`). Every other path falls through to
 * `base` untouched. This smaller host is also reused by the compiler-host
 * wrapper below and for explicit CommonJS resolution checks.
 */
export function createOverlayModuleResolutionHost(
  base: ts.ModuleResolutionHost,
  overlay: ReadonlyMap<string, string | null>,
): ts.ModuleResolutionHost {
  const entries = new Map(
    [...overlay].map(([path, content]) => [canonicalPath(path), content] as const),
  );
  const dirs = overlayDirectories(entries);

  const fileExists = (fileName: string): boolean => {
    const path = canonicalPath(fileName);
    if (entries.has(path)) return entries.get(path) !== null;
    return base.fileExists(fileName);
  };

  const readFile = (fileName: string): string | undefined => {
    const path = canonicalPath(fileName);
    if (entries.has(path)) return entries.get(path) ?? undefined;
    return base.readFile(fileName);
  };

  const directoryExists = (directoryName: string): boolean => {
    if (dirs.has(canonicalPath(directoryName))) return true;
    return base.directoryExists?.(directoryName) ?? true;
  };

  return { ...base, fileExists, readFile, directoryExists };
}

/** Compiler-host counterpart used to build a complete post-move `Program` over the same overlay. */
export function createOverlayCompilerHost(
  compilerOptions: ts.CompilerOptions,
  overlay: ReadonlyMap<string, string | null>,
  moduleResolutionHost?: ts.ModuleResolutionHost,
): ts.CompilerHost {
  const base = ts.createCompilerHost(compilerOptions, true);
  const resolutionHost = createOverlayModuleResolutionHost(moduleResolutionHost ?? base, overlay);

  return {
    ...base,
    fileExists: resolutionHost.fileExists,
    readFile: resolutionHost.readFile,
    directoryExists: resolutionHost.directoryExists,
    realpath: resolutionHost.realpath,
    getSourceFile(fileName, languageVersionOrOptions, onError) {
      const sourceText = resolutionHost.readFile(fileName);
      if (sourceText === undefined) {
        onError?.(`Cannot read ${fileName}`);
        return undefined;
      }
      return ts.createSourceFile(
        fileName,
        sourceText,
        languageVersionOrOptions,
        true,
      );
    },
  };
}

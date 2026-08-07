import { extname, join, relative } from 'node:path';
import { toModulePath } from '../path-utils.js';
import type { TsconfigPaths } from '../tsconfig/types.js';
import { splitSpecifierExtension } from './specifier-extension.js';

export interface MatchedPathsAlias {
  readonly key: string;
  readonly target: string;
  readonly capture: string;
}

function stripRealExtension(filePath: string): string {
  const ext = extname(filePath);
  return ext ? filePath.slice(0, -ext.length) : filePath;
}

/** Classic single-`*`-wildcard TS-paths matcher: no `*` means exact match only. */
function matchWildcard(pattern: string, text: string): string | undefined {
  const starIndex = pattern.indexOf('*');
  if (starIndex === -1) {
    return text === pattern ? '' : undefined;
  }
  const prefix = pattern.slice(0, starIndex);
  const suffix = pattern.slice(starIndex + 1);
  if (!text.startsWith(prefix) || !text.endsWith(suffix)) return undefined;
  if (text.length < prefix.length + suffix.length) return undefined;
  return text.slice(prefix.length, text.length - suffix.length);
}

/**
 * Finds which `paths` entry produced `specifierText`, verified by resolving
 * the candidate (not just matching text) against `expectedResolvedFilePath`
 * — the file we already independently know this specifier resolves to (via
 * the import graph). Only trusts a match when exactly one (key, target) pair
 * verifies; ambiguous or unverifiable matches return `undefined` rather than
 * guessing.
 */
export function matchPathsAlias(
  specifierText: string,
  paths: TsconfigPaths,
  expectedResolvedFilePath: string,
): MatchedPathsAlias | undefined {
  if (!paths.paths || !paths.pathsBaseDir) return undefined;

  const { base: specifierNoExt } = splitSpecifierExtension(specifierText);
  const expectedNoExt = stripRealExtension(expectedResolvedFilePath);
  const candidates: MatchedPathsAlias[] = [];

  for (const [key, targets] of Object.entries(paths.paths)) {
    const capture = matchWildcard(key, specifierNoExt);
    if (capture === undefined) continue;

    for (const target of targets) {
      const substituted = target.includes('*') ? target.replace('*', capture) : target;
      const resolvedNoExt = stripRealExtension(join(paths.pathsBaseDir, substituted));
      if (resolvedNoExt === expectedNoExt) {
        candidates.push({ key, target, capture });
      }
    }
  }

  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * Builds the new alias specifier for `newTargetFilePath`, reusing the same
 * pattern `matched` was found under, and preserving `oldSpecifierText`'s
 * extension-style convention (matching `computeRelativeSpecifier`'s
 * behavior). Returns `undefined` if the moved file no longer falls under the
 * directory this alias's target covers — the same alias pattern literally
 * cannot represent the new location.
 */
export function computeAliasSpecifier(
  matched: MatchedPathsAlias,
  paths: TsconfigPaths,
  newTargetFilePath: string,
  oldSpecifierText: string,
): string | undefined {
  if (!paths.pathsBaseDir) return undefined;

  const targetStarIndex = matched.target.indexOf('*');
  if (targetStarIndex === -1) return undefined;

  const keyStarIndex = matched.key.indexOf('*');
  if (keyStarIndex === -1) return undefined;

  const targetPrefix = matched.target.slice(0, targetStarIndex);
  const targetDir = join(paths.pathsBaseDir, targetPrefix);
  const newTargetNoExt = stripRealExtension(newTargetFilePath);
  const newCapture = toModulePath(relative(targetDir, newTargetNoExt));

  if (newCapture.startsWith('..')) return undefined;

  const keyPrefix = matched.key.slice(0, keyStarIndex);
  const keySuffix = matched.key.slice(keyStarIndex + 1);
  const { ext: specifierExt } = splitSpecifierExtension(oldSpecifierText);
  return `${keyPrefix}${newCapture}${keySuffix}${specifierExt}`;
}

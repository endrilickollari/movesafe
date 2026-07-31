import { readdirSync } from 'node:fs';
import { posix } from 'node:path';
import type { ImportGraph } from '../graph/types.js';
import type { CheckFinding } from './types.js';

function stripExt(name: string): string {
  const ext = posix.extname(name);
  return ext ? name.slice(0, -ext.length) : name;
}

function findRealEntry(dir: string, matches: (entry: string) => boolean): string | undefined {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return undefined;
  }
  return entries.find(matches);
}

/**
 * A relative specifier whose case differs from the real on-disk name resolves
 * fine on a case-insensitive filesystem (this dev machine) but breaks on
 * case-sensitive CI or deployment targets. Since `ts.resolveModuleName`
 * resolves through case-insensitivity transparently, a wrongly-cased
 * *intermediate* directory segment (not just the leaf filename) needs
 * checking too — this walks the specifier's path segment by segment from the
 * importer's own directory, comparing each against the real directory
 * listing case-sensitively, rather than only inspecting the final directory.
 *
 * Scoped to relative specifiers only — alias/workspace specifiers resolve
 * through `node_modules`/symlinks, a different concern. Deliberately NOT
 * gated on `target.kind`: verified empirically that a case-mismatched
 * relative specifier's `resolvedFileName` preserves the *specifier's* wrong
 * casing rather than the real on-disk casing, which makes the graph's own
 * classification miss it as `inProject` and fall through to `outOfProject`
 * instead — exactly the edges this check exists to catch. The directory
 * walk below reads the specifier text directly, not `target.filePath`, so
 * it's correct regardless of how the edge got classified; a genuinely
 * unrelated relative path (or one that doesn't resolve to anything real)
 * simply finds no matching directory entry and is left unflagged. Only
 * reachable on a case-insensitive dev machine's resolution results: on a
 * case-sensitive filesystem, a mis-cased specifier would already be
 * `target.kind === 'unresolved'`, caught by `checkUnresolvedImports`
 * instead — that's the intended split, not a gap.
 */
export function checkCaseSensitivity(graph: ImportGraph): CheckFinding[] {
  const findings: CheckFinding[] = [];

  for (const edge of graph.edges) {
    if (!edge.specifier.startsWith('.')) continue;

    const segments = edge.specifier.split('/').filter((s) => s !== '.' && s !== '');
    if (segments.length === 0) continue;

    let currentDir = posix.dirname(edge.fromFilePath);
    let mismatch: string | undefined;

    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]!;
      if (segment === '..') {
        currentDir = posix.dirname(currentDir);
        continue;
      }

      const realEntry = findRealEntry(currentDir, (entry) => entry.toLowerCase() === segment.toLowerCase());
      if (realEntry === undefined) break; // can't verify further; resolution already succeeded, so don't guess

      if (realEntry !== segment) {
        mismatch = realEntry;
        break;
      }
      currentDir = posix.join(currentDir, realEntry);
    }

    if (mismatch === undefined) {
      const leaf = segments[segments.length - 1]!;
      if (leaf !== '..') {
        const leafStem = stripExt(leaf);
        const realEntry = findRealEntry(
          currentDir,
          (entry) => stripExt(entry).toLowerCase() === leafStem.toLowerCase(),
        );
        if (realEntry !== undefined && stripExt(realEntry) !== leafStem) {
          mismatch = stripExt(realEntry);
        }
      }
    }

    if (mismatch !== undefined) {
      findings.push({
        severity: 'error',
        code: 'case-sensitivity-mismatch',
        message: `${edge.fromFilePath} imports '${edge.specifier}', but the real name on disk is cased '${mismatch}' — this resolves locally on a case-insensitive filesystem but will break on case-sensitive CI or deployment.`,
        path: edge.fromFilePath,
      });
    }
  }

  return findings;
}

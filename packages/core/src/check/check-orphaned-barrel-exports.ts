import { readSourceText, parseSourceFile } from '../ts-utils/index.js';
import type { ImportGraph } from '../graph/types.js';
import { extractDeclaredExports } from './extract-declared-exports.js';
import { extractNamedReexportBindings, fileHasExportStar } from './extract-named-reexport-bindings.js';
import type { CheckFinding } from './types.js';

/**
 * A barrel re-exporting a name its target doesn't actually declare — a real,
 * silent bug (module resolution succeeds; only a full `tsc` typecheck, which
 * this project deliberately doesn't run, would otherwise catch it).
 *
 * Skips targets that themselves contain a bare `export * from` — such a
 * file's true export surface can't be determined from local declarations
 * alone, and guessing wrong here would produce a false positive on a
 * legitimately-valid multi-hop re-export. Full transitive barrel-chain
 * resolution is out of scope; refusing to check is the safe choice.
 */
export function checkOrphanedBarrelExports(graph: ImportGraph): CheckFinding[] {
  const findings: CheckFinding[] = [];
  const declaredExportsCache = new Map<string, ReadonlySet<string>>();

  function declaredExportsOf(filePath: string): ReadonlySet<string> {
    const cached = declaredExportsCache.get(filePath);
    if (cached) return cached;
    const names = extractDeclaredExports(filePath);
    declaredExportsCache.set(filePath, names);
    return names;
  }

  const reexportEdges = graph.edges.filter(
    (edge) => edge.formKind === 'exportFrom' && edge.target.kind === 'inProject',
  );

  const edgesByBarrel = new Map<string, typeof reexportEdges>();
  for (const edge of reexportEdges) {
    const existing = edgesByBarrel.get(edge.fromFilePath);
    if (existing) existing.push(edge);
    else edgesByBarrel.set(edge.fromFilePath, [edge]);
  }

  for (const [barrelPath, edges] of edgesByBarrel) {
    const barrelSourceFile = parseSourceFile(barrelPath, readSourceText(barrelPath));
    const groups = extractNamedReexportBindings(barrelSourceFile);

    for (const edge of edges) {
      if (edge.target.kind !== 'inProject') continue;
      const targetPath = edge.target.filePath;

      const group = groups.find((g) => g.statementStart === edge.statementOffset.start);
      if (!group) continue;

      const targetSourceFile = parseSourceFile(targetPath, readSourceText(targetPath));
      if (fileHasExportStar(targetSourceFile)) continue;

      const targetExports = declaredExportsOf(targetPath);

      for (const binding of group.bindings) {
        if (targetExports.has(binding.originalName)) continue;

        findings.push({
          severity: 'error',
          code: 'orphaned-barrel-export',
          message: `${barrelPath} re-exports '${binding.originalName}' from '${edge.specifier}', but ${targetPath} doesn't declare an export named '${binding.originalName}'.`,
          path: barrelPath,
        });
      }
    }
  }

  return findings;
}

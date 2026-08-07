import { describe, expect, it } from 'vitest';
import { buildImportGraph, runCheck } from '../src/advanced.js';

function fixturePath(...segments: string[]): string {
  return new URL(`./fixtures/graph-repos/${segments.join('/')}`, import.meta.url).pathname;
}

describe('runCheck', () => {
  it('combines findings from all three checks', () => {
    const graph = buildImportGraph(fixturePath('check-repo', 'tsconfig.json'));
    const result = runCheck(graph);

    // Mis-cased imports (consumer.ts, nested-consumer.ts) resolve on a
    // case-insensitive filesystem and only trip checkCaseSensitivity, but
    // genuinely fail to resolve on a case-sensitive one (Linux CI), where
    // checkUnresolvedImports also fires for the same edges — checkCaseSensitivity
    // never gates on resolution outcome, so the two legitimately overlap there.
    // Assert on the set of distinct codes present, not their exact counts.
    const codes = new Set(result.findings.map((f) => f.code));
    expect(codes).toEqual(new Set(['case-sensitivity-mismatch', 'orphaned-barrel-export', 'unresolved-import']));
  });

  it('sorts findings deterministically by path then code', () => {
    const graph = buildImportGraph(fixturePath('check-repo', 'tsconfig.json'));
    const result = runCheck(graph);

    const sorted = [...result.findings].sort((a, b) => {
      const pathCompare = (a.path ?? '').localeCompare(b.path ?? '');
      return pathCompare !== 0 ? pathCompare : a.code.localeCompare(b.code);
    });
    expect(result.findings).toEqual(sorted);
  });

  it('reports no findings for a project with no issues', () => {
    const graph = buildImportGraph(fixturePath('barrel-heavy', 'tsconfig.json'));
    const result = runCheck(graph);

    expect(result.findings).toEqual([]);
  });
});

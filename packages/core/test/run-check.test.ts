import { describe, expect, it } from 'vitest';
import { buildImportGraph, runCheck } from '../src/index.js';

function fixturePath(...segments: string[]): string {
  return new URL(`./fixtures/graph-repos/${segments.join('/')}`, import.meta.url).pathname;
}

describe('runCheck', () => {
  it('combines findings from all three checks', () => {
    const graph = buildImportGraph(fixturePath('check-repo', 'tsconfig.json'));
    const result = runCheck(graph);

    const codes = result.findings.map((f) => f.code).sort();
    expect(codes).toEqual(
      ['case-sensitivity-mismatch', 'case-sensitivity-mismatch', 'orphaned-barrel-export', 'unresolved-import'].sort(),
    );
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

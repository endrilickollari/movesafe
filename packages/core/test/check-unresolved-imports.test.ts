import { describe, expect, it } from 'vitest';
import { buildImportGraph } from '../src/index.js';
import { checkUnresolvedImports } from '../src/check/check-unresolved-imports.js';

function fixturePath(...segments: string[]): string {
  return new URL(`./fixtures/graph-repos/${segments.join('/')}`, import.meta.url).pathname;
}

describe('checkUnresolvedImports', () => {
  it('flags an import that could not be resolved at all', () => {
    const graph = buildImportGraph(fixturePath('check-repo', 'tsconfig.json'));
    const findings = checkUnresolvedImports(graph);

    expect(findings).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'unresolved-import',
        path: fixturePath('check-repo', 'src', 'broken.ts'),
      }),
    ]);
    expect(findings[0]?.message).toContain('does-not-exist');
  });
});

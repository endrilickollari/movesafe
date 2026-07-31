import { describe, expect, it } from 'vitest';
import { buildImportGraph } from '../src/index.js';
import { checkCaseSensitivity } from '../src/check/check-case-sensitivity.js';

function fixturePath(...segments: string[]): string {
  return new URL(`./fixtures/graph-repos/${segments.join('/')}`, import.meta.url).pathname;
}

describe('checkCaseSensitivity', () => {
  it('flags a mis-cased leaf filename', () => {
    const graph = buildImportGraph(fixturePath('check-repo', 'tsconfig.json'));
    const findings = checkCaseSensitivity(graph);

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'case-sensitivity-mismatch',
        path: fixturePath('check-repo', 'src', 'consumer.ts'),
      }),
    );
  });

  it('flags a mis-cased intermediate directory segment, not just the leaf', () => {
    const graph = buildImportGraph(fixturePath('check-repo', 'tsconfig.json'));
    const findings = checkCaseSensitivity(graph);

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'case-sensitivity-mismatch',
        path: fixturePath('check-repo', 'src', 'nested-consumer.ts'),
      }),
    );
  });

  it('does not flag a correctly-cased import', () => {
    const graph = buildImportGraph(fixturePath('check-repo', 'tsconfig.json'));
    const findings = checkCaseSensitivity(graph);

    expect(findings.some((f) => f.path === fixturePath('check-repo', 'src', 'barrel.ts'))).toBe(false);
  });
});

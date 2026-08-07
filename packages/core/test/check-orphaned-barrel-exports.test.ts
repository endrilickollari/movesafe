import { describe, expect, it } from 'vitest';
import { buildImportGraph } from '../src/advanced.js';
import { checkOrphanedBarrelExports } from '../src/check/check-orphaned-barrel-exports.js';

function fixturePath(...segments: string[]): string {
  return new URL(`./fixtures/graph-repos/${segments.join('/')}`, import.meta.url).pathname;
}

describe('checkOrphanedBarrelExports', () => {
  it('flags a barrel re-exporting a name its target does not declare', () => {
    const graph = buildImportGraph(fixturePath('check-repo', 'tsconfig.json'));
    const findings = checkOrphanedBarrelExports(graph);

    expect(findings).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'orphaned-barrel-export',
        path: fixturePath('check-repo', 'src', 'barrel.ts'),
      }),
    ]);
    expect(findings[0]?.message).toContain('Missing');
    expect(findings[0]?.message).not.toContain('RealThing');
  });

  it('does not flag a name that genuinely exists in the target', () => {
    const graph = buildImportGraph(fixturePath('check-repo', 'tsconfig.json'));
    const findings = checkOrphanedBarrelExports(graph);

    expect(findings.some((f) => f.message.includes('RealThing'))).toBe(false);
  });

  it('does not false-positive through a multi-hop barrel (export * from guard)', () => {
    const graph = buildImportGraph(fixturePath('check-repo', 'tsconfig.json'));
    const findings = checkOrphanedBarrelExports(graph);

    expect(findings.some((f) => f.path === fixturePath('check-repo', 'src', 'star-consumer-barrel.ts'))).toBe(false);
  });
});

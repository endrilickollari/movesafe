import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildImportGraph, computePlanDiff, loadTsconfig } from '../src/advanced.js';
import { buildLineOffsets, sliceLine } from '../src/diff/line-offsets.js';
import { planMove } from '../src/planner/plan-move.js';

function fixturePath(...segments: string[]): string {
  return fileURLToPath(new URL(`./fixtures/planner/${segments.join('/')}`, import.meta.url));
}

describe('computePlanDiff', () => {
  it('strips CRLF line endings from rendered line content', () => {
    const text = 'first\r\nsecond\r\n';
    const offsets = buildLineOffsets(text);

    expect(offsets).toEqual([0, 7]);
    expect(sliceLine(text, offsets, 0)).toBe('first');
    expect(sliceLine(text, offsets, 1)).toBe('second');
  });

  it('produces a pure-rename entry with no hunks for a moved file with no outbound imports of its own', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('basic-project', 'tsconfig.json'));
    const from = fixturePath('basic-project', 'src', 'utils.ts');
    const to = fixturePath('basic-project', 'src', 'renamed.ts');

    const plan = planMove(from, to, graph, tsconfig);
    const diff = computePlanDiff(plan);

    const movedEntry = diff.files.find((f) => f.oldPath === from);
    expect(movedEntry).toEqual({ oldPath: from, newPath: to, hunks: [] });
  });

  it('produces exact hunk numbers for a single-line specifier change, with context clamped at both file boundaries', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('basic-project', 'tsconfig.json'));
    const from = fixturePath('basic-project', 'src', 'utils.ts');
    const to = fixturePath('basic-project', 'src', 'renamed.ts');
    const indexPath = fixturePath('basic-project', 'src', 'index.ts');

    const plan = planMove(from, to, graph, tsconfig);
    const diff = computePlanDiff(plan);

    const indexEntry = diff.files.find((f) => f.oldPath === indexPath);
    expect(indexEntry?.hunks).toEqual([
      {
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 3,
        lines: [
          { kind: 'removed', text: "import { helper } from './utils.js';" },
          { kind: 'added', text: "import { helper } from './renamed.js';" },
          { kind: 'context', text: '' },
          { kind: 'context', text: 'export { helper };' },
        ],
      },
    ]);
  });

  it('gives the moved file its own hunk when it has outbound edits of its own', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('basic-project', 'tsconfig.json'));
    const from = fixturePath('basic-project', 'src', 'consumer.ts');
    const to = fixturePath('basic-project', 'src', 'lib', 'consumer.ts');

    const plan = planMove(from, to, graph, tsconfig);
    const diff = computePlanDiff(plan);

    const movedEntry = diff.files.find((f) => f.oldPath === from);
    expect(movedEntry?.newPath).toBe(to);
    expect(movedEntry?.hunks).toHaveLength(1);
    expect(movedEntry?.hunks[0]?.lines).toContainEqual({
      kind: 'removed',
      text: "import { helper } from './utils.js';",
    });
    expect(movedEntry?.hunks[0]?.lines).toContainEqual({
      kind: 'added',
      text: "import { helper } from '../utils.js';",
    });
  });

  it('produces one FileDiff per affected file for a barrel-involved move', () => {
    const graph = buildImportGraph(fixturePath('barrel-project', 'tsconfig.json'));
    const tsconfig = loadTsconfig(fixturePath('barrel-project', 'tsconfig.json'));
    const from = fixturePath('barrel-project', 'src', 'utils.ts');
    const to = fixturePath('barrel-project', 'src', 'lib', 'utils.ts');
    const indexPath = fixturePath('barrel-project', 'src', 'index.ts');

    const plan = planMove(from, to, graph, tsconfig);
    const diff = computePlanDiff(plan);

    expect(diff.files).toHaveLength(2);

    const movedEntry = diff.files.find((f) => f.oldPath === from);
    expect(movedEntry).toEqual({ oldPath: from, newPath: to, hunks: [] });

    const barrelEntry = diff.files.find((f) => f.oldPath === indexPath);
    expect(barrelEntry?.hunks[0]?.lines).toContainEqual({
      kind: 'removed',
      text: "export * from './utils.js';",
    });
    expect(barrelEntry?.hunks[0]?.lines).toContainEqual({
      kind: 'added',
      text: "export * from './lib/utils.js';",
    });
  });
});

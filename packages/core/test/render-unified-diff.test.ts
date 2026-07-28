import { describe, expect, it } from 'vitest';
import type { PlanDiff } from '../src/index.js';
import { renderPlanDiff } from '../src/index.js';

describe('renderPlanDiff', () => {
  const diff: PlanDiff = {
    files: [
      {
        oldPath: '/proj/src/index.ts',
        newPath: '/proj/src/index.ts',
        hunks: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            lines: [
              { kind: 'removed', text: "import { helper } from './utils.js';" },
              { kind: 'added', text: "import { helper } from './renamed.js';" },
            ],
          },
        ],
      },
    ],
  };

  it('renders plain unified diff text with no ANSI escapes by default', () => {
    const output = renderPlanDiff(diff);
    expect(output).toBe(
      [
        '--- a//proj/src/index.ts',
        '+++ b//proj/src/index.ts',
        '@@ -1,1 +1,1 @@',
        "-import { helper } from './utils.js';",
        "+import { helper } from './renamed.js';",
      ].join('\n'),
    );
    expect(output).not.toContain('\x1b[');
  });

  it('wraps removed/added/header lines in ANSI color codes when color: true', () => {
    const output = renderPlanDiff(diff, { color: true });
    expect(output).toContain('\x1b[31m-import');
    expect(output).toContain('\x1b[32m+import');
    expect(output).toContain('\x1b[36m@@');
  });

  it('renders a pure-rename FileDiff as just the rename notice, with no --- / +++ / @@ headers', () => {
    const renameDiff: PlanDiff = {
      files: [{ oldPath: '/proj/src/utils.ts', newPath: '/proj/src/renamed.ts', hunks: [] }],
    };
    const output = renderPlanDiff(renameDiff);
    expect(output).toBe('/proj/src/utils.ts -> /proj/src/renamed.ts');
  });
});

import { describe, expect, it } from 'vitest';
import { renderTty } from '../src/report/render-tty.js';
import type { Finding } from '../src/report/types.js';

const errorFinding: Finding = {
  severity: 'error',
  code: 'unresolved-import',
  message: "Could not resolve './bar'.",
  path: 'src/foo.ts',
};

const warningFinding: Finding = {
  severity: 'warning',
  code: 'some-warning',
  message: 'This is a warning.',
  path: 'src/legacy.ts',
};

const infoFinding: Finding = {
  severity: 'info',
  code: 'workspace-info',
  message: 'This is informational.',
  path: undefined,
};

describe('renderTty', () => {
  it('reports no issues found for an empty list', () => {
    expect(renderTty([])).toEqual(['✔ No issues found.']);
  });

  it('prefixes errors with ✖ and warnings with ⚠', () => {
    const lines = renderTty([errorFinding, warningFinding]);

    expect(lines[0]).toContain('✖');
    expect(lines[0]).toContain(errorFinding.message);
    expect(lines[1]).toContain('⚠');
    expect(lines[1]).toContain(warningFinding.message);
  });

  it('does not emit ANSI codes when color is false', () => {
    const [line] = renderTty([errorFinding], { color: false });
    expect(line).not.toContain('\x1b[');
  });

  it('prefixes informational diagnostics with an info marker', () => {
    expect(renderTty([infoFinding])[0]).toContain('ℹ');
  });

  it('emits ANSI codes when color is true', () => {
    const [line] = renderTty([errorFinding], { color: true });
    expect(line).toContain('\x1b[31m');
    expect(line).toContain('\x1b[0m');
  });
});

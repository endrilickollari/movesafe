import { describe, expect, it } from 'vitest';
import { renderJson } from '../src/report/render-json.js';
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
  path: undefined,
};

describe('renderJson', () => {
  it('produces valid, parseable JSON with a zeroed summary for an empty list', () => {
    const [output] = renderJson([]);
    const parsed = JSON.parse(output as string);

    expect(parsed).toEqual({
      findings: [],
      summary: { errorCount: 0, warningCount: 0, total: 0 },
    });
  });

  it('reports correct counts and normalizes undefined path to null', () => {
    const [output] = renderJson([errorFinding, warningFinding]);
    const parsed = JSON.parse(output as string);

    expect(parsed.summary).toEqual({ errorCount: 1, warningCount: 1, total: 2 });
    expect(parsed.findings).toEqual([
      { severity: 'error', code: 'unresolved-import', message: errorFinding.message, path: 'src/foo.ts' },
      { severity: 'warning', code: 'some-warning', message: warningFinding.message, path: null },
    ]);
  });

  it('returns exactly one line containing the full report', () => {
    const lines = renderJson([errorFinding]);
    expect(lines).toHaveLength(1);
  });
});

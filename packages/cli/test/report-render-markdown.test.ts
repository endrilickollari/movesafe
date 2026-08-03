import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/report/render-markdown.js';
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

describe('renderMarkdown', () => {
  it('reports no issues found for an empty list, with no section headers', () => {
    const [output] = renderMarkdown([]);

    expect(output).toContain('### movesafe check');
    expect(output).toContain('No issues found');
    expect(output).not.toContain('**Errors**');
    expect(output).not.toContain('**Warnings**');
  });

  it('groups findings under Errors and Warnings sections', () => {
    const [output] = renderMarkdown([errorFinding, warningFinding]);

    expect(output).toContain('**Errors**');
    expect(output).toContain('**Warnings**');
    expect(output).toContain('1 error');
    expect(output).toContain('1 warning');
    expect(output).toContain(`\`${errorFinding.path}\`: ${errorFinding.message}`);
  });

  it('omits only the empty severity section', () => {
    const [output] = renderMarkdown([errorFinding]);

    expect(output).toContain('**Errors**');
    expect(output).not.toContain('**Warnings**');
  });

  it('does not print the literal word "undefined" for findings without a path', () => {
    const [output] = renderMarkdown([warningFinding]);

    expect(output).not.toContain('undefined');
    expect(output).toContain(warningFinding.message);
  });
});

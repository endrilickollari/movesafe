import { renderJson } from './render-json.js';
import { renderMarkdown } from './render-markdown.js';
import { renderTty } from './render-tty.js';
import type { Finding, ReportFormat, ReportOptions } from './types.js';

export type { Finding, FindingSeverity, ReportFormat, ReportOptions } from './types.js';

export function renderReport(
  findings: readonly Finding[],
  format: ReportFormat,
  options?: ReportOptions,
): string[] {
  switch (format) {
    case 'json':
      return renderJson(findings);
    case 'md':
      return renderMarkdown(findings);
    case 'tty':
      return renderTty(findings, options);
  }
}

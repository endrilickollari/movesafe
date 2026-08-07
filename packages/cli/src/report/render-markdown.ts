import type { Finding } from './types.js';

function renderFindingLine(f: Finding): string {
  return f.path ? `- \`${f.path}\`: ${f.message}` : `- ${f.message}`;
}

function renderSection(title: string, findings: readonly Finding[]): string[] {
  if (findings.length === 0) {
    return [];
  }
  return ['', `**${title}**`, ...findings.map(renderFindingLine)];
}

export function renderMarkdown(findings: readonly Finding[]): string[] {
  const lines = ['### movesafe check'];

  if (findings.length === 0) {
    lines.push('', '✅ No issues found.');
    return [lines.join('\n')];
  }

  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');
  const info = findings.filter((f) => f.severity === 'info');

  const summaryParts: string[] = [];
  if (errors.length > 0) {
    summaryParts.push(`❌ **${errors.length} error${errors.length === 1 ? '' : 's'}**`);
  }
  if (warnings.length > 0) {
    summaryParts.push(`⚠️ **${warnings.length} warning${warnings.length === 1 ? '' : 's'}**`);
  }
  if (info.length > 0) {
    summaryParts.push(`ℹ️ **${info.length} info**`);
  }

  lines.push('', summaryParts.join(', '));
  lines.push(...renderSection('Errors', errors));
  lines.push(...renderSection('Warnings', warnings));
  lines.push(...renderSection('Information', info));

  return [lines.join('\n')];
}

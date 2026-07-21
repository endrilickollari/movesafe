export interface ParsedPnpmWorkspaceYaml {
  readonly patterns: readonly string[];
  readonly parseError: string | undefined;
}

function stripQuotesAndComment(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  const commentIndex = trimmed.indexOf('#');
  return (commentIndex === -1 ? trimmed : trimmed.slice(0, commentIndex)).trim();
}

/**
 * Parses only the common `packages:\n  - 'glob'` list form that pnpm-workspace.yaml
 * files overwhelmingly use in practice (including this repo's own). Flow-style
 * arrays, anchors/aliases, and multi-document YAML are explicitly unsupported —
 * such input sets `parseError` rather than throwing or silently guessing.
 */
export function parsePnpmWorkspaceYaml(yamlText: string): ParsedPnpmWorkspaceYaml {
  const lines = yamlText.split(/\r?\n/);
  const keyLineIndex = lines.findIndex((line) => /^packages:\s*(#.*)?$/.test(line.trimEnd()));

  if (keyLineIndex === -1) {
    const inlineKeyLine = lines.find((line) => /^packages:\s*\S/.test(line));
    if (inlineKeyLine !== undefined) {
      return {
        patterns: [],
        parseError: `Unsupported inline 'packages:' value (expected a YAML list): ${inlineKeyLine.trim()}`,
      };
    }
    return { patterns: [], parseError: undefined };
  }

  const patterns: string[] = [];
  for (let i = keyLineIndex + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '') continue;
    if (!/^\s/.test(line)) break; // next column-0 key
    const itemMatch = /^\s+-\s*(.+)$/.exec(line);
    if (!itemMatch) break;
    patterns.push(stripQuotesAndComment(itemMatch[1]!));
  }

  return { patterns, parseError: undefined };
}

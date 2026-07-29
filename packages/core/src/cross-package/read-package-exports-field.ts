import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The already-parsed `exports` field of a package's package.json, or `undefined` if absent or unreadable — `detectWorkspacePackages` already validates package.json readability during initial workspace detection, so an unreadable file here is treated the same as a missing field rather than a distinct error. */
export function readPackageExportsField(packageDir: string): unknown {
  try {
    const parsed = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>).exports : undefined;
  } catch {
    return undefined;
  }
}

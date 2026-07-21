import { readFileSync } from 'node:fs';

export interface WorkspacePackageEntry {
  readonly name: string;
  readonly directory: string;
}

export type ReadWorkspacePackageNameResult =
  | { readonly ok: true; readonly entry: WorkspacePackageEntry }
  | { readonly ok: false; readonly reason: 'unreadable' | 'missing-name' };

export function readWorkspacePackageName(packageJsonPath: string): ReadWorkspacePackageNameResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  } catch {
    return { ok: false, reason: 'unreadable' };
  }

  const name =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>).name
      : undefined;
  if (typeof name !== 'string' || name.length === 0) {
    return { ok: false, reason: 'missing-name' };
  }

  const lastSlash = packageJsonPath.lastIndexOf('/');
  const directory = lastSlash === -1 ? packageJsonPath : packageJsonPath.slice(0, lastSlash);

  return { ok: true, entry: { name, directory } };
}

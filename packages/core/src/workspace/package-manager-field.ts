import type { WorkspacePackageManager } from './types.js';

export function packageManagerFromField(value: unknown): WorkspacePackageManager | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.startsWith('pnpm@')) return 'pnpm';
  if (value.startsWith('yarn@')) return 'yarn';
  if (value.startsWith('npm@')) return 'npm';
  return undefined;
}

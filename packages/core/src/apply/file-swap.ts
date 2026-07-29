import { randomUUID } from 'node:crypto';
import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { ApplyDiagnostic } from './types.js';

export interface CompletedSwap {
  readonly originalPath: string;
  readonly backupPath: string;
}

export function tempSiblingPath(originalPath: string, tag: 'tmp' | 'bak'): string {
  return join(dirname(originalPath), `${basename(originalPath)}.movesafe.${tag}.${randomUUID()}`);
}

/** Writes `newContent` in place of `originalPath` via write-temp + backup + swap. Returns the backup path (kept until the whole apply succeeds, in case a rollback is needed). Throws, with its own partial state cleaned up, on any failure. */
export function swapInNewContent(originalPath: string, newContent: string): string {
  const tempPath = tempSiblingPath(originalPath, 'tmp');
  const backupPath = tempSiblingPath(originalPath, 'bak');

  writeFileSync(tempPath, newContent, 'utf8');

  try {
    renameSync(originalPath, backupPath);
  } catch (err) {
    rmSync(tempPath, { force: true });
    throw err;
  }

  try {
    renameSync(tempPath, originalPath);
  } catch (err) {
    renameSync(backupPath, originalPath);
    throw err;
  }

  return backupPath;
}

export function rollbackSwaps(swaps: readonly CompletedSwap[]): void {
  for (const swap of swaps) {
    try {
      renameSync(swap.backupPath, swap.originalPath);
    } catch {
      // Best-effort: nothing more we can do if even the rollback fails.
    }
  }
}

export function renameFailure(path: string, err: unknown): ApplyDiagnostic {
  const message = err instanceof Error ? err.message : String(err);
  return {
    severity: 'error',
    code: 'rename-failed',
    message: `Failed to apply changes to ${path}: ${message}`,
    path,
  };
}

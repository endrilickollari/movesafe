import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import type { ApplyFilesystem } from './filesystem.js';

export interface CompletedSwap {
  readonly originalPath: string;
  readonly backupPath: string;
}

export function tempSiblingPath(originalPath: string, tag: 'tmp' | 'bak'): string {
  return join(dirname(originalPath), `${basename(originalPath)}.movesafe.${tag}.${randomUUID()}`);
}

/**
 * Rolls back completed swaps in reverse completion order. Never throws:
 * returns both paths of every swap it could not restore, so the
 * caller can report an honest `partial` result instead of pretending
 * rollback fully succeeded.
 */
export function rollbackSwaps(fs: ApplyFilesystem, swaps: readonly CompletedSwap[]): readonly string[] {
  const unrecovered: string[] = [];
  for (const swap of [...swaps].reverse()) {
    try {
      fs.renameSync(swap.backupPath, swap.originalPath);
    } catch {
      unrecovered.push(swap.originalPath, swap.backupPath);
    }
  }
  return unrecovered;
}

export interface CompletedMove {
  readonly fromFilePath: string;
  readonly toFilePath: string;
  readonly hadOwnEdits: boolean;
}

/**
 * Rolls back completed moves, in reverse completion order, using the
 * deferred-unlink scheme: a move with no own edits is a plain rename,
 * reversed by renaming back; a move that had own edits never touched its
 * source (the new content was staged to a temp file and committed straight
 * to the destination), so rolling it back only means discarding that
 * destination — the untouched source needs no repair. Never throws: returns
 * every path of a move it could not undo.
 */
export function rollbackMoves(fs: ApplyFilesystem, moves: readonly CompletedMove[]): readonly string[] {
  const unrecovered: string[] = [];
  for (const move of [...moves].reverse()) {
    try {
      if (move.hadOwnEdits) {
        fs.rmSync(move.toFilePath, { force: true });
      } else {
        fs.renameSync(move.toFilePath, move.fromFilePath);
      }
    } catch {
      unrecovered.push(move.fromFilePath, move.toFilePath);
    }
  }
  return unrecovered;
}

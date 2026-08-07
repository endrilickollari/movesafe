import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

/**
 * The exact, minimal slice of `node:fs` the apply transaction needs — kept
 * as a seam (rather than calling `node:fs` directly) so tests can wrap
 * `nodeFilesystem` and throw from a chosen call to exercise a specific
 * transaction phase (stage, commit, rollback) without sabotaging a real
 * directory. Not part of the public SDK surface — reach it via
 * `@movesafe/core/advanced`.
 */
export interface ApplyFilesystem {
  existsSync(path: string): boolean;
  statSync(path: string): { readonly mode: number };
  readFileSync(path: string): string;
  writeFileSync(path: string, content: string, mode: number): void;
  renameSync(from: string, to: string): void;
  unlinkSync(path: string): void;
  rmSync(path: string, options?: { readonly recursive?: boolean; readonly force?: boolean }): void;
  mkdirSync(path: string, options?: { readonly recursive?: boolean }): void;
  readdirSync(path: string): readonly { readonly name: string; isFile(): boolean }[];
}

export const nodeFilesystem: ApplyFilesystem = {
  existsSync: (path) => existsSync(path),
  statSync: (path) => statSync(path),
  readFileSync: (path) => readFileSync(path, 'utf8'),
  writeFileSync: (path, content, mode) => writeFileSync(path, content, { encoding: 'utf8', mode }),
  renameSync: (from, to) => renameSync(from, to),
  unlinkSync: (path) => unlinkSync(path),
  rmSync: (path, options) => rmSync(path, options),
  mkdirSync: (path, options) => mkdirSync(path, options),
  readdirSync: (path) => readdirSync(path, { recursive: true, withFileTypes: true }),
};

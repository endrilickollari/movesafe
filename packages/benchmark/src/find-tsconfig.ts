import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Looks for `tsconfig.json` directly inside `dir` (a cloned repo or workspace
 * package root). Deliberately does not walk upward past `dir` the way
 * packages/cli/src/find-tsconfig.ts does for a user-supplied path — doing so
 * here could escape the cloned repo and pick up an unrelated tsconfig.json
 * higher up the filesystem (e.g. this monorepo's own).
 */
export function findRepoTsconfig(dir: string): string | undefined {
  const candidate = join(dir, 'tsconfig.json');
  return existsSync(candidate) ? candidate : undefined;
}

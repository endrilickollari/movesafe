import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { BenchmarkRepo } from './repos.js';

/** Clones `repo` into `destDir` if it doesn't exist yet; otherwise discards any local changes from a prior run. */
export function cloneOrReset(repo: BenchmarkRepo, destDir: string): void {
  if (!existsSync(destDir)) {
    execFileSync('git', ['clone', '--depth', '1', repo.gitUrl, destDir], { stdio: 'inherit' });
    return;
  }

  execFileSync('git', ['checkout', '--', '.'], { cwd: destDir, stdio: 'inherit' });
  execFileSync('git', ['clean', '-fd'], { cwd: destDir, stdio: 'inherit' });
}

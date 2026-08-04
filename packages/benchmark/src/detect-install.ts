import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

interface InstallCommand {
  readonly command: string;
  readonly args: readonly string[];
}

function detectInstallCommand(repoDir: string): InstallCommand {
  if (existsSync(join(repoDir, 'pnpm-lock.yaml'))) {
    return { command: 'pnpm', args: ['install', '--frozen-lockfile'] };
  }
  if (existsSync(join(repoDir, 'yarn.lock'))) {
    return { command: 'yarn', args: ['install', '--frozen-lockfile'] };
  }

  const hasNpmLockfile =
    existsSync(join(repoDir, 'package-lock.json')) || existsSync(join(repoDir, 'npm-shrinkwrap.json'));
  return hasNpmLockfile ? { command: 'npm', args: ['ci'] } : { command: 'npm', args: ['install'] };
}

/** Installs a cloned repo's dependencies, using whichever package manager its lockfile implies. */
export function installDependencies(repoDir: string): void {
  const { command, args } = detectInstallCommand(repoDir);
  execFileSync(command, args, { cwd: repoDir, stdio: 'inherit' });
}

import { CORE_VERSION } from '@movesafe/core';
import { Command } from 'commander';
import { runCheck } from './run-check.js';
import { runMv } from './run-mv.js';
import type { RunResult } from './run-result.js';

function resolveColorOption(): boolean {
  return !!process.stdout.isTTY && !process.env.NO_COLOR;
}

function runCommand(run: () => RunResult): void {
  const result = run();
  for (const line of result.lines) {
    console.log(line);
  }
  process.exit(result.exitCode);
}

const program = new Command();

program.name('movesafe').description('Move TypeScript files without breaking imports.').version(CORE_VERSION);

program
  .command('mv')
  .description('Move a TypeScript file, rewriting every import that references it')
  .argument('<from>', 'path to the file to move')
  .argument('<to>', 'destination path')
  .option('--dry-run', 'preview the move as a colorized diff without changing any files')
  .action((from: string, to: string, opts: { dryRun?: boolean }) => {
    runCommand(() =>
      runMv({ from, to, dryRun: !!opts.dryRun, color: resolveColorOption(), cwd: process.cwd() }),
    );
  });

program
  .command('check')
  .description('Scan a project for unresolvable imports, orphaned barrel exports, and case-sensitivity mismatches')
  .argument('[path]', 'directory to check (defaults to the current directory)')
  .action((path: string | undefined) => {
    runCommand(() => runCheck({ path, color: resolveColorOption(), cwd: process.cwd() }));
  });

program.parse();

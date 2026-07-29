import { CORE_VERSION } from '@movesafe/core';
import { Command } from 'commander';
import { runMv } from './run-mv.js';

const program = new Command();

program.name('movesafe').description('Move TypeScript files without breaking imports.').version(CORE_VERSION);

program
  .command('mv')
  .description('Move a TypeScript file, rewriting every import that references it')
  .argument('<from>', 'path to the file to move')
  .argument('<to>', 'destination path')
  .option('--dry-run', 'preview the move as a colorized diff without changing any files')
  .action((from: string, to: string, opts: { dryRun?: boolean }) => {
    const result = runMv({
      from,
      to,
      dryRun: !!opts.dryRun,
      color: !!process.stdout.isTTY && !process.env.NO_COLOR,
      cwd: process.cwd(),
    });
    for (const line of result.lines) {
      console.log(line);
    }
    process.exit(result.exitCode);
  });

program.parse();

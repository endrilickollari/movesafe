import { pathToFileURL } from 'node:url';
import { CORE_VERSION } from '@movesafe/core';
import { Command, Option } from 'commander';
import type { ReportFormat } from './report/index.js';
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

export function createProgram(options?: { readonly exitOverride?: boolean }): Command {
  const program = new Command();

  if (options?.exitOverride) {
    program.exitOverride();
  }

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
    .addOption(new Option('--json', 'output findings as JSON').conflicts('md'))
    .addOption(new Option('--md', 'output findings as Markdown (for PR comments)').conflicts('json'))
    .action((path: string | undefined, opts: { json?: boolean; md?: boolean }) => {
      const format: ReportFormat = opts.json ? 'json' : opts.md ? 'md' : 'tty';
      runCommand(() => runCheck({ path, format, color: resolveColorOption(), cwd: process.cwd() }));
    });

  return program;
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  createProgram().parse();
}

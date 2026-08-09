import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApplyFilesystem, MovePlan } from '../src/advanced.js';
import {
  MOVE_PLAN_SCHEMA_VERSION,
  applyMove,
  applyMoveWithFilesystem,
  buildImportGraph,
  collectSealPaths,
  computePlanHash,
  loadTsconfig,
  nodeFilesystem,
  planDirectoryMove,
  sealMovePlan,
} from '../src/advanced.js';
import { planMove } from '../src/planner/plan-move.js';

interface FaultConfig {
  /** Only this specific call (1-indexed) throws; every other call succeeds. */
  readonly failOnCall?: number;
  /** Every call after this one (1-indexed) throws, permanently. */
  readonly failAfter?: number;
  readonly error?: Error;
}

/**
 * Wraps the real `nodeFilesystem` so a named method starts throwing at a
 * chosen call — lets a test target a precise transaction phase (a specific
 * stage-write, commit-rename, or rollback call) without sabotaging a real
 * directory. `failOnCall` isolates one call (e.g. "the mutation fails, but
 * rollback succeeds"); `failAfter` degrades permanently from that call on
 * (e.g. "the mutation fails, and rollback fails too").
 */
function createFaultInjectingFilesystem(
  overrides: Partial<{ readonly [K in keyof ApplyFilesystem]: FaultConfig }>,
): ApplyFilesystem {
  const counts = new Map<string, number>();
  const fs = { ...nodeFilesystem };

  for (const key of Object.keys(overrides) as (keyof ApplyFilesystem)[]) {
    const config = overrides[key];
    if (!config) continue;
    const original = nodeFilesystem[key] as (...args: unknown[]) => unknown;

    (fs[key] as (...args: unknown[]) => unknown) = (...args: unknown[]) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      const shouldFail =
        config.failOnCall === count || (config.failAfter !== undefined && count > config.failAfter);
      if (shouldFail) {
        throw config.error ?? new Error(`injected failure in ${key} (call #${count})`);
      }
      return original(...args);
    };
  }

  return fs;
}

function fixtureSourcePath(...segments: string[]): string {
  return fileURLToPath(new URL(`./fixtures/planner/${segments.join('/')}`, import.meta.url));
}

function copyDirRecursive(src: string, dest: string): void {
  cpSync(src, dest, { recursive: true });
}

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'movesafe-apply-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

/** Copies a fixture project into the scratch temp dir and returns its path there. */
function useFixture(name: string): string {
  const dest = join(tempDir, name);
  copyDirRecursive(fixtureSourcePath(name), dest);
  return dest;
}

function seal(plan: MovePlan): MovePlan {
  return sealMovePlan(
    plan,
    new Map([...collectSealPaths(plan)].map((path) => [path, readFileSync(path, 'utf8')])),
  );
}

function transactionFiles(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((path) => path.includes('.movesafe.'));
}

describe('applyMove', () => {
  it('refuses an unsealed plan and a sealed plan whose hash was changed', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');
    const draft = planMove(from, to, graph, tsconfig);

    expect(applyMove(draft)).toMatchObject({
      status: 'rejected',
      diagnostics: [expect.objectContaining({ code: 'invalid-plan' })],
    });

    const tampered = { ...seal(draft), planHash: 'tampered' };
    expect(applyMove(tampered)).toMatchObject({
      status: 'rejected',
      diagnostics: [expect.objectContaining({ code: 'invalid-plan' })],
    });
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(false);
  });

  it('validates every edit range even when a caller recomputes the plan hash', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');
    const sealed = seal(planMove(from, to, graph, tsconfig));
    const edits = sealed.edits.map((edit, index) =>
      index === 0 ? { ...edit, span: { ...edit.span, end: edit.span.end + 1 } } : edit,
    );
    const malformed: MovePlan = {
      ...sealed,
      edits,
      planHash: computePlanHash(
        sealed.schemaVersion,
        sealed.operation,
        sealed.scope,
        sealed.moves,
        edits,
        sealed.diagnostics,
        sealed.preconditions,
      ),
    };

    const result = applyMove(malformed);

    expect(result).toMatchObject({
      status: 'rejected',
      diagnostics: [expect.objectContaining({ code: 'stale-content' })],
    });
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(false);
  });

  it('applies a straightforward move: file relocated, importer rewritten, no leftover temp/backup files', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');

    const plan = seal(planMove(from, to, graph, tsconfig));
    const result = applyMove(plan);

    expect(result).toEqual({ status: 'applied', diagnostics: [], manualRecoveryPaths: [] });
    expect(existsSync(from)).toBe(false);
    expect(existsSync(to)).toBe(true);

    const indexContent = readFileSync(join(projectDir, 'src', 'index.ts'), 'utf8');
    expect(indexContent).toContain("from './renamed.js'");
    expect(indexContent).not.toContain("from './utils.js'");

    const leftovers = readdirSync(join(projectDir, 'src')).filter((entry) =>
      entry.includes('.movesafe.'),
    );
    expect(leftovers).toEqual([]);
  });

  it('refuses when a target file changed since planning, leaving everything untouched', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');

    const plan = seal(planMove(from, to, graph, tsconfig));

    // Mutate the specifier text itself (not just unrelated content elsewhere
    // in the file) so it actually overlaps the edit's recorded span.
    const indexPath = join(projectDir, 'src', 'index.ts');
    const mutatedContent = readFileSync(indexPath, 'utf8').replace(
      "'./utils.js'",
      "'./utils-changed.js'",
    );
    writeFileSync(indexPath, mutatedContent, 'utf8');

    const result = applyMove(plan);

    expect(result.status).toBe('rejected');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'stale-content', path: indexPath }),
    );
    expect(readFileSync(indexPath, 'utf8')).toBe(mutatedContent);
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(false);
  });

  it('refuses when the destination already exists', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');

    const plan = seal(planMove(from, to, graph, tsconfig));
    writeFileSync(to, 'export const surprise = 1;\n', 'utf8');

    const result = applyMove(plan);

    expect(result.status).toBe('rejected');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'destination-already-exists', path: to }),
    );
    expect(readFileSync(from, 'utf8')).toContain('helper');
  });

  it('refuses when the source file no longer exists', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');

    const plan = seal(planMove(from, to, graph, tsconfig));
    rmSync(from);

    const result = applyMove(plan);

    expect(result.status).toBe('rejected');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'source-file-missing', path: from }),
    );
  });

  it("rewrites the moved file's own outbound imports and lands it at the new path", () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'consumer.ts');
    const to = join(projectDir, 'src', 'lib', 'consumer.ts');

    const plan = seal(planMove(from, to, graph, tsconfig));
    const result = applyMove(plan);

    expect(result).toEqual({ status: 'applied', diagnostics: [], manualRecoveryPaths: [] });
    expect(existsSync(from)).toBe(false);
    expect(existsSync(to)).toBe(true);
    expect(readFileSync(to, 'utf8')).toContain("from '../utils.js'");
  });

  it('applies a barrel-involved move consistently across multiple edited files', () => {
    const projectDir = useFixture('barrel-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'lib', 'utils.ts');

    const plan = seal(planMove(from, to, graph, tsconfig));
    const result = applyMove(plan);

    expect(result).toEqual({ status: 'applied', diagnostics: [], manualRecoveryPaths: [] });
    expect(existsSync(to)).toBe(true);
    const barrelContent = readFileSync(join(projectDir, 'src', 'index.ts'), 'utf8');
    expect(barrelContent).toContain("from './lib/utils.js'");
  });

  it.skipIf(process.platform === 'win32')(
    "preserves the source file's mode on the destination, even when the move rewrites its own content",
    () => {
      const projectDir = useFixture('basic-project');
      const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
      const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
      const from = join(projectDir, 'src', 'consumer.ts');
      const to = join(projectDir, 'src', 'lib', 'consumer.ts');
      chmodSync(from, 0o755);

      const plan = seal(planMove(from, to, graph, tsconfig));
      const result = applyMove(plan);

      expect(result.status).toBe('applied');
      expect(statSync(to).mode & 0o777).toBe(0o755);
    },
  );
});

describe('applyMoveWithFilesystem fault injection', () => {
  function buildTwoFileMovePlan(
    srcDir: string,
    destDir: string,
    files: readonly string[],
  ): MovePlan {
    const moves = files.map((name) => ({
      fromFilePath: join(srcDir, name),
      toFilePath: join(destDir, name),
    }));
    return seal({
      schemaVersion: MOVE_PLAN_SCHEMA_VERSION,
      status: 'ready',
      operation: 'directory',
      scope: 'project',
      moves,
      edits: [],
      diagnostics: [],
      preconditions: [
        { kind: 'source-directory', path: srcDir },
        ...moves.flatMap((move) => [
          { kind: 'source-exists' as const, path: move.fromFilePath },
          { kind: 'destination-absent' as const, path: move.toFilePath },
        ]),
      ],
      planHash: 'draft',
    });
  }

  it('turns an injected preflight read failure into a rejected result', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');
    const plan = seal(planMove(from, to, graph, tsconfig));

    const result = applyMoveWithFilesystem(
      plan,
      createFaultInjectingFilesystem({ readFileSync: { failOnCall: 1 } }),
    );

    expect(result.status).toBe('rejected');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'source-file-missing' }),
    );
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(false);
  });

  it('cleans earlier stages when preparation of a later file fails', () => {
    const projectDir = useFixture('directory-move-project');
    const tsconfigPath = join(projectDir, 'tsconfig.json');
    const graph = buildImportGraph(tsconfigPath);
    const tsconfig = loadTsconfig(tsconfigPath);
    const from = join(projectDir, 'src', 'feature');
    const to = join(projectDir, 'src', 'relocated', 'feature');
    const plan = seal(planDirectoryMove(from, to, graph, tsconfig));
    const preflightReads = collectSealPaths(plan).size;

    const result = applyMoveWithFilesystem(
      plan,
      createFaultInjectingFilesystem({ readFileSync: { failOnCall: preflightReads + 2 } }),
    );

    expect(result.status).toBe('rejected');
    expect(result.manualRecoveryPaths).toEqual([]);
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(false);
    expect(transactionFiles(projectDir)).toEqual([]);
  });

  it('rolls back created directories when destination setup fails', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'consumer.ts');
    const to = join(projectDir, 'src', 'lib', 'consumer.ts');
    const plan = seal(planMove(from, to, graph, tsconfig));

    const result = applyMoveWithFilesystem(
      plan,
      createFaultInjectingFilesystem({ mkdirSync: { failOnCall: 1 } }),
    );

    expect(result.status).toBe('rejected');
    expect(existsSync(from)).toBe(true);
    expect(existsSync(join(projectDir, 'src', 'lib'))).toBe(false);
  });

  it('cleans a partially written stage when staging fails', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');
    const plan = seal(planMove(from, to, graph, tsconfig));

    const result = applyMoveWithFilesystem(
      plan,
      createFaultInjectingFilesystem({ writeFileSync: { failOnCall: 1 } }),
    );

    expect(result.status).toBe('rejected');
    expect(existsSync(from)).toBe(true);
    expect(transactionFiles(projectDir)).toEqual([]);
  });

  it('cleans every stage when the backup phase fails', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');
    const plan = seal(planMove(from, to, graph, tsconfig));

    const result = applyMoveWithFilesystem(
      plan,
      createFaultInjectingFilesystem({ renameSync: { failOnCall: 1 } }),
    );

    expect(result.status).toBe('rejected');
    expect(existsSync(from)).toBe(true);
    expect(transactionFiles(projectDir)).toEqual([]);
  });

  it('restores every backup when an edited-file commit fails', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');
    const plan = seal(planMove(from, to, graph, tsconfig));
    const movedSources = new Set(plan.moves.map((move) => move.fromFilePath));
    const swapCount = new Set(
      plan.edits.filter((edit) => !movedSources.has(edit.file)).map((edit) => edit.file),
    ).size;

    const result = applyMoveWithFilesystem(
      plan,
      createFaultInjectingFilesystem({ renameSync: { failOnCall: swapCount + 1 } }),
    );

    expect(result.status).toBe('rejected');
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(false);
    expect(transactionFiles(projectDir)).toEqual([]);
  });

  it('reports an orphaned stage when rollback cleanup also fails', () => {
    const projectDir = useFixture('directory-move-project');
    const tsconfigPath = join(projectDir, 'tsconfig.json');
    const graph = buildImportGraph(tsconfigPath);
    const tsconfig = loadTsconfig(tsconfigPath);
    const from = join(projectDir, 'src', 'feature');
    const to = join(projectDir, 'src', 'relocated', 'feature');
    const plan = seal(planDirectoryMove(from, to, graph, tsconfig));
    const preflightReads = collectSealPaths(plan).size;

    const result = applyMoveWithFilesystem(
      plan,
      createFaultInjectingFilesystem({
        readFileSync: { failOnCall: preflightReads + 2 },
        rmSync: { failOnCall: 1 },
      }),
    );

    expect(result.status).toBe('partial');
    const stagePath = result.manualRecoveryPaths.find((path) => path.includes('.movesafe.tmp.'))!;
    expect(result.manualRecoveryPaths).toContain(join(projectDir, 'src', 'relocated'));
    expect(existsSync(stagePath)).toBe(true);
  });

  it('reports the original and backup when an in-flight swap cannot be restored', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');
    const plan = seal(planMove(from, to, graph, tsconfig));

    const result = applyMoveWithFilesystem(
      plan,
      createFaultInjectingFilesystem({ renameSync: { failAfter: 1 } }),
    );

    expect(result.status).toBe('partial');
    const editedFile = result.manualRecoveryPaths.find((path) => !path.includes('.movesafe.'))!;
    const backupPath = result.manualRecoveryPaths.find((path) => path.includes('.movesafe.bak.'))!;
    expect(existsSync(editedFile)).toBe(false);
    expect(existsSync(backupPath)).toBe(true);
    expect(transactionFiles(projectDir).filter((path) => path.includes('.movesafe.tmp.'))).toEqual(
      [],
    );
  });

  it('removes a moved-file stage when its commit rename fails', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'consumer.ts');
    const to = join(projectDir, 'src', 'lib', 'consumer.ts');
    const plan = seal(planMove(from, to, graph, tsconfig));

    const result = applyMoveWithFilesystem(
      plan,
      createFaultInjectingFilesystem({ renameSync: { failOnCall: 1 } }),
    );

    expect(result.status).toBe('rejected');
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(false);
    expect(transactionFiles(projectDir)).toEqual([]);
  });

  it('reports partial when a committed moved file cannot remove its old source', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'consumer.ts');
    const to = join(projectDir, 'src', 'lib', 'consumer.ts');
    const plan = seal(planMove(from, to, graph, tsconfig));

    const result = applyMoveWithFilesystem(
      plan,
      createFaultInjectingFilesystem({ unlinkSync: { failOnCall: 1 } }),
    );

    expect(result).toMatchObject({
      status: 'partial',
      diagnostics: [expect.objectContaining({ code: 'cleanup-failed', path: from })],
      manualRecoveryPaths: [from],
    });
    expect(existsSync(from)).toBe(true);
    expect(existsSync(to)).toBe(true);
  });

  it('reports partial and names a backup that cannot be cleaned up', () => {
    const projectDir = useFixture('basic-project');
    const graph = buildImportGraph(join(projectDir, 'tsconfig.json'));
    const tsconfig = loadTsconfig(join(projectDir, 'tsconfig.json'));
    const from = join(projectDir, 'src', 'utils.ts');
    const to = join(projectDir, 'src', 'renamed.ts');
    const plan = seal(planMove(from, to, graph, tsconfig));

    const result = applyMoveWithFilesystem(
      plan,
      createFaultInjectingFilesystem({ rmSync: { failOnCall: 1 } }),
    );

    expect(result.status).toBe('partial');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'backup-cleanup-failed' }),
    );
    expect(result.manualRecoveryPaths).toHaveLength(1);
    expect(result.manualRecoveryPaths[0]).toContain('.movesafe.bak.');
    expect(existsSync(result.manualRecoveryPaths[0]!)).toBe(true);
  });

  it('rolls back completely and reports rejected when a later move fails but rollback succeeds', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'movesafe-fault-injection-'));
    const srcDir = join(tempDir, 'src');
    const destDir = join(tempDir, 'dest');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'a.ts'), 'export const a = 1;\n', 'utf8');
    writeFileSync(join(srcDir, 'b.ts'), 'export const b = 1;\n', 'utf8');

    const plan = buildTwoFileMovePlan(srcDir, destDir, ['a.ts', 'b.ts']);

    // Call #1: move a.ts (succeeds). Call #2: move b.ts (fails, triggering
    // rollback). Rollback undoes a.ts via a 3rd renameSync call, which
    // succeeds since only call #2 is configured to fail.
    const fs = createFaultInjectingFilesystem({ renameSync: { failOnCall: 2 } });
    const result = applyMoveWithFilesystem(plan, fs);

    expect(result.status).toBe('rejected');
    expect(result.manualRecoveryPaths).toEqual([]);
    expect(existsSync(join(srcDir, 'a.ts'))).toBe(true);
    expect(existsSync(join(srcDir, 'b.ts'))).toBe(true);
    expect(existsSync(join(destDir, 'a.ts'))).toBe(false);
    expect(existsSync(join(destDir, 'b.ts'))).toBe(false);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports partial with manual recovery paths when rollback itself fails', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'movesafe-fault-injection-'));
    const srcDir = join(tempDir, 'src');
    const destDir = join(tempDir, 'dest');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'a.ts'), 'export const a = 1;\n', 'utf8');
    writeFileSync(join(srcDir, 'b.ts'), 'export const b = 1;\n', 'utf8');

    const plan = buildTwoFileMovePlan(srcDir, destDir, ['a.ts', 'b.ts']);

    // Call #1: move a.ts (succeeds). Call #2: move b.ts (fails). Every call
    // after that fails too, so rollback's attempt to undo a.ts (call #3)
    // fails as well and a.ts's move can't be undone.
    const fs = createFaultInjectingFilesystem({ renameSync: { failAfter: 1 } });
    const result = applyMoveWithFilesystem(plan, fs);

    expect(result.status).toBe('partial');
    expect(result.manualRecoveryPaths).toEqual([
      join(srcDir, 'a.ts'),
      join(destDir, 'a.ts'),
      destDir,
    ]);
    expect(existsSync(join(srcDir, 'a.ts'))).toBe(false);
    expect(existsSync(join(destDir, 'a.ts'))).toBe(true);

    rmSync(tempDir, { recursive: true, force: true });
  });
});

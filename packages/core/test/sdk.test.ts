import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyMove, checkImports, planMove } from '../src/index.js';
import { analyzeProject, analyzeWorkspace, discoverWorkspaceContext } from '../src/advanced.js';

function fixturePath(...segments: string[]): string {
  return new URL(`./fixtures/${segments.join('/')}`, import.meta.url).pathname;
}

describe('workspace analysis', () => {
  it('discovers and deduplicates solution references', () => {
    const root = fixturePath('resolver', 'references');
    const context = discoverWorkspaceContext(root);

    expect(context.projects.map((project) => project.configFilePath)).toEqual([
      fixturePath('resolver', 'references', 'pkg-a', 'tsconfig.json'),
      fixturePath('resolver', 'references', 'pkg-b', 'tsconfig.json'),
      fixturePath('resolver', 'references', 'tsconfig.json'),
    ]);
  });

  it('keeps one TypeScript Program and indexed graph per project', () => {
    const config = fixturePath('planner', 'basic-project', 'tsconfig.json');
    const analysis = analyzeProject(config);
    const source = fixturePath('planner', 'basic-project', 'src', 'utils.ts');

    expect(analysis.program.getSourceFile(source)).toBeDefined();
    expect(analysis.sourceFiles.get(source)).toBeDefined();
    expect(analysis.index.nodePaths.has(source)).toBe(true);
    expect(analysis.index.inboundByTarget.get(source)).toHaveLength(2);
  });

  it('retains genuine module-resolution diagnostics in project analysis', () => {
    const config = fixturePath('graph', 'basic-project', 'tsconfig.json');
    const analysis = analyzeProject(config);

    expect(analysis.getModuleResolutionDiagnostics()).toEqual([
      expect.objectContaining({ code: 2307 }),
    ]);
    expect(analysis.graph.edges.find((edge) => edge.specifier === './missing.js')).toMatchObject({
      target: { kind: 'unresolved' },
    });
  });

  it('retains module-resolution diagnostics from declaration files', () => {
    const config = fixturePath('graph', 'declaration-diagnostic', 'tsconfig.json');
    const analysis = analyzeProject(config);

    expect(analysis.getModuleResolutionDiagnostics()).toEqual([
      expect.objectContaining({
        code: 2307,
        file: expect.objectContaining({
          fileName: fixturePath('graph', 'declaration-diagnostic', 'src', 'types.d.ts'),
        }),
      }),
    ]);
  });

  it('aggregates cross-package edges into the workspace inbound index', () => {
    const root = fixturePath('sdk', 'workspace');
    const target = fixturePath('sdk', 'workspace', 'packages', 'a', 'src', 'index.ts');
    const context = discoverWorkspaceContext(root);
    const analysis = analyzeWorkspace(context);

    expect(context.projects).toHaveLength(2);
    expect(context.workspacePackages.size).toBe(2);
    expect(analysis.projects).toHaveLength(2);
    expect(analysis.graph.edges).toHaveLength(2);
    expect(analysis.index.inboundByTarget.get(target)).toEqual([
      expect.objectContaining({
        specifier: '@fixture/a',
        target: { kind: 'inProject', filePath: target },
      }),
    ]);
  });

  it('maps an installed workspace package declaration back to its source entry', () => {
    const root = fixturePath('graph-repos', 'pnpm-monorepo');
    const target = fixturePath(
      'graph-repos',
      'pnpm-monorepo',
      'packages',
      'lib',
      'src',
      'index.ts',
    );
    const analysis = analyzeWorkspace(discoverWorkspaceContext(root));

    expect(analysis.index.inboundByTarget.get(target)).toEqual([
      expect.objectContaining({
        specifier: '@fixture/lib',
        target: { kind: 'inProject', filePath: target },
      }),
    ]);
  });
});

describe('SDK', () => {
  it('plans a move from paths and cwd without a caller-built graph', () => {
    const cwd = fixturePath('planner', 'basic-project');
    const plan = planMove({ from: 'src/utils.ts', to: 'src/renamed.ts', cwd });

    expect(plan.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(plan.edits).toContainEqual(
      expect.objectContaining({
        file: fixturePath('planner', 'basic-project', 'src', 'consumer.ts'),
      }),
    );
  });

  it('routes a cross-package move through the workspace planner', () => {
    const cwd = fixturePath('sdk', 'workspace');
    const plan = planMove({
      from: 'packages/a/src/index.ts',
      to: 'packages/b/src/moved.ts',
      cwd,
    });

    expect(plan.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(plan.fromFilePath).toBe(
      fixturePath('sdk', 'workspace', 'packages', 'a', 'src', 'index.ts'),
    );
    expect(plan.edits).toContainEqual(
      expect.objectContaining({
        file: fixturePath('sdk', 'workspace', 'packages', 'b', 'src', 'index.ts'),
        oldText: '@fixture/a',
        newText: './moved',
      }),
    );
    expect(
      plan.diagnostics.some(
        (diagnostic) => diagnostic.code === 'third-party-references-not-rewritten',
      ),
    ).toBe(false);
  });

  it('applies a cross-package SDK plan without leaving a broken workspace import', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'movesafe-sdk-'));
    const cwd = join(tempRoot, 'workspace');
    cpSync(fixturePath('sdk', 'workspace'), cwd, { recursive: true });

    try {
      const plan = planMove({
        from: 'packages/a/src/index.ts',
        to: 'packages/b/src/moved.ts',
        cwd,
      });
      const result = applyMove(plan);

      expect(result.applied).toBe(true);
      expect(existsSync(join(cwd, 'packages/a/src/index.ts'))).toBe(false);
      expect(existsSync(join(cwd, 'packages/b/src/moved.ts'))).toBe(true);
      expect(readFileSync(join(cwd, 'packages/b/src/index.ts'), 'utf8')).toContain(
        "from './moved'",
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('checks every project in a workspace and deduplicates the result', () => {
    const result = checkImports({ path: fixturePath('sdk', 'workspace') });

    expect(result.clean).toBe(true);
    expect(result.summary).toMatchObject({
      errorCount: 0,
      warningCount: 0,
      infoCount: 1,
      projectCount: 2,
    });
    expect(result.projects).toHaveLength(2);
    expect(result.projects.every((project) => project.summary.total === 0)).toBe(true);
  });

  it('surfaces malformed tsconfig diagnostics', () => {
    const result = checkImports({ path: fixturePath('resolver', 'error-malformed-json') });

    expect(result.clean).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', source: 'tsconfig' }),
    );
  });
});

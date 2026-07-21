import { describe, expect, it } from 'vitest';
import { buildImportGraph, discoverProjectFiles, loadTsconfig } from '../src/index.js';

function fixturePath(...segments: string[]): string {
  return new URL(`./fixtures/graph/${segments.join('/')}`, import.meta.url).pathname;
}

describe('buildImportGraph', () => {
  it('includes only source files as nodes, excluding .d.ts and .json', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const nodePaths = graph.nodes.map((n) => n.filePath);
    expect(nodePaths).toContain(fixturePath('basic-project', 'src', 'index.ts'));
    expect(nodePaths).toContain(fixturePath('basic-project', 'src', 'utils.ts'));
    expect(nodePaths).not.toContain(fixturePath('basic-project', 'src', 'types.d.ts'));
    expect(nodePaths).not.toContain(fixturePath('basic-project', 'src', 'data.json'));
    expect(nodePaths).toHaveLength(2);
  });

  it('produces zero outgoing edges for a leaf file', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const utilsPath = fixturePath('basic-project', 'src', 'utils.ts');
    expect(graph.edges.filter((e) => e.fromFilePath === utilsPath)).toEqual([]);
  });

  it('classifies an in-project relative import', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const edge = graph.edges.find((e) => e.specifier === './utils.js');
    expect(edge).toMatchObject({
      formKind: 'import',
      isTypeOnly: false,
      target: { kind: 'inProject', filePath: fixturePath('basic-project', 'src', 'utils.ts') },
    });
  });

  it('classifies a real external package import', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const edge = graph.edges.find((e) => e.specifier === 'left-pad');
    expect(edge).toMatchObject({ target: { kind: 'external', packageName: 'left-pad' } });
  });

  it('classifies a missing specifier as unresolved and surfaces a matching warning', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const edge = graph.edges.find((e) => e.specifier === './missing.js');
    expect(edge).toMatchObject({ target: { kind: 'unresolved' } });
    expect(graph.warnings).toContainEqual(
      expect.objectContaining({
        source: 'resolver',
        warning: expect.objectContaining({ kind: 'unresolved', specifier: './missing.js' }),
      }),
    );
  });

  it('classifies an in-project non-source file (json) as a distinct target kind', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const edge = graph.edges.find((e) => e.specifier === './data.json');
    expect(edge).toMatchObject({
      target: {
        kind: 'inProjectNonSourceFile',
        filePath: fixturePath('basic-project', 'src', 'data.json'),
      },
    });
  });

  it('is JSON-serializable with no data loss', () => {
    const graph = buildImportGraph(fixturePath('basic-project', 'tsconfig.json'));
    const roundTripped = JSON.parse(JSON.stringify(graph));
    expect(roundTripped.nodes).toHaveLength(graph.nodes.length);
    expect(roundTripped.edges).toHaveLength(graph.edges.length);
  });

  it('classifies a workspace-shaped package as external when no workspacePackages option is given', () => {
    const graph = buildImportGraph(fixturePath('workspace-edge', 'tsconfig.json'));
    expect(graph.edges[0]).toMatchObject({ target: { kind: 'external', packageName: '@fixture/lib' } });
  });

  it('reclassifies a workspace-shaped package as outOfProject when its directory is supplied', () => {
    const graph = buildImportGraph(fixturePath('workspace-edge', 'tsconfig.json'), {
      workspacePackages: {
        '@fixture/lib': fixturePath('workspace-edge', 'node_modules', '@fixture', 'lib'),
      },
    });
    expect(graph.edges[0]).toMatchObject({
      target: { kind: 'outOfProject', isWorkspacePackage: true },
    });
  });
});

describe('discoverProjectFiles', () => {
  it('splits fileNames into source files and non-source files', () => {
    const tsconfig = loadTsconfig(fixturePath('basic-project', 'tsconfig.json'));
    const { sourceFiles, nonSourceFiles } = discoverProjectFiles(tsconfig);
    expect(sourceFiles).toContain(fixturePath('basic-project', 'src', 'index.ts'));
    expect(sourceFiles).toContain(fixturePath('basic-project', 'src', 'utils.ts'));
    expect(nonSourceFiles).toContain(fixturePath('basic-project', 'src', 'types.d.ts'));
    expect(nonSourceFiles).toContain(fixturePath('basic-project', 'src', 'data.json'));
  });
});

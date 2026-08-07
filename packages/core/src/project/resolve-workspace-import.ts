import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { ImportGraphEdge, ImportGraphNode } from '../graph/types.js';
import { canonicalPath, isPathInside, toModulePath } from '../path-utils.js';
import type { WorkspaceContext } from './types.js';

const SOURCE_EXTENSIONS = /(?:\.d)?\.[cm]?[jt]sx?$/;
const OUTPUT_DIRECTORY = /^(?:dist|lib|build|out)\//;

function sourceStem(path: string): string {
  return path.replace(SOURCE_EXTENSIONS, '');
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (typeof value !== 'object' || value === null) return [];
  return Object.values(value).flatMap(collectStrings);
}

function packageNameOf(edge: ImportGraphEdge, context: WorkspaceContext): string | undefined {
  const packageName =
    edge.target.kind === 'external'
      ? edge.target.packageName
      : edge.target.kind === 'outOfProject'
        ? edge.target.packageId?.name
        : undefined;
  return packageName && context.workspacePackages.has(packageName) ? packageName : undefined;
}

function packageSubpath(specifier: string, packageName: string): string | undefined {
  if (specifier === packageName) return undefined;
  return specifier.startsWith(`${packageName}/`) ? specifier.slice(packageName.length + 1) : undefined;
}

function manifestTargets(packageDir: string, subpath: string | undefined): string[] {
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    return [];
  }

  const exportsField = manifest.exports;
  const exportTarget =
    subpath === undefined
      ? typeof exportsField === 'object' && exportsField !== null && '.' in exportsField
        ? (exportsField as Record<string, unknown>)['.']
        : exportsField
      : typeof exportsField === 'object' && exportsField !== null
        ? (exportsField as Record<string, unknown>)[`./${subpath}`]
        : undefined;

  return [
    ...(subpath === undefined
      ? collectStrings([manifest.types, manifest.typings, manifest.module, manifest.main])
      : []),
    ...collectStrings(exportTarget),
  ];
}

function candidateStems(packageDir: string, subpath: string | undefined): string[][] {
  const declared = manifestTargets(packageDir, subpath).map((target) =>
    sourceStem(toModulePath(target).replace(/^\.\//, '')),
  );
  const remapped = declared.map((target) => target.replace(OUTPUT_DIRECTORY, 'src/'));
  const conventional = subpath
    ? [`src/${subpath}`, `src/${subpath}/index`, subpath, `${subpath}/index`]
    : ['src/index', 'index'];
  return [declared, remapped, conventional];
}

export function createWorkspaceImportResolver(
  context: WorkspaceContext,
  nodes: readonly ImportGraphNode[],
): (edge: ImportGraphEdge) => string | undefined {
  const nodesByCanonicalPath = new Map(nodes.map((node) => [canonicalPath(node.filePath), node.filePath]));
  const nodesByPackage = new Map<string, ReadonlyMap<string, string>>();
  const resolvedImports = new Map<string, string | undefined>();

  for (const [packageName, packageDir] of context.workspacePackages) {
    nodesByPackage.set(
      packageName,
      new Map(
        nodes
          .filter((node) => isPathInside(node.filePath, packageDir, true))
          .map((node) => [
            sourceStem(toModulePath(relative(packageDir, node.filePath))),
            node.filePath,
          ]),
      ),
    );
  }

  return (edge) => {
    if (edge.target.kind === 'outOfProject') {
      const exactTarget = nodesByCanonicalPath.get(canonicalPath(edge.target.resolvedFileName));
      if (exactTarget) return exactTarget;
    }

    const packageName = packageNameOf(edge, context);
    if (!packageName) return undefined;
    const subpath = packageSubpath(edge.specifier, packageName);
    const cacheKey = `${packageName}\0${subpath ?? ''}`;
    if (resolvedImports.has(cacheKey)) return resolvedImports.get(cacheKey);

    const packageDir = context.workspacePackages.get(packageName)!;
    const nodesByStem = nodesByPackage.get(packageName)!;
    for (const stems of candidateStems(packageDir, subpath)) {
      const matches = new Set(stems.map((stem) => nodesByStem.get(stem)).filter(Boolean));
      if (matches.size === 1) {
        const target = [...matches][0];
        resolvedImports.set(cacheKey, target);
        return target;
      }
    }

    const resolvedTarget =
      edge.target.kind === 'outOfProject' ? resolve(edge.target.resolvedFileName) : undefined;
    const target =
      resolvedTarget && nodesByStem.get(sourceStem(toModulePath(relative(packageDir, resolvedTarget))));
    resolvedImports.set(cacheKey, target);
    return target;
  };
}

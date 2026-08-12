# Use movesafe in a monorepo

Movesafe discovers workspace packages and TypeScript projects before deciding whether a move is project-local or crosses a package boundary.

## Workspace discovery

Supported workspace manifests are:

- `pnpm-workspace.yaml` for pnpm workspaces;
- `package.json#workspaces` for npm and Yarn workspaces.

When both are present, `pnpm-workspace.yaml` wins. Package globs are expanded, each package name is mapped to its directory, and Turborepo is detected when `turbo.json` exists.

From the workspace root, Movesafe loads a root `tsconfig.json` when present and each discovered package-level `tsconfig.json`. TypeScript project references are followed recursively. From a nested path, the nearest applicable config is used.

## Check the whole workspace

```bash
npx --yes movesafe@0.1.0 check .
```

Run this at the workspace root to aggregate findings across discovered package projects. Duplicate findings and diagnostics are removed from the final report.

If the repository has no recognized workspace manifest and no root config, target a package directly:

```bash
npx --yes movesafe@0.1.0 check packages/api
```

## Move across packages

Cross-package file moves require both paths to be inside known workspace packages, and both packages need a `tsconfig.json`:

```bash
npx --yes movesafe@0.1.0 mv \
  packages/web/src/date.ts \
  packages/shared/src/date.ts \
  --dry-run
```

The workspace plan can repair:

- relative imports within the source and destination packages;
- inbound imports that must switch to the destination package;
- imports inside the moved file that must switch back to the source package;
- references from other workspace packages visible in the workspace graph.

## Package boundary rules

Movesafe will not invent package metadata. A package-level rewrite is accepted only when:

1. exactly one non-wildcard entry in the destination `package.json#exports` maps to the destination source file;
2. the new importer already declares a dependency on the imported workspace package;
3. the resulting specifier can be verified against the workspace graph.

A missing dependency blocks the plan. A dependency cycle is reported as a warning. Movesafe edits TypeScript source; it does not add dependencies or change package export maps.

::: warning Directories stay inside one package
Cross-package directory moves are unsupported. Move files individually so each export and dependency edge is explicit in the plan.
:::

## Aliases and package imports

`compilerOptions.paths`, `baseUrl`, Node-style package resolution, and workspace packages are resolved through the TypeScript compiler. An alias may remain unchanged when it still resolves after the move; otherwise the planner computes a safe replacement. If it cannot, the move is blocked instead of falling back to a guess.

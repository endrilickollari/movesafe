---
layout: home
title: Quickstart
titleTemplate: false

hero:
  name: movesafe
  text: Move the file. Keep the graph intact.
  tagline: A headless TypeScript refactoring tool that plans every edit, repairs imports, verifies the result, and only then writes to disk.
  actions:
    - theme: brand
      text: Preview a move
      link: /mv
    - theme: alt
      text: Set up MCP
      link: /mcp
---

## Run your first move

Movesafe requires Node.js 22.13 or newer. You can run the published CLI without adding it to your project:

```bash
# See the exact move and import edits. Nothing is written.
npx --yes movesafe@0.1.0 mv src/utils.ts src/lib/utils.ts --dry-run

# Apply the same move.
npx --yes movesafe@0.1.0 mv src/utils.ts src/lib/utils.ts

# Validate the project afterwards.
npx --yes movesafe@0.1.0 check .
```

Movesafe finds the nearest `tsconfig.json`, builds the project import graph, and resolves specifiers with the TypeScript compiler. Install the target project's dependencies first so package imports can be resolved.

::: tip Start with the diff
Use `--dry-run` in a clean working tree. Review the destination path and every rewritten specifier, then rerun the command without the flag.
:::

## Choose a workflow

| You need to…                              | Use                              |
| ----------------------------------------- | -------------------------------- |
| Preview or apply a file or directory move | [`movesafe mv`](./mv.md)         |
| Find broken imports and barrel exports    | [`movesafe check`](./check.md)   |
| Move across workspace packages            | [Monorepo guide](./monorepos.md) |
| Let an agent plan, review, and apply      | [MCP guide](./mcp.md)            |

## What is repaired

The planner tracks static imports, type imports, re-exports, `require()` calls, and literal dynamic imports. It handles relative specifiers, `tsconfig` path aliases, barrels, project references, and workspace package imports.

Computed import specifiers are reported as diagnostics and are never guessed.

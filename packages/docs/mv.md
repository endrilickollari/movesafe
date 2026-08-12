# Move files with `mv`

`movesafe mv` relocates a TypeScript file or directory and rewrites the import specifiers affected by that move.

```bash
movesafe mv <from> <to> [--dry-run]
```

Paths are resolved from the current working directory.

## Preview before writing

```bash
npx --yes movesafe@0.1.0 mv src/domain/user.ts src/models/user.ts --dry-run
```

The dry run computes the same verified plan used by a real move, renders a unified diff, and leaves the filesystem untouched. A ready plan exits with status `0`; a blocked plan prints diagnostics and exits with status `1`.

The diff can include:

- the source-to-destination file move;
- import changes in files that reference the moved file;
- specifier changes inside the moved file when its relative position changes;
- barrel and re-export updates.

## Apply the move

```bash
npx --yes movesafe@0.1.0 mv src/domain/user.ts src/models/user.ts
```

Movesafe recomputes the plan, verifies the post-move module graph in memory, and applies the sealed plan through rollback-oriented file swaps. It prints the completed path when the apply succeeds.

The plan is rejected if relevant files changed between planning and application. This protects the operation from applying edits against stale source text.

## Move a directory

Use the same command with a directory as `from`:

```bash
npx --yes movesafe@0.1.0 mv src/legacy src/platform/legacy --dry-run
```

All TypeScript source files under that directory become part of one plan. Same-project directory moves are supported; cross-package directory moves are deliberately refused. Move those files individually so each package boundary can be verified.

## Cross-package files

When the source and destination belong to different workspace packages, the planner switches to workspace scope:

```bash
npx --yes movesafe@0.1.0 mv \
  packages/app/src/format.ts \
  packages/shared/src/format.ts \
  --dry-run
```

Package imports are rewritten only when the destination has an unambiguous export target and the importing package already declares the required workspace dependency. See the [monorepo guide](./monorepos.md) for the constraints.

## What can block a move

Movesafe returns diagnostics instead of mutating the project when:

- the source does not exist or is not included by a discovered TypeScript project;
- no applicable `tsconfig.json` can be found;
- the destination is outside the project or collides with a known source file;
- an import cannot be safely rewritten or verified;
- a cross-package move needs a missing package dependency or export mapping.

Warnings remain visible in the dry run and successful output. Review them: they identify risks that did not make the plan unsafe enough to block.

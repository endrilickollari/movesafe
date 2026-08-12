# Check imports

`movesafe check` scans one TypeScript project or a discovered workspace without changing files.

```bash
movesafe check [path] [--json | --md]
```

The path defaults to the current directory. Install the checked project's dependencies first so TypeScript can resolve external packages.

## Findings

The checker reports three source-level errors:

| Code                        | Meaning                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `unresolved-import`         | TypeScript could not resolve an import or re-export target.                                  |
| `orphaned-barrel-export`    | A named barrel re-export points to a name the target file does not declare.                  |
| `case-sensitivity-mismatch` | A relative path differs from the real on-disk casing and may fail on case-sensitive systems. |

It also includes workspace, `tsconfig`, scanner, and resolver diagnostics produced while building the import graph.

::: info Checker scope
This is an import-integrity check, not a replacement for `tsc --noEmit`. For example, multi-hop `export *` chains that cannot be proven from local declarations are skipped rather than guessed.
:::

## Output formats

Use terminal output locally:

```bash
npx --yes movesafe@0.1.0 check .
```

Use JSON for scripts and agents:

```bash
npx --yes movesafe@0.1.0 check packages/api --json
```

Use Markdown for pull-request comments or workflow summaries:

```bash
npx --yes movesafe@0.1.0 check . --md
```

`--json` and `--md` are mutually exclusive. The command exits with status `1` when the combined findings and diagnostics contain an error; otherwise it exits with status `0`.

## Run in CI

The composite GitHub Action installs and runs the published checker, then writes a Markdown report to the workflow summary. Install your repository dependencies before calling it:

```yaml
- uses: actions/checkout@v5

- run: npm ci

- uses: endrilickollari/movesafe/packages/action@main
  with:
    path: .
```

The `path` input follows the same project-discovery rules as the CLI. The Action fails its step when checker errors are present.

## Fix discovery errors

If the checker reports `no-tsconfig-found`, run it from a package directory or pass a path below that package's config. In a workspace with no root `tsconfig.json`, checking `.` from the repository root still discovers package configs when the workspace manifest identifies them.

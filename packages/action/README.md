# movesafe check (GitHub Action)

Fails the build when [movesafe](https://github.com/endrilickollari/movesafe)
finds broken imports, orphaned barrel exports, or case-sensitivity
mismatches. The `--md` report is posted to the job's step summary.

Runs the pinned `movesafe@0.1.0` package from npm. Consuming repositories do
not need pnpm, a movesafe checkout, or a local installation.

## Usage

```yaml
- uses: endrilickollari/movesafe/packages/action@main
  with:
    path: . # optional, defaults to the repo root
```

## Inputs

| Name   | Required | Default | Description                                      |
| ------ | -------- | ------- | ------------------------------------------------- |
| `path` | no       | `.`     | Directory to check, relative to the checkout root. Must be at or below a directory containing a `tsconfig.json` — for a monorepo with no root tsconfig, point this at the specific package. |

## Free vs. paid tier

The free tier (this action) fails the build and prints the report to the
step summary. Rich PR annotations (inline comments, richer diagnostics) are
a paid movesafe-cloud feature, not part of this action.

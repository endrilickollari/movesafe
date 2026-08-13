# Contributing to movesafe

Thanks for helping make TypeScript file moves safer. Bug reports, focused feature proposals,
documentation improvements, and tested code changes are welcome.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md) in all project spaces. Report security
problems through the process in [SECURITY.md](SECURITY.md), not through a public issue.

## Before opening an issue

- Search the existing issues first.
- Use GitHub Discussions for questions and usage help.
- For a bug, provide a public reproduction repository or a minimal reproduction. Remove secrets,
  proprietary code, and identifying paths from logs.
- Keep feature requests grounded in a concrete developer or agent workflow.

## Development setup

Movesafe requires Node.js 22.13 or newer and uses pnpm 11.10.0.

```bash
npm install --global pnpm@11.10.0
pnpm install --frozen-lockfile
```

Create a branch from `main` and keep each pull request focused on one change.

## Validate a change

Run the same checks as CI before opening a pull request:

```bash
pnpm turbo run build lint test --concurrency=2
pnpm test:packages
```

Changes to move planning, module resolution, checking, or filesystem application should include a
regression test. Prefer a small fixture that demonstrates the exact TypeScript configuration and
import shape involved.

To work on the documentation site:

```bash
pnpm --filter @movesafe/docs dev
```

Then open `http://localhost:5173/movesafe/`. Run the docs checks before submitting documentation
changes:

```bash
pnpm --filter @movesafe/docs lint
pnpm --filter @movesafe/docs build
```

## Pull requests

- Explain the problem and the chosen solution.
- Link the relevant issue when one exists.
- Include tests for behavior changes and update user-facing documentation when needed.
- Preserve the project's design rules: plan before writing, refuse instead of guessing, and keep
  core behavior independent from CLI, MCP, and GitHub Action rendering.
- Do not include unrelated formatting or generated-file changes.
- Make sure every required GitHub check passes and resolve review conversations.

Maintainers may ask for a smaller reproduction, additional tests, or a narrower change before
reviewing an implementation.

## Maintenance

Movesafe is maintained independently on the maintainer's schedule. Issues, discussions, and pull
requests are welcome, but response times and release dates are not guaranteed. Security reports
follow the private process in [SECURITY.md](SECURITY.md).

## Releases

Package versions, release tags, changelogs, and npm publication are managed by the project
maintainer. Contributors should not change package versions or publish packages as part of a pull
request unless the maintainer explicitly requests it.

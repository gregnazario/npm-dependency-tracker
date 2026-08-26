# npm-dependency-tracker

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

`dep-tracker` parses any JavaScript lockfile and lets you explore the dependency
graph locally in your browser — no uploads, no accounts, no telemetry. Point it
at a project, it detects which package manager produced the lock, builds a
normalized graph of every resolved package, and opens an interactive D3.js view.

## Why

Dependency trees are where bloat, version conflicts, and supply-chain risk hide,
but the raw lockfiles that describe them are machine formats — hundreds of
kilobytes of JSON/YAML/text optimized for installers, not humans. Existing
explorers either require shipping your `package.json` to a web service or only
work with one package manager's lock format. This tool does the opposite: it
reads the lockfile already on disk for npm, yarn, pnpm, and bun projects, and
runs entirely on your machine.

## Features

- **Lockfile auto-detection** across all four managers — checks for `bun.lockb`
  or `bun.lock`, then `pnpm-lock.yaml`, `yarn.lock`, and `package-lock.json`
  (in that priority order) next to a `package.json`
- **Three D3 layouts** — force-directed, top-down tree, and radial, switchable
  live from the sidebar
- **Prod vs full modes** — `--mode prod|full` on the CLI; dependency-type layers
  (dependencies / devDependencies / peerDependencies / optionalDependencies) can
  be toggled on and off at any time in the sidebar
- **Search and highlight** — dim everything except packages matching a query;
  click a duplicate entry to isolate every copy of it in the graph
- **Duplicate detection** — flags packages installed at multiple versions and
  lists them in a panel with all resolved versions
- **Stats and depth control** — total packages, direct/dev/peer/optional counts,
  max depth, and a slider to prune the tree to a given depth
- **Runs entirely local via Bun** — the CLI parses the lockfile, serves the API
  and web UI from `localhost`, and never contacts the network

## Quick start

Requires [Bun](https://bun.sh).

```sh
git clone https://github.com/gregnazario/npm-dependency-tracker
cd npm-dependency-tracker
bun install
```

Analyze the current directory (detects its lockfile, starts the server, opens
your browser):

```sh
bun run src/cli/index.ts
# or equivalently
bun run dev
```

Point it at another project:

```sh
dep-tracker ~/code/some-project   # or: bun run src/cli/index.ts ~/code/some-project
```

Common flag combinations (`dep-tracker` is the package bin; if you haven't
linked it, substitute `bun run src/cli/index.ts`):

```sh
# Production dependencies only, on a fixed port, without opening a browser
dep-tracker ~/code/some-project --mode prod --port 3000 --no-open

# Short forms work too
dep-tracker . -m prod -p 8321
```

Then visit the printed URL (e.g. `http://localhost:3000?mode=prod`). Press
Ctrl+C to stop.

For a minified production bundle of the web UI, build once — subsequent runs
serve `dist/web/` instead of the sources:

```sh
bun run build
```

## Options

| Flag | Description |
| --- | --- |
| `[path]` | Project directory to analyze (default: current directory) |
| `--mode`, `-m` | Display mode: `prod` or `full` (default: `full`) |
| `--port`, `-p` | Server port (default: random available port) |
| `--no-open` | Don't auto-open the browser |
| `--help`, `-h` | Show help |
| `--version`, `-v` | Show version |

## Known limitations

- Only text-based locks are parsed. bun's binary `bun.lockb` is detected but not
  supported yet: it ranks ahead of `bun.lock` during detection, but parsing then
  reads the text `bun.lock` if present — which can be stale relative to the
  binary file — and errors with "binary format requires CLI fallback" when no
  text lock exists.
- The package-manager-CLI fallback (`npm ls --all --json`) exists but only the
  npm path is implemented; yarn/pnpm/bun fallbacks currently throw.
- Lockfiles are parsed once at startup — edits while the server runs are not
  picked up until you restart.

## Development

```sh
bun test        # parser + server integration tests, fixtures for all four managers
bun run build   # bundle src/web → dist/web with Bun's built-in bundler
```

## License

[Apache-2.0](LICENSE)

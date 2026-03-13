# npm Dependency Tracker — Design Specification

**Date:** 2026-03-13
**Status:** Draft

## Problem

Understanding the full dependency tree of a JavaScript project is difficult. `npm ls` gives text output, but there's no way to visually explore the graph, see how transitive dependencies connect, identify duplicate versions, or filter between production and development dependencies. Existing tools are either abandoned, limited to one package manager, or don't show the full picture.

## Solution

A publishable CLI tool (`dep-tracker`) that analyzes a JavaScript project's dependency tree and renders an interactive D3.js visualization in the browser. Supports npm, yarn, pnpm, and bun.

## Requirements

### Functional
1. **Two modes:** Prod (no devDependencies) and Full (all dependencies)
2. **Four dependency types** visually distinguished: dependency, devDependency, peerDependency, optionalDependency
3. **Duplicate version detection:** Highlight packages that appear with multiple versions; sidebar panel listing all duplicates
4. **Three graph layouts:** Force-directed (default), hierarchical tree, radial — with toggle
5. **Full interactivity:** Zoom/pan, click to expand/collapse subtrees, search/filter, hover tooltips, drag nodes
6. **All four package managers:** npm, yarn (classic + berry), pnpm, bun
7. **Lockfile-first parsing** with CLI fallback when no lockfile exists

### Non-Functional
- Publishable to npm as a CLI package
- TypeScript + Bun runtime
- Handles projects with 1000+ packages without freezing

## Architecture

```
┌─────────────────────────────────────────────┐
│  CLI (src/cli/)                              │
│  - Argument parsing (path, --mode, --port)   │
│  - Package manager auto-detection            │
│  - Server startup + browser launch           │
└─────────────┬───────────────────────────────┘
              │
┌─────────────▼───────────────────────────────┐
│  Parsers (src/parsers/)                      │
│  - npm-parser.ts (package-lock.json v2/v3)   │
│  - yarn-parser.ts (yarn.lock classic+berry)  │
│  - pnpm-parser.ts (pnpm-lock.yaml)           │
│  - bun-parser.ts (bun.lock JSON / CLI)       │
│  - fallback.ts (shell out to PM CLI)         │
│  → All return normalized DependencyGraph     │
└─────────────┬───────────────────────────────┘
              │
┌─────────────▼───────────────────────────────┐
│  Server (src/server/)                        │
│  - Bun.serve on random available port        │
│  - GET / → web app (HTML + JS + CSS)         │
│  - GET /api/graph?mode=prod|full → JSON      │
│  - Static asset serving                      │
└─────────────┬───────────────────────────────┘
              │
┌─────────────▼───────────────────────────────┐
│  Web App (src/web/)                          │
│  - D3.js force/tree/radial layouts           │
│  - Sidebar: mode toggle, search, legend,     │
│    stats, duplicates panel                   │
│  - SVG rendering + d3-zoom                   │
│  - Depth slider, expand/collapse             │
└─────────────────────────────────────────────┘
```

## Data Model

```typescript
interface DependencyNode {
  id: string;            // "package@version"
  name: string;          // "lodash"
  version: string;       // "4.17.21"
  depth: number;         // 0 = root, 1 = direct, 2+ = transitive
  isDuplicate: boolean;  // true if another node has same name but different version
  dependentCount: number; // number of nodes that depend on this one (computed during parsing)
}

interface DependencyEdge {
  source: string;        // node id
  target: string;        // node id
  type: 'dependency' | 'devDependency' | 'peerDependency' | 'optionalDependency';
}

interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  rootId: string;
  stats: {
    totalPackages: number;
    directDeps: number;
    devDeps: number;
    peerDeps: number;
    optionalDeps: number;
    maxDepth: number;
    duplicateCount: number;
  };
}
```

## Prod vs Full Mode Filtering

Parsers always produce the **full** graph (all dependency types). Filtering happens at the **server layer** when the API is called with `?mode=prod`:

1. Walk the full graph starting from root
2. Exclude any edge where `type === 'devDependency'`
3. Remove nodes that become unreachable after excluding dev edges
4. Recompute `stats`, `isDuplicate`, and `dependentCount` for the filtered graph

This means the parser is called once and the result is cached. The server produces two views from the same data. The web app simply re-fetches `/api/graph?mode=prod` or `?mode=full` when the user toggles.

## Visual Language

| Element | Style |
|---------|-------|
| dependency edge | solid indigo `#818cf8` |
| devDependency edge | dashed pink `#f472b6` |
| peerDependency edge | dotted emerald `#34d399` |
| optionalDependency edge | fine dots amber `#fbbf24` |
| duplicate node | red glow ring `#dc2626` |
| node size | proportional to dependent count |
| node opacity | decreases with depth |

## Package Manager Detection

Priority order (first lockfile found wins):
1. `bun.lockb` or `bun.lock` → Bun
2. `pnpm-lock.yaml` → pnpm
3. `yarn.lock` → Yarn
4. `package-lock.json` → npm

If no lockfile, check for `package.json` and attempt CLI fallback.

## Lockfile Parsing Details

### npm (package-lock.json v2/v3)
- Read `packages` field (flat map of `node_modules/` paths → metadata)
- Each entry has `version`, `dependencies`, `devDependencies`, `peerDependencies`, `optional`
- **Path nesting algorithm:** Keys in `packages` are paths like `""` (root), `"node_modules/express"` (direct dep), `"node_modules/express/node_modules/debug"` (nested/transitive dep). To determine parent-child: strip the last `/node_modules/<name>` segment from a key to find its parent. For example, `node_modules/express/node_modules/debug` → parent is `node_modules/express`. The root entry `""` is the project itself. When a package resolves to a hoisted version (no nested path), its parent is the nearest ancestor in the path hierarchy that lists it as a dependency.

### yarn (yarn.lock)
- Custom non-JSON format: entries like `"pkg@^1.0.0":\n  version "1.2.3"\n  dependencies:\n    ...`
- Parse line-by-line with a state machine
- Yarn Berry (v2+): check for `__metadata` key, handle `npm:` protocol resolution

### pnpm (pnpm-lock.yaml)
- YAML with `lockfileVersion`, `importers` (workspace roots), `packages` (resolved)
- Parse with `yaml` npm package (the standard YAML parser for JS, handles YAML 1.2)
- pnpm's content-addressable storage means fewer duplicates

### bun (bun.lock / bun.lockb)
- `bun.lock` (v1.2+): JSON-like format (JSONC with trailing commas), parse with `JSON.parse` after stripping comments/trailing commas, or use Bun's native `JSON.parse` which is lenient
- `bun.lockb`: binary format, not directly parseable. Fallback: run `bun pm ls --all` which outputs an indented tree like:
  ```
  my-app@1.0.0
  ├── express@4.18.2
  │   ├── body-parser@1.20.2
  │   └── cookie@0.6.0
  └── lodash@4.17.21
  ```
  Parse by reading indentation depth (each `├──`/`└──` level = +1 depth) and extracting `name@version` from each line

### Fallback (no lockfile)
- npm: `npm ls --all --json` — returns a JSON tree with `name`, `version`, `dependencies` at each level
- yarn: `yarn list --json` — returns JSON with `data.trees[]` array of `{name, children}`
- pnpm: `pnpm list --json --long` — returns JSON array with `dependencies` and `devDependencies` nested objects
- bun: `bun pm ls --all` — returns indented tree text (same format as bun.lockb fallback above)

## Project Structure

```
npm-dependency-tracker/
├── package.json
├── tsconfig.json
├── src/
│   ├── cli/
│   │   └── index.ts          # Entry point, arg parsing, orchestration
│   ├── parsers/
│   │   ├── types.ts           # DependencyGraph, DependencyNode, DependencyEdge
│   │   ├── detect.ts          # Package manager auto-detection
│   │   ├── npm-parser.ts
│   │   ├── yarn-parser.ts
│   │   ├── pnpm-parser.ts
│   │   ├── bun-parser.ts
│   │   └── fallback.ts        # CLI-based fallback parser
│   ├── server/
│   │   └── index.ts           # Bun.serve, API routes, static serving
│   └── web/
│       ├── index.html         # Main HTML shell
│       ├── app.ts             # App initialization, sidebar, controls
│       ├── graph/
│       │   ├── force-layout.ts
│       │   ├── tree-layout.ts
│       │   ├── radial-layout.ts
│       │   └── renderer.ts    # Shared SVG rendering (nodes, edges, tooltips)
│       ├── components/
│       │   ├── sidebar.ts     # Sidebar UI
│       │   ├── search.ts      # Search/filter logic
│       │   └── duplicates.ts  # Duplicates panel
│       └── styles.css         # Dark theme styles
├── tests/
│   ├── fixtures/              # Sample lockfiles for each format
│   ├── parsers/               # Parser unit tests
│   └── integration/           # CLI → server → API tests
└── docs/
```

## CLI Interface

```
dep-tracker [path] [options]

Arguments:
  path          Path to project directory (default: current directory)

Options:
  --mode, -m    Display mode: "prod" or "full" (default: "full")
  --port, -p    Server port (default: random available port)
  --no-open     Don't auto-open the browser
  --help, -h    Show help
  --version, -v Show version
```

## UI Components

### Sidebar (260px fixed width)
1. **Mode toggle** — Prod / Full segmented control. Switches API call and re-renders graph.
2. **Search bar** — Filters nodes by name. Matching nodes highlighted, others dimmed.
3. **Layout switcher** — Force / Tree / Radial segmented control. Transitions between layouts.
4. **Stats panel** — Total packages, direct deps, dev deps, peer deps, optional deps, max depth.
5. **Legend** — Color-coded edge types with line style samples.
6. **Duplicates panel** — Scrollable list of packages with multiple versions. Click to highlight in graph.

### Graph Area
1. **SVG canvas** with d3-zoom (pan + zoom via scroll/pinch)
2. **Nodes** — circles sized by dependent count, colored by type, opacity by depth
3. **Edges** — styled per dependency type (solid, dashed, dotted, fine-dotted)
4. **Tooltips** — on hover: package name, version, incoming edge types (how this package is depended upon), dependent count, depth
5. **Click behavior** — click node to expand/collapse its subtree
6. **Depth slider** — limits max visible depth
7. **Zoom controls** — +, −, reset buttons

## Testing Strategy

### Unit Tests
- Each parser tested with fixture lockfiles
- Fixture lockfiles generated from small real projects
- Test: correct node count, edge types, duplicate detection, depth calculation

### Integration Tests
- CLI launches server, API returns valid DependencyGraph JSON
- Mode switching returns different node sets (prod excludes devDeps)
- Auto-detection picks correct parser for each lockfile type

### Manual Verification
- Run against a real project (e.g., the tool's own dependencies)
- Verify all three layouts render
- Verify duplicate highlighting works
- Verify search filters correctly
- Test with large project (1000+ deps) for performance

## Resolved Decisions

### Web App Build Strategy
The web app (`src/web/`) is TypeScript that must run in the browser. **Decision: Pre-compile at build time using Bun's bundler.**

- `bun build src/web/app.ts --outdir dist/web --bundle --minify` produces a single `app.js` bundle
- D3.js is installed as an npm dependency and bundled into `app.js` by the bundler (no CDN needed, works offline)
- `src/web/index.html` and `src/web/styles.css` are copied to `dist/web/` at build time
- The `prepublishOnly` script runs the build so the npm package includes `dist/web/` with compiled assets
- `src/server/index.ts` serves files from the `dist/web/` directory
- During development, run `bun run build` to rebuild after web app changes

### CLI Browser Launch
The `--no-open` flag is handled in `src/cli/index.ts`. Browser launch uses `Bun.spawn(['open', url])` on macOS and `Bun.spawn(['xdg-open', url])` on Linux. The `--no-open` flag skips this step and just prints the URL.

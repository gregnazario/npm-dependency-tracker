# Dependency Tracker Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI tool that analyzes JS project dependency trees and renders an interactive D3.js visualization in the browser, supporting npm/yarn/pnpm/bun.

**Architecture:** CLI parses lockfiles (with PM CLI fallback) into a normalized DependencyGraph, starts a Bun HTTP server exposing the graph via API, and serves a pre-compiled D3.js web app with force/tree/radial layouts, search, and duplicate detection.

**Tech Stack:** TypeScript, Bun runtime + bundler, D3.js v7, `yaml` package for pnpm parsing

**Spec:** `docs/superpowers/specs/2026-03-13-dependency-tracker-design.md`

---

## Chunk 1: Project Setup + Types + Detection

### Task 1: Scaffold project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/parsers/types.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "dep-tracker",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "dep-tracker": "./src/cli/index.ts"
  },
  "scripts": {
    "dev": "bun run src/cli/index.ts",
    "build": "bun run scripts/build.ts",
    "test": "bun test"
  },
  "dependencies": {
    "d3": "^7.9.0",
    "yaml": "^2.6.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/d3": "^7.4.3"
  },
  "files": [
    "src/",
    "dist/"
  ]
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["bun-types"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
.superpowers/
```

- [ ] **Step 4: Install dependencies**

Run: `bun install`
Expected: `bun.lockb` created, `node_modules/` populated

- [ ] **Step 5: Create types file `src/parsers/types.ts`**

```typescript
export interface DependencyNode {
  id: string;
  name: string;
  version: string;
  depth: number;
  isDuplicate: boolean;
  dependentCount: number;
}

export interface DependencyEdge {
  source: string;
  target: string;
  type: "dependency" | "devDependency" | "peerDependency" | "optionalDependency";
}

export interface DependencyGraph {
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

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json .gitignore bun.lockb src/parsers/types.ts
git commit -m "feat: scaffold project with types and dependencies"
```

---

### Task 2: Package manager detection

**Files:**
- Create: `src/parsers/detect.ts`
- Create: `tests/parsers/detect.test.ts`

- [ ] **Step 1: Write failing test for detection**

Create `tests/parsers/detect.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { detectPackageManager } from "../../src/parsers/detect";

describe("detectPackageManager", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "detect-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true });
  });

  test("detects bun from bun.lockb", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "bun.lockb"), "");
    expect(detectPackageManager(tempDir)).toBe("bun");
  });

  test("detects bun from bun.lock", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "bun.lock"), "{}");
    expect(detectPackageManager(tempDir)).toBe("bun");
  });

  test("detects pnpm from pnpm-lock.yaml", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "pnpm-lock.yaml"), "");
    expect(detectPackageManager(tempDir)).toBe("pnpm");
  });

  test("detects yarn from yarn.lock", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "yarn.lock"), "");
    expect(detectPackageManager(tempDir)).toBe("yarn");
  });

  test("detects npm from package-lock.json", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "package-lock.json"), "{}");
    expect(detectPackageManager(tempDir)).toBe("npm");
  });

  test("bun takes priority over npm", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "bun.lockb"), "");
    writeFileSync(join(tempDir, "package-lock.json"), "{}");
    expect(detectPackageManager(tempDir)).toBe("bun");
  });

  test("returns null when no lockfile found", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    expect(detectPackageManager(tempDir)).toBeNull();
  });

  test("throws when no package.json found", () => {
    expect(() => detectPackageManager(tempDir)).toThrow("No package.json");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/parsers/detect.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement detection**

Create `src/parsers/detect.ts`:

```typescript
import { existsSync } from "fs";
import { join } from "path";
import type { PackageManager } from "./types";

const LOCKFILE_PRIORITY: Array<{ files: string[]; pm: PackageManager }> = [
  { files: ["bun.lockb", "bun.lock"], pm: "bun" },
  { files: ["pnpm-lock.yaml"], pm: "pnpm" },
  { files: ["yarn.lock"], pm: "yarn" },
  { files: ["package-lock.json"], pm: "npm" },
];

export function detectPackageManager(projectPath: string): PackageManager | null {
  if (!existsSync(join(projectPath, "package.json"))) {
    throw new Error(`No package.json found in ${projectPath}`);
  }

  for (const { files, pm } of LOCKFILE_PRIORITY) {
    if (files.some((f) => existsSync(join(projectPath, f)))) {
      return pm;
    }
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/parsers/detect.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/parsers/detect.ts tests/parsers/detect.test.ts
git commit -m "feat: add package manager detection with lockfile priority"
```

---

### Task 3: Graph utilities (filtering + stats computation)

**Files:**
- Create: `src/parsers/graph-utils.ts`
- Create: `tests/parsers/graph-utils.test.ts`

- [ ] **Step 1: Write failing tests for graph utilities**

Create `tests/parsers/graph-utils.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { filterProdGraph, computeStats, markDuplicates, computeDependentCounts } from "../../src/parsers/graph-utils";
import type { DependencyGraph, DependencyNode, DependencyEdge } from "../../src/parsers/types";

function makeGraph(nodes: DependencyNode[], edges: DependencyEdge[], rootId: string): DependencyGraph {
  return { nodes, edges, rootId, stats: { totalPackages: 0, directDeps: 0, devDeps: 0, peerDeps: 0, optionalDeps: 0, maxDepth: 0, duplicateCount: 0 } };
}

describe("markDuplicates", () => {
  test("marks nodes with same name but different versions", () => {
    const nodes: DependencyNode[] = [
      { id: "root@1.0.0", name: "root", version: "1.0.0", depth: 0, isDuplicate: false, dependentCount: 0 },
      { id: "semver@7.6.0", name: "semver", version: "7.6.0", depth: 1, isDuplicate: false, dependentCount: 0 },
      { id: "semver@6.3.1", name: "semver", version: "6.3.1", depth: 2, isDuplicate: false, dependentCount: 0 },
      { id: "lodash@4.17.21", name: "lodash", version: "4.17.21", depth: 1, isDuplicate: false, dependentCount: 0 },
    ];
    markDuplicates(nodes);
    expect(nodes.find((n) => n.id === "semver@7.6.0")!.isDuplicate).toBe(true);
    expect(nodes.find((n) => n.id === "semver@6.3.1")!.isDuplicate).toBe(true);
    expect(nodes.find((n) => n.id === "lodash@4.17.21")!.isDuplicate).toBe(false);
  });
});

describe("computeDependentCounts", () => {
  test("counts incoming edges per node", () => {
    const nodes: DependencyNode[] = [
      { id: "a@1.0.0", name: "a", version: "1.0.0", depth: 0, isDuplicate: false, dependentCount: 0 },
      { id: "b@1.0.0", name: "b", version: "1.0.0", depth: 1, isDuplicate: false, dependentCount: 0 },
      { id: "c@1.0.0", name: "c", version: "1.0.0", depth: 2, isDuplicate: false, dependentCount: 0 },
    ];
    const edges: DependencyEdge[] = [
      { source: "a@1.0.0", target: "b@1.0.0", type: "dependency" },
      { source: "a@1.0.0", target: "c@1.0.0", type: "dependency" },
      { source: "b@1.0.0", target: "c@1.0.0", type: "dependency" },
    ];
    computeDependentCounts(nodes, edges);
    expect(nodes.find((n) => n.id === "a@1.0.0")!.dependentCount).toBe(0);
    expect(nodes.find((n) => n.id === "b@1.0.0")!.dependentCount).toBe(1);
    expect(nodes.find((n) => n.id === "c@1.0.0")!.dependentCount).toBe(2);
  });
});

describe("computeStats", () => {
  test("computes correct stats from graph", () => {
    const nodes: DependencyNode[] = [
      { id: "root@1.0.0", name: "root", version: "1.0.0", depth: 0, isDuplicate: false, dependentCount: 0 },
      { id: "a@1.0.0", name: "a", version: "1.0.0", depth: 1, isDuplicate: false, dependentCount: 1 },
      { id: "b@1.0.0", name: "b", version: "1.0.0", depth: 1, isDuplicate: true, dependentCount: 1 },
      { id: "c@1.0.0", name: "c", version: "1.0.0", depth: 2, isDuplicate: false, dependentCount: 1 },
      { id: "b@2.0.0", name: "b", version: "2.0.0", depth: 2, isDuplicate: true, dependentCount: 1 },
    ];
    const edges: DependencyEdge[] = [
      { source: "root@1.0.0", target: "a@1.0.0", type: "dependency" },
      { source: "root@1.0.0", target: "b@1.0.0", type: "devDependency" },
      { source: "a@1.0.0", target: "c@1.0.0", type: "peerDependency" },
      { source: "a@1.0.0", target: "b@2.0.0", type: "optionalDependency" },
    ];
    const stats = computeStats(nodes, edges);
    expect(stats.totalPackages).toBe(4); // excluding root
    expect(stats.directDeps).toBe(1);
    expect(stats.devDeps).toBe(1);
    expect(stats.peerDeps).toBe(1);
    expect(stats.optionalDeps).toBe(1);
    expect(stats.maxDepth).toBe(2);
    expect(stats.duplicateCount).toBe(1); // "b" has 2 versions = 1 duplicate package
  });
});

describe("filterProdGraph", () => {
  test("removes devDependency edges and unreachable nodes", () => {
    const graph = makeGraph(
      [
        { id: "root@1.0.0", name: "root", version: "1.0.0", depth: 0, isDuplicate: false, dependentCount: 0 },
        { id: "express@4.0.0", name: "express", version: "4.0.0", depth: 1, isDuplicate: false, dependentCount: 1 },
        { id: "jest@29.0.0", name: "jest", version: "29.0.0", depth: 1, isDuplicate: false, dependentCount: 1 },
        { id: "babel@7.0.0", name: "babel", version: "7.0.0", depth: 2, isDuplicate: false, dependentCount: 1 },
      ],
      [
        { source: "root@1.0.0", target: "express@4.0.0", type: "dependency" },
        { source: "root@1.0.0", target: "jest@29.0.0", type: "devDependency" },
        { source: "jest@29.0.0", target: "babel@7.0.0", type: "dependency" },
      ],
      "root@1.0.0"
    );
    const prod = filterProdGraph(graph);
    expect(prod.nodes.map((n) => n.name)).toEqual(["root", "express"]);
    expect(prod.edges).toHaveLength(1);
    expect(prod.edges[0].type).toBe("dependency");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/parsers/graph-utils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement graph utilities**

Create `src/parsers/graph-utils.ts`:

```typescript
import type { DependencyGraph, DependencyNode, DependencyEdge } from "./types";

export function markDuplicates(nodes: DependencyNode[]): void {
  const nameVersions = new Map<string, string[]>();
  for (const node of nodes) {
    const versions = nameVersions.get(node.name) ?? [];
    versions.push(node.version);
    nameVersions.set(node.name, versions);
  }
  const duplicateNames = new Set<string>();
  for (const [name, versions] of nameVersions) {
    const unique = new Set(versions);
    if (unique.size > 1) duplicateNames.add(name);
  }
  for (const node of nodes) {
    node.isDuplicate = duplicateNames.has(node.name);
  }
}

export function computeDependentCounts(nodes: DependencyNode[], edges: DependencyEdge[]): void {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
  }
  for (const node of nodes) {
    node.dependentCount = counts.get(node.id) ?? 0;
  }
}

/** Precondition: markDuplicates() must be called on nodes before this function. */
export function computeStats(
  nodes: DependencyNode[],
  edges: DependencyEdge[]
): DependencyGraph["stats"] {
  const nonRoot = nodes.filter((n) => n.depth > 0);
  const directEdges = edges.filter(
    (e) => nodes.find((n) => n.id === e.source)?.depth === 0
  );
  const duplicateNames = new Set(
    nonRoot.filter((n) => n.isDuplicate).map((n) => n.name)
  );

  return {
    totalPackages: nonRoot.length,
    directDeps: directEdges.filter((e) => e.type === "dependency").length,
    devDeps: directEdges.filter((e) => e.type === "devDependency").length,
    peerDeps: edges.filter((e) => e.type === "peerDependency").length,       // all peer edges, not just direct
    optionalDeps: edges.filter((e) => e.type === "optionalDependency").length, // all optional edges, not just direct
    maxDepth: Math.max(0, ...nodes.map((n) => n.depth)),
    duplicateCount: duplicateNames.size,
  };
}

export function filterProdGraph(graph: DependencyGraph): DependencyGraph {
  const prodEdges = graph.edges.filter((e) => e.type !== "devDependency");

  // BFS from root to find reachable nodes
  const reachable = new Set<string>([graph.rootId]);
  const queue = [graph.rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of prodEdges) {
      if (edge.source === current && !reachable.has(edge.target)) {
        reachable.add(edge.target);
        queue.push(edge.target);
      }
    }
  }

  const prodNodes = graph.nodes
    .filter((n) => reachable.has(n.id))
    .map((n) => ({ ...n }));
  const filteredEdges = prodEdges.filter(
    (e) => reachable.has(e.source) && reachable.has(e.target)
  );

  markDuplicates(prodNodes);
  computeDependentCounts(prodNodes, filteredEdges);

  return {
    nodes: prodNodes,
    edges: filteredEdges,
    rootId: graph.rootId,
    stats: computeStats(prodNodes, filteredEdges),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/parsers/graph-utils.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/parsers/graph-utils.ts tests/parsers/graph-utils.test.ts
git commit -m "feat: add graph utilities for filtering, stats, and duplicate detection"
```

---

## Chunk 2: Lockfile Parsers

Each parser implements: `(projectPath: string) => DependencyGraph`. They read the lockfile + `package.json` to build the full normalized graph.

### Task 4: npm parser (package-lock.json)

**Files:**
- Create: `src/parsers/npm-parser.ts`
- Create: `tests/parsers/npm-parser.test.ts`
- Create: `tests/fixtures/npm/package.json`
- Create: `tests/fixtures/npm/package-lock.json`

- [ ] **Step 1: Create npm test fixture**

Create `tests/fixtures/npm/package.json`:

```json
{
  "name": "test-project",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.18.0"
  },
  "devDependencies": {
    "jest": "^29.0.0"
  },
  "peerDependencies": {
    "react": "^18.0.0"
  },
  "optionalDependencies": {
    "fsevents": "^2.3.0"
  }
}
```

Create `tests/fixtures/npm/package-lock.json`:

```json
{
  "name": "test-project",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "packages": {
    "": {
      "name": "test-project",
      "version": "1.0.0",
      "dependencies": { "express": "^4.18.0" },
      "devDependencies": { "jest": "^29.0.0" },
      "peerDependencies": { "react": "^18.0.0" },
      "optionalDependencies": { "fsevents": "^2.3.0" }
    },
    "node_modules/express": {
      "version": "4.18.2",
      "dependencies": { "debug": "2.6.9" }
    },
    "node_modules/express/node_modules/debug": {
      "version": "2.6.9",
      "dependencies": { "ms": "2.0.0" }
    },
    "node_modules/express/node_modules/debug/node_modules/ms": {
      "version": "2.0.0"
    },
    "node_modules/jest": {
      "version": "29.7.0",
      "dev": true,
      "dependencies": { "chalk": "4.1.2" }
    },
    "node_modules/jest/node_modules/chalk": {
      "version": "4.1.2",
      "dev": true
    },
    "node_modules/react": {
      "version": "18.2.0",
      "peer": true
    },
    "node_modules/fsevents": {
      "version": "2.3.3",
      "optional": true
    }
  }
}
```

- [ ] **Step 2: Write failing test**

Create `tests/parsers/npm-parser.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { join } from "path";
import { parseNpm } from "../../src/parsers/npm-parser";

const FIXTURE = join(import.meta.dir, "../fixtures/npm");

describe("parseNpm", () => {
  test("parses all nodes from package-lock.json", () => {
    const graph = parseNpm(FIXTURE);
    expect(graph.nodes.length).toBe(8); // root + 7 packages
    expect(graph.rootId).toBe("test-project@1.0.0");
  });

  test("correctly assigns edge types", () => {
    const graph = parseNpm(FIXTURE);
    const expressEdge = graph.edges.find((e) => e.target === "express@4.18.2");
    expect(expressEdge?.type).toBe("dependency");

    const jestEdge = graph.edges.find((e) => e.target === "jest@29.7.0");
    expect(jestEdge?.type).toBe("devDependency");

    const reactEdge = graph.edges.find((e) => e.target === "react@18.2.0");
    expect(reactEdge?.type).toBe("peerDependency");

    const fseventsEdge = graph.edges.find((e) => e.target === "fsevents@2.3.3");
    expect(fseventsEdge?.type).toBe("optionalDependency");
  });

  test("resolves nested transitive dependencies", () => {
    const graph = parseNpm(FIXTURE);
    const debugEdge = graph.edges.find((e) => e.target === "debug@2.6.9");
    expect(debugEdge?.source).toBe("express@4.18.2");

    const msEdge = graph.edges.find((e) => e.target === "ms@2.0.0");
    expect(msEdge?.source).toBe("debug@2.6.9");
  });

  test("computes correct depths", () => {
    const graph = parseNpm(FIXTURE);
    const root = graph.nodes.find((n) => n.name === "test-project");
    expect(root?.depth).toBe(0);

    const express = graph.nodes.find((n) => n.name === "express");
    expect(express?.depth).toBe(1);

    const debug = graph.nodes.find((n) => n.name === "debug");
    expect(debug?.depth).toBe(2);

    const ms = graph.nodes.find((n) => n.name === "ms");
    expect(ms?.depth).toBe(3);
  });

  test("computes stats", () => {
    const graph = parseNpm(FIXTURE);
    expect(graph.stats.totalPackages).toBe(7);
    expect(graph.stats.directDeps).toBe(1);
    expect(graph.stats.devDeps).toBe(1);
    expect(graph.stats.peerDeps).toBe(1);
    expect(graph.stats.optionalDeps).toBe(1);
    expect(graph.stats.maxDepth).toBe(3);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/parsers/npm-parser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement npm parser**

Create `src/parsers/npm-parser.ts`:

```typescript
import { readFileSync } from "fs";
import { join } from "path";
import type { DependencyGraph, DependencyNode, DependencyEdge } from "./types";
import { markDuplicates, computeDependentCounts, computeStats } from "./graph-utils";

interface NpmLockPackage {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  dev?: boolean;
  peer?: boolean;
  optional?: boolean;
}

export function parseNpm(projectPath: string): DependencyGraph {
  const lockRaw = readFileSync(join(projectPath, "package-lock.json"), "utf-8");
  const lock = JSON.parse(lockRaw) as { name: string; version: string; packages: Record<string, NpmLockPackage> };
  const pkgRaw = readFileSync(join(projectPath, "package.json"), "utf-8");
  const pkg = JSON.parse(pkgRaw) as {
    name: string; version: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };

  const nodes: DependencyNode[] = [];
  const edges: DependencyEdge[] = [];
  const rootId = `${pkg.name}@${pkg.version}`;

  // Build a map of path → node id
  const pathToId = new Map<string, string>();

  for (const [pkgPath, meta] of Object.entries(lock.packages)) {
    if (!meta.version) continue;
    const name = pkgPath === "" ? pkg.name : pkgPath.split("node_modules/").pop()!;
    const id = `${name}@${meta.version}`;
    const depth = pkgPath === "" ? 0 : (pkgPath.match(/node_modules\//g) ?? []).length;

    nodes.push({ id, name, version: meta.version, depth, isDuplicate: false, dependentCount: 0 });
    pathToId.set(pkgPath, id);
  }

  // Build edges using path nesting
  for (const [pkgPath, meta] of Object.entries(lock.packages)) {
    const sourceId = pathToId.get(pkgPath);
    if (!sourceId) continue;

    const allDeps = meta.dependencies ?? {};
    for (const [depName] of Object.entries(allDeps)) {
      // Find the resolved dep: check nested first, then walk up
      const targetId = resolveDepPath(pkgPath, depName, pathToId);
      if (!targetId) continue;
      edges.push({ source: sourceId, target: targetId, type: "dependency" });
    }
  }

  // Override edge types for root's direct deps based on package.json
  const rootDevDeps = new Set(Object.keys(pkg.devDependencies ?? {}));
  const rootPeerDeps = new Set(Object.keys(pkg.peerDependencies ?? {}));
  const rootOptionalDeps = new Set(Object.keys(pkg.optionalDependencies ?? {}));

  // Add edges from root for peer/optional deps (they may not be in root's dependencies in lockfile)
  for (const depName of [...rootPeerDeps, ...rootOptionalDeps]) {
    const targetId = resolveDepPath("", depName, pathToId);
    if (!targetId) continue;
    const existing = edges.find((e) => e.source === rootId && e.target === targetId);
    if (!existing) {
      const type = rootPeerDeps.has(depName) ? "peerDependency" : "optionalDependency";
      edges.push({ source: rootId, target: targetId, type });
    }
  }

  // Fix edge types for root direct edges
  for (const edge of edges) {
    if (edge.source !== rootId) continue;
    const targetNode = nodes.find((n) => n.id === edge.target);
    if (!targetNode) continue;
    if (rootDevDeps.has(targetNode.name)) edge.type = "devDependency";
    else if (rootPeerDeps.has(targetNode.name)) edge.type = "peerDependency";
    else if (rootOptionalDeps.has(targetNode.name)) edge.type = "optionalDependency";
  }

  markDuplicates(nodes);
  computeDependentCounts(nodes, edges);

  return { nodes, edges, rootId, stats: computeStats(nodes, edges) };
}

function resolveDepPath(parentPath: string, depName: string, pathToId: Map<string, string>): string | undefined {
  // Check nested path first
  const nestedPath = parentPath ? `${parentPath}/node_modules/${depName}` : `node_modules/${depName}`;
  if (pathToId.has(nestedPath)) return pathToId.get(nestedPath);

  // Walk up: strip last node_modules segment and try again
  let current = parentPath;
  while (current.includes("node_modules/")) {
    current = current.substring(0, current.lastIndexOf("/node_modules/"));
    const tryPath = current ? `${current}/node_modules/${depName}` : `node_modules/${depName}`;
    if (pathToId.has(tryPath)) return pathToId.get(tryPath);
  }

  // Try top-level
  if (pathToId.has(`node_modules/${depName}`)) return pathToId.get(`node_modules/${depName}`);
  return undefined;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/parsers/npm-parser.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/parsers/npm-parser.ts tests/parsers/npm-parser.test.ts tests/fixtures/npm/
git commit -m "feat: add npm lockfile parser with path nesting resolution"
```

---

### Task 5: yarn parser (yarn.lock)

**Files:**
- Create: `src/parsers/yarn-parser.ts`
- Create: `tests/parsers/yarn-parser.test.ts`
- Create: `tests/fixtures/yarn/package.json`
- Create: `tests/fixtures/yarn/yarn.lock`

- [ ] **Step 1: Create yarn test fixture**

Create `tests/fixtures/yarn/package.json`:

```json
{
  "name": "test-yarn-project",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.18.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

Create `tests/fixtures/yarn/yarn.lock`:

```
# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
# yarn lockfile v1


express@^4.18.0:
  version "4.18.2"
  resolved "https://registry.yarnpkg.com/express/-/express-4.18.2.tgz"
  integrity sha512-abc
  dependencies:
    debug "2.6.9"

debug@2.6.9:
  version "2.6.9"
  resolved "https://registry.yarnpkg.com/debug/-/debug-2.6.9.tgz"
  integrity sha512-def
  dependencies:
    ms "2.0.0"

ms@2.0.0:
  version "2.0.0"
  resolved "https://registry.yarnpkg.com/ms/-/ms-2.0.0.tgz"
  integrity sha512-ghi

typescript@^5.0.0:
  version "5.3.3"
  resolved "https://registry.yarnpkg.com/typescript/-/typescript-5.3.3.tgz"
  integrity sha512-jkl
```

- [ ] **Step 2: Write failing test**

Create `tests/parsers/yarn-parser.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { join } from "path";
import { parseYarn } from "../../src/parsers/yarn-parser";

const FIXTURE = join(import.meta.dir, "../fixtures/yarn");

describe("parseYarn", () => {
  test("parses all nodes from yarn.lock", () => {
    const graph = parseYarn(FIXTURE);
    expect(graph.nodes.length).toBe(5); // root + express + debug + ms + typescript
    expect(graph.rootId).toBe("test-yarn-project@1.0.0");
  });

  test("correctly assigns edge types from package.json", () => {
    const graph = parseYarn(FIXTURE);
    const expressEdge = graph.edges.find((e) => e.target === "express@4.18.2");
    expect(expressEdge?.type).toBe("dependency");

    const tsEdge = graph.edges.find((e) => e.target === "typescript@5.3.3");
    expect(tsEdge?.type).toBe("devDependency");
  });

  test("resolves transitive dependencies", () => {
    const graph = parseYarn(FIXTURE);
    const debugEdge = graph.edges.find((e) => e.target === "debug@2.6.9");
    expect(debugEdge?.source).toBe("express@4.18.2");
  });

  test("computes stats", () => {
    const graph = parseYarn(FIXTURE);
    expect(graph.stats.totalPackages).toBe(4);
    expect(graph.stats.directDeps).toBe(1);
    expect(graph.stats.devDeps).toBe(1);
    expect(graph.stats.maxDepth).toBe(3);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/parsers/yarn-parser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement yarn parser**

Create `src/parsers/yarn-parser.ts`:

```typescript
import { readFileSync } from "fs";
import { join } from "path";
import type { DependencyGraph, DependencyNode, DependencyEdge } from "./types";
import { markDuplicates, computeDependentCounts, computeStats } from "./graph-utils";

interface YarnEntry {
  version: string;
  dependencies: Record<string, string>;
}

function parseYarnLock(content: string): Map<string, YarnEntry> {
  const entries = new Map<string, YarnEntry>();
  let currentKeys: string[] = [];
  let currentVersion = "";
  let currentDeps: Record<string, string> = {};
  let inDeps = false;

  for (const line of content.split("\n")) {
    if (line.startsWith("#") || line.trim() === "") {
      if (currentKeys.length > 0 && currentVersion) {
        for (const key of currentKeys) {
          entries.set(key, { version: currentVersion, dependencies: { ...currentDeps } });
        }
      }
      currentKeys = [];
      currentVersion = "";
      currentDeps = {};
      inDeps = false;
      continue;
    }

    // New entry: line ends with ":"
    if (!line.startsWith(" ") && line.endsWith(":")) {
      if (currentKeys.length > 0 && currentVersion) {
        for (const key of currentKeys) {
          entries.set(key, { version: currentVersion, dependencies: { ...currentDeps } });
        }
      }
      currentKeys = line.slice(0, -1).split(", ").map((k) => k.replace(/"/g, ""));
      currentVersion = "";
      currentDeps = {};
      inDeps = false;
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.startsWith("version ")) {
      currentVersion = trimmed.match(/version "(.+)"/)?.[1] ?? "";
      inDeps = false;
    } else if (trimmed === "dependencies:") {
      inDeps = true;
    } else if (trimmed.startsWith("resolved ") || trimmed.startsWith("integrity ")) {
      inDeps = false;
    } else if (inDeps && trimmed.includes(" ")) {
      const match = trimmed.match(/^"?([^"\s]+)"?\s+"?([^"]+)"?$/);
      if (match) currentDeps[match[1]] = match[2];
    }
  }

  // Flush last entry
  if (currentKeys.length > 0 && currentVersion) {
    for (const key of currentKeys) {
      entries.set(key, { version: currentVersion, dependencies: { ...currentDeps } });
    }
  }

  return entries;
}

export function parseYarn(projectPath: string): DependencyGraph {
  const lockContent = readFileSync(join(projectPath, "yarn.lock"), "utf-8");
  const pkgRaw = readFileSync(join(projectPath, "package.json"), "utf-8");
  const pkg = JSON.parse(pkgRaw) as {
    name: string; version: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };

  const entries = parseYarnLock(lockContent);
  const nodes: DependencyNode[] = [];
  const edges: DependencyEdge[] = [];
  const rootId = `${pkg.name}@${pkg.version}`;

  nodes.push({ id: rootId, name: pkg.name, version: pkg.version, depth: 0, isDuplicate: false, dependentCount: 0 });

  // Resolve a dependency specifier like "express@^4.18.0" to its entry
  const resolveEntry = (name: string, range: string): YarnEntry | undefined => {
    return entries.get(`${name}@${range}`);
  };

  const visited = new Set<string>();

  function walk(depName: string, depRange: string, parentId: string, depth: number, edgeType: DependencyEdge["type"]): void {
    const entry = resolveEntry(depName, depRange);
    if (!entry) return;
    const nodeId = `${depName}@${entry.version}`;
    edges.push({ source: parentId, target: nodeId, type: edgeType });

    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    nodes.push({ id: nodeId, name: depName, version: entry.version, depth, isDuplicate: false, dependentCount: 0 });

    for (const [childName, childRange] of Object.entries(entry.dependencies)) {
      walk(childName, childRange, nodeId, depth + 1, "dependency");
    }
  }

  const allRootDeps: Array<{ deps: Record<string, string>; type: DependencyEdge["type"] }> = [
    { deps: pkg.dependencies ?? {}, type: "dependency" },
    { deps: pkg.devDependencies ?? {}, type: "devDependency" },
    { deps: pkg.peerDependencies ?? {}, type: "peerDependency" },
    { deps: pkg.optionalDependencies ?? {}, type: "optionalDependency" },
  ];

  for (const { deps, type } of allRootDeps) {
    for (const [name, range] of Object.entries(deps)) {
      walk(name, range, rootId, 1, type);
    }
  }

  markDuplicates(nodes);
  computeDependentCounts(nodes, edges);

  return { nodes, edges, rootId, stats: computeStats(nodes, edges) };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/parsers/yarn-parser.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/parsers/yarn-parser.ts tests/parsers/yarn-parser.test.ts tests/fixtures/yarn/
git commit -m "feat: add yarn.lock parser with state machine"
```

---

### Task 6: pnpm parser (pnpm-lock.yaml)

**Files:**
- Create: `src/parsers/pnpm-parser.ts`
- Create: `tests/parsers/pnpm-parser.test.ts`
- Create: `tests/fixtures/pnpm/package.json`
- Create: `tests/fixtures/pnpm/pnpm-lock.yaml`

- [ ] **Step 1: Create pnpm test fixture**

Create `tests/fixtures/pnpm/package.json`:

```json
{
  "name": "test-pnpm-project",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.18.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

Create `tests/fixtures/pnpm/pnpm-lock.yaml`:

```yaml
lockfileVersion: '9.0'

settings:
  autoInstallPeers: true

importers:
  .:
    dependencies:
      express:
        specifier: ^4.18.0
        version: 4.18.2
    devDependencies:
      typescript:
        specifier: ^5.0.0
        version: 5.3.3

packages:
  express@4.18.2:
    resolution: {integrity: sha512-abc}
    dependencies:
      debug: 2.6.9
    engines: {node: '>= 0.10.0'}

  debug@2.6.9:
    resolution: {integrity: sha512-def}
    dependencies:
      ms: 2.0.0

  ms@2.0.0:
    resolution: {integrity: sha512-ghi}

  typescript@5.3.3:
    resolution: {integrity: sha512-jkl}
    engines: {node: '>=14.17'}
```

- [ ] **Step 2: Write failing test**

Create `tests/parsers/pnpm-parser.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { join } from "path";
import { parsePnpm } from "../../src/parsers/pnpm-parser";

const FIXTURE = join(import.meta.dir, "../fixtures/pnpm");

describe("parsePnpm", () => {
  test("parses all nodes from pnpm-lock.yaml", () => {
    const graph = parsePnpm(FIXTURE);
    expect(graph.nodes.length).toBe(5); // root + 4 packages
    expect(graph.rootId).toBe("test-pnpm-project@1.0.0");
  });

  test("correctly assigns edge types", () => {
    const graph = parsePnpm(FIXTURE);
    const expressEdge = graph.edges.find((e) => e.target === "express@4.18.2");
    expect(expressEdge?.type).toBe("dependency");

    const tsEdge = graph.edges.find((e) => e.target === "typescript@5.3.3");
    expect(tsEdge?.type).toBe("devDependency");
  });

  test("resolves transitive dependencies", () => {
    const graph = parsePnpm(FIXTURE);
    const debugEdge = graph.edges.find((e) => e.target === "debug@2.6.9");
    expect(debugEdge?.source).toBe("express@4.18.2");
  });

  test("computes stats", () => {
    const graph = parsePnpm(FIXTURE);
    expect(graph.stats.totalPackages).toBe(4);
    expect(graph.stats.directDeps).toBe(1);
    expect(graph.stats.devDeps).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/parsers/pnpm-parser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement pnpm parser**

Create `src/parsers/pnpm-parser.ts`:

```typescript
import { readFileSync } from "fs";
import { join } from "path";
import YAML from "yaml";
import type { DependencyGraph, DependencyNode, DependencyEdge } from "./types";
import { markDuplicates, computeDependentCounts, computeStats } from "./graph-utils";

interface PnpmLock {
  lockfileVersion: string;
  importers: Record<string, {
    dependencies?: Record<string, { specifier: string; version: string }>;
    devDependencies?: Record<string, { specifier: string; version: string }>;
    optionalDependencies?: Record<string, { specifier: string; version: string }>;
  }>;
  packages: Record<string, {
    resolution?: { integrity: string };
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  }>;
}

function parsePackageKey(key: string): { name: string; version: string } {
  // Format: "package@version" or "@scope/package@version"
  const atIdx = key.lastIndexOf("@");
  return { name: key.substring(0, atIdx), version: key.substring(atIdx + 1) };
}

export function parsePnpm(projectPath: string): DependencyGraph {
  const lockRaw = readFileSync(join(projectPath, "pnpm-lock.yaml"), "utf-8");
  const lock = YAML.parse(lockRaw) as PnpmLock;
  const pkgRaw = readFileSync(join(projectPath, "package.json"), "utf-8");
  const pkg = JSON.parse(pkgRaw) as {
    name: string; version: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };

  const nodes: DependencyNode[] = [];
  const edges: DependencyEdge[] = [];
  const rootId = `${pkg.name}@${pkg.version}`;

  nodes.push({ id: rootId, name: pkg.name, version: pkg.version, depth: 0, isDuplicate: false, dependentCount: 0 });

  const visited = new Set<string>();

  function walk(pkgKey: string, parentId: string, depth: number, edgeType: DependencyEdge["type"]): void {
    const { name, version } = parsePackageKey(pkgKey);
    const nodeId = `${name}@${version}`;
    edges.push({ source: parentId, target: nodeId, type: edgeType });

    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    nodes.push({ id: nodeId, name, version, depth, isDuplicate: false, dependentCount: 0 });

    const pkgData = lock.packages[pkgKey];
    if (!pkgData) return;

    for (const [depName, depVersion] of Object.entries(pkgData.dependencies ?? {})) {
      walk(`${depName}@${depVersion}`, nodeId, depth + 1, "dependency");
    }
  }

  // Process root importer
  const rootImporter = lock.importers["."];
  if (rootImporter) {
    for (const [name, meta] of Object.entries(rootImporter.dependencies ?? {})) {
      walk(`${name}@${meta.version}`, rootId, 1, "dependency");
    }
    for (const [name, meta] of Object.entries(rootImporter.devDependencies ?? {})) {
      walk(`${name}@${meta.version}`, rootId, 1, "devDependency");
    }
    for (const [name, meta] of Object.entries(rootImporter.optionalDependencies ?? {})) {
      walk(`${name}@${meta.version}`, rootId, 1, "optionalDependency");
    }
  }

  markDuplicates(nodes);
  computeDependentCounts(nodes, edges);

  return { nodes, edges, rootId, stats: computeStats(nodes, edges) };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/parsers/pnpm-parser.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/parsers/pnpm-parser.ts tests/parsers/pnpm-parser.test.ts tests/fixtures/pnpm/
git commit -m "feat: add pnpm lockfile parser with YAML parsing"
```

---

### Task 7: bun parser (bun.lock)

**Files:**
- Create: `src/parsers/bun-parser.ts`
- Create: `tests/parsers/bun-parser.test.ts`
- Create: `tests/fixtures/bun/package.json`
- Create: `tests/fixtures/bun/bun.lock`

- [ ] **Step 1: Create bun test fixture**

Create `tests/fixtures/bun/package.json`:

```json
{
  "name": "test-bun-project",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.18.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

Create `tests/fixtures/bun/bun.lock` (JSON-like format with trailing commas):

```json
{
  "lockfileVersion": 0,
  "workspaces": {
    "": {
      "name": "test-bun-project",
      "dependencies": {
        "express": "^4.18.0"
      },
      "devDependencies": {
        "typescript": "^5.0.0"
      }
    }
  },
  "packages": {
    "express": ["express@4.18.2", { "dependencies": { "debug": "2.6.9" } }],
    "debug": ["debug@2.6.9", { "dependencies": { "ms": "2.0.0" } }],
    "ms": ["ms@2.0.0", {}],
    "typescript": ["typescript@5.3.3", {}]
  }
}
```

- [ ] **Step 2: Write failing test**

Create `tests/parsers/bun-parser.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { join } from "path";
import { parseBun } from "../../src/parsers/bun-parser";

const FIXTURE = join(import.meta.dir, "../fixtures/bun");

describe("parseBun", () => {
  test("parses all nodes from bun.lock", () => {
    const graph = parseBun(FIXTURE);
    expect(graph.nodes.length).toBe(5); // root + 4 packages
    expect(graph.rootId).toBe("test-bun-project@1.0.0");
  });

  test("correctly assigns edge types", () => {
    const graph = parseBun(FIXTURE);
    const expressEdge = graph.edges.find((e) => e.target === "express@4.18.2");
    expect(expressEdge?.type).toBe("dependency");

    const tsEdge = graph.edges.find((e) => e.target === "typescript@5.3.3");
    expect(tsEdge?.type).toBe("devDependency");
  });

  test("resolves transitive dependencies", () => {
    const graph = parseBun(FIXTURE);
    const debugEdge = graph.edges.find((e) => e.target === "debug@2.6.9");
    expect(debugEdge?.source).toBe("express@4.18.2");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/parsers/bun-parser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement bun parser**

Create `src/parsers/bun-parser.ts`:

```typescript
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { DependencyGraph, DependencyNode, DependencyEdge } from "./types";
import { markDuplicates, computeDependentCounts, computeStats } from "./graph-utils";

interface BunLock {
  lockfileVersion: number;
  workspaces: Record<string, {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  }>;
  packages: Record<string, [string, { dependencies?: Record<string, string> }]>;
}

function parseBunLockJson(content: string): BunLock {
  // bun.lock may have trailing commas; Bun's JSON.parse handles this natively
  return JSON.parse(content) as BunLock;
}

export function parseBun(projectPath: string): DependencyGraph {
  const lockPath = existsSync(join(projectPath, "bun.lock"))
    ? join(projectPath, "bun.lock")
    : null;

  if (!lockPath) {
    throw new Error("No bun.lock found. bun.lockb binary format requires CLI fallback.");
  }

  const lockRaw = readFileSync(lockPath, "utf-8");
  const lock = parseBunLockJson(lockRaw);
  const pkgRaw = readFileSync(join(projectPath, "package.json"), "utf-8");
  const pkg = JSON.parse(pkgRaw) as { name: string; version: string };

  const rootWorkspace = lock.workspaces[""] ?? Object.values(lock.workspaces)[0];
  const nodes: DependencyNode[] = [];
  const edges: DependencyEdge[] = [];
  const rootId = `${pkg.name}@${pkg.version}`;

  nodes.push({ id: rootId, name: pkg.name, version: pkg.version, depth: 0, isDuplicate: false, dependentCount: 0 });

  // Build a lookup: package name → resolved "name@version"
  const resolvedVersions = new Map<string, string>();
  for (const [key, [resolved]] of Object.entries(lock.packages)) {
    resolvedVersions.set(key, resolved);
  }

  const visited = new Set<string>();

  function resolveId(name: string): string | undefined {
    const resolved = resolvedVersions.get(name);
    return resolved ?? undefined;
  }

  function walk(depName: string, parentId: string, depth: number, edgeType: DependencyEdge["type"]): void {
    const resolvedStr = resolveId(depName);
    if (!resolvedStr) return;

    // Parse "name@version" from resolved string
    const atIdx = resolvedStr.lastIndexOf("@");
    const name = resolvedStr.substring(0, atIdx);
    const version = resolvedStr.substring(atIdx + 1);
    const nodeId = `${name}@${version}`;

    edges.push({ source: parentId, target: nodeId, type: edgeType });

    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    nodes.push({ id: nodeId, name, version, depth, isDuplicate: false, dependentCount: 0 });

    const pkgEntry = lock.packages[depName];
    if (!pkgEntry) return;
    const deps = pkgEntry[1]?.dependencies ?? {};
    for (const [childName] of Object.entries(deps)) {
      walk(childName, nodeId, depth + 1, "dependency");
    }
  }

  const depsConfig: Array<{ deps: Record<string, string>; type: DependencyEdge["type"] }> = [
    { deps: rootWorkspace.dependencies ?? {}, type: "dependency" },
    { deps: rootWorkspace.devDependencies ?? {}, type: "devDependency" },
    { deps: rootWorkspace.peerDependencies ?? {}, type: "peerDependency" },
    { deps: rootWorkspace.optionalDependencies ?? {}, type: "optionalDependency" },
  ];

  for (const { deps, type } of depsConfig) {
    for (const name of Object.keys(deps)) {
      walk(name, rootId, 1, type);
    }
  }

  markDuplicates(nodes);
  computeDependentCounts(nodes, edges);

  return { nodes, edges, rootId, stats: computeStats(nodes, edges) };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/parsers/bun-parser.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/parsers/bun-parser.ts tests/parsers/bun-parser.test.ts tests/fixtures/bun/
git commit -m "feat: add bun.lock parser"
```

---

### Task 8: Fallback parser (npm CLI only; yarn/pnpm/bun CLI fallbacks deferred as future enhancement since lockfile parsing is the primary path)

**Files:**
- Create: `src/parsers/fallback.ts`
- Create: `tests/parsers/fallback.test.ts`

- [ ] **Step 1: Write failing test for npm CLI fallback**

Create `tests/parsers/fallback.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { parseNpmLsJson } from "../../src/parsers/fallback";

describe("parseNpmLsJson", () => {
  test("parses npm ls --all --json output into graph", () => {
    const npmOutput = {
      name: "my-project",
      version: "1.0.0",
      dependencies: {
        express: {
          version: "4.18.2",
          dependencies: {
            debug: {
              version: "2.6.9",
              dependencies: {
                ms: { version: "2.0.0" }
              }
            }
          }
        }
      },
      devDependencies: {
        jest: { version: "29.7.0" }
      }
    };

    const graph = parseNpmLsJson(npmOutput);
    expect(graph.nodes.length).toBe(5);
    expect(graph.rootId).toBe("my-project@1.0.0");
    expect(graph.edges.find((e) => e.target === "jest@29.7.0")?.type).toBe("devDependency");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/parsers/fallback.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement fallback parser**

Create `src/parsers/fallback.ts`:

```typescript
import type { DependencyGraph, DependencyNode, DependencyEdge } from "./types";
import { markDuplicates, computeDependentCounts, computeStats } from "./graph-utils";
import type { PackageManager } from "./types";

interface NpmLsNode {
  version: string;
  dependencies?: Record<string, NpmLsNode>;
  devDependencies?: Record<string, NpmLsNode>;
}

export function parseNpmLsJson(data: NpmLsNode & { name: string }): DependencyGraph {
  const nodes: DependencyNode[] = [];
  const edges: DependencyEdge[] = [];
  const rootId = `${data.name}@${data.version}`;
  const visited = new Set<string>();

  nodes.push({ id: rootId, name: data.name, version: data.version, depth: 0, isDuplicate: false, dependentCount: 0 });

  function walk(deps: Record<string, NpmLsNode>, parentId: string, depth: number, type: DependencyEdge["type"]): void {
    for (const [name, meta] of Object.entries(deps)) {
      if (!meta.version) continue;
      const nodeId = `${name}@${meta.version}`;
      edges.push({ source: parentId, target: nodeId, type });

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      nodes.push({ id: nodeId, name, version: meta.version, depth, isDuplicate: false, dependentCount: 0 });

      if (meta.dependencies) walk(meta.dependencies, nodeId, depth + 1, "dependency");
    }
  }

  if (data.dependencies) walk(data.dependencies, rootId, 1, "dependency");
  if (data.devDependencies) walk(data.devDependencies, rootId, 1, "devDependency");

  markDuplicates(nodes);
  computeDependentCounts(nodes, edges);
  return { nodes, edges, rootId, stats: computeStats(nodes, edges) };
}

export async function parseFallback(projectPath: string, pm: PackageManager): Promise<DependencyGraph> {
  const commands: Record<PackageManager, string[]> = {
    npm: ["npm", "ls", "--all", "--json"],
    yarn: ["yarn", "list", "--json"],
    pnpm: ["pnpm", "list", "--json", "--long"],
    bun: ["bun", "pm", "ls", "--all"],
  };

  const proc = Bun.spawn(commands[pm], { cwd: projectPath, stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;

  if (pm === "npm") {
    return parseNpmLsJson(JSON.parse(stdout));
  }

  // For other PMs, parse JSON or text output similarly
  // (Simplified: fall back to npm-like JSON parsing where possible)
  throw new Error(`Fallback parsing for ${pm} not yet fully implemented — use lockfile instead`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/parsers/fallback.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/parsers/fallback.ts tests/parsers/fallback.test.ts
git commit -m "feat: add CLI fallback parser with npm ls JSON support"
```

---

### Task 9: Run all parser tests

- [ ] **Step 1: Run all tests**

Run: `bun test`
Expected: All tests pass across detect, graph-utils, npm, yarn, pnpm, bun, fallback

- [ ] **Step 2: Fix any failures and re-run until all tests pass, then commit fixes**

```bash
git add -A && git commit -m "fix: resolve any parser test issues"
```

---

## Chunk 3: Server + CLI Entry Point

### Task 10: HTTP server with graph API

**Files:**
- Create: `src/server/index.ts`
- Create: `tests/integration/server.test.ts`

- [ ] **Step 1: Write failing test for server API**

Create `tests/integration/server.test.ts`:

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startServer } from "../../src/server/index";
import type { DependencyGraph } from "../../src/parsers/types";

describe("server", () => {
  let server: ReturnType<typeof Bun.serve>;
  let baseUrl: string;

  // Use the tool's own project as a test target (it has a bun.lockb)
  const testProjectPath = process.cwd();

  beforeAll(async () => {
    const result = await startServer(testProjectPath, 0); // port 0 = random
    server = result.server;
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(() => {
    server.stop(true);
  });

  test("GET / returns HTML", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("GET /api/graph?mode=full returns valid graph JSON", async () => {
    const res = await fetch(`${baseUrl}/api/graph?mode=full`);
    expect(res.status).toBe(200);
    const graph: DependencyGraph = await res.json();
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.rootId).toBeDefined();
    expect(graph.stats.totalPackages).toBeGreaterThan(0);
  });

  test("GET /api/graph?mode=prod returns fewer nodes than full", async () => {
    const fullRes = await fetch(`${baseUrl}/api/graph?mode=full`);
    const full: DependencyGraph = await fullRes.json();

    const prodRes = await fetch(`${baseUrl}/api/graph?mode=prod`);
    const prod: DependencyGraph = await prodRes.json();

    expect(prod.nodes.length).toBeLessThanOrEqual(full.nodes.length);
    expect(prod.edges.every((e) => e.type !== "devDependency")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/integration/server.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement server**

Create `src/server/index.ts`:

```typescript
import { join, resolve } from "path";
import { existsSync, readFileSync } from "fs";
import { detectPackageManager } from "../parsers/detect";
import { parseNpm } from "../parsers/npm-parser";
import { parseYarn } from "../parsers/yarn-parser";
import { parsePnpm } from "../parsers/pnpm-parser";
import { parseBun } from "../parsers/bun-parser";
import { filterProdGraph } from "../parsers/graph-utils";
import type { DependencyGraph } from "../parsers/types";

function parseProject(projectPath: string): DependencyGraph {
  const pm = detectPackageManager(projectPath);
  if (!pm) throw new Error("No lockfile found. Install dependencies first.");

  switch (pm) {
    case "npm": return parseNpm(projectPath);
    case "yarn": return parseYarn(projectPath);
    case "pnpm": return parsePnpm(projectPath);
    case "bun": return parseBun(projectPath);
  }
}

export async function startServer(projectPath: string, port: number) {
  const absPath = resolve(projectPath);
  const fullGraph = parseProject(absPath);
  const prodGraph = filterProdGraph(fullGraph);

  // Resolve web assets directory (dist/web in production, src/web in dev)
  const distWeb = join(import.meta.dir, "../../dist/web");
  const srcWeb = join(import.meta.dir, "../web");
  const webDir = existsSync(distWeb) ? distWeb : srcWeb;

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/api/graph") {
        const mode = url.searchParams.get("mode") ?? "full";
        const graph = mode === "prod" ? prodGraph : fullGraph;
        return Response.json(graph);
      }

      // Static file serving
      let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
      const fullPath = join(webDir, filePath);

      if (existsSync(fullPath)) {
        const file = Bun.file(fullPath);
        return new Response(file);
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  return { server, fullGraph, prodGraph };
}
```

- [ ] **Step 4: Create minimal web app placeholder so server tests can pass**

Create `src/web/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>dep-tracker</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app">
    <aside id="sidebar"></aside>
    <main id="graph-container"></main>
  </div>
  <script type="module" src="app.js"></script>
</body>
</html>
```

Create `src/web/styles.css` (empty placeholder — full styles added in Task 17):

```css
/* placeholder */
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/integration/server.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/index.ts src/web/index.html src/web/styles.css tests/integration/server.test.ts
git commit -m "feat: add HTTP server with graph API and mode filtering"
```

---

### Task 11: CLI entry point

**Files:**
- Create: `src/cli/index.ts`

- [ ] **Step 1: Implement CLI**

Create `src/cli/index.ts`:

```typescript
#!/usr/bin/env bun
import { resolve } from "path";
import { startServer } from "../server/index";

function printHelp() {
  console.log(`
dep-tracker [path] [options]

Arguments:
  path          Path to project directory (default: current directory)

Options:
  --mode, -m    Display mode: "prod" or "full" (default: "full")
  --port, -p    Server port (default: random available port)
  --no-open     Don't auto-open the browser
  --help, -h    Show help
  --version, -v Show version
`);
}

function parseArgs(args: string[]) {
  const opts = { path: ".", mode: "full", port: 0, open: true, help: false, version: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") { opts.help = true; }
    else if (arg === "--version" || arg === "-v") { opts.version = true; }
    else if (arg === "--no-open") { opts.open = false; }
    else if ((arg === "--mode" || arg === "-m") && args[i + 1]) { opts.mode = args[++i]; }
    else if ((arg === "--port" || arg === "-p") && args[i + 1]) { opts.port = parseInt(args[++i], 10); }
    else if (!arg.startsWith("-")) { opts.path = arg; }
  }

  return opts;
}

async function main() {
  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  if (opts.help) { printHelp(); process.exit(0); }
  if (opts.version) {
    const pkg = await Bun.file(resolve(import.meta.dir, "../../package.json")).json();
    console.log(pkg.version);
    process.exit(0);
  }

  const projectPath = resolve(opts.path);
  console.log(`Analyzing dependencies in ${projectPath}...`);

  try {
    const { server } = await startServer(projectPath, opts.port);
    const url = `http://localhost:${server.port}`;
    console.log(`Server running at ${url}`);
    console.log(`Mode: ${opts.mode} (switch in the UI)`);

    if (opts.open) {
      const cmd = process.platform === "darwin" ? "open" : "xdg-open";
      Bun.spawn([cmd, `${url}?mode=${opts.mode}`]);
    }

    console.log("Press Ctrl+C to stop");
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: Test CLI manually**

Run: `bun run src/cli/index.ts --help`
Expected: Help text printed

Run: `bun run src/cli/index.ts --no-open`
Expected: "Analyzing dependencies..." and "Server running at http://localhost:XXXX" printed. Ctrl+C to stop.

- [ ] **Step 3: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: add CLI entry point with arg parsing and browser launch"
```

---

## Chunk 4: Web App — D3 Layouts + Renderer

The web app files in `src/web/` are TypeScript that will be bundled by Bun for the browser. During development, the server serves them from `src/web/` (as pre-built JS) or `dist/web/` (after running `bun run build`).

### Task 12: Shared graph renderer (nodes, edges, tooltips)

**Files:**
- Create: `src/web/graph/renderer.ts`

- [ ] **Step 1: Implement shared renderer**

Create `src/web/graph/renderer.ts`:

```typescript
import * as d3 from "d3";
import type { DependencyNode, DependencyEdge, DependencyGraph } from "../../parsers/types";

export const EDGE_COLORS: Record<DependencyEdge["type"], string> = {
  dependency: "#818cf8",
  devDependency: "#f472b6",
  peerDependency: "#34d399",
  optionalDependency: "#fbbf24",
};

export const EDGE_DASH: Record<DependencyEdge["type"], string> = {
  dependency: "none",
  devDependency: "6 3",
  peerDependency: "3 5",
  optionalDependency: "2 3",
};

const MAX_DEPTH_OPACITY = 8;

export function nodeRadius(node: DependencyNode): number {
  if (node.depth === 0) return 22;
  return Math.min(18, 6 + Math.sqrt(node.dependentCount) * 3);
}

export function nodeOpacity(node: DependencyNode): number {
  return Math.max(0.3, 1 - node.depth / MAX_DEPTH_OPACITY);
}

export function nodeColor(node: DependencyNode): string {
  if (node.depth === 0) return "#6366f1";
  if (node.isDuplicate) return "#7f1d1d";
  return "#312e81";
}

export function nodeStroke(node: DependencyNode): string {
  if (node.isDuplicate) return "#dc2626";
  return "#6366f1";
}

export interface RendererOptions {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  width: number;
  height: number;
  graph: DependencyGraph;
  onNodeClick?: (node: DependencyNode) => void;
  maxDepth?: number;
}

export function createEdgeElements(
  container: d3.Selection<SVGGElement, unknown, null, undefined>,
  edges: DependencyEdge[]
) {
  return container
    .selectAll<SVGLineElement, DependencyEdge>("line.edge")
    .data(edges, (d) => `${d.source}-${d.target}`)
    .join("line")
    .attr("class", "edge")
    .attr("stroke", (d) => EDGE_COLORS[d.type])
    .attr("stroke-width", 1.2)
    .attr("stroke-dasharray", (d) => EDGE_DASH[d.type])
    .attr("stroke-opacity", 0.5);
}

export function createNodeElements(
  container: d3.Selection<SVGGElement, unknown, null, undefined>,
  nodes: DependencyNode[],
  onNodeClick?: (node: DependencyNode) => void
) {
  const groups = container
    .selectAll<SVGGElement, DependencyNode>("g.node")
    .data(nodes, (d) => d.id)
    .join("g")
    .attr("class", "node")
    .style("cursor", "pointer");

  // Duplicate glow ring
  groups.filter((d) => d.isDuplicate)
    .append("circle")
    .attr("class", "glow")
    .attr("r", (d) => nodeRadius(d) + 4)
    .attr("fill", "none")
    .attr("stroke", "#dc2626")
    .attr("stroke-width", 1)
    .attr("stroke-opacity", 0.3);

  // Main circle
  groups.append("circle")
    .attr("r", (d) => nodeRadius(d))
    .attr("fill", (d) => nodeColor(d))
    .attr("stroke", (d) => nodeStroke(d))
    .attr("stroke-width", (d) => d.isDuplicate ? 2 : 1.5)
    .attr("opacity", (d) => nodeOpacity(d));

  // Label
  groups.append("text")
    .text((d) => d.name.length > 12 ? d.name.slice(0, 11) + "…" : d.name)
    .attr("text-anchor", "middle")
    .attr("dy", (d) => d.depth === 0 ? -4 : 0)
    .attr("fill", "white")
    .attr("font-size", (d) => d.depth === 0 ? 9 : 7)
    .attr("pointer-events", "none");

  // Version label for root
  groups.filter((d) => d.depth === 0)
    .append("text")
    .text((d) => d.version)
    .attr("text-anchor", "middle")
    .attr("dy", 8)
    .attr("fill", "#c4b5fd")
    .attr("font-size", 7)
    .attr("pointer-events", "none");

  if (onNodeClick) {
    groups.on("click", (_event, d) => onNodeClick(d));
  }

  return groups;
}

export function createTooltip() {
  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "graph-tooltip")
    .style("position", "absolute")
    .style("display", "none")
    .style("background", "#1e1e2e")
    .style("border", "1px solid #3730a3")
    .style("border-radius", "6px")
    .style("padding", "8px 12px")
    .style("color", "#e2e8f0")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("z-index", "1000");

  return tooltip;
}

export function attachTooltip(
  groups: d3.Selection<SVGGElement, DependencyNode, SVGGElement, unknown>,
  tooltip: d3.Selection<HTMLDivElement, unknown, HTMLElement, undefined>,
  edges: DependencyEdge[]
) {
  groups
    .on("mouseenter", (event, d) => {
      const incomingTypes = edges
        .filter((e) => e.target === d.id)
        .map((e) => e.type)
        .filter((v, i, a) => a.indexOf(v) === i);

      tooltip
        .style("display", "block")
        .html(`
          <strong>${d.name}</strong><br>
          <span style="color:#818cf8">v${d.version}</span><br>
          <span style="color:#888">${incomingTypes.join(", ") || "root"}</span><br>
          <span style="color:#888">depth: ${d.depth} · dependents: ${d.dependentCount}</span>
          ${d.isDuplicate ? '<br><span style="color:#f87171">⚠ duplicate version</span>' : ""}
        `);
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", event.pageX + 12 + "px")
        .style("top", event.pageY - 10 + "px");
    })
    .on("mouseleave", () => {
      tooltip.style("display", "none");
    });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/web/graph/renderer.ts
git commit -m "feat: add shared D3 graph renderer with nodes, edges, tooltips"
```

---

### Task 13: Force-directed layout

**Files:**
- Create: `src/web/graph/force-layout.ts`

- [ ] **Step 1: Implement force layout**

Create `src/web/graph/force-layout.ts`:

```typescript
import * as d3 from "d3";
import type { DependencyNode, DependencyEdge, DependencyGraph } from "../../parsers/types";
import { createEdgeElements, createNodeElements, createTooltip, attachTooltip, nodeRadius } from "./renderer";

interface SimNode extends DependencyNode, d3.SimulationNodeDatum {}
interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  type: DependencyEdge["type"];
}

export function renderForceLayout(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  graph: DependencyGraph,
  width: number,
  height: number,
  onNodeClick?: (node: DependencyNode) => void
) {
  svg.selectAll("*").remove();

  const simNodes: SimNode[] = graph.nodes.map((n) => ({ ...n }));
  const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
  const simEdges: SimEdge[] = graph.edges
    .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
    .map((e) => ({ source: nodeMap.get(e.source)!, target: nodeMap.get(e.target)!, type: e.type }));

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => container.attr("transform", event.transform));

  svg.call(zoom);
  const container = svg.append("g");
  const edgeGroup = container.append("g").attr("class", "edges");
  const nodeGroup = container.append("g").attr("class", "nodes");

  const edgeElements = createEdgeElements(edgeGroup, simEdges as unknown as DependencyEdge[]);
  const nodeElements = createNodeElements(nodeGroup, simNodes, onNodeClick);

  const tooltip = createTooltip();
  attachTooltip(nodeElements, tooltip, graph.edges);

  const simulation = d3.forceSimulation<SimNode>(simNodes)
    .force("link", d3.forceLink<SimNode, SimEdge>(simEdges).id((d) => d.id).distance(60))
    .force("charge", d3.forceManyBody().strength(-200))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide<SimNode>().radius((d) => nodeRadius(d) + 4));

  simulation.on("tick", () => {
    edgeElements
      .attr("x1", (d: any) => d.source.x)
      .attr("y1", (d: any) => d.source.y)
      .attr("x2", (d: any) => d.target.x)
      .attr("y2", (d: any) => d.target.y);

    nodeElements.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
  });

  // Drag behavior
  const drag = d3.drag<SVGGElement, SimNode>()
    .on("start", (event, d) => {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on("drag", (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on("end", (event, d) => {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    });

  nodeElements.call(drag as any);

  return { simulation, zoom };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/web/graph/force-layout.ts
git commit -m "feat: add D3 force-directed layout with drag and zoom"
```

---

### Task 14: Hierarchical tree layout

**Files:**
- Create: `src/web/graph/tree-layout.ts`

- [ ] **Step 1: Implement tree layout**

Create `src/web/graph/tree-layout.ts`:

```typescript
import * as d3 from "d3";
import type { DependencyNode, DependencyEdge, DependencyGraph } from "../../parsers/types";
import { createNodeElements, createTooltip, attachTooltip, nodeRadius, EDGE_COLORS, EDGE_DASH } from "./renderer";

interface TreeNode {
  data: DependencyNode;
  children: TreeNode[];
}

function buildTree(graph: DependencyGraph): TreeNode {
  const root = graph.nodes.find((n) => n.id === graph.rootId)!;
  const childMap = new Map<string, DependencyEdge[]>();
  for (const edge of graph.edges) {
    const children = childMap.get(edge.source) ?? [];
    children.push(edge);
    childMap.set(edge.source, children);
  }

  const visited = new Set<string>();

  function build(node: DependencyNode): TreeNode {
    visited.add(node.id);
    const childEdges = childMap.get(node.id) ?? [];
    const children: TreeNode[] = [];
    for (const edge of childEdges) {
      if (visited.has(edge.target)) continue;
      const childNode = graph.nodes.find((n) => n.id === edge.target);
      if (childNode) children.push(build(childNode));
    }
    return { data: node, children };
  }

  return build(root);
}

export function renderTreeLayout(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  graph: DependencyGraph,
  width: number,
  height: number,
  onNodeClick?: (node: DependencyNode) => void
) {
  svg.selectAll("*").remove();

  const treeData = buildTree(graph);
  const hierarchy = d3.hierarchy<TreeNode>(treeData, (d) => d.children);
  const treeLayout = d3.tree<TreeNode>().size([width - 100, height - 100]);
  const treeRoot = treeLayout(hierarchy);

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => container.attr("transform", event.transform));

  svg.call(zoom);
  const container = svg.append("g").attr("transform", "translate(50, 50)");

  // Build edge type lookup
  const edgeTypeMap = new Map<string, DependencyEdge["type"]>();
  for (const edge of graph.edges) {
    edgeTypeMap.set(`${edge.source}-${edge.target}`, edge.type);
  }

  // Draw links
  container.append("g").attr("class", "links")
    .selectAll("path")
    .data(treeRoot.links())
    .join("path")
    .attr("fill", "none")
    .attr("stroke", (d) => {
      const key = `${d.source.data.data.id}-${d.target.data.data.id}`;
      const type = edgeTypeMap.get(key) ?? "dependency";
      return EDGE_COLORS[type];
    })
    .attr("stroke-dasharray", (d) => {
      const key = `${d.source.data.data.id}-${d.target.data.data.id}`;
      const type = edgeTypeMap.get(key) ?? "dependency";
      return EDGE_DASH[type];
    })
    .attr("stroke-width", 1.2)
    .attr("stroke-opacity", 0.5)
    .attr("d", d3.linkVertical<any, any>()
      .x((d: any) => d.x)
      .y((d: any) => d.y));

  // Draw nodes
  const nodeData = treeRoot.descendants().map((d) => ({
    ...d.data.data,
    _x: d.x,
    _y: d.y,
  }));

  const nodeGroup = container.append("g").attr("class", "nodes");
  const nodeElements = createNodeElements(nodeGroup, nodeData, onNodeClick);
  nodeElements.attr("transform", (d: any) => `translate(${d._x},${d._y})`);

  const tooltip = createTooltip();
  attachTooltip(nodeElements, tooltip, graph.edges);

  return { zoom };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/web/graph/tree-layout.ts
git commit -m "feat: add D3 hierarchical tree layout"
```

---

### Task 15: Radial layout

**Files:**
- Create: `src/web/graph/radial-layout.ts`

- [ ] **Step 1: Implement radial layout**

Create `src/web/graph/radial-layout.ts`:

```typescript
import * as d3 from "d3";
import type { DependencyNode, DependencyEdge, DependencyGraph } from "../../parsers/types";
import { createNodeElements, createTooltip, attachTooltip, EDGE_COLORS, EDGE_DASH } from "./renderer";

interface TreeNode {
  data: DependencyNode;
  children: TreeNode[];
}

function buildTree(graph: DependencyGraph): TreeNode {
  const root = graph.nodes.find((n) => n.id === graph.rootId)!;
  const childMap = new Map<string, DependencyEdge[]>();
  for (const edge of graph.edges) {
    const children = childMap.get(edge.source) ?? [];
    children.push(edge);
    childMap.set(edge.source, children);
  }

  const visited = new Set<string>();

  function build(node: DependencyNode): TreeNode {
    visited.add(node.id);
    const childEdges = childMap.get(node.id) ?? [];
    const children: TreeNode[] = [];
    for (const edge of childEdges) {
      if (visited.has(edge.target)) continue;
      const childNode = graph.nodes.find((n) => n.id === edge.target);
      if (childNode) children.push(build(childNode));
    }
    return { data: node, children };
  }

  return build(root);
}

export function renderRadialLayout(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  graph: DependencyGraph,
  width: number,
  height: number,
  onNodeClick?: (node: DependencyNode) => void
) {
  svg.selectAll("*").remove();

  const treeData = buildTree(graph);
  const hierarchy = d3.hierarchy<TreeNode>(treeData, (d) => d.children);
  const radius = Math.min(width, height) / 2 - 80;
  const treeLayout = d3.tree<TreeNode>()
    .size([2 * Math.PI, radius])
    .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth);

  const treeRoot = treeLayout(hierarchy);

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => container.attr("transform", event.transform));

  svg.call(zoom);
  const container = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);

  const edgeTypeMap = new Map<string, DependencyEdge["type"]>();
  for (const edge of graph.edges) {
    edgeTypeMap.set(`${edge.source}-${edge.target}`, edge.type);
  }

  // Draw links as radial curves
  container.append("g").attr("class", "links")
    .selectAll("path")
    .data(treeRoot.links())
    .join("path")
    .attr("fill", "none")
    .attr("stroke", (d) => {
      const key = `${d.source.data.data.id}-${d.target.data.data.id}`;
      return EDGE_COLORS[edgeTypeMap.get(key) ?? "dependency"];
    })
    .attr("stroke-dasharray", (d) => {
      const key = `${d.source.data.data.id}-${d.target.data.data.id}`;
      return EDGE_DASH[edgeTypeMap.get(key) ?? "dependency"];
    })
    .attr("stroke-width", 1.2)
    .attr("stroke-opacity", 0.5)
    .attr("d", d3.linkRadial<any, any>()
      .angle((d: any) => d.x)
      .radius((d: any) => d.y));

  // Draw nodes
  const nodeData = treeRoot.descendants().map((d) => ({
    ...d.data.data,
    _x: d.y * Math.cos(d.x - Math.PI / 2),
    _y: d.y * Math.sin(d.x - Math.PI / 2),
  }));

  const nodeGroup = container.append("g").attr("class", "nodes");
  const nodeElements = createNodeElements(nodeGroup, nodeData, onNodeClick);
  nodeElements.attr("transform", (d: any) => `translate(${d._x},${d._y})`);

  const tooltip = createTooltip();
  attachTooltip(nodeElements, tooltip, graph.edges);

  return { zoom };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/web/graph/radial-layout.ts
git commit -m "feat: add D3 radial layout"
```

---

## Chunk 5: UI Components + App Entry + Build

Note: The sidebar uses innerHTML for rendering controlled static content (stats, legend SVGs). All values come from the parsed graph data (not user input), so XSS risk is minimal. If the tool later accepts untrusted input, these should be converted to DOM construction methods.

### Task 16: Sidebar, search, and duplicates components

**Files:**
- Create: `src/web/components/sidebar.ts`
- Create: `src/web/components/search.ts`

- [ ] **Step 1: Implement sidebar**

Create `src/web/components/sidebar.ts`:

```typescript
import type { DependencyGraph } from "../../parsers/types";

export type LayoutMode = "force" | "tree" | "radial";
export type GraphMode = "prod" | "full";

export interface SidebarCallbacks {
  onModeChange: (mode: GraphMode) => void;
  onLayoutChange: (layout: LayoutMode) => void;
  onSearch: (query: string) => void;
  onDepthChange: (depth: number) => void;
  onDuplicateClick: (packageName: string) => void;
}

export function renderSidebar(
  container: HTMLElement,
  graph: DependencyGraph,
  currentMode: GraphMode,
  currentLayout: LayoutMode,
  callbacks: SidebarCallbacks
) {
  // Clear container using DOM methods
  while (container.firstChild) container.removeChild(container.firstChild);

  // Mode toggle
  const modeSection = el("div", "sidebar-section");
  const modeToggle = el("div", "toggle-group");
  for (const mode of ["prod", "full"] as GraphMode[]) {
    const btn = el("button", `toggle-btn ${mode === currentMode ? "active" : ""}`);
    btn.textContent = mode === "prod" ? "Prod" : "Full";
    btn.onclick = () => callbacks.onModeChange(mode);
    modeToggle.appendChild(btn);
  }
  modeSection.appendChild(modeToggle);
  container.appendChild(modeSection);

  // Search
  const searchSection = el("div", "sidebar-section");
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search packages...";
  searchInput.className = "search-input";
  searchInput.oninput = () => callbacks.onSearch(searchInput.value);
  searchSection.appendChild(searchInput);
  container.appendChild(searchSection);

  // Layout toggle
  const layoutSection = el("div", "sidebar-section");
  const layoutToggle = el("div", "toggle-group toggle-group-small");
  for (const layout of ["force", "tree", "radial"] as LayoutMode[]) {
    const btn = el("button", `toggle-btn ${layout === currentLayout ? "active" : ""}`);
    btn.textContent = layout.charAt(0).toUpperCase() + layout.slice(1);
    btn.onclick = () => callbacks.onLayoutChange(layout);
    layoutToggle.appendChild(btn);
  }
  layoutSection.appendChild(layoutToggle);
  container.appendChild(layoutSection);

  // Stats — built with DOM methods, no innerHTML
  const statsSection = el("div", "sidebar-section stats");
  const stats = graph.stats;
  const statItems: Array<[string, number]> = [
    ["Packages", stats.totalPackages],
    ["Direct deps", stats.directDeps],
    ["Dev deps", stats.devDeps],
    ["Peer deps", stats.peerDeps],
    ["Optional deps", stats.optionalDeps],
    ["Max depth", stats.maxDepth],
  ];
  for (const [label, value] of statItems) {
    const row = el("div", "stat-row");
    const labelSpan = el("span", "stat-label");
    labelSpan.textContent = label;
    const valueSpan = el("span", "stat-value");
    valueSpan.textContent = String(value);
    row.appendChild(labelSpan);
    row.appendChild(valueSpan);
    statsSection.appendChild(row);
  }
  container.appendChild(statsSection);

  // Legend — uses SVG elements built with createElementNS
  const legendSection = el("div", "sidebar-section");
  const legendTitle = el("div", "section-title");
  legendTitle.textContent = "Edge Types";
  legendSection.appendChild(legendTitle);
  const legendItems = [
    { label: "dependency", color: "#818cf8", dash: "" },
    { label: "devDependency", color: "#f472b6", dash: "6 3" },
    { label: "peerDependency", color: "#34d399", dash: "3 5" },
    { label: "optionalDependency", color: "#fbbf24", dash: "2 3" },
  ];
  for (const item of legendItems) {
    const row = el("div", "legend-row");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "2");
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", "0"); line.setAttribute("y1", "1");
    line.setAttribute("x2", "24"); line.setAttribute("y2", "1");
    line.setAttribute("stroke", item.color);
    line.setAttribute("stroke-width", "2");
    if (item.dash) line.setAttribute("stroke-dasharray", item.dash);
    svg.appendChild(line);
    row.appendChild(svg);
    const labelSpan = el("span", "legend-label");
    labelSpan.textContent = item.label;
    row.appendChild(labelSpan);
    legendSection.appendChild(row);
  }
  container.appendChild(legendSection);

  // Depth slider
  const depthSection = el("div", "sidebar-section");
  const depthLabel = el("div", "section-title");
  depthLabel.textContent = `Depth: ${stats.maxDepth}`;
  depthSection.appendChild(depthLabel);
  const depthSlider = document.createElement("input");
  depthSlider.type = "range";
  depthSlider.min = "1";
  depthSlider.max = String(stats.maxDepth);
  depthSlider.value = String(stats.maxDepth);
  depthSlider.className = "depth-slider";
  depthSlider.oninput = () => {
    depthLabel.textContent = `Depth: ${depthSlider.value}`;
    callbacks.onDepthChange(parseInt(depthSlider.value, 10));
  };
  depthSection.appendChild(depthSlider);
  container.appendChild(depthSection);

  // Duplicates panel
  const dupes = getDuplicates(graph);
  if (dupes.length > 0) {
    const dupeSection = el("div", "sidebar-section duplicates-section");
    const dupeTitle = el("div", "section-title");
    dupeTitle.textContent = "Duplicates ";
    const badge = el("span", "badge");
    badge.textContent = String(dupes.length);
    dupeTitle.appendChild(badge);
    dupeSection.appendChild(dupeTitle);

    for (const dupe of dupes) {
      const card = el("div", "dupe-card");
      const nameDiv = el("div", "dupe-name");
      nameDiv.textContent = dupe.name;
      const versionsDiv = el("div", "dupe-versions");
      versionsDiv.textContent = dupe.versions.join(", ");
      card.appendChild(nameDiv);
      card.appendChild(versionsDiv);
      card.onclick = () => callbacks.onDuplicateClick(dupe.name);
      dupeSection.appendChild(card);
    }
    container.appendChild(dupeSection);
  }
}

function getDuplicates(graph: DependencyGraph): Array<{ name: string; versions: string[] }> {
  const versionMap = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    if (node.depth === 0) continue;
    const versions = versionMap.get(node.name) ?? new Set();
    versions.add(node.version);
    versionMap.set(node.name, versions);
  }
  return Array.from(versionMap.entries())
    .filter(([, versions]) => versions.size > 1)
    .map(([name, versions]) => ({ name, versions: Array.from(versions).sort() }));
}

function el(tag: string, className: string): HTMLElement {
  const elem = document.createElement(tag);
  elem.className = className;
  return elem;
}
```

- [ ] **Step 2: Implement search highlight logic**

Create `src/web/components/search.ts`:

```typescript
import * as d3 from "d3";
import type { DependencyNode } from "../../parsers/types";

export function applySearchHighlight(query: string): void {
  const lowerQuery = query.toLowerCase().trim();
  d3.selectAll<SVGGElement, DependencyNode>("g.node")
    .style("opacity", (d) => {
      if (!lowerQuery) return null; // reset
      return d.name.toLowerCase().includes(lowerQuery) ? "1" : "0.15";
    });
}

export function highlightDuplicate(packageName: string): void {
  d3.selectAll<SVGGElement, DependencyNode>("g.node")
    .style("opacity", (d) => d.name === packageName ? "1" : "0.15");
}

export function clearHighlights(): void {
  d3.selectAll<SVGGElement, DependencyNode>("g.node")
    .style("opacity", null);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/web/components/
git commit -m "feat: add sidebar, search, and duplicates UI components"
```

---

### Task 17: Dark theme styles

**Files:**
- Modify: `src/web/styles.css`

- [ ] **Step 1: Write full CSS**

Replace `src/web/styles.css` with:

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: #0a0a12;
  color: #e2e8f0;
  font-family: system-ui, -apple-system, sans-serif;
  overflow: hidden;
}

#app {
  display: flex;
  height: 100vh;
  width: 100vw;
}

/* Sidebar */
#sidebar {
  width: 260px;
  background: #12121a;
  border-right: 1px solid #2a2a3a;
  overflow-y: auto;
  flex-shrink: 0;
}

.sidebar-section {
  padding: 10px 12px;
  border-bottom: 1px solid #2a2a3a;
}

.section-title {
  color: #888;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
}

/* Toggle groups */
.toggle-group {
  display: flex;
  background: #1e1e2e;
  border-radius: 6px;
  overflow: hidden;
}

.toggle-btn {
  flex: 1;
  padding: 6px;
  border: none;
  background: transparent;
  color: #666;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.toggle-btn.active {
  background: #6366f1;
  color: white;
  font-weight: 600;
}

.toggle-group-small .toggle-btn { font-size: 11px; padding: 4px; }

/* Search */
.search-input {
  width: 100%;
  background: #1e1e2e;
  border: 1px solid #2a2a3a;
  border-radius: 6px;
  padding: 6px 10px;
  color: #e2e8f0;
  font-size: 12px;
  outline: none;
}

.search-input:focus { border-color: #6366f1; }
.search-input::placeholder { color: #555; }

/* Stats */
.stat-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.stat-label { color: #888; font-size: 11px; }
.stat-value { color: #c4b5fd; font-size: 11px; font-weight: 600; }

/* Legend */
.legend-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.legend-label { color: #aaa; font-size: 11px; }

/* Depth slider */
.depth-slider {
  width: 100%;
  accent-color: #6366f1;
}

/* Duplicates */
.badge {
  background: #dc2626;
  color: white;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 10px;
  margin-left: 4px;
}

.dupe-card {
  background: #1e1e2e;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 6px;
  border-left: 3px solid #dc2626;
  cursor: pointer;
  transition: background 0.15s;
}

.dupe-card:hover { background: #252538; }
.dupe-name { color: #e2e8f0; font-size: 12px; font-weight: 600; }
.dupe-versions { color: #888; font-size: 11px; }

.duplicates-section { flex: 1; overflow-y: auto; }

/* Graph area */
#graph-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

#graph-container svg {
  width: 100%;
  height: 100%;
  background: #0a0a12;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/web/styles.css
git commit -m "feat: add dark theme styles for sidebar and graph"
```

---

### Task 18: App entry point (ties everything together)

**Files:**
- Create: `src/web/app.ts`

- [ ] **Step 1: Implement app entry**

Create `src/web/app.ts`:

```typescript
import * as d3 from "d3";
import type { DependencyGraph, DependencyNode } from "../parsers/types";
import { renderForceLayout } from "./graph/force-layout";
import { renderTreeLayout } from "./graph/tree-layout";
import { renderRadialLayout } from "./graph/radial-layout";
import { renderSidebar, type GraphMode, type LayoutMode } from "./components/sidebar";
import { applySearchHighlight, highlightDuplicate } from "./components/search";

let currentMode: GraphMode = "full";
let currentLayout: LayoutMode = "force";
let currentGraph: DependencyGraph | null = null;
let currentMaxDepth = Infinity;

const sidebar = document.getElementById("sidebar")!;
const graphContainer = document.getElementById("graph-container")!;

async function fetchGraph(mode: GraphMode): Promise<DependencyGraph> {
  const res = await fetch(`/api/graph?mode=${mode}`);
  return res.json();
}

function filterByDepth(graph: DependencyGraph, maxDepth: number): DependencyGraph {
  if (maxDepth >= graph.stats.maxDepth) return graph;
  const nodes = graph.nodes.filter((n) => n.depth <= maxDepth);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  return { ...graph, nodes, edges };
}

function renderGraph(graph: DependencyGraph) {
  const filtered = filterByDepth(graph, currentMaxDepth);
  const svg = d3.select<SVGSVGElement, unknown>("#graph-svg");
  const { width, height } = graphContainer.getBoundingClientRect();

  // Remove old tooltip
  d3.selectAll(".graph-tooltip").remove();

  const onNodeClick = (node: DependencyNode) => {
    console.log("Clicked:", node.name, node.version);
  };

  switch (currentLayout) {
    case "force":
      renderForceLayout(svg, filtered, width, height, onNodeClick);
      break;
    case "tree":
      renderTreeLayout(svg, filtered, width, height, onNodeClick);
      break;
    case "radial":
      renderRadialLayout(svg, filtered, width, height, onNodeClick);
      break;
  }
}

function updateSidebar() {
  if (!currentGraph) return;
  renderSidebar(sidebar, currentGraph, currentMode, currentLayout, {
    onModeChange: async (mode) => {
      currentMode = mode;
      currentGraph = await fetchGraph(mode);
      currentMaxDepth = currentGraph.stats.maxDepth;
      updateSidebar();
      renderGraph(currentGraph);
    },
    onLayoutChange: (layout) => {
      currentLayout = layout;
      updateSidebar();
      if (currentGraph) renderGraph(currentGraph);
    },
    onSearch: (query) => applySearchHighlight(query),
    onDepthChange: (depth) => {
      currentMaxDepth = depth;
      if (currentGraph) renderGraph(currentGraph);
    },
    onDuplicateClick: (name) => highlightDuplicate(name),
  });
}

async function init() {
  // Parse initial mode from URL
  const params = new URLSearchParams(window.location.search);
  currentMode = (params.get("mode") as GraphMode) ?? "full";

  // Create SVG
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "graph-svg";
  graphContainer.appendChild(svg);

  currentGraph = await fetchGraph(currentMode);
  currentMaxDepth = currentGraph.stats.maxDepth;
  updateSidebar();
  renderGraph(currentGraph);

  // Handle window resize
  window.addEventListener("resize", () => {
    if (currentGraph) renderGraph(currentGraph);
  });
}

init();
```

Note: `src/web/app.ts` imports from `../parsers/types`. This is safe because `types.ts` contains only TypeScript interfaces (no runtime code) — they are erased during bundling.

- [ ] **Step 2: Commit**

```bash
git add src/web/app.ts
git commit -m "feat: add app entry point wiring layouts, sidebar, and API"
```

---

### Task 19: Build script + dev workflow

**Files:**
- Create: `scripts/build.ts`

- [ ] **Step 1: Create build script**

Create `scripts/build.ts`:

```typescript
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const DIST_WEB = join(ROOT, "dist/web");

// Ensure output directory exists
if (!existsSync(DIST_WEB)) {
  mkdirSync(DIST_WEB, { recursive: true });
}

// Bundle TypeScript web app with D3 included
const result = await Bun.build({
  entrypoints: [join(ROOT, "src/web/app.ts")],
  outdir: DIST_WEB,
  bundle: true,
  minify: true,
  target: "browser",
  format: "esm",
});

if (!result.success) {
  console.error("Build failed:", result.logs);
  process.exit(1);
}

// Copy static assets
copyFileSync(join(ROOT, "src/web/index.html"), join(DIST_WEB, "index.html"));
copyFileSync(join(ROOT, "src/web/styles.css"), join(DIST_WEB, "styles.css"));

console.log("Build complete → dist/web/");
```

- [ ] **Step 2: Run the build**

Run: `bun run build`
Expected: "Build complete → dist/web/" printed. `dist/web/` contains `app.js`, `index.html`, `styles.css`

- [ ] **Step 3: Test the full app end-to-end**

Run: `bun run src/cli/index.ts --no-open`
Expected: Server starts. Open the printed URL in a browser manually. Verify:
- Graph renders with the tool's own dependencies
- Sidebar shows stats, legend, mode toggle
- Switching between Force/Tree/Radial works
- Search filters nodes
- Duplicates panel shows if any exist

- [ ] **Step 4: Commit**

```bash
git add scripts/build.ts dist/
git commit -m "feat: add build script and compiled web assets"
```

---

### Task 20: Final integration test + all tests pass

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass (detect, graph-utils, npm, yarn, pnpm, bun, fallback, server)

- [ ] **Step 2: Fix any failures and re-run until all pass**

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: dep-tracker v0.1.0 — complete dependency visualization tool"
```

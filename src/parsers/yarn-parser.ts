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

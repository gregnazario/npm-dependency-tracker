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
      const targetId = resolveDepPath(pkgPath, depName, pathToId);
      if (!targetId) continue;
      edges.push({ source: sourceId, target: targetId, type: "dependency" });
    }

    // For root entry, also process devDependencies listed in lockfile
    if (pkgPath === "") {
      for (const [depName] of Object.entries(meta.devDependencies ?? {})) {
        const targetId = resolveDepPath(pkgPath, depName, pathToId);
        if (!targetId) continue;
        edges.push({ source: sourceId, target: targetId, type: "dependency" });
      }
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

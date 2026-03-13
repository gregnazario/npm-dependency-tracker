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
  packages: Record<string, any[]>;
}

function parseBunLockJson(content: string): BunLock {
  // bun.lock has trailing commas — strip them before JSON.parse
  const cleaned = content.replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(cleaned) as BunLock;
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
    // bun.lock arrays vary: [resolved, {deps}] or [resolved, registry, {deps}, hash]
    // Find the first object element which contains the dependencies
    const depsObj = pkgEntry.find((el): el is Record<string, any> => typeof el === "object" && el !== null);
    const deps = depsObj?.dependencies ?? {};
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

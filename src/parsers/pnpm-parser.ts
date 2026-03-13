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

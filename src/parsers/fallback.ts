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

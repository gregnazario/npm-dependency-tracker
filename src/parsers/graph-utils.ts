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
    peerDeps: edges.filter((e) => e.type === "peerDependency").length,
    optionalDeps: edges.filter((e) => e.type === "optionalDependency").length,
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

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

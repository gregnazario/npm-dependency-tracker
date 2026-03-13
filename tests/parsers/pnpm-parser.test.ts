import { describe, test, expect } from "bun:test";
import { join } from "path";
import { parsePnpm } from "../../src/parsers/pnpm-parser";

const FIXTURE = join(import.meta.dir, "../fixtures/pnpm");
const FIXTURE_V9 = join(import.meta.dir, "../fixtures/pnpm-v9");

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

  test("v9 with snapshots resolves full transitive tree", () => {
    const graph = parsePnpm(FIXTURE_V9);
    expect(graph.stats.maxDepth).toBeGreaterThan(1);
    // express -> debug -> ms = depth 3
    const msNode = graph.nodes.find((n) => n.name === "ms");
    expect(msNode).toBeDefined();
    expect(msNode!.depth).toBe(3);
  });
});

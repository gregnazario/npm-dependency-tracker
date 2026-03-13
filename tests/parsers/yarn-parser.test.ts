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

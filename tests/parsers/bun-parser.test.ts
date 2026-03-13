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

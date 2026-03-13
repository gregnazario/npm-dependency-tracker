import { describe, test, expect } from "bun:test";
import { join } from "path";
import { parseNpm } from "../../src/parsers/npm-parser";

const FIXTURE = join(import.meta.dir, "../fixtures/npm");

describe("parseNpm", () => {
  test("parses all nodes from package-lock.json", () => {
    const graph = parseNpm(FIXTURE);
    expect(graph.nodes.length).toBe(8); // root + 7 packages
    expect(graph.rootId).toBe("test-project@1.0.0");
  });

  test("correctly assigns edge types", () => {
    const graph = parseNpm(FIXTURE);
    const expressEdge = graph.edges.find((e) => e.target === "express@4.18.2");
    expect(expressEdge?.type).toBe("dependency");

    const jestEdge = graph.edges.find((e) => e.target === "jest@29.7.0");
    expect(jestEdge?.type).toBe("devDependency");

    const reactEdge = graph.edges.find((e) => e.target === "react@18.2.0");
    expect(reactEdge?.type).toBe("peerDependency");

    const fseventsEdge = graph.edges.find((e) => e.target === "fsevents@2.3.3");
    expect(fseventsEdge?.type).toBe("optionalDependency");
  });

  test("resolves nested transitive dependencies", () => {
    const graph = parseNpm(FIXTURE);
    const debugEdge = graph.edges.find((e) => e.target === "debug@2.6.9");
    expect(debugEdge?.source).toBe("express@4.18.2");

    const msEdge = graph.edges.find((e) => e.target === "ms@2.0.0");
    expect(msEdge?.source).toBe("debug@2.6.9");
  });

  test("computes correct depths", () => {
    const graph = parseNpm(FIXTURE);
    const root = graph.nodes.find((n) => n.name === "test-project");
    expect(root?.depth).toBe(0);

    const express = graph.nodes.find((n) => n.name === "express");
    expect(express?.depth).toBe(1);

    const debug = graph.nodes.find((n) => n.name === "debug");
    expect(debug?.depth).toBe(2);

    const ms = graph.nodes.find((n) => n.name === "ms");
    expect(ms?.depth).toBe(3);
  });

  test("computes stats", () => {
    const graph = parseNpm(FIXTURE);
    expect(graph.stats.totalPackages).toBe(7);
    expect(graph.stats.directDeps).toBe(1);
    expect(graph.stats.devDeps).toBe(1);
    expect(graph.stats.peerDeps).toBe(1);
    expect(graph.stats.optionalDeps).toBe(1);
    expect(graph.stats.maxDepth).toBe(3);
  });
});

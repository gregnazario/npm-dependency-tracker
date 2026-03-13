import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startServer } from "../../src/server/index";
import type { DependencyGraph } from "../../src/parsers/types";

describe("server", () => {
  let server: ReturnType<typeof Bun.serve>;
  let baseUrl: string;

  // Use the tool's own project as a test target (it has a bun.lock)
  const testProjectPath = process.cwd();

  beforeAll(async () => {
    const result = await startServer(testProjectPath, 0); // port 0 = random
    server = result.server;
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(() => {
    server.stop(true);
  });

  test("GET / returns HTML", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("GET /api/graph returns valid graph JSON", async () => {
    const res = await fetch(`${baseUrl}/api/graph`);
    expect(res.status).toBe(200);
    const graph: DependencyGraph = await res.json();
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.rootId).toBeDefined();
    expect(graph.stats.totalPackages).toBeGreaterThan(0);
  });
});

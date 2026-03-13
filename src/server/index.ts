import { join, resolve } from "path";
import { existsSync, readFileSync } from "fs";
import { detectPackageManager } from "../parsers/detect";
import { parseNpm } from "../parsers/npm-parser";
import { parseYarn } from "../parsers/yarn-parser";
import { parsePnpm } from "../parsers/pnpm-parser";
import { parseBun } from "../parsers/bun-parser";
import { filterProdGraph } from "../parsers/graph-utils";
import type { DependencyGraph } from "../parsers/types";

function parseProject(projectPath: string): DependencyGraph {
  const pm = detectPackageManager(projectPath);
  if (!pm) throw new Error("No lockfile found. Install dependencies first.");

  switch (pm) {
    case "npm": return parseNpm(projectPath);
    case "yarn": return parseYarn(projectPath);
    case "pnpm": return parsePnpm(projectPath);
    case "bun": return parseBun(projectPath);
  }
}

export async function startServer(projectPath: string, port: number) {
  const absPath = resolve(projectPath);
  const fullGraph = parseProject(absPath);
  const prodGraph = filterProdGraph(fullGraph);

  // Resolve web assets directory (dist/web in production, src/web in dev)
  const distWeb = join(import.meta.dir, "../../dist/web");
  const srcWeb = join(import.meta.dir, "../web");
  const webDir = existsSync(distWeb) ? distWeb : srcWeb;

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/api/graph") {
        const mode = url.searchParams.get("mode") ?? "full";
        const graph = mode === "prod" ? prodGraph : fullGraph;
        return Response.json(graph);
      }

      // Static file serving
      let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
      const fullPath = join(webDir, filePath);

      if (existsSync(fullPath)) {
        const file = Bun.file(fullPath);
        return new Response(file);
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  return { server, fullGraph, prodGraph };
}

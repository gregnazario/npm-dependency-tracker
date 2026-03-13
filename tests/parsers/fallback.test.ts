import { describe, test, expect } from "bun:test";
import { parseNpmLsJson } from "../../src/parsers/fallback";

describe("parseNpmLsJson", () => {
  test("parses npm ls --all --json output into graph", () => {
    const npmOutput = {
      name: "my-project",
      version: "1.0.0",
      dependencies: {
        express: {
          version: "4.18.2",
          dependencies: {
            debug: {
              version: "2.6.9",
              dependencies: {
                ms: { version: "2.0.0" }
              }
            }
          }
        }
      },
      devDependencies: {
        jest: { version: "29.7.0" }
      }
    };

    const graph = parseNpmLsJson(npmOutput);
    expect(graph.nodes.length).toBe(5);
    expect(graph.rootId).toBe("my-project@1.0.0");
    expect(graph.edges.find((e) => e.target === "jest@29.7.0")?.type).toBe("devDependency");
  });
});

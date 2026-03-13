import * as d3 from "d3";
import type { DependencyNode } from "../../parsers/types";

export function applySearchHighlight(query: string): void {
  const lowerQuery = query.toLowerCase().trim();
  d3.selectAll<SVGGElement, DependencyNode>("g.node")
    .style("opacity", (d) => {
      if (!lowerQuery) return null; // reset
      return d.name.toLowerCase().includes(lowerQuery) ? "1" : "0.15";
    });
}

export function highlightDuplicate(packageName: string): void {
  d3.selectAll<SVGGElement, DependencyNode>("g.node")
    .style("opacity", (d) => d.name === packageName ? "1" : "0.15");
}

export function clearHighlights(): void {
  d3.selectAll<SVGGElement, DependencyNode>("g.node")
    .style("opacity", null);
}

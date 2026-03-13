import * as d3 from "d3";
import type { DependencyNode, DependencyEdge, DependencyGraph } from "../../parsers/types";

export const EDGE_COLORS: Record<DependencyEdge["type"], string> = {
  dependency: "#818cf8",
  devDependency: "#f472b6",
  peerDependency: "#34d399",
  optionalDependency: "#fbbf24",
};

export const EDGE_DASH: Record<DependencyEdge["type"], string> = {
  dependency: "none",
  devDependency: "6 3",
  peerDependency: "3 5",
  optionalDependency: "2 3",
};

const MAX_DEPTH_OPACITY = 8;

export function nodeRadius(node: DependencyNode): number {
  if (node.depth === 0) return 22;
  return Math.min(18, 6 + Math.sqrt(node.dependentCount) * 3);
}

export function nodeOpacity(node: DependencyNode): number {
  return Math.max(0.3, 1 - node.depth / MAX_DEPTH_OPACITY);
}

export function nodeColor(node: DependencyNode): string {
  if (node.depth === 0) return "#6366f1";
  if (node.isDuplicate) return "#7f1d1d";
  return "#312e81";
}

export function nodeStroke(node: DependencyNode): string {
  if (node.isDuplicate) return "#dc2626";
  return "#6366f1";
}

export interface RendererOptions {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  width: number;
  height: number;
  graph: DependencyGraph;
  onNodeClick?: (node: DependencyNode) => void;
  maxDepth?: number;
}

export function createEdgeElements(
  container: d3.Selection<SVGGElement, unknown, null, undefined>,
  edges: DependencyEdge[]
) {
  return container
    .selectAll<SVGLineElement, DependencyEdge>("line.edge")
    .data(edges, (d) => `${d.source}-${d.target}`)
    .join("line")
    .attr("class", "edge")
    .attr("stroke", (d) => EDGE_COLORS[d.type])
    .attr("stroke-width", 1.2)
    .attr("stroke-dasharray", (d) => EDGE_DASH[d.type])
    .attr("stroke-opacity", 0.5);
}

export function createNodeElements(
  container: d3.Selection<SVGGElement, unknown, null, undefined>,
  nodes: DependencyNode[],
  onNodeClick?: (node: DependencyNode) => void
) {
  const groups = container
    .selectAll<SVGGElement, DependencyNode>("g.node")
    .data(nodes, (d) => d.id)
    .join("g")
    .attr("class", "node")
    .style("cursor", "pointer");

  // Duplicate glow ring
  groups.filter((d) => d.isDuplicate)
    .append("circle")
    .attr("class", "glow")
    .attr("r", (d) => nodeRadius(d) + 4)
    .attr("fill", "none")
    .attr("stroke", "#dc2626")
    .attr("stroke-width", 1)
    .attr("stroke-opacity", 0.3);

  // Main circle
  groups.append("circle")
    .attr("r", (d) => nodeRadius(d))
    .attr("fill", (d) => nodeColor(d))
    .attr("stroke", (d) => nodeStroke(d))
    .attr("stroke-width", (d) => d.isDuplicate ? 2 : 1.5)
    .attr("opacity", (d) => nodeOpacity(d));

  // Label
  groups.append("text")
    .text((d) => d.name.length > 12 ? d.name.slice(0, 11) + "\u2026" : d.name)
    .attr("text-anchor", "middle")
    .attr("dy", (d) => d.depth === 0 ? -4 : 0)
    .attr("fill", "white")
    .attr("font-size", (d) => d.depth === 0 ? 9 : 7)
    .attr("pointer-events", "none");

  // Version label for root
  groups.filter((d) => d.depth === 0)
    .append("text")
    .text((d) => d.version)
    .attr("text-anchor", "middle")
    .attr("dy", 8)
    .attr("fill", "#c4b5fd")
    .attr("font-size", 7)
    .attr("pointer-events", "none");

  if (onNodeClick) {
    groups.on("click", (_event, d) => onNodeClick(d));
  }

  return groups;
}

export function createTooltip() {
  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "graph-tooltip")
    .style("position", "absolute")
    .style("display", "none")
    .style("background", "#1e1e2e")
    .style("border", "1px solid #3730a3")
    .style("border-radius", "6px")
    .style("padding", "8px 12px")
    .style("color", "#e2e8f0")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("z-index", "1000");

  return tooltip;
}

export function attachTooltip(
  groups: d3.Selection<SVGGElement, DependencyNode, SVGGElement, unknown>,
  tooltip: d3.Selection<HTMLDivElement, unknown, HTMLElement, undefined>,
  edges: DependencyEdge[]
) {
  groups
    .on("mouseenter", (event, d) => {
      const incomingTypes = edges
        .filter((e) => e.target === d.id)
        .map((e) => e.type)
        .filter((v, i, a) => a.indexOf(v) === i);

      tooltip
        .style("display", "block")
        .html(`
          <strong>${d.name}</strong><br>
          <span style="color:#818cf8">v${d.version}</span><br>
          <span style="color:#888">${incomingTypes.join(", ") || "root"}</span><br>
          <span style="color:#888">depth: ${d.depth} · dependents: ${d.dependentCount}</span>
          ${d.isDuplicate ? '<br><span style="color:#f87171">⚠ duplicate version</span>' : ""}
        `);
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", event.pageX + 12 + "px")
        .style("top", event.pageY - 10 + "px");
    })
    .on("mouseleave", () => {
      tooltip.style("display", "none");
    });
}

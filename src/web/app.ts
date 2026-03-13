import * as d3 from "d3";
import type { DependencyGraph, DependencyNode } from "../parsers/types";
import { renderForceLayout } from "./graph/force-layout";
import { renderTreeLayout } from "./graph/tree-layout";
import { renderRadialLayout } from "./graph/radial-layout";
import { renderSidebar, type GraphMode, type LayoutMode } from "./components/sidebar";
import { applySearchHighlight, highlightDuplicate } from "./components/search";

let currentMode: GraphMode = "full";
let currentLayout: LayoutMode = "force";
let currentGraph: DependencyGraph | null = null;
let currentMaxDepth = Infinity;

const sidebar = document.getElementById("sidebar")!;
const graphContainer = document.getElementById("graph-container")!;

async function fetchGraph(mode: GraphMode): Promise<DependencyGraph> {
  const res = await fetch(`/api/graph?mode=${mode}`);
  return res.json();
}

function filterByDepth(graph: DependencyGraph, maxDepth: number): DependencyGraph {
  if (maxDepth >= graph.stats.maxDepth) return graph;
  const nodes = graph.nodes.filter((n) => n.depth <= maxDepth);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  return { ...graph, nodes, edges };
}

function renderGraph(graph: DependencyGraph) {
  const filtered = filterByDepth(graph, currentMaxDepth);
  const svgEl = document.getElementById("graph-svg") as unknown as SVGSVGElement;
  const svg = d3.select<SVGSVGElement, unknown>(svgEl);
  const { width, height } = graphContainer.getBoundingClientRect();

  // Remove old tooltip
  d3.selectAll(".graph-tooltip").remove();

  const onNodeClick = (node: DependencyNode) => {
    console.log("Clicked:", node.name, node.version);
  };

  switch (currentLayout) {
    case "force":
      renderForceLayout(svg, filtered, width, height, onNodeClick);
      break;
    case "tree":
      renderTreeLayout(svg, filtered, width, height, onNodeClick);
      break;
    case "radial":
      renderRadialLayout(svg, filtered, width, height, onNodeClick);
      break;
  }
}

function updateSidebar() {
  if (!currentGraph) return;
  renderSidebar(sidebar, currentGraph, currentMode, currentLayout, {
    onModeChange: async (mode) => {
      currentMode = mode;
      currentGraph = await fetchGraph(mode);
      currentMaxDepth = currentGraph.stats.maxDepth;
      updateSidebar();
      renderGraph(currentGraph);
    },
    onLayoutChange: (layout) => {
      currentLayout = layout;
      updateSidebar();
      if (currentGraph) renderGraph(currentGraph);
    },
    onSearch: (query) => applySearchHighlight(query),
    onDepthChange: (depth) => {
      currentMaxDepth = depth;
      if (currentGraph) renderGraph(currentGraph);
    },
    onDuplicateClick: (name) => highlightDuplicate(name),
  });
}

async function init() {
  // Parse initial mode from URL
  const params = new URLSearchParams(window.location.search);
  currentMode = (params.get("mode") as GraphMode) ?? "full";

  // Create SVG
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "graph-svg";
  graphContainer.appendChild(svg);

  currentGraph = await fetchGraph(currentMode);
  currentMaxDepth = currentGraph.stats.maxDepth;
  updateSidebar();
  renderGraph(currentGraph);

  // Handle window resize
  window.addEventListener("resize", () => {
    if (currentGraph) renderGraph(currentGraph);
  });
}

init();

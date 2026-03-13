import * as d3 from "d3";
import type { DependencyNode, DependencyEdge, DependencyGraph } from "../../parsers/types";
import { createNodeElements, createTooltip, attachTooltip, EDGE_COLORS, EDGE_DASH } from "./renderer";

interface TreeNode {
  data: DependencyNode;
  children: TreeNode[];
}

function buildTree(graph: DependencyGraph): TreeNode {
  const root = graph.nodes.find((n) => n.id === graph.rootId)!;
  const childMap = new Map<string, DependencyEdge[]>();
  for (const edge of graph.edges) {
    const children = childMap.get(edge.source) ?? [];
    children.push(edge);
    childMap.set(edge.source, children);
  }

  const visited = new Set<string>();

  function build(node: DependencyNode): TreeNode {
    visited.add(node.id);
    const childEdges = childMap.get(node.id) ?? [];
    const children: TreeNode[] = [];
    for (const edge of childEdges) {
      if (visited.has(edge.target)) continue;
      const childNode = graph.nodes.find((n) => n.id === edge.target);
      if (childNode) children.push(build(childNode));
    }
    return { data: node, children };
  }

  return build(root);
}

export function renderTreeLayout(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  graph: DependencyGraph,
  width: number,
  height: number,
  onNodeClick?: (node: DependencyNode) => void
) {
  svg.selectAll("*").remove();

  const treeData = buildTree(graph);
  const hierarchy = d3.hierarchy<TreeNode>(treeData, (d) => d.children);
  const treeLayout = d3.tree<TreeNode>().size([width - 100, height - 100]);
  const treeRoot = treeLayout(hierarchy);

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => container.attr("transform", event.transform));

  svg.call(zoom);
  const container = svg.append("g").attr("transform", "translate(50, 50)");

  // Build edge type lookup
  const edgeTypeMap = new Map<string, DependencyEdge["type"]>();
  for (const edge of graph.edges) {
    edgeTypeMap.set(`${edge.source}-${edge.target}`, edge.type);
  }

  // Draw links
  container.append("g").attr("class", "links")
    .selectAll("path")
    .data(treeRoot.links())
    .join("path")
    .attr("fill", "none")
    .attr("stroke", (d) => {
      const key = `${d.source.data.data.id}-${d.target.data.data.id}`;
      const type = edgeTypeMap.get(key) ?? "dependency";
      return EDGE_COLORS[type];
    })
    .attr("stroke-dasharray", (d) => {
      const key = `${d.source.data.data.id}-${d.target.data.data.id}`;
      const type = edgeTypeMap.get(key) ?? "dependency";
      return EDGE_DASH[type];
    })
    .attr("stroke-width", 1.2)
    .attr("stroke-opacity", 0.5)
    .attr("d", d3.linkVertical<any, any>()
      .x((d: any) => d.x)
      .y((d: any) => d.y));

  // Draw nodes
  const nodeData = treeRoot.descendants().map((d) => ({
    ...d.data.data,
    _x: d.x,
    _y: d.y,
  }));

  const nodeGroup = container.append("g").attr("class", "nodes");
  const nodeElements = createNodeElements(nodeGroup, nodeData, onNodeClick);
  nodeElements.attr("transform", (d: any) => `translate(${d._x},${d._y})`);

  const tooltip = createTooltip();
  attachTooltip(nodeElements, tooltip, graph.edges);

  return { zoom };
}

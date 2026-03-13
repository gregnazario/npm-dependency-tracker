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

export function renderRadialLayout(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  graph: DependencyGraph,
  width: number,
  height: number,
  onNodeClick?: (node: DependencyNode) => void
) {
  svg.selectAll("*").remove();

  const treeData = buildTree(graph);
  const hierarchy = d3.hierarchy<TreeNode>(treeData, (d) => d.children);
  const radius = Math.min(width, height) / 2 - 80;
  const treeLayout = d3.tree<TreeNode>()
    .size([2 * Math.PI, radius])
    .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth);

  const treeRoot = treeLayout(hierarchy);

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => container.attr("transform", event.transform));

  svg.call(zoom);
  const container = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);

  const edgeTypeMap = new Map<string, DependencyEdge["type"]>();
  for (const edge of graph.edges) {
    edgeTypeMap.set(`${edge.source}-${edge.target}`, edge.type);
  }

  // Draw links as radial curves
  container.append("g").attr("class", "links")
    .selectAll("path")
    .data(treeRoot.links())
    .join("path")
    .attr("fill", "none")
    .attr("stroke", (d) => {
      const key = `${d.source.data.data.id}-${d.target.data.data.id}`;
      return EDGE_COLORS[edgeTypeMap.get(key) ?? "dependency"];
    })
    .attr("stroke-dasharray", (d) => {
      const key = `${d.source.data.data.id}-${d.target.data.data.id}`;
      return EDGE_DASH[edgeTypeMap.get(key) ?? "dependency"];
    })
    .attr("stroke-width", 1.2)
    .attr("stroke-opacity", 0.5)
    .attr("d", d3.linkRadial<any, any>()
      .angle((d: any) => d.x)
      .radius((d: any) => d.y));

  // Draw nodes
  const nodeData = treeRoot.descendants().map((d) => ({
    ...d.data.data,
    _x: d.y * Math.cos(d.x - Math.PI / 2),
    _y: d.y * Math.sin(d.x - Math.PI / 2),
  }));

  const nodeGroup = container.append("g").attr("class", "nodes");
  const nodeElements = createNodeElements(nodeGroup, nodeData, onNodeClick);
  nodeElements.attr("transform", (d: any) => `translate(${d._x},${d._y})`);

  const tooltip = createTooltip();
  attachTooltip(nodeElements, tooltip, graph.edges);

  return { zoom };
}

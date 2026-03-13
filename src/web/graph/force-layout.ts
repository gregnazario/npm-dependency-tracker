import * as d3 from "d3";
import type { DependencyNode, DependencyEdge, DependencyGraph } from "../../parsers/types";
import { createEdgeElements, createNodeElements, createTooltip, attachTooltip, nodeRadius } from "./renderer";

interface SimNode extends DependencyNode, d3.SimulationNodeDatum {}
interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  type: DependencyEdge["type"];
}

export function renderForceLayout(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  graph: DependencyGraph,
  width: number,
  height: number,
  onNodeClick?: (node: DependencyNode) => void
) {
  svg.selectAll("*").remove();

  const simNodes: SimNode[] = graph.nodes.map((n) => ({ ...n }));
  const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
  const simEdges: SimEdge[] = graph.edges
    .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
    .map((e) => ({ source: nodeMap.get(e.source)!, target: nodeMap.get(e.target)!, type: e.type }));

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => container.attr("transform", event.transform));

  svg.call(zoom);
  const container = svg.append("g");
  const edgeGroup = container.append("g").attr("class", "edges");
  const nodeGroup = container.append("g").attr("class", "nodes");

  const edgeElements = createEdgeElements(edgeGroup, simEdges as unknown as DependencyEdge[]);
  const nodeElements = createNodeElements(nodeGroup, simNodes, onNodeClick);

  const tooltip = createTooltip();
  attachTooltip(nodeElements, tooltip, graph.edges);

  const simulation = d3.forceSimulation<SimNode>(simNodes)
    .force("link", d3.forceLink<SimNode, SimEdge>(simEdges).id((d) => d.id).distance(60))
    .force("charge", d3.forceManyBody().strength(-200))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide<SimNode>().radius((d) => nodeRadius(d) + 4));

  simulation.on("tick", () => {
    edgeElements
      .attr("x1", (d: any) => d.source.x)
      .attr("y1", (d: any) => d.source.y)
      .attr("x2", (d: any) => d.target.x)
      .attr("y2", (d: any) => d.target.y);

    nodeElements.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
  });

  // Drag behavior
  const drag = d3.drag<SVGGElement, SimNode>()
    .on("start", (event, d) => {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on("drag", (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on("end", (event, d) => {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    });

  nodeElements.call(drag as any);

  return { simulation, zoom };
}

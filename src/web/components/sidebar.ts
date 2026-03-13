import type { DependencyGraph } from "../../parsers/types";

export type LayoutMode = "force" | "tree" | "radial";
export type GraphMode = "prod" | "full";

export interface SidebarCallbacks {
  onModeChange: (mode: GraphMode) => void;
  onLayoutChange: (layout: LayoutMode) => void;
  onSearch: (query: string) => void;
  onDepthChange: (depth: number) => void;
  onDuplicateClick: (packageName: string) => void;
}

export function renderSidebar(
  container: HTMLElement,
  graph: DependencyGraph,
  currentMode: GraphMode,
  currentLayout: LayoutMode,
  callbacks: SidebarCallbacks
) {
  // Clear container using DOM methods
  while (container.firstChild) container.removeChild(container.firstChild);

  // Mode toggle
  const modeSection = el("div", "sidebar-section");
  const modeToggle = el("div", "toggle-group");
  for (const mode of ["prod", "full"] as GraphMode[]) {
    const btn = el("button", `toggle-btn ${mode === currentMode ? "active" : ""}`);
    btn.textContent = mode === "prod" ? "Prod" : "Full";
    btn.onclick = () => callbacks.onModeChange(mode);
    modeToggle.appendChild(btn);
  }
  modeSection.appendChild(modeToggle);
  container.appendChild(modeSection);

  // Search
  const searchSection = el("div", "sidebar-section");
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search packages...";
  searchInput.className = "search-input";
  searchInput.oninput = () => callbacks.onSearch(searchInput.value);
  searchSection.appendChild(searchInput);
  container.appendChild(searchSection);

  // Layout toggle
  const layoutSection = el("div", "sidebar-section");
  const layoutToggle = el("div", "toggle-group toggle-group-small");
  for (const layout of ["force", "tree", "radial"] as LayoutMode[]) {
    const btn = el("button", `toggle-btn ${layout === currentLayout ? "active" : ""}`);
    btn.textContent = layout.charAt(0).toUpperCase() + layout.slice(1);
    btn.onclick = () => callbacks.onLayoutChange(layout);
    layoutToggle.appendChild(btn);
  }
  layoutSection.appendChild(layoutToggle);
  container.appendChild(layoutSection);

  // Stats
  const statsSection = el("div", "sidebar-section stats");
  const stats = graph.stats;
  const statItems: Array<[string, number]> = [
    ["Packages", stats.totalPackages],
    ["Direct deps", stats.directDeps],
    ["Dev deps", stats.devDeps],
    ["Peer deps", stats.peerDeps],
    ["Optional deps", stats.optionalDeps],
    ["Max depth", stats.maxDepth],
  ];
  for (const [label, value] of statItems) {
    const row = el("div", "stat-row");
    const labelSpan = el("span", "stat-label");
    labelSpan.textContent = label;
    const valueSpan = el("span", "stat-value");
    valueSpan.textContent = String(value);
    row.appendChild(labelSpan);
    row.appendChild(valueSpan);
    statsSection.appendChild(row);
  }
  container.appendChild(statsSection);

  // Legend
  const legendSection = el("div", "sidebar-section");
  const legendTitle = el("div", "section-title");
  legendTitle.textContent = "Edge Types";
  legendSection.appendChild(legendTitle);
  const legendItems = [
    { label: "dependency", color: "#818cf8", dash: "" },
    { label: "devDependency", color: "#f472b6", dash: "6 3" },
    { label: "peerDependency", color: "#34d399", dash: "3 5" },
    { label: "optionalDependency", color: "#fbbf24", dash: "2 3" },
  ];
  for (const item of legendItems) {
    const row = el("div", "legend-row");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "2");
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", "0"); line.setAttribute("y1", "1");
    line.setAttribute("x2", "24"); line.setAttribute("y2", "1");
    line.setAttribute("stroke", item.color);
    line.setAttribute("stroke-width", "2");
    if (item.dash) line.setAttribute("stroke-dasharray", item.dash);
    svg.appendChild(line);
    row.appendChild(svg);
    const labelSpan = el("span", "legend-label");
    labelSpan.textContent = item.label;
    row.appendChild(labelSpan);
    legendSection.appendChild(row);
  }
  container.appendChild(legendSection);

  // Depth slider
  const depthSection = el("div", "sidebar-section");
  const depthLabel = el("div", "section-title");
  depthLabel.textContent = `Depth: ${stats.maxDepth}`;
  depthSection.appendChild(depthLabel);
  const depthSlider = document.createElement("input");
  depthSlider.type = "range";
  depthSlider.min = "1";
  depthSlider.max = String(stats.maxDepth);
  depthSlider.value = String(stats.maxDepth);
  depthSlider.className = "depth-slider";
  depthSlider.oninput = () => {
    depthLabel.textContent = `Depth: ${depthSlider.value}`;
    callbacks.onDepthChange(parseInt(depthSlider.value, 10));
  };
  depthSection.appendChild(depthSlider);
  container.appendChild(depthSection);

  // Duplicates panel
  const dupes = getDuplicates(graph);
  if (dupes.length > 0) {
    const dupeSection = el("div", "sidebar-section duplicates-section");
    const dupeTitle = el("div", "section-title");
    dupeTitle.textContent = "Duplicates ";
    const badge = el("span", "badge");
    badge.textContent = String(dupes.length);
    dupeTitle.appendChild(badge);
    dupeSection.appendChild(dupeTitle);

    for (const dupe of dupes) {
      const card = el("div", "dupe-card");
      const nameDiv = el("div", "dupe-name");
      nameDiv.textContent = dupe.name;
      const versionsDiv = el("div", "dupe-versions");
      versionsDiv.textContent = dupe.versions.join(", ");
      card.appendChild(nameDiv);
      card.appendChild(versionsDiv);
      card.onclick = () => callbacks.onDuplicateClick(dupe.name);
      dupeSection.appendChild(card);
    }
    container.appendChild(dupeSection);
  }
}

function getDuplicates(graph: DependencyGraph): Array<{ name: string; versions: string[] }> {
  const versionMap = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    if (node.depth === 0) continue;
    const versions = versionMap.get(node.name) ?? new Set();
    versions.add(node.version);
    versionMap.set(node.name, versions);
  }
  return Array.from(versionMap.entries())
    .filter(([, versions]) => versions.size > 1)
    .map(([name, versions]) => ({ name, versions: Array.from(versions).sort() }));
}

function el(tag: string, className: string): HTMLElement {
  const elem = document.createElement(tag);
  elem.className = className;
  return elem;
}

export interface DependencyNode {
  id: string;
  name: string;
  version: string;
  depth: number;
  isDuplicate: boolean;
  dependentCount: number;
}

export interface DependencyEdge {
  source: string;
  target: string;
  type: "dependency" | "devDependency" | "peerDependency" | "optionalDependency";
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  rootId: string;
  stats: {
    totalPackages: number;
    directDeps: number;
    devDeps: number;
    peerDeps: number;
    optionalDeps: number;
    maxDepth: number;
    duplicateCount: number;
  };
}

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

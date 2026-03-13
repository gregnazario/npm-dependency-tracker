import { existsSync } from "fs";
import { join } from "path";
import type { PackageManager } from "./types";

const LOCKFILE_PRIORITY: Array<{ files: string[]; pm: PackageManager }> = [
  { files: ["bun.lockb", "bun.lock"], pm: "bun" },
  { files: ["pnpm-lock.yaml"], pm: "pnpm" },
  { files: ["yarn.lock"], pm: "yarn" },
  { files: ["package-lock.json"], pm: "npm" },
];

export function detectPackageManager(projectPath: string): PackageManager | null {
  if (!existsSync(join(projectPath, "package.json"))) {
    throw new Error(`No package.json found in ${projectPath}`);
  }

  for (const { files, pm } of LOCKFILE_PRIORITY) {
    if (files.some((f) => existsSync(join(projectPath, f)))) {
      return pm;
    }
  }

  return null;
}

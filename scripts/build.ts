import { copyFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const DIST_WEB = join(ROOT, "dist/web");

// Ensure output directory exists
if (!existsSync(DIST_WEB)) {
  mkdirSync(DIST_WEB, { recursive: true });
}

// Bundle TypeScript web app with D3 included
const result = await Bun.build({
  entrypoints: [join(ROOT, "src/web/app.ts")],
  outdir: DIST_WEB,
  bundle: true,
  minify: true,
  target: "browser",
  format: "esm",
});

if (!result.success) {
  console.error("Build failed:", result.logs);
  process.exit(1);
}

// Copy static assets
copyFileSync(join(ROOT, "src/web/index.html"), join(DIST_WEB, "index.html"));
copyFileSync(join(ROOT, "src/web/styles.css"), join(DIST_WEB, "styles.css"));

console.log("Build complete → dist/web/");

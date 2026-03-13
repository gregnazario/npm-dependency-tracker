#!/usr/bin/env bun
import { resolve } from "path";
import { startServer } from "../server/index";

function printHelp() {
  console.log(`
dep-tracker [path] [options]

Arguments:
  path          Path to project directory (default: current directory)

Options:
  --mode, -m    Display mode: "prod" or "full" (default: "full")
  --port, -p    Server port (default: random available port)
  --no-open     Don't auto-open the browser
  --help, -h    Show help
  --version, -v Show version
`);
}

function parseArgs(args: string[]) {
  const opts = { path: ".", mode: "full", port: 0, open: true, help: false, version: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") { opts.help = true; }
    else if (arg === "--version" || arg === "-v") { opts.version = true; }
    else if (arg === "--no-open") { opts.open = false; }
    else if ((arg === "--mode" || arg === "-m") && args[i + 1]) { opts.mode = args[++i]; }
    else if ((arg === "--port" || arg === "-p") && args[i + 1]) { opts.port = parseInt(args[++i], 10); }
    else if (!arg.startsWith("-")) { opts.path = arg; }
  }

  return opts;
}

async function main() {
  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  if (opts.help) { printHelp(); process.exit(0); }
  if (opts.version) {
    const pkg = await Bun.file(resolve(import.meta.dir, "../../package.json")).json();
    console.log(pkg.version);
    process.exit(0);
  }

  const projectPath = resolve(opts.path);
  console.log(`Analyzing dependencies in ${projectPath}...`);

  try {
    const { server } = await startServer(projectPath, opts.port);
    const url = `http://localhost:${server.port}`;
    console.log(`Server running at ${url}`);
    console.log(`Mode: ${opts.mode} (switch in the UI)`);

    if (opts.open) {
      const cmd = process.platform === "darwin" ? "open" : "xdg-open";
      Bun.spawn([cmd, `${url}?mode=${opts.mode}`]);
    }

    console.log("Press Ctrl+C to stop");
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();

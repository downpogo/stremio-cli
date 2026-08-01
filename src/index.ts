#!/usr/bin/env node

import { spawn } from "node:child_process";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

function readSearchQuery(args: string[]): string | undefined {
  const index = args.indexOf("--search");
  if (index !== -1) return args[index + 1]?.trim();
  return args.find((arg) => arg.startsWith("--search="))?.slice("--search=".length).trim();
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log('Usage: stremio-cli --search "title"');
  process.exit(0);
}

const query = readSearchQuery(args);
if (!query) {
  console.error('Usage: stremio-cli --search "title"');
  process.exit(1);
}

const root = fileURLToPath(new URL("..", import.meta.url));
const cableDir = fileURLToPath(new URL("../cable", import.meta.url));
const runtimeDir = fileURLToPath(new URL(".", import.meta.url));
const runtimeExtension = extname(fileURLToPath(import.meta.url)).slice(1);
const television = spawn("tv", ["stremio-titles", "--cable-dir", cableDir, "--no-remote"], {
  stdio: "inherit",
  detached: true,
  env: {
    ...process.env,
    STREMIO_CLI_ROOT: root,
    STREMIO_CLI_RUNTIME_DIR: runtimeDir,
    STREMIO_CLI_RUNTIME_EXTENSION: runtimeExtension,
    STREMIO_CABLE_DIR: cableDir,
    STREMIO_QUERY: query,
    STREMIO_ROOT_PID: String(process.pid),
  },
});

let quitting = false;
process.on("SIGUSR1", () => {
  quitting = true;
  if (television.pid) {
    try {
      process.kill(-television.pid, "SIGTERM");
    } catch {
      // The Television process may already have exited.
    }
  }
});

await new Promise<void>((resolve) => {
  television.once("error", (error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error("Television is not installed. Install `tv` and try again.");
    } else {
      console.error(`Failed to start Television: ${error.message}`);
    }
    process.exitCode = 1;
    resolve();
  });
  television.once("close", () => {
    if (quitting) process.exitCode = 0;
    resolve();
  });
});

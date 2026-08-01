import { execFileSync } from "node:child_process";
import { chmodSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = fileURLToPath(new URL("../dist", import.meta.url));

rmSync(dist, { recursive: true, force: true });
execFileSync(
  "pnpm",
  ["exec", "tsc", "--noEmit", "false", "--outDir", "dist", "--rewriteRelativeImportExtensions"],
  { cwd: root, stdio: "inherit" },
);

for (const file of [
  "index.js",
  "tv.js",
  "quit.js",
  "commands/search.js",
  "commands/seasons.js",
  "commands/episodes.js",
  "commands/streams.js",
]) {
  chmodSync(fileURLToPath(new URL(`../dist/${file}`, import.meta.url)), 0o755);
}

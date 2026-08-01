#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const transition = process.argv[2];
const first = process.argv[3];
const second = process.argv[4];
const cableDir = process.env.STREMIO_CABLE_DIR;

if (!cableDir) throw new Error("STREMIO_CABLE_DIR is not set");

let channel: string;
let context: Record<string, string>;

if (transition === "title" && first && second === "movie") {
  channel = "stremio-streams";
  context = { STREMIO_MEDIA_TYPE: "movie", STREMIO_VIDEO_ID: first };
} else if (transition === "title" && first && second === "series") {
  channel = "stremio-seasons";
  context = { STREMIO_SERIES_ID: first };
} else if (transition === "season" && first && second) {
  channel = "stremio-episodes";
  context = { STREMIO_SERIES_ID: first, STREMIO_SEASON: second };
} else if (transition === "episode" && first) {
  channel = "stremio-streams";
  context = { STREMIO_MEDIA_TYPE: "series", STREMIO_VIDEO_ID: first };
} else {
  throw new Error("Invalid Television transition");
}

const result = spawnSync("tv", [channel, "--cable-dir", cableDir, "--no-remote"], {
  stdio: "inherit",
  env: { ...process.env, ...context },
});

if (result.error) throw result.error;

if (channel === "stremio-streams" && result.status === 0) {
  const rootPid = Number(process.env.STREMIO_ROOT_PID);
  if (!Number.isInteger(rootPid) || rootPid <= 0) {
    throw new Error("STREMIO_ROOT_PID is not set");
  }
  process.kill(rootPid, "SIGUSR1");
}

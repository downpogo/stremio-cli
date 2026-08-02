#!/usr/bin/env node

import { spawn } from "node:child_process";
import { writeSync } from "node:fs";

const url = process.argv[2];
if (!url) throw new Error("Stream URL is required");

const command = process.env.STREMIO_STREAM_COMMAND?.trim();
if (command) {
  if (!command.includes("$")) {
    throw new Error("STREMIO_STREAM_COMMAND must contain a $ placeholder");
  }

  const child = spawn("/bin/sh", ["-c", command.replaceAll("$", '"$1"'), "stremio-stream", url], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
} else {
  writeSync(process.stdout.fd, `${url}\n`);

  const rootPid = Number(process.env.STREMIO_ROOT_PID);
  if (!Number.isInteger(rootPid) || rootPid <= 0) {
    throw new Error("STREMIO_ROOT_PID is not set");
  }
  process.kill(rootPid, "SIGUSR1");
}

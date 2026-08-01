#!/usr/bin/env node

const rootPid = Number(process.env.STREMIO_ROOT_PID);
if (!Number.isInteger(rootPid) || rootPid <= 0) {
  throw new Error("STREMIO_ROOT_PID is not set");
}

process.kill(rootPid, "SIGUSR1");

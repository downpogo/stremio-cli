#!/usr/bin/env node

import { fetchStreams, oneLine, type MediaType } from "../stremio.ts";

const type = process.argv[2] as MediaType | undefined;
const id = process.argv[3];
if ((type !== "movie" && type !== "series") || !id) {
  throw new Error("Usage: stremio-streams <movie|series> <video-id>");
}

for (const stream of await fetchStreams(type, id)) {
  console.log(`${oneLine(stream.url)}\t${oneLine(stream.description)}`);
}

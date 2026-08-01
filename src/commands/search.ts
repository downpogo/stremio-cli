#!/usr/bin/env node

import { oneLine, search } from "../stremio.ts";

const query = process.argv.slice(2).join(" ").trim();
if (!query) throw new Error("Usage: stremio-search <query>");

for (const result of await search(query)) {
  console.log([result.id, result.type, oneLine(result.name), result.releaseInfo ?? ""].join("\t"));
}

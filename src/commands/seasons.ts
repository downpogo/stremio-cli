#!/usr/bin/env node

import { fetchEpisodes } from "../stremio.ts";

const id = process.argv[2];
if (!id) throw new Error("Usage: stremio-seasons <series-id>");

const episodes = await fetchEpisodes(id);
const seasons = [...new Set(episodes.map((episode) => episode.season))].sort((a, b) => a - b);
for (const season of seasons) {
  console.log(`${season}\tSeason ${season}`);
}

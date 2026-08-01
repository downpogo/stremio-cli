#!/usr/bin/env node

import { fetchEpisodes, oneLine } from "../stremio.ts";

const id = process.argv[2];
const season = Number(process.argv[3]);
if (!id || !Number.isInteger(season) || season < 1) {
  throw new Error("Usage: stremio-episodes <series-id> <season>");
}

const episodes = (await fetchEpisodes(id))
  .filter((episode) => episode.season === season)
  .sort((left, right) => left.episode - right.episode);

for (const episode of episodes) {
  const name = oneLine(episode.name ?? episode.title ?? `Episode ${episode.episode}`);
  const released = episode.released?.slice(0, 10) ?? "";
  console.log([episode.id, `E${episode.episode}: ${name}`, released].join("\t"));
}

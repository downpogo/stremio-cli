import { loadEnvFile } from "node:process";

import { cachedJson, cacheKey } from "./cache.ts";

const CINEMETA_URL = "https://v3-cinemeta.strem.io";
const RESULT_LIMIT = 10;
const STREAM_LIMIT = 30;
const SEARCH_CACHE_TTL = 12 * 60 * 60 * 1000;
const EPISODE_CACHE_TTL = 24 * 60 * 60 * 1000;
const MANIFEST_CACHE_TTL = 24 * 60 * 60 * 1000;
const STREAM_CACHE_TTL = 10 * 60 * 1000;

export type MediaType = "movie" | "series";

export interface SearchResult {
  id: string;
  name: string;
  type: MediaType;
  releaseInfo?: string;
}

export interface Episode {
  id: string;
  name?: string;
  title?: string;
  season: number;
  episode: number;
  released?: string;
}

export interface PlayableStream {
  description: string;
  url: string;
}

interface CatalogResponse {
  metas?: SearchResult[];
}

interface MetaResponse {
  meta?: {
    videos?: Episode[];
  };
}

interface ResourceDefinition {
  name: string;
  types?: MediaType[];
  idPrefixes?: string[];
}

interface AddonManifest {
  name?: string;
  types?: MediaType[];
  resources?: Array<string | ResourceDefinition>;
}

interface Addon {
  name: string;
  manifestUrl: string;
  manifest: AddonManifest;
}

interface Stream {
  name?: string;
  title?: string;
  description?: string;
  url?: string;
  externalUrl?: string;
  ytId?: string;
  infoHash?: string;
}

interface StreamResponse {
  streams?: Stream[];
}

async function searchCatalog(query: string, type: MediaType): Promise<SearchResult[]> {
  const normalizedQuery = query.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return cachedJson(
    `search:${type}:${cacheKey(normalizedQuery)}`,
    SEARCH_CACHE_TTL,
    async () => {
      const url = `${CINEMETA_URL}/catalog/${type}/top/search=${encodeURIComponent(query)}.json`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Cinemeta returned ${response.status} for ${type} search`);
      }

      const body = (await response.json()) as CatalogResponse;
      return Array.isArray(body.metas) ? body.metas : [];
    },
    { staleIfError: true, shouldCache: (results) => results.length > 0 },
  );
}

export async function search(query: string): Promise<SearchResult[]> {
  const [series, movies] = await Promise.all([
    searchCatalog(query, "series"),
    searchCatalog(query, "movie"),
  ]);
  const normalizedQuery = query.toLocaleLowerCase();

  return [...series, ...movies]
    .map((result, index) => ({
      result,
      index,
      exact: result.name.toLocaleLowerCase() === normalizedQuery,
    }))
    .sort((left, right) => Number(right.exact) - Number(left.exact) || left.index - right.index)
    .slice(0, RESULT_LIMIT)
    .map(({ result }) => result);
}

export async function fetchEpisodes(id: string): Promise<Episode[]> {
  return cachedJson(
    `episodes:${cacheKey(id)}`,
    EPISODE_CACHE_TTL,
    async () => {
      const response = await fetch(`${CINEMETA_URL}/meta/series/${encodeURIComponent(id)}.json`);
      if (!response.ok) {
        throw new Error(`Cinemeta returned ${response.status} while loading episodes`);
      }

      const body = (await response.json()) as MetaResponse;
      return (body.meta?.videos ?? []).filter(
        (video) =>
          typeof video.id === "string" &&
          typeof video.season === "number" &&
          video.season > 0 &&
          typeof video.episode === "number",
      );
    },
    { staleIfError: true, shouldCache: (episodes) => episodes.length > 0 },
  );
}

function loadAddonUrls(): string[] {
  try {
    loadEnvFile();
  } catch (error: unknown) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code !== "ENOENT") throw error;
  }

  return (process.env.STREMIO_ADDONS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

async function loadAddons(): Promise<Addon[]> {
  const manifestUrls = loadAddonUrls();
  if (manifestUrls.length === 0) {
    throw new Error("No addons configured. Set STREMIO_ADDONS in .env.");
  }

  const addons = await Promise.all(
    manifestUrls.map(async (manifestUrl): Promise<Addon | undefined> => {
      try {
        const parsedUrl = new URL(manifestUrl);
        if (!parsedUrl.pathname.endsWith("/manifest.json")) {
          throw new Error("URL must end with /manifest.json");
        }

        const manifest = await cachedJson(
          `manifest:${cacheKey(manifestUrl)}`,
          MANIFEST_CACHE_TTL,
          async () => {
            const response = await fetch(parsedUrl);
            if (!response.ok) throw new Error(`manifest returned ${response.status}`);
            return (await response.json()) as AddonManifest;
          },
          { staleIfError: true },
        );
        return { name: manifest.name ?? parsedUrl.hostname, manifestUrl, manifest };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Skipping addon: ${message}`);
        return undefined;
      }
    }),
  );

  return addons.filter((addon): addon is Addon => addon !== undefined);
}

function addonSupports(addon: Addon, type: MediaType, id: string): boolean {
  return (addon.manifest.resources ?? []).some((resource) => {
    if (addon.manifest.types && !addon.manifest.types.includes(type)) return false;
    if (resource === "stream") return true;
    if (typeof resource === "string" || resource.name !== "stream") return false;
    return (
      (!resource.types || resource.types.includes(type)) &&
      (!resource.idPrefixes || resource.idPrefixes.some((prefix) => id.startsWith(prefix)))
    );
  });
}

function streamUrl(manifestUrl: string, type: MediaType, id: string): URL {
  const url = new URL(manifestUrl);
  url.pathname = url.pathname.replace(
    /\/manifest\.json$/,
    `/stream/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`,
  );
  return url;
}

function playableUrl(stream: Stream): string | undefined {
  if (stream.url) return stream.url;
  if (stream.externalUrl) return stream.externalUrl;
  if (stream.ytId) return `https://www.youtube.com/watch?v=${stream.ytId}`;
  if (stream.infoHash) return `magnet:?xt=urn:btih:${stream.infoHash}`;
  return undefined;
}

export async function fetchStreams(type: MediaType, id: string): Promise<PlayableStream[]> {
  const addons = (await loadAddons()).filter((addon) => addonSupports(addon, type, id));
  const responses = await Promise.all(
    addons.map(async (addon) => {
      try {
        return await cachedJson(
          `streams:${cacheKey(addon.manifestUrl)}:${type}:${cacheKey(id)}`,
          STREAM_CACHE_TTL,
          async () => {
            const response = await fetch(streamUrl(addon.manifestUrl, type, id));
            if (!response.ok) throw new Error(`stream request returned ${response.status}`);
            const body = (await response.json()) as StreamResponse;
            return body.streams ?? [];
          },
          { shouldCache: (streams) => streams.length > 0 },
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Skipping ${addon.name}: ${message}`);
        return [];
      }
    }),
  );

  return responses
    .flat()
    .flatMap((stream) => {
      const url = playableUrl(stream);
      return url ? [{ description: stream.description ?? "No description", url }] : [];
    })
    .slice(0, STREAM_LIMIT);
}

export function oneLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

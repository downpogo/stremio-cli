import { createHash } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

const MAX_STALE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  value: string;
  expires_at: number;
}

interface CacheOptions<T> {
  staleIfError?: boolean;
  shouldCache?: (value: T) => boolean;
}

let databasePromise: Promise<DatabaseSync | undefined> | undefined;

async function openDatabase(): Promise<DatabaseSync | undefined> {
  if (databasePromise) return databasePromise;

  databasePromise = (async () => {
    let openedDatabase: DatabaseSync | undefined;
    try {
      const configuredCacheRoot = process.env.XDG_CACHE_HOME?.trim();
      const cacheRoot =
        configuredCacheRoot && isAbsolute(configuredCacheRoot)
          ? configuredCacheRoot
          : join(homedir(), ".cache");
      const cacheDirectory = join(cacheRoot, "stremio-cli");
      const databasePath = join(cacheDirectory, "cache.sqlite");
      mkdirSync(cacheDirectory, { recursive: true, mode: 0o700 });
      chmodSync(cacheDirectory, 0o700);

      const { DatabaseSync } = await import("node:sqlite");
      openedDatabase = new DatabaseSync(databasePath);
      chmodSync(databasePath, 0o600);
      openedDatabase.exec(`
        PRAGMA busy_timeout = 5000;
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS cache_entries (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          stale_until INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      openedDatabase
        .prepare("DELETE FROM cache_entries WHERE stale_until < ?")
        .run(Date.now());
      return openedDatabase;
    } catch {
      openedDatabase?.close();
      return undefined;
    }
  })();
  return databasePromise;
}

async function readEntry<T>(key: string): Promise<{ value: T; expiresAt: number } | undefined> {
  try {
    const db = await openDatabase();
    if (!db) return undefined;
    const entry = db
      .prepare("SELECT value, expires_at FROM cache_entries WHERE key = ?")
      .get(key) as unknown as CacheEntry | undefined;
    if (!entry) return undefined;

    try {
      return { value: JSON.parse(entry.value) as T, expiresAt: entry.expires_at };
    } catch {
      db.prepare("DELETE FROM cache_entries WHERE key = ?").run(key);
      return undefined;
    }
  } catch {
    return undefined;
  }
}

async function writeEntry<T>(
  key: string,
  value: T,
  ttlMs: number,
  retainStale: boolean,
): Promise<void> {
  try {
    const now = Date.now();
    const expiresAt = now + ttlMs;
    const db = await openDatabase();
    if (!db) return;
    db
      .prepare(
        `INSERT INTO cache_entries (key, value, expires_at, stale_until, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           expires_at = excluded.expires_at,
           stale_until = excluded.stale_until,
           updated_at = excluded.updated_at`,
      )
      .run(
        key,
        JSON.stringify(value),
        expiresAt,
        retainStale ? expiresAt + MAX_STALE_AGE_MS : expiresAt,
        now,
      );
  } catch {
    // Caching must not prevent a successful network response from being used.
  }
}

export async function cachedJson<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  options: CacheOptions<T> = {},
): Promise<T> {
  const entry = await readEntry<T>(key);
  if (entry && entry.expiresAt > Date.now()) return entry.value;

  try {
    const value = await load();
    if (options.shouldCache?.(value) ?? true) {
      await writeEntry(key, value, ttlMs, options.staleIfError ?? false);
    }
    return value;
  } catch (error) {
    if (options.staleIfError && entry) return entry.value;
    throw error;
  }
}

export function cacheKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

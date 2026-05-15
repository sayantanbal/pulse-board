import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LRUCache } from "lru-cache";
import maxmind, { type CityResponse, type Reader } from "maxmind";
import { env } from "../config/env.js";
import { maskIpAddress } from "../lib/ipMasker.js";

export type GeolocationResult = {
  country: string | null;
  region: string | null;
  city: string | null;
};

const LOOKUP_TIMEOUT_MS = 100;
const CACHE_MAX = 10_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const defaultDbPath = path.join(backendRoot, "data", "GeoLite2-City.mmdb");

type CacheEntry = GeolocationResult;

const cache = new LRUCache<string, CacheEntry>({
  max: CACHE_MAX,
  ttl: CACHE_TTL_MS,
});

let reader: Reader<CityResponse> | null = null;
let readerInit: Promise<Reader<CityResponse> | null> | null = null;
let warnedMissingDb = false;

function getDbPath(): string {
  return env.MAXMIND_DB_PATH ?? defaultDbPath;
}

async function getReader(): Promise<Reader<CityResponse> | null> {
  if (reader) {
    return reader;
  }
  if (readerInit) {
    return readerInit;
  }

  readerInit = (async () => {
    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) {
      if (!warnedMissingDb) {
        console.warn(
          `MaxMind database not found at ${dbPath}; geolocation lookups disabled`,
        );
        warnedMissingDb = true;
      }
      return null;
    }

    try {
      reader = await maxmind.open<CityResponse>(dbPath);
      return reader;
    } catch (err) {
      console.warn("Failed to load MaxMind database:", err);
      return null;
    }
  })();

  return readerInit;
}

function normalizeIp(ipAddress: string): string {
  const trimmed = ipAddress.trim();
  const mapped = trimmed.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return mapped?.[1] ?? trimmed;
}

function isPrivateOrReservedIp(ipAddress: string): boolean {
  const ip = normalizeIp(ipAddress);

  if (ip === "::1" || ip === "127.0.0.1" || ip === "0.0.0.0") {
    return true;
  }

  if (/^10\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  if (/^127\./.test(ip)) return true;
  if (/^(22[4-9]|23\d)\./.test(ip)) return true;

  const lower = ip.toLowerCase();
  if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) {
    return true;
  }

  return false;
}

function mapCityResponse(result: CityResponse | null): GeolocationResult {
  if (!result) {
    return { country: null, region: null, city: null };
  }

  const country =
    result.country?.iso_code?.toUpperCase() ??
    result.registered_country?.iso_code?.toUpperCase() ??
    null;

  const region = result.subdivisions?.[0]?.names?.en ?? null;

  const city = result.city?.names?.en ?? null;

  return { country, region, city };
}

function lookupSync(ipAddress: string): GeolocationResult {
  if (!reader) {
    return { country: null, region: null, city: null };
  }

  try {
    const result = reader.get(normalizeIp(ipAddress));
    return mapCityResponse(result ?? null);
  } catch (err) {
    console.warn(
      `Geolocation lookup failed for ${maskIpAddress(ipAddress)}:`,
      err,
    );
    return { country: null, region: null, city: null };
  }
}

export async function lookup(ipAddress: string): Promise<GeolocationResult> {
  const ip = normalizeIp(ipAddress);

  if (!ip || isPrivateOrReservedIp(ip)) {
    if (ip && process.env.NODE_ENV === "development") {
      console.info(
        `Geolocation skipped for private/reserved IP ${maskIpAddress(ipAddress)} (expected on localhost/LAN dev)`,
      );
    }
    return { country: null, region: null, city: null };
  }

  const cached = cache.get(ip);
  if (cached) {
    return cached;
  }

  const dbReader = await getReader();
  if (!dbReader) {
    return { country: null, region: null, city: null };
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<GeolocationResult>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(
        `Geolocation lookup timed out for ${maskIpAddress(ip)}`,
      );
      resolve({ country: null, region: null, city: null });
    }, LOOKUP_TIMEOUT_MS);
  });

  const lookupPromise = Promise.resolve().then(() => {
    const result = lookupSync(ip);
    cache.set(ip, result);
    return result;
  });

  try {
    return await Promise.race([lookupPromise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function clearCache(): void {
  cache.clear();
}

/** Reset reader state (for tests). */
export function resetGeolocatorForTests(): void {
  reader = null;
  readerInit = null;
  warnedMissingDb = false;
  clearCache();
}

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_SAFE_ROUTE_PREFERENCES,
  normalizeSafeRoutePreferences,
  type SafeRouteRoutePreferences,
} from "./routePreferences";

const STORAGE_KEY_PREFIX = "saferoute.route-preferences.v1";
const STORAGE_VERSION = 1;

type StoredRoutePreferences = {
  preferences: SafeRouteRoutePreferences;
  scopeId: string;
  updatedAtMs: number;
  version: typeof STORAGE_VERSION;
};

const pendingWrites = new Map<string, Promise<SafeRouteRoutePreferences>>();

export const routePreferencesStore = {
  async load(scopeIdValue: string): Promise<SafeRouteRoutePreferences> {
    const { key, scopeId } = storageIdentity(scopeIdValue);
    await pendingWrites.get(key)?.catch(() => undefined);
    try {
      const raw = await AsyncStorage.getItem(key);
      return (
        parseStoredRoutePreferences(raw, scopeId) ||
        { ...DEFAULT_SAFE_ROUTE_PREFERENCES }
      );
    } catch {
      return { ...DEFAULT_SAFE_ROUTE_PREFERENCES };
    }
  },

  async save(
    scopeIdValue: string,
    preferencesValue: SafeRouteRoutePreferences,
  ): Promise<SafeRouteRoutePreferences> {
    const { key, scopeId } = storageIdentity(scopeIdValue);
    const preferences = normalizeSafeRoutePreferences(preferencesValue);
    const previous = pendingWrites.get(key) || Promise.resolve(preferences);
    const next = previous.catch(() => preferences).then(async () => {
      const record: StoredRoutePreferences = {
        preferences,
        scopeId,
        updatedAtMs: Date.now(),
        version: STORAGE_VERSION,
      };
      const serialized = JSON.stringify(record);
      await AsyncStorage.setItem(key, serialized);
      const readback = await AsyncStorage.getItem(key);
      const verified = parseStoredRoutePreferences(readback, scopeId, null);
      if (!verified) {
        throw new Error("Route preferences write could not be verified");
      }
      return verified;
    });
    pendingWrites.set(key, next);
    try {
      return await next;
    } finally {
      if (pendingWrites.get(key) === next) {
        pendingWrites.delete(key);
      }
    }
  },
};

export function parseStoredRoutePreferences(
  raw: string | null,
  expectedScopeId: string,
  fallback: SafeRouteRoutePreferences | null = DEFAULT_SAFE_ROUTE_PREFERENCES,
): SafeRouteRoutePreferences | null {
  if (!raw || raw.length > 4096) {
    return fallback ? { ...fallback } : null;
  }
  try {
    const value = JSON.parse(raw) as Partial<StoredRoutePreferences>;
    if (
      value.version !== STORAGE_VERSION ||
      value.scopeId !== expectedScopeId ||
      !Number.isFinite(value.updatedAtMs) ||
      Number(value.updatedAtMs) <= 0 ||
      !value.preferences ||
      typeof value.preferences !== "object"
    ) {
      return fallback ? { ...fallback } : null;
    }
    const fields = Object.values(value.preferences);
    if (
      fields.length !== 4 ||
      fields.some((field) => typeof field !== "boolean")
    ) {
      return fallback ? { ...fallback } : null;
    }
    return normalizeSafeRoutePreferences(value.preferences);
  } catch {
    return fallback ? { ...fallback } : null;
  }
}

function storageIdentity(scopeIdValue: string) {
  const scopeId = String(scopeIdValue || "").trim().slice(0, 160) || "guest";
  return {
    key: `${STORAGE_KEY_PREFIX}.${encodeURIComponent(scopeId)}`,
    scopeId,
  };
}

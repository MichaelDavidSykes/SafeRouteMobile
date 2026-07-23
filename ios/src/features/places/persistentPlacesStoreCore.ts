import {
  clearPersistentPlaceSlot,
  clearPersistentRecentDestinations,
  createEmptyPersistentPlacesRecord,
  normalizePersistentPlacesScopeId,
  parsePersistentPlacesRecord,
  recordPersistentRecentDestination,
  removePersistentFavourite,
  removePersistentRecentDestination,
  savePersistentFavourite,
  setPersistentPlaceSlot,
  type PersistentPlaceInput,
  type PersistentPlaceSlot,
  type PersistentPlacesRecord,
} from "./persistentPlacesModel";

export const PERSISTENT_PLACES_STORAGE_KEY_PREFIX =
  "saferoute.places.v1";
export const PERSISTENT_PLACES_MAX_STORAGE_CHARACTERS = 64 * 1024;

export type PersistentPlacesStorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  removeItem: (key: string) => Promise<void>;
  setItem: (key: string, value: string) => Promise<void>;
};

export type PersistentPlacesStore = ReturnType<
  typeof createPersistentPlacesStore
>;

export function createPersistentPlacesStore(
  adapter: PersistentPlacesStorageAdapter,
  keyPrefix = PERSISTENT_PLACES_STORAGE_KEY_PREFIX,
) {
  const pendingMutations = new Map<string, Promise<unknown>>();

  const keyForScope = (scopeIdValue: string) => {
    const scopeId = requireScopeId(scopeIdValue);
    return {
      key: `${keyPrefix}.${encodeURIComponent(scopeId)}`,
      scopeId,
    };
  };

  const waitForPendingMutation = async (key: string) => {
    await pendingMutations.get(key)?.catch(() => undefined);
  };

  const enqueueMutation = async <Result>(
    key: string,
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    const previous = pendingMutations.get(key) || Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    pendingMutations.set(key, current);
    try {
      return await current;
    } finally {
      if (pendingMutations.get(key) === current) {
        pendingMutations.delete(key);
      }
    }
  };

  const readRecord = async (
    key: string,
    scopeId: string,
    nowMs: number,
    repairInvalid: boolean,
  ): Promise<PersistentPlacesRecord> => {
    const raw = await adapter.getItem(key);
    if (raw === null) {
      return createEmptyPersistentPlacesRecord(scopeId, nowMs);
    }
    const parsed =
      raw.length <= PERSISTENT_PLACES_MAX_STORAGE_CHARACTERS
        ? parseStoredRecord(raw, scopeId, nowMs)
        : null;
    if (parsed) {
      return parsed;
    }
    if (repairInvalid) {
      await adapter.removeItem(key);
    }
    return createEmptyPersistentPlacesRecord(scopeId, nowMs);
  };

  const persistRecord = async (
    key: string,
    record: PersistentPlacesRecord,
    nowMs: number,
  ): Promise<PersistentPlacesRecord> => {
    const serialized = JSON.stringify(record);
    if (serialized.length > PERSISTENT_PLACES_MAX_STORAGE_CHARACTERS) {
      throw new Error("Persistent places storage capacity was exceeded");
    }
    await adapter.setItem(key, serialized);
    const readback = await adapter.getItem(key);
    if (readback !== serialized) {
      throw new Error("Persistent places write could not be verified");
    }
    const parsed = parseStoredRecord(readback, record.scopeId, nowMs);
    if (!parsed) {
      throw new Error("Persistent places write produced an invalid record");
    }
    return parsed;
  };

  const mutate = async (
    scopeIdValue: string,
    mutation: (
      current: PersistentPlacesRecord,
    ) => PersistentPlacesRecord,
    nowMs: number,
  ) => {
    const { key, scopeId } = keyForScope(scopeIdValue);
    return enqueueMutation(key, async () => {
      const current = await readRecord(key, scopeId, nowMs, true);
      const next = mutation(current);
      if (next === current) {
        return current;
      }
      return persistRecord(key, next, nowMs);
    });
  };

  return {
    async load(
      scopeIdValue: string,
      nowMs = Date.now(),
    ): Promise<PersistentPlacesRecord> {
      const { key, scopeId } = keyForScope(scopeIdValue);
      await waitForPendingMutation(key);
      try {
        return await readRecord(key, scopeId, nowMs, true);
      } catch {
        return createEmptyPersistentPlacesRecord(scopeId, nowMs);
      }
    },

    setHome(
      scopeId: string,
      input: PersistentPlaceInput,
      nowMs = Date.now(),
    ) {
      return mutate(
        scopeId,
        (current) =>
          setPersistentPlaceSlot(current, "home", input, nowMs),
        nowMs,
      );
    },

    setWork(
      scopeId: string,
      input: PersistentPlaceInput,
      nowMs = Date.now(),
    ) {
      return mutate(
        scopeId,
        (current) =>
          setPersistentPlaceSlot(current, "work", input, nowMs),
        nowMs,
      );
    },

    clearSlot(
      scopeId: string,
      slot: PersistentPlaceSlot,
      nowMs = Date.now(),
    ) {
      return mutate(
        scopeId,
        (current) => clearPersistentPlaceSlot(current, slot, nowMs),
        nowMs,
      );
    },

    saveFavourite(
      scopeId: string,
      input: PersistentPlaceInput,
      nowMs = Date.now(),
    ) {
      return mutate(
        scopeId,
        (current) => savePersistentFavourite(current, input, nowMs),
        nowMs,
      );
    },

    removeFavourite(
      scopeId: string,
      favouriteId: string,
      nowMs = Date.now(),
    ) {
      return mutate(
        scopeId,
        (current) =>
          removePersistentFavourite(current, favouriteId, nowMs),
        nowMs,
      );
    },

    recordRecentDestination(
      scopeId: string,
      input: PersistentPlaceInput,
      nowMs = Date.now(),
    ) {
      return mutate(
        scopeId,
        (current) =>
          recordPersistentRecentDestination(current, input, nowMs),
        nowMs,
      );
    },

    removeRecentDestination(
      scopeId: string,
      recentId: string,
      nowMs = Date.now(),
    ) {
      return mutate(
        scopeId,
        (current) =>
          removePersistentRecentDestination(current, recentId, nowMs),
        nowMs,
      );
    },

    clearRecents(scopeId: string, nowMs = Date.now()) {
      return mutate(
        scopeId,
        (current) => clearPersistentRecentDestinations(current, nowMs),
        nowMs,
      );
    },

    async clear(scopeIdValue: string): Promise<void> {
      const { key } = keyForScope(scopeIdValue);
      await enqueueMutation(key, async () => {
        await adapter.removeItem(key);
        if ((await adapter.getItem(key)) !== null) {
          throw new Error("Persistent places clear could not be verified");
        }
      });
    },
  };
}

function parseStoredRecord(
  raw: string,
  scopeId: string,
  nowMs: number,
): PersistentPlacesRecord | null {
  try {
    return parsePersistentPlacesRecord(JSON.parse(raw), scopeId, nowMs);
  } catch {
    return null;
  }
}

function requireScopeId(scopeIdValue: string): string {
  const scopeId = normalizePersistentPlacesScopeId(scopeIdValue);
  if (!scopeId) {
    throw new Error("Persistent places scope is invalid");
  }
  return scopeId;
}

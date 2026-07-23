import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PERSISTENT_PLACES_STORAGE_KEY_PREFIX,
  createPersistentPlacesStore,
  type PersistentPlacesStorageAdapter,
} from "../src/features/places/persistentPlacesStoreCore";
import type { PersistentPlaceInput } from "../src/features/places/persistentPlacesModel";

const nowMs = Date.UTC(2026, 6, 23, 12, 0, 0);

function place(index: number): PersistentPlaceInput {
  return {
    coordinate: {
      latitude: 51.5 + index / 100,
      longitude: -0.1 - index / 100,
    },
    displayName: `Place ${index}, London`,
    label: `Place ${index}`,
    sourceId: `provider-${index}`,
  };
}

function createMemoryAdapter(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  let activeWrites = 0;
  let maximumConcurrentWrites = 0;
  let failReads = false;
  let ignoreWrites = false;
  const adapter: PersistentPlacesStorageAdapter = {
    getItem: async (key) => {
      if (failReads) {
        throw new Error("read failed");
      }
      return values.get(key) ?? null;
    },
    removeItem: async (key) => {
      values.delete(key);
    },
    setItem: async (key, value) => {
      activeWrites += 1;
      maximumConcurrentWrites = Math.max(
        maximumConcurrentWrites,
        activeWrites,
      );
      await Promise.resolve();
      if (!ignoreWrites) {
        values.set(key, value);
      }
      activeWrites -= 1;
    },
  };
  return {
    adapter,
    get maximumConcurrentWrites() {
      return maximumConcurrentWrites;
    },
    setFailReads(value: boolean) {
      failReads = value;
    },
    setIgnoreWrites(value: boolean) {
      ignoreWrites = value;
    },
    values,
  };
}

describe("persistent places store", () => {
  it("persists places across store instances while isolating owner scopes", async () => {
    const memory = createMemoryAdapter();
    const store = createPersistentPlacesStore(memory.adapter);

    await store.setHome("principal-a", place(1), nowMs + 1);
    await store.setWork("principal-a", place(2), nowMs + 2);
    await store.saveFavourite("principal-a", place(3), nowMs + 3);
    await store.recordRecentDestination(
      "principal-a",
      place(4),
      nowMs + 4,
    );
    await store.saveFavourite("principal-b", place(5), nowMs + 5);

    const relaunched = createPersistentPlacesStore(memory.adapter);
    const first = await relaunched.load("principal-a", nowMs + 6);
    const second = await relaunched.load("principal-b", nowMs + 6);

    assert.equal(first.home?.label, "Place 1");
    assert.equal(first.work?.label, "Place 2");
    assert.deepEqual(
      first.favourites.map((candidate) => candidate.label),
      ["Place 3"],
    );
    assert.deepEqual(
      first.recents.map((candidate) => candidate.label),
      ["Place 4"],
    );
    assert.deepEqual(
      second.favourites.map((candidate) => candidate.label),
      ["Place 5"],
    );
    assert.equal(second.home, null);
  });

  it("serializes concurrent mutations so no favourite or recent update is lost", async () => {
    const memory = createMemoryAdapter();
    const store = createPersistentPlacesStore(memory.adapter);

    await Promise.all([
      store.saveFavourite("guest", place(1), nowMs + 1),
      store.saveFavourite("guest", place(2), nowMs + 2),
      store.recordRecentDestination("guest", place(3), nowMs + 3),
      store.recordRecentDestination("guest", place(4), nowMs + 4),
    ]);

    const record = await store.load("guest", nowMs + 5);
    assert.deepEqual(
      new Set(record.favourites.map((candidate) => candidate.label)),
      new Set(["Place 1", "Place 2"]),
    );
    assert.deepEqual(
      new Set(record.recents.map((candidate) => candidate.label)),
      new Set(["Place 3", "Place 4"]),
    );
    assert.equal(memory.maximumConcurrentWrites, 1);
  });

  it("repairs corrupt scoped data without affecting another owner", async () => {
    const corruptKey = `${PERSISTENT_PLACES_STORAGE_KEY_PREFIX}.guest`;
    const otherKey = `${PERSISTENT_PLACES_STORAGE_KEY_PREFIX}.principal-b`;
    const memory = createMemoryAdapter({
      [corruptKey]: "{not-json",
      [otherKey]: "other-owner-data",
    });
    const store = createPersistentPlacesStore(memory.adapter);

    const record = await store.load("guest", nowMs);

    assert.deepEqual(record.favourites, []);
    assert.equal(memory.values.has(corruptKey), false);
    assert.equal(memory.values.get(otherKey), "other-owner-data");
  });

  it("does not claim a mutation succeeded when storage cannot verify it", async () => {
    const memory = createMemoryAdapter();
    const store = createPersistentPlacesStore(memory.adapter);
    memory.setIgnoreWrites(true);

    await assert.rejects(
      () => store.saveFavourite("guest", place(1), nowMs + 1),
      /could not be verified/,
    );

    memory.setIgnoreWrites(false);
    const record = await store.load("guest", nowMs + 2);
    assert.deepEqual(record.favourites, []);
  });

  it("contains read failures on load but refuses to overwrite unreadable data", async () => {
    const memory = createMemoryAdapter();
    const store = createPersistentPlacesStore(memory.adapter);
    await store.saveFavourite("guest", place(1), nowMs + 1);
    memory.setFailReads(true);

    const unavailable = await store.load("guest", nowMs + 2);
    assert.deepEqual(unavailable.favourites, []);
    await assert.rejects(
      () => store.saveFavourite("guest", place(2), nowMs + 3),
      /read failed/,
    );

    memory.setFailReads(false);
    const recovered = await store.load("guest", nowMs + 4);
    assert.deepEqual(
      recovered.favourites.map((candidate) => candidate.label),
      ["Place 1"],
    );
  });

  it("supports targeted removal, recent clearing, and verified scope clearing", async () => {
    const memory = createMemoryAdapter();
    const store = createPersistentPlacesStore(memory.adapter);
    let record = await store.saveFavourite("guest", place(1), nowMs + 1);
    record = await store.recordRecentDestination(
      "guest",
      place(2),
      nowMs + 2,
    );

    await store.removeFavourite(
      "guest",
      record.favourites[0]?.id || "",
      nowMs + 3,
    );
    await store.removeRecentDestination(
      "guest",
      record.recents[0]?.id || "",
      nowMs + 4,
    );
    await store.recordRecentDestination("guest", place(3), nowMs + 5);
    await store.clearRecents("guest", nowMs + 6);
    record = await store.load("guest", nowMs + 7);
    assert.deepEqual(record.favourites, []);
    assert.deepEqual(record.recents, []);

    await store.setHome("guest", place(4), nowMs + 8);
    await store.clear("guest");
    record = await store.load("guest", nowMs + 9);
    assert.equal(record.home, null);
  });
});

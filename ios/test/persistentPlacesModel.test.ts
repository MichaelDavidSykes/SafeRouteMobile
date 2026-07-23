import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PERSISTENT_PLACES_MAX_FAVOURITES,
  PERSISTENT_PLACES_MAX_RECENTS,
  clearPersistentPlaceSlot,
  clearPersistentRecentDestinations,
  createEmptyPersistentPlacesRecord,
  parsePersistentPlacesRecord,
  recordPersistentRecentDestination,
  removePersistentFavourite,
  removePersistentRecentDestination,
  savePersistentFavourite,
  setPersistentPlaceSlot,
  type PersistentPlaceInput,
} from "../src/features/places/persistentPlacesModel";

const nowMs = Date.UTC(2026, 6, 23, 12, 0, 0);

function place(index: number): PersistentPlaceInput {
  return {
    category: " point of interest ",
    coordinate: {
      latitude: 51.5 + index / 1000,
      longitude: -0.1 - index / 1000,
    },
    displayName: ` Place ${index}, London `,
    label: ` Place ${index} `,
    sourceId: `provider-${index}`,
  };
}

describe("persistent places model", () => {
  it("stores independent Home, Work, and favourite places with normalized provider data", () => {
    const empty = createEmptyPersistentPlacesRecord(" principal-a ", nowMs);
    const withHome = setPersistentPlaceSlot(
      empty,
      "home",
      place(1),
      nowMs + 1,
    );
    const withWork = setPersistentPlaceSlot(
      withHome,
      "work",
      place(2),
      nowMs + 2,
    );
    const saved = savePersistentFavourite(
      withWork,
      {
        ...place(3),
        coordinate: {
          latitude: 51.5031234567,
          longitude: -0.1037654321,
        },
      },
      nowMs + 3,
    );

    assert.equal(saved.scopeId, "principal-a");
    assert.equal(saved.home?.label, "Place 1");
    assert.equal(saved.work?.displayName, "Place 2, London");
    assert.equal(saved.favourites[0]?.id, "source:provider-3");
    assert.deepEqual(saved.favourites[0]?.coordinate, {
      latitude: 51.503123,
      longitude: -0.103765,
    });
    assert.equal(saved.favourites[0]?.category, "point of interest");
  });

  it("deduplicates recent destinations, increments use count, and keeps newest first", () => {
    let record = createEmptyPersistentPlacesRecord("guest", nowMs);
    record = recordPersistentRecentDestination(
      record,
      place(1),
      nowMs + 1,
    );
    record = recordPersistentRecentDestination(
      record,
      place(2),
      nowMs + 2,
    );
    record = recordPersistentRecentDestination(
      record,
      {
        ...place(9),
        coordinate: {
          latitude: place(1).coordinate.latitude + 0.000001,
          longitude: place(1).coordinate.longitude - 0.000001,
        },
        label: "Updated place 1",
      },
      nowMs + 3,
    );

    assert.equal(record.recents.length, 2);
    assert.equal(record.recents[0]?.label, "Updated place 1");
    assert.equal(record.recents[0]?.useCount, 2);
    assert.equal(record.recents[0]?.lastUsedAtMs, nowMs + 3);
    assert.equal(record.recents[1]?.label, "Place 2");
  });

  it("bounds favourites and recents without allowing duplicate locations", () => {
    let record = createEmptyPersistentPlacesRecord("guest", nowMs);
    for (let index = 0; index < PERSISTENT_PLACES_MAX_FAVOURITES + 5; index += 1) {
      record = savePersistentFavourite(record, place(index), nowMs + index + 1);
    }
    for (let index = 0; index < PERSISTENT_PLACES_MAX_RECENTS + 5; index += 1) {
      record = recordPersistentRecentDestination(
        record,
        place(index),
        nowMs + 100 + index,
      );
    }

    assert.equal(record.favourites.length, PERSISTENT_PLACES_MAX_FAVOURITES);
    assert.equal(record.recents.length, PERSISTENT_PLACES_MAX_RECENTS);
    assert.equal(record.favourites[0]?.label, "Place 44");
    assert.equal(record.recents[0]?.label, "Place 24");
  });

  it("removes exact records and leaves no-op removals referentially stable", () => {
    let record = createEmptyPersistentPlacesRecord("guest", nowMs);
    record = setPersistentPlaceSlot(record, "home", place(1), nowMs + 1);
    record = savePersistentFavourite(record, place(2), nowMs + 2);
    record = recordPersistentRecentDestination(
      record,
      place(3),
      nowMs + 3,
    );

    assert.strictEqual(
      removePersistentFavourite(record, "missing", nowMs + 4),
      record,
    );
    record = removePersistentFavourite(
      record,
      record.favourites[0]?.id || "",
      nowMs + 4,
    );
    record = removePersistentRecentDestination(
      record,
      record.recents[0]?.id || "",
      nowMs + 5,
    );
    record = clearPersistentPlaceSlot(record, "home", nowMs + 6);
    record = clearPersistentRecentDestinations(record, nowMs + 7);

    assert.equal(record.home, null);
    assert.deepEqual(record.favourites, []);
    assert.deepEqual(record.recents, []);
  });

  it("rejects cross-scope, future, malformed, and unsupported records", () => {
    const valid = savePersistentFavourite(
      createEmptyPersistentPlacesRecord("principal-a", nowMs),
      place(1),
      nowMs + 1,
    );

    assert.equal(
      parsePersistentPlacesRecord(valid, "principal-b", nowMs + 2),
      null,
    );
    assert.equal(
      parsePersistentPlacesRecord(
        { ...valid, schema: 2 },
        "principal-a",
        nowMs + 2,
      ),
      null,
    );
    assert.equal(
      parsePersistentPlacesRecord(
        { ...valid, storedAtMs: nowMs + 6 * 60 * 1000 },
        "principal-a",
        nowMs,
      ),
      null,
    );
    assert.equal(
      parsePersistentPlacesRecord(
        { ...valid, favourites: "not-an-array" },
        "principal-a",
        nowMs + 2,
      ),
      null,
    );
    assert.equal(
      parsePersistentPlacesRecord(
        { ...valid, home: { label: "Invalid" } },
        "principal-a",
        nowMs + 2,
      ),
      null,
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SAVED_ROUTE_PLANS } from "../src/features/live-map/demoRoute";
import {
  OFFLINE_OPERATIONS_CACHE_MAX_AGE_MS,
  OFFLINE_OPERATIONS_CACHE_MAX_BYTES,
  createOfflineOperationsCacheRecord,
  createOfflineOperationsRevocationRecord,
  parseOfflineOperationsCacheRecord,
  utf8ByteLength,
} from "../src/features/operations/offlineOperationsCacheCore";
import { loadPreviewOperationsState } from "../src/features/operations/previewOperationsApi";

const principalId = "principal-1";
const workspaceId = "preview-routes";
const nowMs = new Date("2026-07-18T09:00:00.000Z").getTime();

function createRecord() {
  const record = createOfflineOperationsCacheRecord(
    principalId,
    workspaceId,
    {
      operationsState: loadPreviewOperationsState(workspaceId),
      routes: SAVED_ROUTE_PLANS.map((route) => ({
        ...route,
        clientId: workspaceId,
      })),
    },
    nowMs,
  );
  assert.ok(record);
  return record;
}

describe("offline Operations calendar cache", () => {
  it("projects only a byte-bounded calendar allowlist for the exact identity and workspace", () => {
    const record = createRecord();
    const serialized = JSON.stringify(record);
    const snapshot = parseOfflineOperationsCacheRecord(
      record,
      principalId,
      workspaceId,
      nowMs,
    );

    assert.ok(snapshot);
    assert.ok(snapshot.entries.length > 0);
    assert.ok(utf8ByteLength(serialized) <= OFFLINE_OPERATIONS_CACHE_MAX_BYTES);
    assert.deepEqual(Object.keys(snapshot.entries[0]).sort(), [
      "destination",
      "durationMinutes",
      "id",
      "movementIso",
      "origin",
      "status",
      "title",
    ]);
    for (const forbidden of [
      "people",
      "vehicles",
      "person_ids",
      "vehicle_ids",
      "callsign",
      "contact",
      "notes",
      "vin",
      "registration",
      "route_assignments",
      "routeData",
      "geometry",
      "risk",
      "manifest",
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
  });

  it("fails closed for wrong scope, future timestamps, expiry, revocation, and added fields", () => {
    const record = createRecord();
    assert.equal(
      parseOfflineOperationsCacheRecord(
        record,
        "principal-2",
        workspaceId,
        nowMs,
      ),
      null,
    );
    assert.equal(
      parseOfflineOperationsCacheRecord(
        record,
        principalId,
        "workspace-2",
        nowMs,
      ),
      null,
    );
    assert.equal(
      parseOfflineOperationsCacheRecord(
        record,
        principalId,
        workspaceId,
        nowMs - 1,
      ),
      null,
    );
    assert.equal(
      parseOfflineOperationsCacheRecord(
        record,
        principalId,
        workspaceId,
        nowMs + OFFLINE_OPERATIONS_CACHE_MAX_AGE_MS,
      ),
      null,
    );
    assert.equal(
      parseOfflineOperationsCacheRecord(
        createOfflineOperationsRevocationRecord(principalId, workspaceId),
        principalId,
        workspaceId,
        nowMs,
      ),
      null,
    );

    const poisoned = structuredClone(record);
    Object.assign(poisoned.value.entries[0], { vehicle_ids: ["vehicle-1"] });
    assert.equal(
      parseOfflineOperationsCacheRecord(
        poisoned,
        principalId,
        workspaceId,
        nowMs,
      ),
      null,
    );

    assert.equal(
      parseOfflineOperationsCacheRecord(
        { ...record, manifest: { people: ["person-1"] } },
        principalId,
        workspaceId,
        nowMs,
      ),
      null,
    );
    assert.equal(
      parseOfflineOperationsCacheRecord(
        {
          ...record,
          value: {
            ...record.value,
            people: ["person-1"],
          },
        },
        principalId,
        workspaceId,
        nowMs,
      ),
      null,
    );
  });

  it("keeps contract-length assignment identifiers distinct", () => {
    const state = loadPreviewOperationsState(workspaceId);
    const template = state.trips[0];
    const tripId = "t".repeat(80);
    const routePrefix = "r".repeat(79);
    state.trips = [
      {
        ...template,
        id: tripId,
        movement_date: "2026-07-20T09:00:00.000Z",
        route_assignments: [
          {
            ...template.route_assignments[0],
            movement_date: "2026-07-20T09:00:00.000Z",
            route_id: `${routePrefix}a`,
          },
          {
            ...template.route_assignments[0],
            movement_date: "2026-07-20T10:00:00.000Z",
            route_id: `${routePrefix}b`,
          },
        ],
        route_ids: [`${routePrefix}a`, `${routePrefix}b`],
      },
    ];

    const record = createOfflineOperationsCacheRecord(
      principalId,
      workspaceId,
      { operationsState: state, routes: [] },
      nowMs,
    );
    assert.ok(record);
    assert.equal(record.value.entries.length, 2);
    assert.equal(new Set(record.value.entries.map((entry) => entry.id)).size, 2);
    assert.ok(record.value.entries.every((entry) => entry.id.length <= 96));
    assert.ok(
      parseOfflineOperationsCacheRecord(
        record,
        principalId,
        workspaceId,
        nowMs,
      ),
    );
  });

  it("preserves exact identity text and rejects oversized shared-prefix identities", () => {
    const record = createOfflineOperationsCacheRecord(
      "principal  one",
      workspaceId,
      {
        operationsState: loadPreviewOperationsState(workspaceId),
        routes: [],
      },
      nowMs,
    );
    assert.ok(record);
    assert.equal(record.principalId, "principal  one");
    assert.equal(
      parseOfflineOperationsCacheRecord(
        record,
        "principal one",
        workspaceId,
        nowMs,
      ),
      null,
    );

    const prefix = "p".repeat(256);
    assert.equal(
      createOfflineOperationsCacheRecord(
        `${prefix}a`,
        workspaceId,
        {
          operationsState: loadPreviewOperationsState(workspaceId),
          routes: [],
        },
        nowMs,
      ),
      null,
    );
    assert.equal(
      createOfflineOperationsCacheRecord(
        `${prefix}b`,
        workspaceId,
        {
          operationsState: loadPreviewOperationsState(workspaceId),
          routes: [],
        },
        nowMs,
      ),
      null,
    );
  });

  it("keeps current and upcoming movements ahead of old, completed, or distant entries", () => {
    const state = loadPreviewOperationsState(workspaceId);
    const template = state.trips[0];
    const createTrip = (
      id: string,
      movementDate: string,
      status: typeof template.status = "ready",
    ) => ({
      ...template,
      id,
      movement_date: movementDate,
      status,
      route_assignments: template.route_assignments.map((assignment) => ({
        ...assignment,
        movement_date: movementDate,
        status,
      })),
    });
    state.trips = [
      createTrip("old-trip", "2026-07-15T08:00:00.000Z"),
      createTrip("completed-trip", "2026-07-18T10:00:00.000Z", "completed"),
      createTrip("current-trip", "2026-07-17T12:00:00.000Z"),
      createTrip("upcoming-trip", "2026-07-20T09:00:00.000Z"),
      createTrip("distant-trip", "2027-07-20T09:00:00.000Z"),
    ];
    const record = createOfflineOperationsCacheRecord(
      principalId,
      workspaceId,
      {
        operationsState: state,
        routes: SAVED_ROUTE_PLANS.map((route) => ({
          ...route,
          clientId: workspaceId,
        })),
      },
      nowMs,
    );
    assert.ok(record);
    assert.deepEqual(
      record.value.entries.map((entry) => entry.movementIso),
      [
        "2026-07-17T12:00:00.000Z",
        "2026-07-20T09:00:00.000Z",
      ],
    );
  });

  it("sorts movements, discloses truncation, and rejects foreign projections", () => {
    const state = loadPreviewOperationsState(workspaceId);
    const template = state.trips[0];
    state.trips = Array.from({ length: 20 }, (_, index) => ({
      ...template,
      id: `trip-${index}`,
      movement_date: `2026-07-${String(20 + (index % 8)).padStart(2, "0")}T09:00:00.000Z`,
      route_assignments: template.route_assignments.map((assignment) => ({
        ...assignment,
        movement_date: `2026-07-${String(20 + (index % 8)).padStart(2, "0")}T09:00:00.000Z`,
      })),
    }));
    const record = createOfflineOperationsCacheRecord(
      principalId,
      workspaceId,
      {
        operationsState: state,
        routes: SAVED_ROUTE_PLANS.map((route) => ({
          ...route,
          clientId: workspaceId,
        })),
      },
      nowMs,
    );
    assert.ok(record);
    assert.equal(record.value.truncated, true);
    assert.ok(record.value.entries.length > 0);
    assert.ok(record.value.entries.length <= 8);
    assert.deepEqual(
      record.value.entries.map((entry) => entry.movementIso),
      [...record.value.entries]
        .map((entry) => entry.movementIso)
        .sort(),
    );

    state.client_id = "foreign-workspace";
    assert.equal(
      createOfflineOperationsCacheRecord(
        principalId,
        workspaceId,
        { operationsState: state, routes: [] },
        nowMs,
      ),
      null,
    );
  });
});

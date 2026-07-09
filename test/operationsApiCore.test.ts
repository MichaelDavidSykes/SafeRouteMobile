import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiSessionExpiredError } from "../src/features/api/apiClientCore";
import {
  buildOperationsStatePath,
  createEmptyOperationsState,
  loadOperationsState,
  normalizeOperationsState,
  type OperationsApiRequester
} from "../src/features/operations/operationsApiCore";

describe("SafeRoute operations API core", () => {
  it("builds encoded view-only operations paths scoped to a client", () => {
    assert.equal(
      buildOperationsStatePath(" client/alpha beta "),
      "/convoy-routes/operations/client/client%2Falpha%20beta"
    );
    assert.throws(() => buildOperationsStatePath("   "), /client id is required/i);
  });

  it("loads and normalizes SafeRoute operation manifests through an injected requester", async () => {
    const seenPaths: string[] = [];
    const request: OperationsApiRequester = async (path, accessToken) => {
      seenPaths.push(`${accessToken}:${path}`);
      return {
        client_id: " client-1 ",
        people: [
          { id: " person-1 ", name: " Driver One ", role: "driver", is_active: true },
          { id: "person-bad", name: "Inactive", role: "invalid", is_active: false }
        ],
        vehicles: [
          { id: " vehicle-1 ", callsign: " Lead 1 ", make: " BMW ", model: " X5 ", vehicle_type: "lead", protection_profile: "armored", seat_count: "4" }
        ],
        trips: [
          {
            id: " trip-1 ",
            name: " Morning move ",
            status: "ready",
            route_ids: [" route-1 ", "route-1"],
            vehicle_ids: [" vehicle-1 "],
            person_ids: [" person-1 "],
            route_assignments: [
              {
                route_id: " route-1 ",
                vehicle_ids: [" vehicle-1 "],
                person_ids: [" person-1 "],
                movement_date: "2026-07-09T09:30",
                duration_minutes: "90",
                status: "ready"
              }
            ]
          }
        ],
        updated_at: " 2026-07-09T08:00 "
      } as never;
    };

    const state = await loadOperationsState(request, " token-1 ", "client-1");

    assert.deepEqual(seenPaths, ["token-1:/convoy-routes/operations/client/client-1"]);
    assert.equal(state.client_id, "client-1");
    assert.equal(state.people[0].name, "Driver One");
    assert.equal(state.people[1].role, "other");
    assert.equal(state.vehicles[0].seat_count, 4);
    assert.equal(state.vehicles[0].protection_profile, "armored");
    assert.deepEqual(state.trips[0].route_ids, ["route-1"]);
    assert.equal(state.trips[0].route_assignments[0].movement_date, "2026-07-09T09:30");
  });

  it("requires a non-empty token before loading operations", async () => {
    let requested = false;
    const request: OperationsApiRequester = async () => {
      requested = true;
      return {} as never;
    };

    await assert.rejects(
      () => loadOperationsState(request, "   ", "client-1"),
      (error) => error instanceof ApiSessionExpiredError && /sign in again/i.test(error.message)
    );
    assert.equal(requested, false);
  });

  it("treats malformed operations payloads as an empty read-only state", () => {
    assert.deepEqual(normalizeOperationsState("maintenance", "client-1"), createEmptyOperationsState("client-1"));
  });
});

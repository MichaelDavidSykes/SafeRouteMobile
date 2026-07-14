import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SAVED_ROUTE_PLANS } from "../src/features/live-map/demoRoute";
import {
  loadPreviewOperationsState,
  PREVIEW_OPERATIONS_CLIENT_ID,
  PREVIEW_OPERATIONS_WEST_CLIENT_ID
} from "../src/features/operations/previewOperationsApi";

describe("SafeRoute preview operations API", () => {
  it("serves local trip, calendar, vehicle, and people manifests for preview-mode UI checks", () => {
    const state = loadPreviewOperationsState(PREVIEW_OPERATIONS_CLIENT_ID);

    assert.equal(state.client_id, PREVIEW_OPERATIONS_CLIENT_ID);
    assert.equal(state.people.length >= 3, true);
    assert.equal(state.vehicles.length >= 3, true);
    assert.equal(state.trips.length, 2);
    assert.equal(state.trips[0].route_assignments[0].route_id, SAVED_ROUTE_PLANS[0].id);
    assert.equal(state.trips[0].vehicle_ids.length, 2);
    assert.equal(state.trips[0].person_ids.length, 2);
    assert.match(state.trips[0].route_assignments[0].movement_date || "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    assert.ok(state.people.every((person) => person.client_id === PREVIEW_OPERATIONS_CLIENT_ID));
    assert.ok(state.vehicles.every((vehicle) => vehicle.client_id === PREVIEW_OPERATIONS_CLIENT_ID));
    assert.ok(state.trips.every((trip) => trip.client_id === PREVIEW_OPERATIONS_CLIENT_ID));
    assert.equal(
      state.trips.some((trip) => trip.route_ids.includes(SAVED_ROUTE_PLANS[2].id)),
      false,
    );
  });

  it("serves a positive West Corridor manifest without Central routes", () => {
    const state = loadPreviewOperationsState(PREVIEW_OPERATIONS_WEST_CLIENT_ID);

    assert.equal(state.client_id, PREVIEW_OPERATIONS_WEST_CLIENT_ID);
    assert.equal(state.people.length, 1);
    assert.equal(state.vehicles.length, 1);
    assert.equal(state.trips.length, 1);
    assert.deepEqual(state.trips[0].route_ids, [SAVED_ROUTE_PLANS[2].id]);
    assert.equal(
      state.trips[0].route_assignments[0].route_id,
      SAVED_ROUTE_PLANS[2].id,
    );
    assert.equal(
      state.trips[0].route_ids.some((routeId) =>
        [SAVED_ROUTE_PLANS[0].id, SAVED_ROUTE_PLANS[1].id].includes(routeId)),
      false,
    );
  });

  it("returns an empty client-scoped operations state for mismatched preview clients", () => {
    const state = loadPreviewOperationsState("other-client");

    assert.equal(state.client_id, "other-client");
    assert.deepEqual(state.people, []);
    assert.deepEqual(state.vehicles, []);
    assert.deepEqual(state.trips, []);
  });
});

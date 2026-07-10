import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SAVED_ROUTE_PLANS } from "../src/features/live-map/demoRoute";
import {
  loadPreviewOperationsState,
  PREVIEW_OPERATIONS_CLIENT_ID
} from "../src/features/operations/previewOperationsApi";

describe("SafeRoute preview operations API", () => {
  it("serves local trip, calendar, vehicle, and people manifests for preview-mode UI checks", () => {
    const state = loadPreviewOperationsState(PREVIEW_OPERATIONS_CLIENT_ID);

    assert.equal(state.client_id, PREVIEW_OPERATIONS_CLIENT_ID);
    assert.equal(state.people.length >= 3, true);
    assert.equal(state.vehicles.length >= 3, true);
    assert.equal(state.trips.length, 3);
    assert.equal(state.trips[0].route_assignments[0].route_id, SAVED_ROUTE_PLANS[0].id);
    assert.equal(state.trips[0].vehicle_ids.length, 2);
    assert.equal(state.trips[0].person_ids.length, 2);
    assert.match(state.trips[0].route_assignments[0].movement_date || "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("returns an empty client-scoped operations state for mismatched preview clients", () => {
    const state = loadPreviewOperationsState("other-client");

    assert.equal(state.client_id, "other-client");
    assert.deepEqual(state.people, []);
    assert.deepEqual(state.vehicles, []);
    assert.deepEqual(state.trips, []);
  });
});

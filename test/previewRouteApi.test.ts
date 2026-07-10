import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SAVED_ROUTE_PLANS } from "../src/features/live-map/demoRoute";
import {
  loadPreviewRouteDetail,
  loadPreviewSavedRoutes,
} from "../src/features/routes/previewRouteApi";

describe("SafeRoute preview route API", () => {
  it("serves local saved-route fixtures for non-production authenticated UI checks", () => {
    const result = loadPreviewSavedRoutes();

    assert.deepEqual(result.clients, [
      {
        id: "preview-routes",
        name: "Preview routes",
      },
    ]);
    assert.equal(result.routes.length, SAVED_ROUTE_PLANS.length);
    assert.equal(result.routes[0].id, SAVED_ROUTE_PLANS[0].id);
    assert.equal(result.selectedClientId, "preview-routes");
  });

  it("keeps preview client filtering deterministic", () => {
    assert.equal(loadPreviewSavedRoutes(" preview-routes ").routes.length, SAVED_ROUTE_PLANS.length);
    assert.equal(loadPreviewSavedRoutes("other-client").routes.length, 0);
  });

  it("serves an empty local Saved state for no-saved-routes previews", () => {
    const result = loadPreviewSavedRoutes(undefined, { empty: true });

    assert.deepEqual(result, {
      clients: [],
      routes: [],
      selectedClientId: null,
    });
  });

  it("loads preview route detail by id and fails clearly for stale fixture ids", () => {
    assert.equal(
      loadPreviewRouteDetail(` ${SAVED_ROUTE_PLANS[1].id} `).id,
      SAVED_ROUTE_PLANS[1].id,
    );

    assert.throws(
      () => loadPreviewRouteDetail("missing-route"),
      /preview route unavailable/i,
    );
  });
});

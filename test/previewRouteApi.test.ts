import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SAVED_ROUTE_PLANS } from "../src/features/live-map/demoRoute";
import {
  PREVIEW_CLIENTS,
  loadPreviewRouteDetail,
  loadPreviewSavedRoutes,
} from "../src/features/routes/previewRouteApi";

describe("SafeRoute preview route API", () => {
  it("serves local saved-route fixtures for non-production authenticated UI checks", () => {
    const result = loadPreviewSavedRoutes();

    assert.deepEqual(result.clients, PREVIEW_CLIENTS);
    assert.equal(result.routes.length, SAVED_ROUTE_PLANS.length);
    assert.equal(result.routes[0].id, SAVED_ROUTE_PLANS[0].id);
    assert.equal(result.routes[0].clientId, "preview-routes");
    assert.equal(result.routes[2].clientId, "preview-west");
    assert.equal(result.selectedClientId, "preview-routes");
  });

  it("keeps preview client filtering deterministic", () => {
    const central = loadPreviewSavedRoutes(" preview-routes ");
    const west = loadPreviewSavedRoutes("preview-west");

    assert.deepEqual(central.clients, [PREVIEW_CLIENTS[0]]);
    assert.equal(central.routes.length, 2);
    assert.ok(central.routes.every((route) => route.clientId === "preview-routes"));
    assert.deepEqual(west.clients, [PREVIEW_CLIENTS[1]]);
    assert.deepEqual(west.routes.map((route) => route.id), ["sr-westbound-heathrow"]);
    const missing = loadPreviewSavedRoutes("other-client");
    assert.equal(missing.routes.length, 0);
    assert.equal(missing.selectedClientId, null);
  });

  it("serves an empty local Saved state for no-saved-routes previews", () => {
    const result = loadPreviewSavedRoutes(undefined, { empty: true });

    assert.deepEqual(result, {
      clients: [PREVIEW_CLIENTS[0]],
      routes: [],
      selectedClientId: PREVIEW_CLIENTS[0].id,
    });
  });

  it("loads preview route detail by id and fails clearly for stale fixture ids", () => {
    assert.equal(
      loadPreviewRouteDetail(` ${SAVED_ROUTE_PLANS[1].id} `).id,
      SAVED_ROUTE_PLANS[1].id,
    );
    assert.equal(
      loadPreviewRouteDetail(SAVED_ROUTE_PLANS[2].id).clientId,
      "preview-west",
    );

    assert.throws(
      () => loadPreviewRouteDetail("missing-route"),
      /preview route unavailable/i,
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRouteCardTestID } from "../src/features/routes/routeCardPresentation";
import {
  normalizeTestIdSegment,
  uiTestIds,
} from "../src/testing/uiTestIds";

describe("UI test identifiers", () => {
  it("normalizes route and feature identifiers for stable iOS smoke flows", () => {
    assert.equal(
      normalizeTestIdSegment(" SR/City Airport Alpha "),
      "sr-city-airport-alpha",
    );
    assert.equal(normalizeTestIdSegment(""), "unknown");
  });

  it("keeps saved-route card identifiers aligned with route presentation", () => {
    assert.equal(
      uiTestIds.savedRouteCard(" SR/City Airport Alpha "),
      "safe-route-card-sr-city-airport-alpha",
    );
    assert.equal(
      createRouteCardTestID(" SR/City Airport Alpha "),
      uiTestIds.savedRouteCard(" SR/City Airport Alpha "),
    );
  });

  it("keeps live-map smoke identifiers stable without changing visible chrome", () => {
    assert.equal(uiTestIds.routeListScreen, "safe-route-picker");
    assert.equal(uiTestIds.liveMapScreen, "safe-route-live-map");
    assert.equal(uiTestIds.liveMapCanvas, "safe-route-map-view");
    assert.equal(uiTestIds.liveMapControl("follow"), "safe-route-control-follow");
    assert.equal(uiTestIds.liveMapControl("route intelligence"), "safe-route-control-route-intelligence");
    assert.equal(
      uiTestIds.liveMapRouteSummarySheet,
      "safe-route-summary-sheet",
    );
    assert.equal(uiTestIds.liveMapPrimaryAction, "safe-route-primary-action");
    assert.equal(uiTestIds.liveMapDemoDriveAction, "safe-route-demo-action");
    assert.equal(uiTestIds.liveMapRiskAlert, "safe-route-risk-alert");
    assert.equal(uiTestIds.liveMapRiskDetail, "safe-route-risk-detail");
    assert.equal(
      uiTestIds.liveMapRiskZone("Guest/Bank Crowd"),
      "safe-route-risk-zone-guest-bank-crowd",
    );
  });
});

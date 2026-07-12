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
    assert.equal(uiTestIds.liveMapRemainingMetrics, "safe-route-remaining-metrics");
    assert.equal(uiTestIds.liveMapPrimaryAction, "safe-route-primary-action");
    assert.equal(uiTestIds.guestMapRiskLoadingStatus, "guest-map-risk-loading-status");
    assert.equal(uiTestIds.loginScreen, "safe-route-login");
    assert.equal(uiTestIds.loginEmail, "safe-route-login-email");
    assert.equal(uiTestIds.loginPassword, "safe-route-login-password");
    assert.equal(uiTestIds.loginPrimaryAction, "safe-route-login-primary-action");
    assert.equal(uiTestIds.loginMapReturn, "safe-route-login-map-return");
    assert.equal(uiTestIds.operationsScreen, "safe-route-operations");
    assert.equal(uiTestIds.operationsMapReturn, "safe-route-operations-map-return");
    assert.equal(uiTestIds.operationsSignOut, "safe-route-operations-sign-out");
    assert.equal(uiTestIds.operationsClientSelector, "safe-route-operations-client-selector");
    assert.equal(
      uiTestIds.operationsTab("convoy management"),
      "safe-route-operations-tab-convoy-management",
    );
    assert.equal(
      uiTestIds.operationsRouteCard("SR City Airport"),
      "safe-route-operations-route-sr-city-airport",
    );
    assert.equal(
      uiTestIds.operationsClientTab("Client/Alpha"),
      "safe-route-operations-client-client-alpha",
    );
    assert.equal(
      uiTestIds.operationsConvoyCard("Alpha convoy"),
      "safe-route-operations-convoy-alpha-convoy",
    );
    assert.equal(uiTestIds.liveMapRiskAlert, "safe-route-risk-alert");
    assert.equal(uiTestIds.liveMapRiskDetail, "safe-route-risk-detail");
    assert.equal(
      uiTestIds.liveMapRiskZoneArea("Guest/Bank Crowd"),
      "safe-route-risk-area-guest-bank-crowd",
    );
    assert.equal(
      uiTestIds.liveMapRouteRiskSegment("Guest/Bank Crowd"),
      "safe-route-risk-segment-guest-bank-crowd",
    );
    assert.equal(
      uiTestIds.liveMapRiskZone("Guest/Bank Crowd"),
      "safe-route-risk-zone-guest-bank-crowd",
    );
  });
});

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
    assert.equal(
      uiTestIds.liveMapJourney(" Route/66B "),
      "safe-route-journey-route-66b",
    );
    assert.equal(
      uiTestIds.liveMapGuidanceState(" Off Route "),
      "safe-route-guidance-off-route",
    );
    assert.equal(uiTestIds.liveMapPrimaryAction, "safe-route-primary-action");
    assert.equal(uiTestIds.suspendedNavigationNotice, "safe-route-suspended-navigation");
    assert.equal(uiTestIds.suspendedNavigationRetry, "safe-route-suspended-navigation-retry");
    assert.equal(uiTestIds.suspendedNavigationEnd, "safe-route-suspended-navigation-end");
    assert.equal(uiTestIds.navigationCleanupNotice, "safe-route-navigation-cleanup");
    assert.equal(uiTestIds.navigationCleanupRetry, "safe-route-navigation-cleanup-retry");
    assert.equal(uiTestIds.guestMapRiskLoadingStatus, "guest-map-risk-loading-status");
    assert.equal(uiTestIds.guestMapRiskResearch, "guest-map-risk-research");
    assert.equal(uiTestIds.guestMapWorkspaceSelector, "guest-map-workspace-selector");
    assert.equal(
      uiTestIds.guestMapWorkspaceOption(" West Corridor "),
      "guest-map-workspace-west-corridor",
    );
    assert.equal(uiTestIds.routeListWorkspaceSelector, "safe-route-workspace-selector");
    assert.equal(uiTestIds.routeListWorkspaceState, "safe-route-workspace-state");
    assert.equal(uiTestIds.routeListOfflineNotice, "safe-route-offline-notice");
    assert.equal(
      uiTestIds.suspendedNavigationStatus,
      "safe-route-suspended-navigation-status",
    );
    assert.equal(
      uiTestIds.routeListWorkspaceOption(" West Corridor "),
      "safe-route-workspace-west-corridor",
    );
    assert.equal(uiTestIds.loginScreen, "safe-route-login");
    assert.equal(uiTestIds.loginEmail, "safe-route-login-email");
    assert.equal(uiTestIds.loginPassword, "safe-route-login-password");
    assert.equal(uiTestIds.loginPrimaryAction, "safe-route-login-primary-action");
    assert.equal(uiTestIds.loginMapReturn, "safe-route-login-map-return");
    assert.equal(uiTestIds.operationsScreen, "safe-route-operations");
    assert.equal(uiTestIds.operationsMapReturn, "safe-route-operations-map-return");
    assert.equal(uiTestIds.operationsSignOut, "safe-route-operations-sign-out");
    assert.equal(
      uiTestIds.operationsCalendarSavingControl,
      "safe-route-operations-calendar-saving-control",
    );
    assert.equal(
      uiTestIds.operationsCalendarSavingStatus,
      "safe-route-operations-calendar-saving-status",
    );
    assert.equal(
      uiTestIds.operationsWorkspaceSelector,
      "safe-route-operations-workspace-selector",
    );
    assert.equal(
      uiTestIds.operationsWorkspaceState,
      "safe-route-operations-workspace-state",
    );
    assert.equal(
      uiTestIds.operationsTab("convoy management"),
      "safe-route-operations-tab-convoy-management",
    );
    assert.equal(
      uiTestIds.operationsRouteCard("SR City Airport"),
      "safe-route-operations-route-sr-city-airport",
    );
    assert.equal(
      uiTestIds.operationsWorkspaceOption("Client/Alpha"),
      "safe-route-operations-workspace-client-alpha",
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

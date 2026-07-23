import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const source = (path: string) =>
  readFileSync(join(process.cwd(), "src", path), "utf8");

describe("live map design motion", () => {
  it("reveals the map scene and route chrome without moving state ownership", () => {
    const screen = source("features/live-map/LiveMapScreen.tsx");
    const overlay = source("features/live-map/LiveMapOverlay.tsx");

    assert.match(
      screen,
      /<MotionEntrance[\s\S]*replayKey=\{liveRoutePlan\.id\}[\s\S]*variant="scene"[\s\S]*<LiveMapCanvas/,
    );
    assert.match(
      overlay,
      /<MotionEntrance[\s\S]*replayKey=\{routePlan\.id\}[\s\S]*variant="chrome"[\s\S]*<LiveMapRouteHeader[\s\S]*<LiveMapControls/,
    );
    assert.match(screen, /testID=\{uiTestIds\.liveMapScreen\}/);
  });

  it("animates guidance, risk details, and summary disclosures with stable IDs", () => {
    const guidance = source("features/live-map/LiveMapGuidanceCard.tsx");
    const riskDetail = source(
      "features/live-map/LiveMapRiskDetailCallout.tsx",
    );
    const summary = source(
      "features/live-map/LiveMapRouteSummarySheet.tsx",
    );

    assert.match(guidance, /replayKey=\{`\$\{state\}:\$\{reroutePresentation\?\./);
    assert.match(guidance, /variant="chrome"/);
    assert.match(
      riskDetail,
      /replayKey=\{zone\.id\}[\s\S]*variant="sheet"[\s\S]*Animated\.View[\s\S]*panResponder\.panHandlers/,
    );
    assert.match(
      summary,
      /replayKey=\{routePlan\.id\}[\s\S]*testID=\{uiTestIds\.liveMapRouteSummarySheet\}[\s\S]*variant="sheet"/,
    );
    assert.match(
      summary,
      /detailsVisible \? \([\s\S]*<MotionEntrance[\s\S]*variant="disclosure"/,
    );
    assert.match(
      summary,
      /accessibilityState=\{\{ expanded: detailsVisible \}\}/,
    );
  });

  it("uses the handoff pulse only for the real current-position marker", () => {
    const markers = source("features/live-map/LiveMapMarkers.tsx");

    assert.match(markers, /useReduceMotionEnabled\(\)/);
    assert.match(
      markers,
      /useLoopingPulse\(\{[\s\S]*duration: 2600[\s\S]*enabled: !demoDriveEnabled/,
    );
    assert.match(markers, /outputRange: \[1, 2\.8\]/);
    assert.match(markers, /reduceMotionEnabled\s*\?\s*0/);
    assert.match(
      markers,
      /accessibilityLabel=\{createVehicleMarkerAccessibilityLabel\(demoDriveEnabled\)\}/,
    );
    assert.match(markers, /accessibilityRole="image"/);
  });

  it("reveals recovery controls while preserving their actions and alerts", () => {
    const cleanup = source(
      "features/live-map/NavigationCleanupNotice.tsx",
    );
    const suspended = source(
      "features/live-map/SuspendedNavigationNotice.tsx",
    );
    const resume = source("features/live-map/ResumeNavigationButton.tsx");
    const handoff = source(
      "features/workspaces/WorkspaceHandoffRetryNotice.tsx",
    );
    const refresh = source(
      "features/workspaces/WorkspaceAccessRefreshControl.tsx",
    );

    for (const notice of [cleanup, suspended, resume, handoff]) {
      assert.match(notice, /<MotionEntrance/);
      assert.match(notice, /variant="chrome"/);
    }
    assert.match(refresh, /<MotionEntrance variant="disclosure">/);
    assert.match(cleanup, /accessibilityRole="alert"/);
    assert.match(suspended, /testID=\{uiTestIds\.suspendedNavigationRetry\}/);
    assert.match(resume, /testID=\{uiTestIds\.liveMapResumeAction\}/);
    assert.match(
      handoff,
      /testID=\{uiTestIds\.workspaceHandoffRetryAction\}/,
    );
    assert.match(refresh, /testID=\{uiTestIds\.workspaceAccessRefresh\}/);
  });
});

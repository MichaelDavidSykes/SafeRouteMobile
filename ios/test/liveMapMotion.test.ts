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
      /replayKey=\{zone\.id\}[\s\S]*<SafeRouteBottomSheet[\s\S]*snapPoints=\{snapPoints\}[\s\S]*<BottomSheetScrollView/,
    );
    assert.match(riskDetail, /enablePanDownToClose/);
    assert.match(riskDetail, /onClose=\{handleSheetClosed\}/);
    assert.match(riskDetail, /overrideReduceMotion=\{ReduceMotion\.System\}/);
    assert.doesNotMatch(riskDetail, /MotionEntrance|PanResponder|Animated\.View/);
    assert.doesNotMatch(riskDetail, /requestAnimationFrame|expandedPanelHeight/);
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

  it("keeps current position and compass direction in one map annotation", () => {
    const markers = source("features/live-map/LiveMapMarkers.tsx");

    assert.doesNotMatch(markers, /useLoopingPulse/);
    assert.match(markers, /style=\{styles\.vehicleMarker\}/);
    assert.match(markers, /styles\.vehicleMarkerHeadingBeam/);
    assert.match(markers, /collapsable=\{false\}/);
    assert.match(markers, /tracksViewChanges=\{screenRotation !== null\}/);
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

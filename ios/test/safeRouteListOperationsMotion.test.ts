import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

describe("SafeRoute list and Operations motion", () => {
  it("smoothly reveals the compact navigation menu while respecting Reduce Motion", () => {
    const navigationMenu = source("src/components/AppTabBar.tsx");
    const motion = source("src/motion/SafeRouteMotion.tsx");

    assert.match(navigationMenu, /useMotionValue\(open \? 1 : 0/);
    assert.match(navigationMenu, /duration: safeRouteMotion\.disclosureDurationMs/);
    assert.match(navigationMenu, /outputRange: \[18, 0\]/);
    assert.match(navigationMenu, /accessibilityState=\{\{ expanded: open \}\}/);
    assert.match(motion, /useReduceMotionEnabled\(\)/);
  });

  it("replays the 440 millisecond scene entrance for saved routes and active Operations content", () => {
    const routeList = source("src/features/routes/RouteListScreen.tsx");
    const operations = source("src/features/operations/OperationsScreen.tsx");
    const motion = source("src/motion/SafeRouteMotion.tsx");

    assert.match(motion, /sceneDurationMs: 440/);
    assert.match(
      routeList,
      /<MotionEntrance[\s\S]*replayKey=\{selectedClientId \|\| "no-workspace"\}[\s\S]*variant="scene"/,
    );
    assert.match(
      operations,
      /<MotionEntrance[\s\S]*replayKey=\{activeTab\}[\s\S]*variant="scene"/,
    );
  });

  it("uses the handoff disclosure entrance and keeps convoy collapse smooth", () => {
    const operations = source("src/features/operations/OperationsScreen.tsx");

    assert.match(operations, /CONVOY_CHEVRON_DURATION_MS = 250/);
    assert.match(
      operations,
      /CONVOY_EXPANSION_DURATION_MS = safeRouteMotion\.disclosureDurationMs/,
    );
    assert.match(
      operations,
      /if \(!reduceMotionEnabled\) \{\s*configureConvoyExpansionAnimation\(\)/,
    );
    assert.match(
      operations,
      /<MotionEntrance[\s\S]*style=\{styles\.convoyExpandedContent\}[\s\S]*variant="disclosure"/,
    );
    assert.match(
      operations,
      /useMotionValue\(expanded \? 1 : 0,\s*\{[\s\S]*CONVOY_CHEVRON_DURATION_MS/,
    );
  });

  it("uses the shared native-thread sheet for saved route details", () => {
    const sheet = source("src/features/routes/RouteDetailSheet.tsx");

    assert.match(sheet, /<SafeRouteBottomSheet/);
    assert.match(sheet, /<BottomSheetScrollView/);
    assert.match(sheet, /enablePanDownToClose/);
    assert.match(sheet, /dismissOnBackdropPress/);
    assert.doesNotMatch(sheet, /PanResponder/);
  });

  it("uses the shared native-thread sheet for Operations details", () => {
    const sheet = source("src/features/operations/OperationsScreen.tsx");

    assert.match(sheet, /OPERATIONS_DETAIL_SHEET_SNAP_POINTS[^\n]*\["88%"\]/);
    assert.match(sheet, /function OperationsDetailSheet[\s\S]*<SafeRouteBottomSheet/);
    assert.match(sheet, /<BottomSheetScrollView/);
    assert.match(sheet, /enablePanDownToClose/);
    assert.match(sheet, /dismissOnBackdropPress/);
    assert.match(sheet, /onClose=\{handleSheetClosed\}/);
    assert.doesNotMatch(sheet, /PanResponder/);
  });
});

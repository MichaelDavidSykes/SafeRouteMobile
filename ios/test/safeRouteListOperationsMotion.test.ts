import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

describe("SafeRoute list and Operations motion", () => {
  it("lifts the selected app tab by three points with reduced-motion-aware spring motion", () => {
    const tabBar = source("src/components/AppTabBar.tsx");
    const motion = source("src/motion/SafeRouteMotion.tsx");

    assert.match(tabBar, /useMotionValue\(selected \? 1 : 0,\s*\{\s*spring: true/);
    assert.match(tabBar, /outputRange: \[0, -3\]/);
    assert.match(tabBar, /accessibilityState=\{\{ disabled, selected \}\}/);
    assert.match(motion, /spring\s*\?\s*Animated\.spring/);
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

  it("coordinates sheet and scrim entrances while preserving drag dismissal", () => {
    for (const path of [
      "src/features/routes/RouteDetailSheet.tsx",
      "src/features/operations/OperationsScreen.tsx",
    ]) {
      const sheet = source(path);

      assert.match(sheet, /useReduceMotionEnabled\(\)/);
      assert.match(sheet, /safeRouteMotion\.sheetDurationMs/);
      assert.match(sheet, /safeRouteMotion\.scrimDurationMs/);
      assert.match(sheet, /Animated\.parallel\(\[/);
      assert.match(sheet, /opacity: scrimOpacity/);
      assert.match(sheet, /shouldStartRiskDetailDismissGesture/);
      assert.match(sheet, /shouldDismissRiskDetailGesture/);
      assert.match(sheet, /onPanResponderMove/);
    }
  });
});
